import { describe, expect, it, vi } from 'vitest';
import { createGame, selectRole, giveGoods, activatePlantation } from '../helpers';
import { GoodType, RoleType, PlantationType } from '../../core/types';
import { HardcoreBot } from '../../src/bots/HardcoreBot';
import { ChampionBot } from '../../src/bots/ChampionBot';
import { hardcoreActionKey } from '../../src/bots/hardcorePolicy';
import { cloneGameState } from '../../src/bots/simulation';
import { NeuralPolicyNetwork } from '../../src/bots/neural/policyNetwork';
import { heuristicPolicyProbabilities, NEURAL_ACTION_VOCABULARY } from '../../src/bots/neural/policyFeatures';
import { evaluateHardcoreState } from '../../src/bots/hardcoreEvaluation';
import { seededRandom } from '../../tools/arena-core';
import { SEARCH_VARIANTS } from '../../tools/search-lab';
import { parseTeacherMode, teacherPoliciesForGame, collectTeacherGame, createPolicyTeacher,
  createNeuralTeacherEvaluator, NEURAL_TEACHER_PHASES, NEURAL_TEACHER_SETTINGS } from '../../tools/collect-policy';
import type { TeacherGame } from '../../tools/collect-policy';

function stableGame(game: TeacherGame) {
  const { elapsedMs: _elapsed, decisionMs: _timings, ...record } = game.record;
  return { ...game, record };
}
function stableStats(bot: HardcoreBot | ChampionBot) {
  const { elapsedMs: _elapsed, ...stats } = bot.lastSearchStats;
  return stats;
}

