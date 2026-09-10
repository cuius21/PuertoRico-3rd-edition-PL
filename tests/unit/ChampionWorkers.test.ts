import { describe, it, expect } from 'vitest';
import { chooseChampionWorkerAction } from '../../src/bots/championWorkers';
import { chooseHeuristicAction } from '../../src/bots/hardcorePolicy';
import { cloneGameState } from '../../src/bots/simulation';
import { serializeGameState } from '../../src/game/GameSerializer';
import { SmallIndigoPlant, LargeIndigoPlant, SmallSugarMill, TobaccoStorage, CoffeeRoaster } from '../../domain/buildings/catalog/ProductionBuildings';
import { Factory, Harbour, LargeMarket } from '../../domain/buildings/catalog/SmallUtilityBuildings';
import { CustomsHouse } from '../../domain/buildings/catalog/LargeBuildings';
import { Chapel } from '../../domain/buildings/catalog/NewBuildings2';
import { Plantation } from '../../domain/Plantation';
import { MayorPhase } from '../../state/phases/MayorPhase';
import type { GameState } from '../../state/GameState';
import type { Action } from '../../actions/Action';
import { GoodType, PlantationType, type PlayerId } from '../../core/types';
import { createGame, applyOk } from '../helpers';

function finishPlayer(state: GameState, pid: PlayerId, choose = (state: GameState, pid: PlayerId): Action => chooseChampionWorkerAction(state, pid, state.getValidActions(pid))): void {
  let steps = 0;
  while (!state.gameOver && state.getCurrentPlayer().id === pid && steps++ < 60) {
    const player = state.getPlayer(pid)!;
    if (player.pendingWorkers + player.pendingNobles === 0) break;
    const action = choose(state, pid);
    expect(action.validate(state).ok).toBe(true);
    applyOk(state, action);
  }
  expect(steps).toBeLessThan(60);
}
function scarceLabour(): GameState {
  const state = createGame();
  const p = state.players[0]!;
  p.island.restorePlantationSlots([PlantationType.Indigo, PlantationType.Sugar, PlantationType.Tobacco, PlantationType.Coffee].map(t => new Plantation(t)));
  for (const Building of [SmallIndigoPlant, SmallSugarMill, TobaccoStorage, CoffeeRoaster, Factory, Harbour, LargeMarket]) p.island.addBuilding(new Building());
  state.restorePhase(new MayorPhase());
  p.pendingWorkers = 3;
  return state;
}

describe('Champion coordinated staffing', () => {
  it('keeps production working instead of staffing three utilities with zero operating income', () => {
    const state = scarceLabour();
    const baseline = cloneGameState(state);
    const pid = state.players[0]!.id;
    finishPlayer(baseline, pid, chooseHeuristicAction);
    expect(Object.values(GoodType).reduce((sum, g) => sum + baseline.players[0]!.island.getProductionCapacity(g), 0)).toBe(0);
    finishPlayer(state, pid);
    const player = state.players[0]!;
    expect(player.island.getProductionCapacity(GoodType.Coffee)).toBe(1);
    expect(player.island.getBuildings().find(b => b.id === 'largeMarket')!.isActive()).toBe(true);
    expect(player.island.getBuildings().find(b => b.id === 'factory')!.isActive()).toBe(false);
  });

  it('allocates the complete plantation/factory pair with two workers', () => {
    const state = createGame();
    const p = state.players[0]!;
    p.island.addBuilding(new LargeIndigoPlant());
    state.restorePhase(new MayorPhase());
    p.pendingWorkers = 2;
    finishPlayer(state, p.id);
    expect(p.island.getProductionCapacity(GoodType.Indigo)).toBe(1);
    expect(p.island.getBuildings()[0]!.occupiedWorkers).toBe(1);
  });

  it('activates the certain large-building endgame bonus before speculative production', () => {
    const state = createGame();
    const p = state.players[0]!;
    p.victoryPointTokens = 40;
    p.island.addBuilding(new CustomsHouse());
    p.island.addBuilding(new LargeIndigoPlant());
    state.supply.victoryPointPool = 3;
    state.restorePhase(new MayorPhase());
    p.pendingWorkers = 1;
    finishPlayer(state, p.id);
    expect(p.island.getBuildings().find(b => b.id === 'customsHouse')!.isActive()).toBe(true);
  });

  it('uses legal noble placement on the dual-effect building while completing production', () => {
    const state = createGame();
    const p = state.players[0]!;
    p.island.restorePlantationSlots([new Plantation(PlantationType.Coffee)]);
    p.island.addBuilding(new CoffeeRoaster());
    p.island.addBuilding(new Chapel());
    state.restorePhase(new MayorPhase());
    state.nobleExpansion = true;
    p.pendingWorkers = 2;
    p.pendingNobles = 1;
    finishPlayer(state, p.id);
    expect(p.island.getProductionCapacity(GoodType.Coffee)).toBe(1);
    expect(p.island.getBuildings().find(b => b.id === 'chapel')!.occupiedNobles).toBe(1);
    expect(p.pendingWorkers + p.pendingNobles).toBe(0);
  });

  it('preserves existing partial placements when completing a production pair', () => {
    const state = createGame();
    const p = state.players[0]!;
    const factory = new LargeIndigoPlant();
    factory.occupiedWorkers = 1;
    p.island.addBuilding(factory);
    state.restorePhase(new MayorPhase());
    p.pendingWorkers = 1;
    finishPlayer(state, p.id);
    expect(p.island.getProductionCapacity(GoodType.Indigo)).toBe(1);
    expect(factory.occupiedWorkers).toBe(1);
  });

  it('keeps surplus labour when a smaller factory would suppress an active larger one', () => {
    const state = createGame();
    const p = state.players[0]!;
    p.island.restorePlantationSlots([new Plantation(PlantationType.Indigo), new Plantation(PlantationType.Indigo)]);
    p.island.addBuilding(new SmallIndigoPlant());
    p.island.addBuilding(new LargeIndigoPlant());
    state.restorePhase(new MayorPhase());
    p.pendingWorkers = 6;
    finishPlayer(state, p.id);
    expect(p.island.getProductionCapacity(GoodType.Indigo)).toBe(2);
    expect(p.island.getBuildings()[0]!.isActive()).toBe(false);
    expect(p.heldWorkers).toBe(1);
  });

  it('does not mutate the state while computing or reusing the complete plan', () => {
    const state = scarceLabour();
    const before = serializeGameState(state);
    const pid = state.getCurrentPlayer().id;
    const first = chooseChampionWorkerAction(state, pid, state.getValidActions(pid));
    expect(chooseChampionWorkerAction(state, pid, state.getValidActions(pid))).toEqual(first);
    expect(serializeGameState(state)).toEqual(before);
  });
});