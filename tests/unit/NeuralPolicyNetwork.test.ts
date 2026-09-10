import { describe, it, expect } from 'vitest';
import { createGame, selectRole, giveGoods } from '../helpers';
import { GoodType, RoleType } from '../../core/types';
import { PassAction } from '../../actions/PassAction';
import { cloneGameState } from '../../src/bots/simulation';
import { evaluateHardcoreState } from '../../src/bots/hardcoreEvaluation';
import { NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES, NEURAL_INPUT_SIZE, encodeNeuralState, encodeNeuralPlayerState } from '../../src/bots/neural/features';
import { NEURAL_ACTION_VOCABULARY, heuristicPolicyProbabilities } from '../../src/bots/neural/policyFeatures';
import type { PolicyExample } from '../../src/bots/neural/policyFeatures';
import { NeuralPolicyNetwork, NEURAL_POLICY_OUTPUT_SIZE } from '../../src/bots/neural/policyNetwork';
import { splitPolicyGames, parsePolicyDataset, measurePolicy } from '../../tools/train-policy';

function example(value = 0.7, ids = [2, 2, 7], target = [0.1, 0.2, 0.7]): PolicyExample {
  const input = new Array<number>(NEURAL_INPUT_SIZE).fill(0);
  input[0] = value;
  input[NEURAL_INPUT_SIZE - 1] = -0.2;
  return { input, actionIds: ids, baseline: ids.map(() => 1 / ids.length), target,
    phase: 'roleSelection', mover: 0, teacherIterations: 100, teacherValues: ids.map(() => 0.5) };
}

