import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { GoodType, PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import type { Player } from '../../domain/Player';
import { LoadShipAction } from '../../actions/LoadShipAction';
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
// Po zakończeniu ładowania: magazynowanie (auto — gracz zachowuje najcenniejsze towary)
// i opróżnienie pełnych statków.
export class CaptainPhase implements GamePhase {
  readonly type = PhaseType.Captain;
  private consecutivePasses = 0;
  private storageDone = false;

  onEnter(state: GameState): void {
    this.consecutivePasses = 0;
    this.storageDone = false;
    state.currentPlayerIndex = state.roleSelectorIndex;
    for (const player of state.players) {
      player.resetCaptainPhaseFlags();
    }
  }

  onExit(state: GameState): void {
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
    const player = state.getPlayer(playerId)!;
    return this.buildLoadActions(state, player);
  }

  checkTransition(state: GameState): GamePhase | null {
    if (this.storageDone) {
      return nextPhaseAfterRole(state);
    }

    // Po załadowaniu resetujemy licznik przejść
    this.consecutivePasses = 0;

    // Pomiń graczy, którzy nie mogą ładować
    while (true) {
      const current = state.getCurrentPlayer();
      if (this.canPlayerLoad(state, current)) {
        return null; // Gracz może ładować — czekamy na LoadShipAction
      }
      this.consecutivePasses++;
      state.advanceCurrentPlayer();
      if (this.consecutivePasses >= state.players.length) {
        // Pełna runda bez ładowania — przechodzimy do magazynowania
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
    }
    return false;
  }

  private buildLoadActions(state: GameState, player: Player): LoadShipAction[] {
    const actions: LoadShipAction[] = [];
    const { playerId } = { playerId: player.id };

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
    }

    return actions;
  }

  private processStorage(state: GameState): void {
    for (const player of state.players) {
      this.processPlayerStorage(state, player);
    }
  }

  private processPlayerStorage(state: GameState, player: Player): void {
    const activeBuildings = player.island.getActiveBuildings();

    // Ile pełnych typów towarów gracz może zachować (magazyny)
    let keepFullTypes = 0;
    for (const b of activeBuildings) {
      if (b.goodTypesToKeepAfterCaptain) {
        keepFullTypes = Math.max(keepFullTypes, b.goodTypesToKeepAfterCaptain());
      }
    }

    // Posortuj typy towarów które gracz posiada, malejąco po cenie
    const ownedGoods = GOOD_TYPES_BY_PRICE.filter(g => player.getStoredGoodCount(g) > 0);

    if (keepFullTypes > 0) {
      // Zatrzymaj wszystkie tokeny najcenniejszych N typów
      const keep = new Set(ownedGoods.slice(0, keepFullTypes));
      for (const good of ownedGoods) {
        if (!keep.has(good)) {
          const c = player.getStoredGoodCount(good);
          player.removeStoredGoods(good, c);
          state.supply.returnGoods(good, c);
        }
      }
    } else {
      // Bez magazynu: zachowaj 1 znacznik najcenniejszego towaru
      for (let i = 0; i < ownedGoods.length; i++) {
        const good = ownedGoods[i]!;
        const c = player.getStoredGoodCount(good);
        if (i === 0 && c >= 1) {
          // Zostaw 1, resztę odrzuć
          if (c > 1) {
            player.removeStoredGoods(good, c - 1);
            state.supply.returnGoods(good, c - 1);
          }
        } else {
          player.removeStoredGoods(good, c);
          state.supply.returnGoods(good, c);
        }
      }
    }

    void GOOD_PRICES; // satisfy lint: GOOD_PRICES imported for sort reference
  }
}
