import { describe, it, expect } from 'vitest';
import { LoadShipAction } from '../../actions/LoadShipAction';
import { createGame, selectRole, applyOk, giveGoods } from '../helpers';
import { GoodType, RoleType, PhaseType } from '../../core/types';
import { SmallWarehouse } from '../../domain/buildings/catalog/SmallUtilityBuildings';

describe('CaptainPhase — loading order', () => {
  it('selector is first to load', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 1); // Alice (selector) has goods
    selectRole(state, RoleType.Captain);
    expect(state.getCurrentPhase().type).toBe(PhaseType.Captain);
    expect(state.getCurrentPlayer().id).toBe('player-0'); // Alice is first
  });

  it('skips selector to first player who can load (when selector has no goods)', () => {
    const state = createGame(3);
    // Alice (selector) has no goods; Bob has goods
    giveGoods(state.players[1]!, GoodType.Corn, 1);
    selectRole(state, RoleType.Captain);
    expect(state.getCurrentPhase().type).toBe(PhaseType.Captain);
    expect(state.getCurrentPlayer().id).toBe('player-1'); // Skipped to Bob
  });

  it('phase immediately transitions if nobody has goods', () => {
    const state = createGame(3);
    // Nobody has goods
    selectRole(state, RoleType.Captain);
    // Phase should have auto-transitioned past Captain
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });
});

describe('CaptainPhase — VP calculation', () => {
  it('selector gets +1 VP privilege on first load', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 2);
    selectRole(state, RoleType.Captain);
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    // 2 units + 1 privilege = 3 VP
    expect(state.players[0]!.victoryPointTokens).toBe(3);
  });

  it('non-selector gets base VP only', () => {
    const state = createGame(3);
    // Give Bob (non-selector) goods; Alice (selector) has no goods
    giveGoods(state.players[1]!, GoodType.Indigo, 3);
    selectRole(state, RoleType.Captain);
    applyOk(state, new LoadShipAction('player-1', { kind: 'ship', shipIndex: 0 }, GoodType.Indigo));
    // 3 units, no privilege = 3 VP
    expect(state.players[1]!.victoryPointTokens).toBe(3);
  });

  it('multiple players all receive VP from same round of loading', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 1);  // Alice: selector
    giveGoods(state.players[1]!, GoodType.Indigo, 2); // Bob
    giveGoods(state.players[2]!, GoodType.Sugar, 1);  // Carol
    selectRole(state, RoleType.Captain);

    // Alice loads corn: 1+1 = 2 VP
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    // Bob loads indigo: 2 VP
    applyOk(state, new LoadShipAction('player-1', { kind: 'ship', shipIndex: 1 }, GoodType.Indigo));
    // Carol loads sugar: 1 VP
    applyOk(state, new LoadShipAction('player-2', { kind: 'ship', shipIndex: 2 }, GoodType.Sugar));

    expect(state.players[0]!.victoryPointTokens).toBe(2);
    expect(state.players[1]!.victoryPointTokens).toBe(2);
    expect(state.players[2]!.victoryPointTokens).toBe(1);
  });
});

describe('CaptainPhase — consecutive passes → storage', () => {
  it('transitions after all players fail to load', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 1);
    selectRole(state, RoleType.Captain);
    // Alice loads corn (only player with goods)
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    // After Alice loads, no one else can load → consecutive passes → storage → next phase
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });
});

describe('CaptainPhase — storage (processStorage)', () => {
  it('without warehouse: player keeps at most 1 token of most expensive good', () => {
    const state = createGame(3);
    // Bob (non-selector) has 3 corn; Alice (selector) has no goods
    giveGoods(state.players[1]!, GoodType.Corn, 3);
    selectRole(state, RoleType.Captain);
    // Bob loads corn onto the only available ship (capacity 4, Bob has 3)
    applyOk(state, new LoadShipAction('player-1', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    // Phase transitions, processStorage runs
    // Bob loaded all 3, has 0 corn left — nothing to store
    expect(state.players[1]!.getStoredGoodCount(GoodType.Corn)).toBe(0);
  });

  it('excess goods after loading are reduced to 1 token (no warehouse)', () => {
    const state = createGame(3);
    // Ship[0] capacity=4; Bob has 5 corn → loads 4, keeps 1
    // But ship capacity is 4 so Bob can load 4 at most, has 1 left
    // processStorage: keep 1 of most expensive → corn is only good → keep 1
    giveGoods(state.players[1]!, GoodType.Corn, 5);
    selectRole(state, RoleType.Captain);
    applyOk(state, new LoadShipAction('player-1', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    // After loading 4 corn, Bob has 1 left → processStorage keeps 1 → Bob=1 corn
    expect(state.players[1]!.getStoredGoodCount(GoodType.Corn)).toBe(1);
  });

  it('with SmallWarehouse (active): player keeps all tokens of 1 type', () => {
    const state = createGame(3);
    const warehouse = new SmallWarehouse();
    warehouse.occupiedWorkers = 1; // active
    state.players[1]!.island.addBuilding(warehouse);

    // Bob has 5 corn; ship[0] capacity=4 → loads 4, keeps 1
    // SmallWarehouse: can keep all of 1 type fully
    giveGoods(state.players[1]!, GoodType.Corn, 5);
    selectRole(state, RoleType.Captain);
    applyOk(state, new LoadShipAction('player-1', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    // Bob keeps all remaining 1 corn (only 1 type, fully kept by warehouse)
    expect(state.players[1]!.getStoredGoodCount(GoodType.Corn)).toBe(1);
  });
});

describe('CaptainPhase — ship management', () => {
  it('full ships cleared in onExit', () => {
    const state = createGame(3);
    // Load ship[0] (capacity=4) exactly full
    giveGoods(state.players[0]!, GoodType.Corn, 4);
    selectRole(state, RoleType.Captain);
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    // After phase ends, full ships cleared
    expect(state.ships[0]!.loadedCount).toBe(0);
    expect(state.ships[0]!.loadedGood).toBeNull();
  });

  it('partial ships NOT cleared in onExit (carry over to next round)', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 2); // partial load (capacity=4)
    selectRole(state, RoleType.Captain);
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    // Phase ends, ship[0] has 2/4 corn → NOT cleared
    expect(state.ships[0]!.loadedCount).toBe(2);
    expect(state.ships[0]!.loadedGood).toBe(GoodType.Corn);
  });
});