describe('masked neural policy and duplicate semantic actions', () => {
  it('keeps focal encoding and trusted legal-action inference identical for every seat', () => {
    const state = createGame();
    giveGoods(state.players[1]!, GoodType.Coffee, 3);
    state.players[2]!.doubloons = 17;
    const model = new NeuralPolicyNetwork({ policyMode: 'standalone', hiddenSize: 8 });
    const check = () => {
      const rows = encodeNeuralState(state);
      for (const [index, player] of state.players.entries()) {
        expect(encodeNeuralPlayerState(state, player.id)).toEqual(rows[index]);
      }
      const playerId = state.getCurrentPlayer().id;
      const actions = state.getValidActions(playerId);
      expect(model.policyForLegalActions(state, playerId, actions)).toEqual(model.policy(state, playerId, actions));
    };
    check();
    selectRole(state, RoleType.Builder);
    check();
    expect(() => encodeNeuralPlayerState(state, 'missing')).toThrow('Unknown neural player');
  });

  it('starts residual predictions at the heuristic baseline, including repeated IDs', () => {
    const sample = example();
    sample.baseline = [0.6, 0.1, 0.3];
    const model = new NeuralPolicyNetwork({ policyMode: 'residual', hiddenSize: 8 });
    const predicted = model.predict(sample);
    for (let i = 0; i < predicted.length; i++) expect(predicted[i]).toBeCloseTo(sample.baseline[i]!, 12);
  });

  it('normalizes over the ordered legal positions and masks every absent vocabulary entry', () => {
    const model = new NeuralPolicyNetwork({ policyMode: 'standalone', hiddenSize: 8 });
    const sample = example();
    const baseline = model.predict(sample);
    expect(baseline[0]).toBe(baseline[1]);
    expect(baseline.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    const json = model.toJSON();
    const bias = NEURAL_INPUT_SIZE * 8 + 8 + NEURAL_POLICY_OUTPUT_SIZE * 8;
    json.parameters[bias + 20] = 1e6;
    expect(NeuralPolicyNetwork.fromJSON(json).predict(sample)).toEqual(baseline);
    const reordered = { ...sample, actionIds: [7, 2, 2], baseline: [1 / 3, 1 / 3, 1 / 3] };
    expect(model.predict(reordered)[0]).toBeCloseTo(baseline[2]!, 12);
  });

  it('matches numerical cross-entropy gradients with duplicated action IDs', () => {
    const model = new NeuralPolicyNetwork({ policyMode: 'standalone', hiddenSize: 4, seed: 8 });
    const samples = [example()];
    const { gradients } = model.lossAndGradients(samples);
    const hiddenBias = NEURAL_INPUT_SIZE * 4;
    const output = hiddenBias + 4, outputBias = output + NEURAL_POLICY_OUTPUT_SIZE * 4;
    const indices = [0, NEURAL_INPUT_SIZE - 1, hiddenBias, output + 2 * 4, outputBias + 2, outputBias + 7, outputBias + 20];
    const epsilon = 1e-5;
    for (const index of indices) {
      const plus = model.toJSON(), minus = model.toJSON();
      plus.parameters[index]! += epsilon;
      minus.parameters[index]! -= epsilon;
      const numeric = (NeuralPolicyNetwork.fromJSON(plus).loss(samples) - NeuralPolicyNetwork.fromJSON(minus).loss(samples)) / (2 * epsilon);
      expect(gradients[index]).toBeCloseTo(numeric, 7);
    }
    expect(gradients[outputBias + 20]).toBe(0);
  });

  for (const policyMode of ['residual', 'standalone'] as const) {
    it('learns different teacher actions from state features in ' + policyMode + ' mode', () => {
      const a = example(1, [0, 1], [0.98, 0.02]), b = example(-1, [0, 1], [0.02, 0.98]);
      a.baseline = [0.9, 0.1]; b.baseline = [0.9, 0.1];
      const model = new NeuralPolicyNetwork({ policyMode, hiddenSize: 8, seed: 13 });
      const before = model.loss([a, b]);
      for (let batch = 0; batch < 160; batch++) model.trainBatch([a, b], { learningRate: 0.02, l2: 0 });
      expect(model.loss([a, b])).toBeLessThan(before * 0.3);
      expect(model.predict(a)[0]).toBeGreaterThan(0.95);
      expect(model.predict(b)[1]).toBeGreaterThan(0.95);
    });
  }
});

describe('policy evaluator integration', () => {
  it('assigns zero probability to an action excluded by the game even when its validate method accepts it', () => {
    const state = createGame();
    giveGoods(state.players[0]!, GoodType.Corn, 2);
    selectRole(state, RoleType.Captain);
    const player = state.getCurrentPlayer().id, legal = state.getValidActions(player);
    const pass = new PassAction(player);
    expect(pass.validate(state).ok).toBe(true);
    const model = new NeuralPolicyNetwork();
    const probabilities = model.policy(state, player, [...legal, pass]);
    expect(probabilities[probabilities.length - 1]).toBe(0);
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(model.policy(state, player, [pass])).toEqual([0]);
  });

  it('keeps the existing value evaluator and falls back for unsupported states and actions', () => {
    const model = new NeuralPolicyNetwork();
    const four = createGame(4), pid = four.getCurrentPlayer().id, actions = four.getValidActions(pid);
    expect(model.evaluate(four)).toEqual(evaluateHardcoreState(four));
    expect(model.policy(four, pid, actions)).toEqual(heuristicPolicyProbabilities(four, pid, actions));
    const mayor = createGame();
    selectRole(mayor, RoleType.Mayor);
    const actor = mayor.getCurrentPlayer().id, workers = mayor.getValidActions(actor);
    expect(model.policy(mayor, actor, workers)).toEqual(heuristicPolicyProbabilities(mayor, actor, workers));
    expect(model.policy(mayor, actor, [])).toEqual([]);
  });

  it('cannot distinguish different concealed plantation orders', () => {
    const state = createGame(), hidden = cloneGameState(state), model = new NeuralPolicyNetwork({ policyMode: 'standalone' });
    for (const deck of hidden.supply.plantationDecks) deck.reverse();
    const pid = state.getCurrentPlayer().id;
    expect(model.policy(state, pid, state.getValidActions(pid))).toEqual(model.policy(hidden, pid, hidden.getValidActions(pid)));
  });
});

describe('portable policy model validation', () => {
  it('preserves predictions and exact Adam continuation while isolating serialized arrays', () => {
    const sample = example(), model = new NeuralPolicyNetwork({ hiddenSize: 8 });
    for (let i = 0; i < 5; i++) model.trainBatch([sample]);
    const data = model.toJSON({ trainingGameSeeds: [1], validationGameSeeds: [2] }, true);
    const restored = NeuralPolicyNetwork.fromJSON(JSON.parse(JSON.stringify(data)));
    expect(restored.predict(sample)).toEqual(model.predict(sample));
    model.trainBatch([sample]); restored.trainBatch([sample]);
    expect(restored.toJSON().parameters).toEqual(model.toJSON().parameters);
    const expected = restored.predict(sample);
    data.parameters.fill(0);
    expect(restored.predict(sample)).toEqual(expected);
  });

  it('rejects schema, vocabulary, tensor, optimizer, mask and distribution corruption', () => {
    const model = new NeuralPolicyNetwork({ hiddenSize: 8 }), data = model.toJSON({}, true);
    expect(() => NeuralPolicyNetwork.fromJSON({ ...data, version: 99 })).toThrow();
    expect(() => NeuralPolicyNetwork.fromJSON({ ...data, featureNames: [] })).toThrow();
    expect(() => NeuralPolicyNetwork.fromJSON({ ...data, actionVocabulary: [] })).toThrow();
    expect(() => NeuralPolicyNetwork.fromJSON({ ...data, parameters: [0] })).toThrow();
    expect(() => NeuralPolicyNetwork.fromJSON({ ...data, optimizer: { ...data.optimizer, secondMoments: data.parameters.map(() => -1) } })).toThrow();
    expect(() => model.predict({ ...example(), actionIds: [NEURAL_POLICY_OUTPUT_SIZE, 1, 2] })).toThrow();
    expect(() => model.predict({ ...example(), baseline: [0.2, 0.2, 0.2] })).toThrow();
    expect(() => model.trainBatch([{ ...example(), target: [1, 1, 1] }])).toThrow();
  });
});

describe('teacher dataset and whole-game policy validation', () => {
  const games = [11, 22, 33, 44, 55].map(seed => ({ seed, samples: [example(), example(-0.2)],
    valueSamples: [], record: { status: 'completed', environmentSeed: seed } }));
  const dataset = { format: 'puerto-rico-search-policy', version: 1, featureSchema: NEURAL_FEATURE_SCHEMA,
    featureNames: [...NEURAL_FEATURE_NAMES], actionVocabulary: [...NEURAL_ACTION_VOCABULARY],
    config: { games: 5, iterations: 100, seed: 1, exploration: 0 }, games };

  it('validates teacher distributions and complete unique game records', () => {
    expect(parsePolicyDataset(dataset)).toBe(dataset);
    expect(() => parsePolicyDataset({ ...dataset, games: [...games, games[0]] })).toThrow();
    expect(() => parsePolicyDataset({ ...dataset, games: [{ ...games[0], record: { status: 'unfinished', environmentSeed: 11 } }] })).toThrow();
    expect(() => parsePolicyDataset({ ...dataset, games: [{ ...games[0], samples: [{ ...example(), target: [0, 0, 0] }] }] })).toThrow();
  });

  it('never splits positions from one game and preserves prior split membership on resume', () => {
    const initial = splitPolicyGames(games, 17);
    expect(initial.validation).toHaveLength(1);
    const previous = { trainingGameSeeds: initial.training.map(game => game.seed), validationGameSeeds: initial.validation.map(game => game.seed) };
    const additions = Array.from({ length: 20 }, (_, i) => ({ ...games[0]!, seed: 1000 + i }));
    const expanded = splitPolicyGames([...games, ...additions], 999, previous);
    const validation = new Set(expanded.validation.map(game => game.seed));
    expect(initial.training.every(game => !validation.has(game.seed))).toBe(true);
    expect(initial.validation.every(game => validation.has(game.seed))).toBe(true);
    expect(splitPolicyGames([...games].reverse(), 17)).toEqual(initial);
    expect(() => splitPolicyGames(games, 17, { trainingGameSeeds: [11], validationGameSeeds: [11] })).toThrow();
    expect(() => splitPolicyGames(games, 17, { trainingGameSeeds: [999], validationGameSeeds: [11] })).toThrow();
    expect(() => splitPolicyGames(games, 17, {})).toThrow();
  });

  it('reports cross-entropy above target entropy and counts tied teacher top actions fairly', () => {
    const sample = example(0, [0, 1, 2], [0.5, 0.5, 0]);
    sample.baseline = [0.1, 0.8, 0.1];
    const metrics = measurePolicy(null, [sample]);
    expect(metrics.top1Accuracy).toBe(1);
    expect(metrics.crossEntropy).toBeGreaterThan(metrics.targetEntropy);
    expect(metrics.klDivergence).toBeCloseTo(metrics.crossEntropy - metrics.targetEntropy, 12);
  });
});
