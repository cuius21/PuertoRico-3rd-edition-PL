import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
import type { Building } from '../domain/buildings/Building';

function calcBuildCost(state: GameState, player: { id: string; island: { countActiveQuarries(): number; getActiveBuildings(): readonly Building[] } }, building: Building): number {
  const isSelector = state.getRoleSelector().id === player.id;
  const activeQuarries = player.island.countActiveQuarries();
  const hasSmithy = player.island.getActiveBuildings().some(b => b.id === 'smithy');
  const quarryCap = (building.priceGroup as number) + (hasSmithy ? 1 : 0);
  const quarryDiscount = Math.min(activeQuarries, quarryCap);
  const builderDiscount = isSelector ? 1 : 0;
  return Math.max(0, building.cost - quarryDiscount - builderDiscount);
}

// Faza budowniczego: gracz kupuje jeden budynek ze zniżką kamieniołomów.
// Budowniczy (selektor) dostaje dodatkowy -1 do kosztu jako przywilej.
// Kuźnia podnosi limit zniżki kamieniołomów o 1 ponad wartość priceGroup budynku.
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
      return Err(`Potrzebujesz ${cost} dublonów, masz ${player.doubloons}`);
    }

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const building = state.supply.takeBuilding(this.buildingId)!;

    const cost = calcBuildCost(state, player, building);
    player.doubloons -= cost;
    state.supply.depositDoubloons(cost);

    player.island.addBuilding(building);

    // University hook: place a worker from supply on the new building
    for (const owned of player.island.getActiveBuildings()) {
      if (owned.afterBuildCompleted) {
        owned.afterBuildCompleted(state, player, building);
      }
    }

    state.advanceCurrentPlayer();
  }
}