describe('policy expert-iteration teacher league', () => {
  it('keeps the old default and deterministically balances mixed teachers across seats without RNG draws', () => {
    expect(parseTeacherMode()).toBe('hardcore');
    expect(parseTeacherMode('neural')).toBe('neural');
    expect(parseTeacherMode('mixed')).toBe('mixed');
    expect(() => parseTeacherMode('unknown')).toThrow();
    expect(teacherPoliciesForGame('hardcore', 3)).toEqual(['hardcore', 'hardcore', 'hardcore']);
    expect(teacherPoliciesForGame('neural', 3)).toEqual(Array(3).fill('neuralSelectiveRollout'));
    const random = vi.spyOn(Math, 'random');
    const schedule = Array.from({ length: 12 }, (_, index) => teacherPoliciesForGame('mixed', index));
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(schedule.map(row => row.filter(policy => policy === 'neuralSelectiveRollout').length))
      .toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
    expect([0, 1, 2].map(seat => schedule.filter(row => row[seat] === 'neuralSelectiveRollout').length)).toEqual([6, 6, 6]);
    expect(schedule[1]).toEqual(['neuralSelectiveRollout', 'hardcore', 'hardcore']);
    expect(schedule[5]).toEqual(['hardcore', 'neuralSelectiveRollout', 'hardcore']);
    expect(schedule[9]).toEqual(['hardcore', 'hardcore', 'neuralSelectiveRollout']);
    expect(() => teacherPoliciesForGame('mixed', -1)).toThrow();
    expect(() => collectTeacherGame({ games: 1, iterations: 1, seed: 1, exploration: 0, teacher: 'mixed' }, 0))
      .toThrow('requires a loaded policy model');
  });

  it('matches the frozen search-lab neural variant and preserves the Hardcore factory exactly', () => {
    const settings = SEARCH_VARIANTS['neuralSelectiveRollout']!;
    expect(NEURAL_TEACHER_SETTINGS).toMatchObject({
      selectionRule: settings.selectionRule, rolloutRounds: settings.rolloutRounds,
      rolloutExploration: settings.rolloutExploration, rolloutPolicy: settings.rolloutPolicy,
      evaluatorWeight: 0, coordinatedWorkers: false, jointShipping: false,
    });
    expect(NEURAL_TEACHER_PHASES).toEqual(settings.neural);
    const state = createGame(), pid = state.getCurrentPlayer().id;
    const old = new HardcoreBot({ maxIterations: 2, timeBudgetMs: Infinity, random: seededRandom(81) });
    const unchanged = createPolicyTeacher('hardcore', 2, seededRandom(81));
    expect(hardcoreActionKey(unchanged.chooseAction(cloneGameState(state), pid)))
      .toBe(hardcoreActionKey(old.chooseAction(cloneGameState(state), pid)));
    expect(stableStats(unchanged)).toEqual(stableStats(old));
    const model = new NeuralPolicyNetwork({ hiddenSize: 8, policyMode: 'standalone', seed: 13 });
    const teacher = createPolicyTeacher('neuralSelectiveRollout', 2, seededRandom(91), model);
    const reference = new ChampionBot({ ...settings, maxIterations: 2, timeBudgetMs: Infinity, random: seededRandom(91),
      evaluatorWeight: 0, evaluator: createNeuralTeacherEvaluator(model) });
    expect(hardcoreActionKey(teacher.chooseAction(cloneGameState(state), pid)))
      .toBe(hardcoreActionKey(reference.chooseAction(cloneGameState(state), pid)));
    expect(stableStats(teacher)).toEqual(stableStats(reference));
  });

  it('uses learned probabilities only in the four selected phases and true heuristic probabilities elsewhere', () => {
    const model = new NeuralPolicyNetwork({ hiddenSize: 8, policyMode: 'standalone' });
    const spy = vi.spyOn(model, 'policyForLegalActions');
    const evaluator = createNeuralTeacherEvaluator(model);
    for (const role of [null, RoleType.Builder, RoleType.Trader, RoleType.Settler, RoleType.Captain, RoleType.Craftsman]) {
      const state = createGame();
      giveGoods(state.players[0]!, GoodType.Corn, 3);
      activatePlantation(state.players[0]!, PlantationType.Corn);
      if (role) { selectRole(state, role); expect(state.getCurrentPhase().type).toBe(role); }
      const pid = state.getCurrentPlayer().id, actions = state.getValidActions(pid);
      spy.mockClear();
      const probabilities = evaluator.policy!(state, pid, actions);
      const neural = (NEURAL_TEACHER_PHASES as readonly string[]).includes(state.getCurrentPhase().type);
      expect(spy).toHaveBeenCalledTimes(neural ? 1 : 0);
      expect(probabilities).toEqual(neural ? model.policyForLegalActions(state, pid, actions) : heuristicPolicyProbabilities(state, pid, actions));
      expect(probabilities).toHaveLength(actions.length);
      expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
      expect(evaluator.evaluate(state)).toEqual(evaluateHardcoreState(state));
    }
  });

  it('reproduces complete mixed games with legal normalized integer-visit labels and per-seat provenance', () => {
    const config = { games: 2, iterations: 1, seed: 27090935, exploration: 0.08,
      teacher: 'mixed' as const, modelHash: 'a'.repeat(64) };
    const model = new NeuralPolicyNetwork({ hiddenSize: 4, policyMode: 'standalone', seed: 13 });
    const first = collectTeacherGame(config, 1, model), repeated = collectTeacherGame(config, 1, model);
    expect(stableGame(repeated)).toEqual(stableGame(first));
    expect(first.record.status).toBe('completed');
    expect(first.teacherPolicies).toEqual(['neuralSelectiveRollout', 'hardcore', 'hardcore']);
    expect(first.teacherModelHash).toBe(config.modelHash);
    expect(first.samples.length).toBeGreaterThan(10);
    for (const sample of first.samples) {
      expect(sample.target.length).toBe(sample.actionIds.length);
      expect(sample.teacherValues.length).toBe(sample.actionIds.length);
      expect(sample.actionIds.every(id => Number.isInteger(id) && id >= 0 && id < NEURAL_ACTION_VOCABULARY.length)).toBe(true);
      expect(sample.target.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
      expect(sample.target.every(value => value >= 0 && value <= 1 &&
        Math.abs(value * sample.teacherIterations - Math.round(value * sample.teacherIterations)) < 1e-10)).toBe(true);
      expect(sample.teacherValues.every(Number.isFinite)).toBe(true);
    }
    expect(first.valueSamples.every(sample => JSON.stringify(sample.target) === JSON.stringify(first.record.winCredits))).toBe(true);
  }, 60000);
});
