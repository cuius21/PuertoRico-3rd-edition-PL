import { describe, it, expect } from 'vitest';
import { BuildAction } from '../../../actions/BuildAction';
import { PassAction } from '../../../actions/PassAction';
import { createGame, selectRole, applyOk, activatePlantation } from '../../helpers';
import { RoleType, PlantationType, PhaseType } from '../../../core/types';
import { SmallIndigoPlant, SmallSugarMill } from '../../../domain/buildings/catalog/ProductionBuildings';
import { Smithy, SmallMarket } from '../../../domain/buildings/catalog/SmallUtilityBuildings';

function enterBuilderPhase(playerCount: 3 | 4 | 5 = 3) {
  const state = createGame(playerCount);
  selectRole(state, RoleType.Builder);
  expect(state.getCurrentPhase().type).toBe(PhaseType.Builder);
  return state;
}

describe('BuildAction.validate', () => {
  it('fails outside builder phase', () => {
    const state = createGame(3);
    // Still in RoleSelection
    const result = state.apply(new BuildAction('player-0', 'smallIndigoPlant'));
    expect(result.ok).toBe(false);
  });

  it('fails when not current player', () => {
    const state = enterBuilderPhase();
    // Alice (player-0) is selector and current — try Bob's action
    const result = state.apply(new BuildAction('player-1', 'smallIndigoPlant'));
    expect(result.ok).toBe(false);
  });

  it('fails when player cannot afford the building', () => {
    const state = createGame(3);
    state.players[0]!.doubloons = 0; // no doubloons
    selectRole(state, RoleType.Builder);
    // SmallIndigoPlant costs 1, with builder privilege (selector) = 0 → should succeed
    // Force base cost check: use a building that costs more
    const result = state.apply(new BuildAction('player-0', 'largeSugarMill'));
    // largeSugarMill costs 4, with 1 privilege = 3, player has 0 → fail
    expect(result.ok).toBe(false);
  });

  it('fails when player already owns the building', () => {
    const state = createGame(3);
    const existing = new SmallIndigoPlant();
    state.players[0]!.island.addBuilding(existing);
    selectRole(state, RoleType.Builder);
    const result = state.apply(new BuildAction('player-0', 'smallIndigoPlant'));
    expect(result.ok).toBe(false);
  });

  it('fails when no urban space left', () => {
    const state = createGame(3);
    // Fill all 12 urban slots with SmallMarket (tileSize=1)
    for (let i = 0; i < 12; i++) {
      state.players[0]!.island.addBuilding(new SmallMarket());
    }
    selectRole(state, RoleType.Builder);
    const result = state.apply(new BuildAction('player-0', 'smallIndigoPlant'));
    expect(result.ok).toBe(false);
  });
});

