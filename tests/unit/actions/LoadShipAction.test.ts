import { describe, it, expect } from 'vitest';
import { LoadShipAction } from '../../../actions/LoadShipAction';
import { createGame, selectRole, applyOk, giveGoods } from '../../helpers';
import { GoodType, RoleType, PhaseType } from '../../../core/types';

function enterCaptainPhase(playerCount: 3 | 4 | 5 = 3) {
  const state = createGame(playerCount);
  // Give Alice (the future captain selector) goods so the phase doesn't auto-skip
  giveGoods(state.players[0]!, GoodType.Corn, 3);
  selectRole(state, RoleType.Captain);
  expect(state.getCurrentPhase().type).toBe(PhaseType.Captain);
  return state;
}

describe('LoadShipAction.validate', () => {
  it('fails outside captain phase', () => {
    const state = createGame(3);
    const result = state.apply(new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(result.ok).toBe(false);
  });

  it('fails when not current player', () => {
    const state = enterCaptainPhase();
    // Alice is current (selector) — Bob tries to load
    giveGoods(state.players[1]!, GoodType.Corn, 1);
    const result = state.apply(new LoadShipAction('player-1', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(result.ok).toBe(false);
  });

  it('fails when player has none of the requested good', () => {
    const state = enterCaptainPhase();
    const result = state.apply(new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Coffee));
    expect(result.ok).toBe(false);
  });

  it('fails when good is already on a different ship', () => {
    const state = createGame(3);
    // Put corn on ship[1] already
    state.ships[1]!.loadedGood = GoodType.Corn;
    state.ships[1]!.loadedCount = 1;
    giveGoods(state.players[0]!, GoodType.Corn, 2);
    selectRole(state, RoleType.Captain);
    // Alice tries to load corn on ship[0] (but corn is on ship[1])
    const result = state.apply(new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(result.ok).toBe(false);
  });

  it('fails when ship is full', () => {
    const state = createGame(3);
    // Fill ship[0] (capacity=4) completely with corn
    state.ships[0]!.loadedGood = GoodType.Corn;
    state.ships[0]!.loadedCount = 4;
    giveGoods(state.players[0]!, GoodType.Corn, 1);
    selectRole(state, RoleType.Captain);
    const result = state.apply(new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(result.ok).toBe(false);
  });
});

describe('LoadShipAction.execute — ship loading', () => {
  it('loads goods onto ship up to remaining capacity', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 10);
    giveGoods(state.players[1]!, GoodType.Indigo, 2); // keep phase alive so full ship isn't cleared
    selectRole(state, RoleType.Captain);
    // ship[0] capacity=4, Alice has 10 corn → loads 4 (capped at capacity)
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(state.ships[0]!.loadedCount).toBe(4);
    expect(state.ships[0]!.loadedGood).toBe(GoodType.Corn);
    expect(state.players[0]!.getStoredGoodCount(GoodType.Corn)).toBe(6);
  });

  it('loads all goods when fewer than capacity', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 2);
    selectRole(state, RoleType.Captain);
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(state.ships[0]!.loadedCount).toBe(2);
    expect(state.players[0]!.getStoredGoodCount(GoodType.Corn)).toBe(0);
  });

  it('sets loadedGood on previously empty ship', () => {
    const state = enterCaptainPhase();
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(state.ships[0]!.loadedGood).toBe(GoodType.Corn);
  });
});

describe('LoadShipAction.execute — VP calculation', () => {
  it('awards 1 VP per unit loaded', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 3);
    selectRole(state, RoleType.Captain);
    const vpBefore = state.players[0]!.victoryPointTokens;
    const poolBefore = state.supply.victoryPointPool;
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    // 3 units loaded → 3 VP base + 1 captain privilege = 4 VP total
    expect(state.players[0]!.victoryPointTokens).toBe(vpBefore + 4);
    expect(state.supply.victoryPointPool).toBe(poolBefore - 4);
  });

  it('captain selector gets +1 VP privilege on first load', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 1);
    selectRole(state, RoleType.Captain);
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(state.players[0]!.victoryPointTokens).toBe(2); // 1 base + 1 privilege
  });

  it('selector privilege applies only once per phase', () => {
    const state = createGame(3);
    // Alice (selector) has corn and indigo → can load twice in a round
    giveGoods(state.players[0]!, GoodType.Corn, 1);
    giveGoods(state.players[0]!, GoodType.Indigo, 1);
    // Give Bob and Carol goods too so the phase doesn't end after Alice's first load
    giveGoods(state.players[1]!, GoodType.Sugar, 1);
    giveGoods(state.players[2]!, GoodType.Tobacco, 1);
    selectRole(state, RoleType.Captain);

    // Alice loads corn: 1 base + 1 privilege = 2
    applyOk(state, new LoadShipAction('player-0', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(state.players[0]!.victoryPointTokens).toBe(2);
    expect(state.players[0]!.hasUsedCaptainBonusThisPhase).toBe(true);
  });

  it('non-selector does not get privilege', () => {
    const state = createGame(3);
    // Alice (selector) has no goods; Bob has goods → Bob loads
    giveGoods(state.players[1]!, GoodType.Corn, 2);
    selectRole(state, RoleType.Captain);
    // Phase skips Alice (no goods), Bob is current
    expect(state.getCurrentPlayer().id).toBe('player-1');
    applyOk(state, new LoadShipAction('player-1', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));
    expect(state.players[1]!.victoryPointTokens).toBe(2); // 2 base, no privilege
  });
});
