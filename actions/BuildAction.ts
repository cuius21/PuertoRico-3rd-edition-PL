import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { GoodType, PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
import type { Building } from '../domain/buildings/Building';
import type { Player } from '../domain/Player';
import { GOOD_PRICES } from '../core/constants';

// Maksymalny rabat z Czarnego rynku (do 3 zasobów zwróconych za 1 dublon każdy).
const BLACK_MARKET_MAX = 3;

// Liczy dostępne zasoby do zwrotu w Czarnym rynku (maks. BLACK_MARKET_MAX).
function czarnyRynekAvailable(player: Player): number {
  let avail = 0;
  for (const cnt of player.storedGoods.values()) avail += cnt;
  avail += player.pendingWorkers;
  avail += player.victoryPointTokens;
  return Math.min(avail, BLACK_MARKET_MAX);
}

// Zwraca najtańsze zasoby gracza w celu pokrycia shortfall.
// Priorytet: kukurydza, indygo, cukier, tytoń, kawa, robotnicy, PZ.
function applyBlackMarketReturn(state: GameState, player: Player, amount: number): void {
  let remaining = amount;
  const cheapestOrder: GoodType[] = [
    GoodType.Corn, GoodType.Indigo, GoodType.Sugar, GoodType.Tobacco, GoodType.Coffee,
  ];
  for (const good of cheapestOrder) {
    if (remaining <= 0) break;
    const cnt = player.getStoredGoodCount(good);
    const toReturn = Math.min(remaining, cnt);
    if (toReturn > 0) {
      player.removeStoredGoods(good, toReturn);
      state.supply.returnGoods(good, toReturn);
      remaining -= toReturn;
    }
  }
  if (remaining > 0 && player.pendingWorkers > 0) {
    const toReturn = Math.min(remaining, player.pendingWorkers);
    player.pendingWorkers -= toReturn;
    state.supply.returnWorkersToPool(toReturn);
    remaining -= toReturn;
  }
  if (remaining > 0 && player.victoryPointTokens > 0) {
    const toReturn = Math.min(remaining, player.victoryPointTokens);
    player.victoryPointTokens -= toReturn;
    state.supply.victoryPointPool += toReturn;
  }
}

function calcBuildCost(state: GameState, player: Player, building: Building): number {
  const isSelector = state.getRoleSelector().id === player.id;
  const activeBuildings = player.island.getActiveBuildings();

  const activeQuarries = player.island.countActiveQuarries();
  const hasSmithy = activeBuildings.some(b => b.id === 'smithy');
  const quarryCap = (building.priceGroup as number) + (hasSmithy ? 1 : 0);
  const quarryDiscount = Math.min(activeQuarries, quarryCap);

  // Biblioteka podwaja przywilej budowniczego (-2 zamiast -1)
  const hasLibrary = isSelector && activeBuildings.some(b => b.doublesRolePrivilege?.());
  const builderDiscount = isSelector ? (hasLibrary ? 2 : 1) : 0;

  // Szałas: każde 2 lasy dają -1 dublon
  const forestDiscount = Math.floor(player.island.countForests() / 2);

  return Math.max(0, building.cost - quarryDiscount - builderDiscount - forestDiscount);
}

// Faza budowniczego: gracz kupuje jeden budynek ze zniżką kamieniołomów.
// Budowniczy (selektor) dostaje dodatkowy -1 do kosztu jako przywilej.
// Kuźnia podnosi limit zniżki kamieniołomów o 1 ponad wartość priceGroup budynku.
// Biblioteka podwaja przywilej budowniczego (-2 zamiast -1).
// Szałas: każde 2 lasy dają -1 dublon przy budowaniu.
// Czarny rynek: pozwala dopłacić brakujące dublon zasobami (maks. 3).
export class BuildAction implements Action {
  readonly type = 'BUILD';

  constructor(
    readonly playerId: PlayerId,
    readonly buildingId: string,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Builder) {
      return Err('Budowanie możliwe tylko w fazie budowniczego');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej w fazie budowniczego');
    }

    const player = state.getPlayer(this.playerId)!;
    const building = state.supply.availableBuildings.find(b => b.id === this.buildingId);

    if (!building) {
      return Err(`Budynek ${this.buildingId} nie jest dostępny w puli`);
    }
    if (player.island.hasBuildingOfType(this.buildingId)) {
      return Err(`Masz już budynek ${this.buildingId}`);
    }
    if (player.island.getFreeUrbanSlotCount() < building.tileSize) {
      return Err('Brak miejsca w mieście na ten budynek');
    }

    const cost = calcBuildCost(state, player, building);
    if (player.doubloons < cost) {
      // Sprawdź czy Czarny rynek może pokryć niedobór
      const shortfall = cost - player.doubloons;
      if (
        shortfall <= BLACK_MARKET_MAX &&
        player.island.getActiveBuildings().some(b => b.id === 'blackMarket') &&
        czarnyRynekAvailable(player) >= shortfall
      ) {
        return OkVoid;
      }
      return Err(`Potrzebujesz ${cost} dublonów, masz ${player.doubloons}`);
    }

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const building = state.supply.takeBuilding(this.buildingId)!;

    const cost = calcBuildCost(state, player, building);

    // Czarny rynek: auto-zwrot zasobów gdy brakuje dublonów
    if (player.doubloons < cost) {
      const shortfall = cost - player.doubloons;
      applyBlackMarketReturn(state, player, shortfall);
    }

    player.doubloons -= cost;
    state.supply.depositDoubloons(cost);

    player.island.addBuilding(building);

    // Kościół: bonus PZ za wybudowanie budynku wg grupy cenowej
    for (const owned of player.island.getActiveBuildings()) {
      if (owned.bonusVpOnBuild && owned.id !== building.id) {
        const bonusVp = owned.bonusVpOnBuild(state, player, building.priceGroup);
        if (bonusVp > 0) {
          player.victoryPointTokens += state.supply.drawVictoryPoints(bonusVp);
        }
      }
    }

    // Uniwersytet: kładzie robotnika z puli na nowo wybudowanym budynku
    for (const owned of player.island.getActiveBuildings()) {
      if (owned.afterBuildCompleted) {
        owned.afterBuildCompleted(state, player, building);
      }
    }

    // Festival: check budowa quest
    if (state.festivalBoard) {
      const q = state.festivalBoard.budowa;
      if (!q.completedBy && this.buildingId === q.buildingId) {
        q.completedBy = player.id;
        player.victoryPointTokens += state.supply.drawVictoryPoints(3);
      }
    }

    state.advanceCurrentPlayer();
  }
}

void GOOD_PRICES; // suppress unused import lint (used by applyBlackMarketReturn indirectly)
