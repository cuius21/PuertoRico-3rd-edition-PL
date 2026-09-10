import { describe, expect, it } from 'vitest';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { SelectRoleAction } from '../../actions/SelectRoleAction';
import { RoleType } from '../../core/types';

function createCorsairGame(players: 3 | 5 = 3) {
  return GameFactory.create(players, Array.from({ length: players }, (_, i) => 'Player ' + i), new RoleSelectionPhase(), {
    festival: false, corsair: true, newBuildings: false, nobleBuildings: false,
  });
}

describe('Corsair role legal-action generation', () => {
  it('does not offer Corsair again to the player holding its token', () => {
    const state = createCorsairGame();
    const pid = state.getCurrentPlayer().id;
    state.corsairTokenHolderId = pid;
    const actions = state.getValidActions(pid) as SelectRoleAction[];
    expect(new SelectRoleAction(pid, RoleType.Corsair).validate(state).ok).toBe(false);
    expect(actions.some(action => action.role === RoleType.Corsair)).toBe(false);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every(action => action.validate(state).ok)).toBe(true);
  });

  it('still offers Corsair when another player holds the token', () => {
    const state = createCorsairGame();
    state.corsairTokenHolderId = state.players[1]!.id;
    const actions = state.getValidActions(state.getCurrentPlayer().id) as SelectRoleAction[];
    expect(actions.some(action => action.role === RoleType.Corsair)).toBe(true);
    expect(actions.every(action => action.validate(state).ok)).toBe(true);
  });

  it('preserves distinct legal Prospector cards in five-player games', () => {
    const state = createCorsairGame(5);
    const pid = state.getCurrentPlayer().id;
    state.corsairTokenHolderId = pid;
    const actions = state.getValidActions(pid) as SelectRoleAction[];
    const prospectors = actions.filter(action => action.role === RoleType.Prospector);
    expect(prospectors).toHaveLength(2);
    expect(new Set(prospectors.map(action => action.cardIndex)).size).toBe(2);
    expect(actions.every(action => action.validate(state).ok)).toBe(true);
  });
});
