import { GameFactory } from '../state/GameFactory';
import { RoleSelectionPhase } from '../state/phases/RoleSelectionPhase';
import { SelectRoleAction } from '../actions/SelectRoleAction';
import { Plantation } from '../domain/Plantation';
import type { GameState } from '../state/GameState';
import type { Player } from '../domain/Player';
import type { Building } from '../domain/buildings/Building';
import type { Action } from '../actions/Action';
import { GoodType, RoleType, PlantationType, PhaseType } from '../core/types';

export function createGame(playerCount: 3 | 4 | 5 = 3): GameState {
  const allNames = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];
  const names = allNames.slice(0, playerCount) as readonly string[];
  return GameFactory.create(playerCount, names, new RoleSelectionPhase());
}

export function applyOk(state: GameState, action: Action): void {
  const result = state.apply(action);
  if (!result.ok) throw new Error(`Action failed unexpectedly: ${result.error}`);
}

export function selectRole(state: GameState, role: RoleType): void {
  applyOk(state, new SelectRoleAction(state.getCurrentPlayer().id, role));
}

export function giveGoods(player: Player, good: GoodType, count: number): void {
  player.addStoredGoods(good, count);
}

// Adds a plantation with a worker already placed (active).
export function activatePlantation(player: Player, type: PlantationType): void {
  const p = new Plantation(type);
  p.occupiedWorkers = 1;
  player.island.addPlantation(p);
}

// Adds a building with one worker already placed (active).
export function activateBuilding(player: Player, building: Building): void {
  building.occupiedWorkers = 1;
  player.island.addBuilding(building);
}

// Drives the current phase by applying the first valid action repeatedly until phase changes.
export function autoPlayPhase(state: GameState, phaseType: PhaseType, maxIterations = 100): void {
  let n = 0;
  while (state.getCurrentPhase().type === phaseType && n++ < maxIterations) {
    const pid = state.getCurrentPlayer().id;
    const actions = state.getValidActions(pid);
    if (actions.length === 0) break;
    applyOk(state, actions[0]!);
  }
}
