import { describe, expect, it } from 'vitest';
import { ChampionBot } from '../../src/bots/ChampionBot';
import { createGame, selectRole } from '../helpers';
import { RoleType } from '../../core/types';
import { seededRandom } from '../../tools/arena-core';
import { cloneGameState } from '../../src/bots/simulation';
import { serializeGameState } from '../../src/game/GameSerializer';
import { collectTeacherGame } from '../../tools/collect-policy';
import { neuralActionId, NEURAL_ACTION_VOCABULARY } from '../../src/bots/neural/policyFeatures';

describe('candidate search', () => {
  it.each([
    { coordinatedWorkers: true, jointShipping: false },
    { coordinatedWorkers: false, jointShipping: true },
    { coordinatedWorkers: true, jointShipping: true },
  ])('keeps the live state intact with the new economic planners: %j', options => {
    const state = createGame();
    const snapshot = serializeGameState(state);
    const bot = new ChampionBot({ ...options, maxIterations: 3, timeBudgetMs: Infinity, random: seededRandom(150) });
    expect(bot.chooseAction(state, state.getCurrentPlayer().id).validate(state).ok).toBe(true);
    expect(bot.lastSearchStats.iterations).toBe(3);
    expect(serializeGameState(state)).toEqual(snapshot);
  });

  it('contains a failing neural rollout policy and completes search legally', () => {
    const state = createGame();
    const snapshot = serializeGameState(state);
    const bot = new ChampionBot({ maxIterations: 3, timeBudgetMs: Infinity, random: seededRandom(151),
      rolloutPolicy: 'neural', coordinatedWorkers: true, jointShipping: true, evaluatorWeight: 0,
      evaluator: { evaluate: () => { throw new Error('Unused value evaluator'); },
        policy: () => { throw new Error('Policy failed'); } } });
    expect(bot.chooseAction(state, state.getCurrentPlayer().id).validate(state).ok).toBe(true);
    expect(bot.lastSearchStats.iterations).toBe(3);
    expect(bot.lastSearchStats.evaluatorErrors).toBe(1);
    expect(serializeGameState(state)).toEqual(snapshot);
  });

  it.each(['ucb', 'puct'] as const)('counts identical building actions once under %s', selectionRule => {
    const state = createGame();
    state.players[0]!.doubloons = 12;
    selectRole(state, RoleType.Builder);
    const actions = state.getValidActions(state.getCurrentPlayer().id);
    const keys = actions.map(action => JSON.stringify(action));
    expect(keys.length).toBeGreaterThan(new Set(keys).size);
    const snapshot = serializeGameState(state);
    const hostRandom = Math.random;
    const bot = new ChampionBot({ selectionRule, maxIterations: 24, timeBudgetMs: Infinity, random: seededRandom(84) });
    const action = bot.chooseAction(state, state.getCurrentPlayer().id);
    expect(action.validate(state).ok).toBe(true);
    const roots = bot.lastSearchStats.rootActions;
    expect(new Set(roots.map(root => root.key)).size).toBe(roots.length);
    expect(roots.reduce((sum, root) => sum + root.visits, 0)).toBe(24);
    expect(serializeGameState(state)).toEqual(snapshot);
    expect(Math.random).toBe(hostRandom);
  });

  it('keeps seeded choices independent of concealed plantation order', () => {
    const state = createGame();
    const other = cloneGameState(state);
    for (const deck of other.supply.plantationDecks) deck.reverse();
    const options = { selectionRule: 'puct' as const, maxIterations: 24, timeBudgetMs: Infinity, rolloutRounds: 4 };
    const a = new ChampionBot({ ...options, random: seededRandom(48) });
    const b = new ChampionBot({ ...options, random: seededRandom(48) });
    expect(a.chooseAction(state, state.getCurrentPlayer().id)).toEqual(b.chooseAction(other, other.getCurrentPlayer().id));
    expect(a.lastSearchStats.rootActions).toEqual(b.lastSearchStats.rootActions);
  });
});

it('collects normalized teacher policies with supported semantic action IDs', () => {
  const config = { games: 1, iterations: 2, seed: 771026, exploration: 0.08 };
  const game = collectTeacherGame(config, 0);
  expect(game.record.status).toBe('completed');
  expect(game.samples.length).toBeGreaterThan(20);
  for (const sample of game.samples) {
    expect(sample.target.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(sample.target).toHaveLength(sample.actionIds.length);
    expect(sample.actionIds.every(id => id >= 0 && id < NEURAL_ACTION_VOCABULARY.length)).toBe(true);
  }
  const state = createGame();
  for (const action of state.getValidActions(state.getCurrentPlayer().id)) expect(neuralActionId(state, action)).toBeDefined();
});
