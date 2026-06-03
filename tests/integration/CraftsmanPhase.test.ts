import { describe, it, expect } from 'vitest';
import { createGame, selectRole, applyOk, activatePlantation, activateBuilding } from '../helpers';
import { RoleType, PlantationType, GoodType, PhaseType } from '../../core/types';
import { SmallIndigoPlant } from '../../domain/buildings/catalog/ProductionBuildings';
import { Factory } from '../../domain/buildings/catalog/SmallUtilityBuildings';

describe('CraftsmanPhase — production in onEnter', () => {
  it('produces corn for player with active corn plantation (no building needed)', () => {
    const state = createGame(3);
    activatePlantation(state.players[0]!, PlantationType.Corn);
    selectRole(state, RoleType.Craftsman);
    expect(state.players[0]!.getStoredGoodCount(GoodType.Corn)).toBe(1);
  });

  it('produces indigo when player has active plantation AND active SmallIndigoPlant', () => {
    const state = createGame(3);
    activatePlantation(state.players[0]!, PlantationType.Indigo);
    const building = new SmallIndigoPlant();
    activateBuilding(state.players[0]!, building);
    selectRole(state, RoleType.Craftsman);
    expect(state.players[0]!.getStoredGoodCount(GoodType.Indigo)).toBe(1);
  });

  it('does NOT produce indigo with only plantation (no production building)', () => {
    const state = createGame(3);
    // Player-0 already has an indigo plantation from game setup, but no building
    selectRole(state, RoleType.Craftsman);
    expect(state.players[0]!.getStoredGoodCount(GoodType.Indigo)).toBe(0);
  });

  it('produces goods for all players simultaneously', () => {
    const state = createGame(3);
    activatePlantation(state.players[0]!, PlantationType.Corn);
    activatePlantation(state.players[1]!, PlantationType.Corn);
    activatePlantation(state.players[2]!, PlantationType.Corn);
    selectRole(state, RoleType.Craftsman);
    expect(state.players[0]!.getStoredGoodCount(GoodType.Corn)).toBe(1);
    expect(state.players[1]!.getStoredGoodCount(GoodType.Corn)).toBe(1);
    expect(state.players[2]!.getStoredGoodCount(GoodType.Corn)).toBe(1);
  });

  it('production capped by supply pool', () => {
    const state = createGame(3);
    state.supply.goodsPool.set(GoodType.Corn, 1); // only 1 corn in supply
    activatePlantation(state.players[0]!, PlantationType.Corn);
    activatePlantation(state.players[1]!, PlantationType.Corn);
    selectRole(state, RoleType.Craftsman);
    const total = state.players[0]!.getStoredGoodCount(GoodType.Corn)
                + state.players[1]!.getStoredGoodCount(GoodType.Corn);
    expect(total).toBe(1); // only 1 available in supply
  });
});

describe('CraftsmanPhase — selector bonus action', () => {
  it('selector with production capacity gets a CraftsmanBonusAction', () => {
    const state = createGame(3);
    activatePlantation(state.players[0]!, PlantationType.Corn);
    selectRole(state, RoleType.Craftsman);
    const actions = state.getValidActions('player-0');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some(a => a.type === 'CRAFTSMAN_BONUS')).toBe(true);
  });

  it('bonus action adds 1 extra good', () => {
    const state = createGame(3);
    activatePlantation(state.players[0]!, PlantationType.Corn);
    selectRole(state, RoleType.Craftsman);
    const cornBefore = state.players[0]!.getStoredGoodCount(GoodType.Corn);
    const bonusAction = state.getValidActions('player-0')[0]!;
    applyOk(state, bonusAction);
    expect(state.players[0]!.getStoredGoodCount(GoodType.Corn)).toBe(cornBefore + 1);
  });

  it('phase transitions after selector uses bonus', () => {
    const state = createGame(3);
    activatePlantation(state.players[0]!, PlantationType.Corn);
    selectRole(state, RoleType.Craftsman);
    const bonus = state.getValidActions('player-0')[0]!;
    applyOk(state, bonus);
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });

  it('immediately transitions if selector produces nothing', () => {
    const state = createGame(3);
    // Governor=Alice selects Craftsman, but Alice produces 0 (no active plants set up beyond starting indigo w/o building)
    selectRole(state, RoleType.Craftsman);
    // Should have immediately transitioned past Craftsman
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });
});

describe('CraftsmanPhase — Factory bonus', () => {
  it('active Factory gives doubloon bonus based on distinct good types produced', () => {
    const state = createGame(3);
    const alice = state.players[0]!;
    // Alice produces 2 different goods: corn + indigo
    activatePlantation(alice, PlantationType.Corn);
    activatePlantation(alice, PlantationType.Indigo);
    const building = new SmallIndigoPlant();
    activateBuilding(alice, building);
    const factory = new Factory();
    activateBuilding(alice, factory);

    const doubloonsBefore = alice.doubloons;
    selectRole(state, RoleType.Craftsman);
    // 2 distinct goods → Factory gives 1 doubloon bonus (2 types → +1)
    expect(alice.doubloons).toBe(doubloonsBefore + 1);
  });
});