describe('BuildAction cost calculation', () => {
  it('builder (selector) gets -1 privilege', () => {
    const state = createGame(3);
    state.players[0]!.doubloons = 0; // will only succeed if cost = 0
    selectRole(state, RoleType.Builder);
    // SmallIndigoPlant costs 1, privilege -1 = 0
    const result = state.apply(new BuildAction('player-0', 'smallIndigoPlant'));
    expect(result.ok).toBe(true);
    expect(state.players[0]!.doubloons).toBe(0); // paid 0
  });

  it('non-selector pays full cost', () => {
    const state = createGame(3);
    state.players[0]!.doubloons = 10;
    state.players[1]!.doubloons = 2;
    selectRole(state, RoleType.Builder);
    // Alice (selector) builds and passes turn to Bob
    applyOk(state, new PassAction('player-0'));
    // Bob pays full 1 for SmallIndigoPlant
    applyOk(state, new BuildAction('player-1', 'smallIndigoPlant'));
    expect(state.players[1]!.doubloons).toBe(1); // 2 - 1 = 1
  });

  it('active quarry gives 1 discount (within priceGroup cap)', () => {
    const state = createGame(3);
    activatePlantation(state.players[0]!, PlantationType.Quarry);
    state.players[0]!.doubloons = 10;
    selectRole(state, RoleType.Builder);
    // SmallSugarMill: cost=2, priceGroup=1, builder privilege-1, quarry-1 → max(0,2-1-1)=0
    const doubloonsBefore = state.players[0]!.doubloons;
    applyOk(state, new BuildAction('player-0', 'smallSugarMill'));
    expect(state.players[0]!.doubloons).toBe(doubloonsBefore); // paid 0
  });

  it('quarry discount capped by priceGroup', () => {
    const state = createGame(3);
    // 3 active quarries on Alice — but priceGroup 1 limits discount to 1
    activatePlantation(state.players[0]!, PlantationType.Quarry);
    activatePlantation(state.players[0]!, PlantationType.Quarry);
    activatePlantation(state.players[0]!, PlantationType.Quarry);
    state.players[0]!.doubloons = 10;
    selectRole(state, RoleType.Builder);
    // SmallIndigoPlant: cost=1, priceGroup=1, builder-1, quarry min(3,1)=1 → max(0,1-1-1)=0
    applyOk(state, new BuildAction('player-0', 'smallIndigoPlant'));
    expect(state.players[0]!.doubloons).toBe(10); // cost=0, paid 0
  });

  it('smithy adds 1 to quarry discount cap', () => {
    const state = createGame(3);
    // 2 active quarries, smithy active → cap = priceGroup(1) + 1 = 2 quarry discount
    activatePlantation(state.players[0]!, PlantationType.Quarry);
    activatePlantation(state.players[0]!, PlantationType.Quarry);
    const smithy = new Smithy();
    smithy.occupiedWorkers = 1; // active
    state.players[0]!.island.addBuilding(smithy);
    state.players[0]!.doubloons = 10;
    selectRole(state, RoleType.Builder);
    // SmallSugarMill: cost=2, priceGroup=1, smithy → cap=2, quarry discount=2, builder-1
    // cost = max(0, 2 - 2 - 1) = 0
    applyOk(state, new BuildAction('player-0', 'smallSugarMill'));
    expect(state.players[0]!.doubloons).toBe(10); // paid 0
  });
});

describe('BuildAction.execute', () => {
  it('adds building to player island', () => {
    const state = createGame(3);
    state.players[0]!.doubloons = 10;
    selectRole(state, RoleType.Builder);
    applyOk(state, new BuildAction('player-0', 'smallIndigoPlant'));
    expect(state.players[0]!.island.hasBuildingOfType('smallIndigoPlant')).toBe(true);
  });

  it('removes building from supply', () => {
    const state = createGame(3);
    const beforeCount = state.supply.availableBuildings.filter(b => b.id === 'smallIndigoPlant').length;
    state.players[0]!.doubloons = 10;
    selectRole(state, RoleType.Builder);
    applyOk(state, new BuildAction('player-0', 'smallIndigoPlant'));
    const afterCount = state.supply.availableBuildings.filter(b => b.id === 'smallIndigoPlant').length;
    expect(afterCount).toBe(beforeCount - 1);
  });

  it('doubloons deposited back to bank', () => {
    const state = createGame(3);
    const bankBefore = state.supply.doubloonsInBank;
    state.players[0]!.doubloons = 5;
    selectRole(state, RoleType.Builder);
    // SmallIndigoPlant: cost=1, builder privilege -1 = 0. Actually Alice is selector, pays 0
    applyOk(state, new BuildAction('player-0', 'smallIndigoPlant'));
    // Alice paid 0, so bank unchanged
    expect(state.supply.doubloonsInBank).toBe(bankBefore);

    // Bob (non-selector) pays 1
    applyOk(state, new BuildAction('player-1', 'smallIndigoPlant'));
    expect(state.supply.doubloonsInBank).toBe(bankBefore + 1);
  });

  it('advances current player after build', () => {
    const state = createGame(3);
    state.players[0]!.doubloons = 10;
    selectRole(state, RoleType.Builder);
    expect(state.getCurrentPlayer().id).toBe('player-0');
    applyOk(state, new BuildAction('player-0', 'smallIndigoPlant'));
    expect(state.getCurrentPlayer().id).toBe('player-1');
  });
});
