import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { GoodType, PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import type { Player } from '../../domain/Player';
import { LoadShipAction } from '../../actions/LoadShipAction';
import { TreasuryAction } from '../../actions/TreasuryAction';
import { SelectStorageAction } from '../../actions/SelectStorageAction';
import { GOOD_PRICES } from '../../core/constants';
import { RoleSelectionPhase } from './RoleSelectionPhase';
import { RoundEndPhase } from './RoundEndPhase';

const GOOD_TYPES_BY_PRICE = [
  GoodType.Coffee, GoodType.Tobacco, GoodType.Sugar,
  GoodType.Indigo, GoodType.Corn,
] as const;

function nextPhaseAfterRole(state: GameState): GamePhase {
  const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
  return takenCount >= state.players.length ? new RoundEndPhase() : new RoleSelectionPhase();
}

// Faza kapitana: gracze MUSZĄ ładować towary na statki, jeśli mogą.
// Pętla ładowania trwa, dopóki ktokolwiek może coś załadować.
// Po zakończeniu ładowania: magazynowanie (auto) i opróżnienie pełnych statków.
export class CaptainPhase implements GamePhase {
  readonly type = PhaseType.Captain;
  private consecutivePasses = 0;
  private storageDone = false;
  // true po zakończeniu ładowania — jesteśmy w fazie wyboru magazynu lub po niej
  private storagePhaseStarted = false;

  onEnter(state: GameState): void {
    this.consecutivePasses = 0;
    this.storageDone = false;
    this.storagePhaseStarted = false;
    state.captainStoragePending = false;
    state.currentPlayerIndex = state.roleSelectorIndex;
    for (const player of state.players) {
      player.resetCaptainPhaseFlags();
    }

    // Przeładownia: +1 PZ za każdą parę takich samych towarów przed pierwszym załadunkiem
    for (const player of state.players) {
      for (const building of player.island.getActiveBuildings()) {
        if (building.bonusVpAtCaptainStart) {
          const bonus = building.bonusVpAtCaptainStart(state, player);
          if (bonus > 0) {
            player.victoryPointTokens += state.supply.drawVictoryPoints(bonus);
          }
        }
      }
    }

    // Latarnia morska: +1 dublon dla selektora (kapitan) za wybranie tej postaci
    const selector = state.players[state.roleSelectorIndex]!;
    for (const building of selector.island.getActiveBuildings()) {
      if (building.bonusDblIfCaptainSelector) {
        selector.doubloons += state.supply.drawDoubloons(building.bonusDblIfCaptainSelector());
      }
    }
  }

  onExit(state: GameState): void {
    // PZ za Przystań (marina): 1 PZ za każde 2 załadowane towary
    for (const player of state.players) {
      if (player.marinaGoodsLoaded > 0) {
        const marinaVP = Math.floor(player.marinaGoodsLoaded / 2);
        if (marinaVP > 0) {
          player.victoryPointTokens += state.supply.drawVictoryPoints(marinaVP);
        }
      }
    }

    // Opróżnij pełne statki
    for (const ship of state.ships) {
      if (ship.isFull()) {
        state.supply.returnGoods(ship.loadedGood!, ship.loadedCount);
        ship.unload();
      }
    }
  }

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (this.storageDone) return [];
    if (state.getCurrentPlayer().id !== playerId) return [];

    // Faza wyboru magazynu: gracz z aktywnym magazynem wybiera które typy zachować
    if (state.captainStoragePending) {
      const player = state.getPlayer(playerId)!;
      const capacity = this.getWarehouseCapacity(player);
      const goodTypes = GOOD_TYPES_BY_PRICE.filter(g => player.getStoredGoodCount(g) > 0);
      return this.buildStorageChoiceActions(playerId, capacity, goodTypes);
    }

    const player = state.getPlayer(playerId)!;
    const actions: Action[] = this.buildLoadActions(state, player);

    // Skarbiec: gracz z aktywnym Skarbcem + szlachcicami może dostarczyć towary przed załadunkiem.
    if (!player.hasUsedTreasuryThisPhase) {
      const hasTreasury = player.island.getBuildings().some(b => b.id === 'treasury' && b.isActive());
      if (hasTreasury && player.getTotalNobles() > 0) {
        const ownedGoods = [...player.storedGoods.entries()]
          .filter(([, cnt]) => cnt > 0)
          .map(([g]) => g);
        if (ownedGoods.length > 0) {
          const maxGoods = Math.min(player.getTotalNobles(), ownedGoods.length);
          // Generujemy TreasuryAction dla każdego niepustego podzbioru do maxGoods elementów.
          // Uproszczenie: oferujemy wszystkie jednoelementowe opcje + pełny zbiór.
          for (const good of ownedGoods) {
            actions.push(new TreasuryAction(playerId, [good]));
          }
          if (maxGoods > 1) {
            actions.push(new TreasuryAction(playerId, ownedGoods.slice(0, maxGoods)));
          }
        }
      }
    }

    return actions;
  }

  checkTransition(state: GameState): GamePhase | null {
    if (this.storageDone) return nextPhaseAfterRole(state);

    // Faza wyboru magazynu — oczekujemy na SelectStorageAction
    if (this.storagePhaseStarted) {
      if (state.captainStoragePending) return null; // czekamy na wybór

      // captainStoragePending właśnie zostało wyczyszczone przez SelectStorageAction —
      // szukamy kolejnego gracza z magazynem i wieloma typami towaru
      const nextIdx = this.findNextStorageChoicePlayerIndex(state);
      if (nextIdx !== null) {
        state.currentPlayerIndex = nextIdx;
        state.captainStoragePending = true;
        return null;
      }

      // Wszyscy z magazynem wybrali — auto-przetwarzamy graczy bez magazynu
      this.processNonWarehousePlayers(state);
      this.storageDone = true;
      return nextPhaseAfterRole(state);
    }

    // Faza ładowania
    this.consecutivePasses = 0;

    while (true) {
      const current = state.getCurrentPlayer();
      if (this.canPlayerLoad(state, current)) {
        return null;
      }
      this.consecutivePasses++;
      state.advanceCurrentPlayer();
      if (this.consecutivePasses >= state.players.length) {
        // Ładowanie zakończone — sprawdź czy ktoś potrzebuje wybrać magazyn
        this.storagePhaseStarted = true;
        const nextIdx = this.findNextStorageChoicePlayerIndex(state);
        if (nextIdx !== null) {
          state.currentPlayerIndex = nextIdx;
          state.captainStoragePending = true;
          return null;
        }
        // Nikt nie ma aktywnego magazynu z wieloma typami — auto-przetwórz wszystkich
        this.processStorage(state);
        this.storageDone = true;
        return nextPhaseAfterRole(state);
      }
    }
  }

  private canPlayerLoad(state: GameState, player: Player): boolean {
    for (const [good, count] of player.storedGoods) {
      if (count === 0) continue;
      for (let i = 0; i < state.ships.length; i++) {
        const ship = state.ships[i]!;
        if (!ship.canAccept(good)) continue;
        const onOtherShip = state.ships.some((s, idx) => idx !== i && s.loadedGood === good);
        if (!onOtherShip) return true;
      }
      if (!player.hasUsedWharfThisPhase &&
          player.island.getActiveBuildings().some(b => b.hasOwnShip?.())) {
        return true;
      }
      if (player.island.getActiveBuildings().some(b => b.hasPrivateMarinaShip?.())) {
        return true;
      }
    }
    return false;
  }

  private buildLoadActions(state: GameState, player: Player): LoadShipAction[] {
    const actions: LoadShipAction[] = [];
    const { id: playerId } = player;

    const hasMarina = player.island.getActiveBuildings().some(b => b.hasPrivateMarinaShip?.());

    for (const [good, count] of player.storedGoods) {
      if (count === 0) continue;
      for (let i = 0; i < state.ships.length; i++) {
        const ship = state.ships[i]!;
        if (!ship.canAccept(good)) continue;
        const onOtherShip = state.ships.some((s, idx) => idx !== i && s.loadedGood === good);
        if (!onOtherShip) {
          actions.push(new LoadShipAction(playerId, { kind: 'ship', shipIndex: i }, good));
        }
      }
      if (!player.hasUsedWharfThisPhase &&
          player.island.getActiveBuildings().some(b => b.hasOwnShip?.())) {
        actions.push(new LoadShipAction(playerId, { kind: 'wharf' }, good));
      }
      if (hasMarina) {
        actions.push(new LoadShipAction(playerId, { kind: 'marina' }, good));
      }
    }

    return actions;
  }

  private processStorage(state: GameState): void {
    for (const player of state.players) {
      this.processPlayerStorage(state, player);
    }
  }

  // Przetwarza tylko graczy BEZ aktywnego magazynu (magazynowi gracze już wybrali sami).
  private processNonWarehousePlayers(state: GameState): void {
    for (const player of state.players) {
      if (this.getWarehouseCapacity(player) === 0) {
        this.processPlayerStorage(state, player);
      }
    }
  }

  // Zwraca indeks pierwszego gracza z aktywnym magazynem który ma >1 typ towaru.
  private findNextStorageChoicePlayerIndex(state: GameState): number | null {
    for (let i = 0; i < state.players.length; i++) {
      const player = state.players[i]!;
      const capacity = this.getWarehouseCapacity(player);
      if (capacity === 0) continue;
      const typeCount = GOOD_TYPES_BY_PRICE.filter(g => player.getStoredGoodCount(g) > 0).length;
      if (typeCount > capacity) return i; // ma więcej typów niż może zachować → potrzebuje wyboru
    }
    return null;
  }

  // Pojemność magazynu gracza (0 = brak, 1 = Mały Magazyn, 2 = Duży Magazyn).
  private getWarehouseCapacity(player: Player): number {
    let cap = 0;
    for (const b of player.island.getActiveBuildings()) {
      if (b.goodTypesToKeepAfterCaptain) {
        cap += b.goodTypesToKeepAfterCaptain();
      }
    }
    return cap;
  }

  // Buduje listę akcji SelectStorageAction dla wyboru typów towaru do zachowania.
  private buildStorageChoiceActions(
    playerId: PlayerId,
    capacity: number,
    goodTypes: readonly GoodType[],
  ): SelectStorageAction[] {
    const actions: SelectStorageAction[] = [];
    if (capacity >= 2 && goodTypes.length >= 2) {
      // Duży Magazyn: kombinacje dwóch typów + pojedyncze
      for (let i = 0; i < goodTypes.length; i++) {
        for (let j = i + 1; j < goodTypes.length; j++) {
          actions.push(new SelectStorageAction(playerId, [goodTypes[i]!, goodTypes[j]!]));
        }
      }
    }
    // Zawsze: pojedynczy typ (dla Małego Magazynu lub jako opcja dla Dużego)
    for (const g of goodTypes) {
      actions.push(new SelectStorageAction(playerId, [g]));
    }
    return actions;
  }

  private processPlayerStorage(state: GameState, player: Player): void {
    const activeBuildings = player.island.getActiveBuildings();

    let keepFullTypes = 0;
    for (const b of activeBuildings) {
      if (b.goodTypesToKeepAfterCaptain) {
        keepFullTypes += b.goodTypesToKeepAfterCaptain();
      }
    }

    let extraGoodsAllowed = 0;
    for (const b of activeBuildings) {
      if (b.extraGoodsStorage) {
        extraGoodsAllowed = Math.max(extraGoodsAllowed, b.extraGoodsStorage());
      }
    }

    const ownedGoods = GOOD_TYPES_BY_PRICE.filter(g => player.getStoredGoodCount(g) > 0);

    // Oblicz ile każdego towaru zachować
    const keepMap = new Map<GoodType, number>();

    if (keepFullTypes > 0) {
      const keepTypes = new Set(ownedGoods.slice(0, keepFullTypes));
      for (const good of ownedGoods) {
        keepMap.set(good, keepTypes.has(good) ? player.getStoredGoodCount(good) : 0);
      }
    } else {
      for (let i = 0; i < ownedGoods.length; i++) {
        keepMap.set(ownedGoods[i]!, i === 0 ? 1 : 0);
      }
    }

    // Skład: zachowaj do extraGoodsAllowed dodatkowych (najcenniejsze najpierw)
    if (extraGoodsAllowed > 0) {
      let extra = extraGoodsAllowed;
      for (const good of GOOD_TYPES_BY_PRICE) {
        if (extra <= 0) break;
        const total = player.getStoredGoodCount(good);
        const alreadyKept = keepMap.get(good) ?? 0;
        const wouldDiscard = total - alreadyKept;
        if (wouldDiscard > 0) {
          const toKeepMore = Math.min(extra, wouldDiscard);
          keepMap.set(good, alreadyKept + toKeepMore);
          extra -= toKeepMore;
        }
      }
    }

    // Zastosuj: wyrzuć to co nie zostaje
    for (const good of ownedGoods) {
      const total = player.getStoredGoodCount(good);
      const keep = keepMap.get(good) ?? 0;
      const discard = total - keep;
      if (discard > 0) {
        player.removeStoredGoods(good, discard);
        state.supply.returnGoods(good, discard);
      }
    }
  }
}

void GOOD_PRICES;
