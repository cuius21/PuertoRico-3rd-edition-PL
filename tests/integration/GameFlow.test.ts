import { describe, it, expect } from 'vitest';
import { PassAction } from '../../actions/PassAction';
import { MayorPassAction } from '../../actions/MayorPassAction';
import { LoadShipAction } from '../../actions/LoadShipAction';
import { createGame, selectRole, applyOk, giveGoods } from '../helpers';
import { RoleType, PhaseType, GoodType } from '../../core/types';

describe('GameFlow — role selection transitions', () => {
  it('selecting Mayor transitions to MayorPhase', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Mayor);
    expect(state.getCurrentPhase().type).toBe(PhaseType.Mayor);
  });

  it('selecting Settler transitions to SettlerPhase', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Settler);
    expect(state.getCurrentPhase().type).toBe(PhaseType.Settler);
  });

  it('selecting Builder transitions to BuilderPhase', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Builder);
    expect(state.getCurrentPhase().type).toBe(PhaseType.Builder);
  });

  it('selecting Craftsman auto-transitions if selector cannot produce', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Craftsman);
    // Alice (selector) produces nothing from starting indigo (no production building) → auto-transition
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });

  it('selecting Trader transitions to TraderPhase', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Trader);
    expect(state.getCurrentPhase().type).toBe(PhaseType.Trader);
  });

  it('selecting Captain transitions to CaptainPhase when player has goods', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 1);
    selectRole(state, RoleType.Captain);
    expect(state.getCurrentPhase().type).toBe(PhaseType.Captain);
  });
});

describe('GameFlow — round completion', () => {
  it('after 3 roles played, roundNumber increments and new RoleSelectionPhase starts', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Builder);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
    selectRole(state, RoleType.Settler);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
    selectRole(state, RoleType.Trader);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));

    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
    expect(state.roundNumber).toBe(1);
  });

  it('governor picks first in round 1, next player in round 2', () => {
    const state = createGame(3);
    expect(state.getCurrentPlayer().id).toBe('player-0'); // Alice (governor) picks first

    selectRole(state, RoleType.Builder);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
    selectRole(state, RoleType.Settler);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
    selectRole(state, RoleType.Trader);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));

    expect(state.getCurrentPlayer().id).toBe('player-1'); // Bob (new governor) picks first
  });

  it('second pick in a round belongs to governor+1', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Builder); // Alice picks
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
    // Now in RoleSelection for 2nd pick: Bob should be current
    expect(state.getCurrentPlayer().id).toBe('player-1');
  });

  it('roleSelectorIndex is set to the picking player', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Builder);
    expect(state.roleSelectorIndex).toBe(0); // Alice (player-0)
  });
});

describe('GameFlow — full Mayor + Captain round', () => {
  it('ships goods earned via Craftsman and awards VP', () => {
    const state = createGame(3);
    // Give Carol goods directly (simulating production)
    giveGoods(state.players[2]!, GoodType.Corn, 2);

    // Alice picks Mayor
    selectRole(state, RoleType.Mayor);
    applyOk(state, new MayorPassAction('player-0'));
    applyOk(state, new MayorPassAction('player-1'));
    applyOk(state, new MayorPassAction('player-2'));

    // Bob picks Settler (2nd pick)
    selectRole(state, RoleType.Settler);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));

    // Carol picks Captain (3rd pick)
    selectRole(state, RoleType.Captain);
    expect(state.getCurrentPhase().type).toBe(PhaseType.Captain);

    // Carol (selector) loads her 2 corn
    applyOk(state, new LoadShipAction('player-2', { kind: 'ship', shipIndex: 0 }, GoodType.Corn));

    // Phase complete, Carol has VP tokens
    expect(state.players[2]!.victoryPointTokens).toBe(3); // 2 base + 1 captain privilege
    expect(state.roundNumber).toBe(1);
  });
});

describe('GameFlow — game over guard', () => {
  it('apply() returns error after gameOver', () => {
    const state = createGame(3);
    state.supply.victoryPointPool = 0;

    selectRole(state, RoleType.Builder);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
    selectRole(state, RoleType.Settler);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
    selectRole(state, RoleType.Trader);
    for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));

    expect(state.gameOver).toBe(true);
    const result = state.apply(new PassAction('player-0'));
    expect(result.ok).toBe(false);
  });
});
