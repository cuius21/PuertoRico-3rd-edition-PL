import { describe, expect, it, vi } from 'vitest';
import { createGame, selectRole, giveGoods } from '../helpers';
import { GoodType, RoleType } from '../../core/types';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { NeuralBot } from '../../src/bots/NeuralBot';
import { HardcoreBot } from '../../src/bots/HardcoreBot';
import { NeuralPolicyNetwork } from '../../src/bots/neural/policyNetwork';
import { cloneGameState } from '../../src/bots/simulation';
import { hardcoreActionKey } from '../../src/bots/hardcorePolicy';
import { createPolicyTeacher } from '../../tools/collect-policy';
import { seededRandom } from '../../tools/arena-core';

function stableStats(bot: { lastSearchStats: object }) {
  const { elapsedMs: _elapsed, ...stats } = bot.lastSearchStats as { elapsedMs: number };
  return stats;
}

describe('neural difficulty runtime adapter', () => {
  it.each([null, RoleType.Builder, RoleType.Trader, RoleType.Settler])(
    'reproduces the validated arena teacher in phase %s without altering the live state', role => {
      const state = createGame();
      giveGoods(state.players[0]!, GoodType.Coffee, 2);
      giveGoods(state.players[0]!, GoodType.Indigo, 2);
      if (role) selectRole(state, role);
      const pid = state.getCurrentPlayer().id, before = JSON.stringify(state);
      const model = new NeuralPolicyNetwork({ hiddenSize: 8, policyMode: 'standalone', seed: 13 });
      const predict = vi.spyOn(model, 'predict');
      const runtime = new NeuralBot(model, { maxIterations: 4, timeBudgetMs: Infinity, random: seededRandom(911) });
      const expected = createPolicyTeacher('neuralSelectiveRollout', 4, seededRandom(911), model);
      const actual = runtime.chooseAction(state, pid);
      expect(predict).toHaveBeenCalled();
      expect(hardcoreActionKey(actual)).toBe(hardcoreActionKey(expected.chooseAction(cloneGameState(state), pid)));
      expect(stableStats(runtime)).toEqual(stableStats(expected));
      expect(runtime.lastSearchStats.evaluatorErrors).toBe(0);
      expect(actual.validate(state).ok).toBe(true);
      expect(JSON.stringify(state)).toBe(before);
    });


  it.each([null, RoleType.Builder, RoleType.Trader, RoleType.Settler])(
    'cached adapter preserves fixed-iteration decisions, values and state in phase %s', role => {
      const state = createGame();
      giveGoods(state.players[0]!, GoodType.Coffee, 2);
      giveGoods(state.players[0]!, GoodType.Indigo, 2);
      if (role) selectRole(state, role);
      const pid = state.getCurrentPlayer().id;
      const before = JSON.stringify(state);
      const descriptors = state.players.map(player => Object.getOwnPropertyDescriptors(player.island));
      const model = new NeuralPolicyNetwork({ hiddenSize: 8, policyMode: 'standalone', seed: 31 });
      const scopes: { phase: string; cached: boolean }[] = [];
      const original = model.policyForLegalActions.bind(model);
      vi.spyOn(model, 'policyForLegalActions').mockImplementation((position, mover, actions) => {
        scopes.push({ phase: position.getCurrentPhase().type,
          cached: Object.prototype.hasOwnProperty.call(position.players[0]!.island, 'getBuildings') });
        return original(position, mover, actions);
      });
      const cached = new NeuralBot(model, { cachePolicy: true, maxIterations: 4, timeBudgetMs: Infinity, random: seededRandom(921) });
      const uncached = new NeuralBot(model, { maxIterations: 4, timeBudgetMs: Infinity, random: seededRandom(921) });
      const actual = cached.chooseAction(state, pid);
      expect(scopes.some(scope => scope.cached)).toBe(true);
      expect(scopes.every(scope => scope.cached === ['roleSelection', 'builder'].includes(scope.phase))).toBe(true);
      scopes.length = 0;
      expect(hardcoreActionKey(actual)).toBe(hardcoreActionKey(uncached.chooseAction(cloneGameState(state), pid)));
      expect(scopes.length).toBeGreaterThan(0);
      expect(scopes.every(scope => !scope.cached)).toBe(true);
      expect(stableStats(cached)).toEqual(stableStats(uncached));
      expect(cached.lastSearchStats.evaluatorErrors).toBe(0);
      expect(actual.validate(state).ok).toBe(true);
      expect(JSON.stringify(state)).toBe(before);
      state.players.forEach((player, index) =>
        expect(Object.getOwnPropertyDescriptors(player.island)).toEqual(descriptors[index]));
    });

  it('restores scoped methods when a cached policy fails and search uses its fallback', () => {
    const state = createGame();
    const before = JSON.stringify(state);
    const descriptors = state.players.map(player => Object.getOwnPropertyDescriptors(player.island));
    const model = new NeuralPolicyNetwork({ hiddenSize: 4, seed: 21 });
    vi.spyOn(model, 'policyForLegalActions').mockImplementation(() => { throw new Error('Deliberate policy failure'); });
    const runtime = new NeuralBot(model, { cachePolicy: true, maxIterations: 2, timeBudgetMs: Infinity, random: seededRandom(922) });
    const action = runtime.chooseAction(state, state.getCurrentPlayer().id);
    expect(action.validate(state).ok).toBe(true);
    expect(runtime.lastSearchStats.evaluatorErrors).toBe(1);
    expect(JSON.stringify(state)).toBe(before);
    state.players.forEach((player, index) =>
      expect(Object.getOwnPropertyDescriptors(player.island)).toEqual(descriptors[index]));
  });

  it.each([false, true].flatMap(cachePolicy => [
    { players: 4 as const, extras: false, cachePolicy },
    { players: 5 as const, extras: false, cachePolicy },
    { players: 3 as const, extras: true, cachePolicy },
  ]))(
    'preserves the frozen Hardcore for unsupported configuration %j', ({ players, extras, cachePolicy }) => {
      const state = GameFactory.create(players, ['A', 'B', 'C', 'D', 'E'].slice(0, players), new RoleSelectionPhase(), {
        festival: extras, corsair: extras, newBuildings: extras, nobleBuildings: extras,
      });
      const pid = state.getCurrentPlayer().id;
      const model = new NeuralPolicyNetwork({ hiddenSize: 4, seed: 17 });
      const predict = vi.spyOn(model, 'predict');
      const runtime = new NeuralBot(model, { cachePolicy, maxIterations: 2, timeBudgetMs: Infinity, random: seededRandom(912) });
      const reference = new HardcoreBot({ maxIterations: 2, timeBudgetMs: Infinity, random: seededRandom(912) });
      expect(hardcoreActionKey(runtime.chooseAction(state, pid)))
        .toBe(hardcoreActionKey(reference.chooseAction(cloneGameState(state), pid)));
      expect(stableStats(runtime)).toEqual(stableStats(reference));
      expect(predict).not.toHaveBeenCalled();
    });
});
