import { describe, it, expect } from 'vitest';
import { createGame } from '../helpers';
import { cloneGameState } from '../../src/bots/simulation';
import { NeuralValueNetwork } from '../../src/bots/neural/network';
import type { NeuralExample } from '../../src/bots/neural/network';
import { encodeNeuralState, NEURAL_INPUT_SIZE, NEURAL_FEATURE_NAMES, NEURAL_FEATURE_SCHEMA } from '../../src/bots/neural/features';
import { evaluateHardcoreState } from '../../src/bots/hardcoreEvaluation';
import { parseNeuralDataset, splitByGameSeed } from '../../tools/train-neural';
import type { NeuralTrainingGame } from '../../tools/train-neural';

function sample(values: number[], target: number[]): NeuralExample {
  return { inputs: values.map(value => {
    const row = new Array<number>(NEURAL_INPUT_SIZE).fill(0);
    row[0] = value;
    return row;
  }), target };
}

describe('neural public features', () => {
  it('has an explicit stable finite feature schema and ignores the hidden deck order', () => {
    const state = createGame();
    const other = cloneGameState(state);
    for (const deck of other.supply.plantationDecks) deck.reverse();
    const encoded = encodeNeuralState(state);
    expect(encoded).toHaveLength(3);
    expect(NEURAL_INPUT_SIZE).toBe(NEURAL_FEATURE_NAMES.length);
    expect(new Set(NEURAL_FEATURE_NAMES).size).toBe(NEURAL_INPUT_SIZE);
    for (const row of encoded) {
      expect(row).toHaveLength(NEURAL_INPUT_SIZE);
      expect(row.every(Number.isFinite)).toBe(true);
    }
    expect(encodeNeuralState(other)).toEqual(encoded);
  });

  it('rotating seats rotates predictions without changing player identity evaluations', () => {
    const state = createGame();
    state.players[0]!.doubloons = 20;
    state.players[1]!.victoryPointTokens = 12;
    const rotated = cloneGameState(state);
    rotated.players.push(rotated.players.shift()!);
    rotated.governorIndex = (rotated.governorIndex + 2) % 3;
    rotated.roleSelectorIndex = (rotated.roleSelectorIndex + 2) % 3;
    rotated.currentPlayerIndex = (rotated.currentPlayerIndex + 2) % 3;
    const network = new NeuralValueNetwork({ seed: 99 });
    const original = network.evaluate(state);
    const changed = network.evaluate(rotated);
    expect(changed[0]).toBeCloseTo(original[1]!, 12);
    expect(changed[1]).toBeCloseTo(original[2]!, 12);
    expect(changed[2]).toBeCloseTo(original[0]!, 12);
  });

  it('falls back to the strong heuristic for unsupported configurations', () => {
    const state = createGame(4);
    const network = new NeuralValueNetwork();
    expect(network.supports(state)).toBe(false);
    expect(network.evaluate(state)).toEqual(evaluateHardcoreState(state));
    const expansion = createGame();
    expansion.nobleExpansion = true;
    expect(network.supports(expansion)).toBe(false);
    expect(network.evaluate(expansion)).toEqual(evaluateHardcoreState(expansion));
  });

  it('terminal evaluation uses the actual winner and tie-break rather than predicted value', () => {
    const state = createGame();
    state.gameOver = true;
    state.players[0]!.victoryPointTokens = 12;
    state.players[1]!.victoryPointTokens = 12;
    state.players[1]!.doubloons = 20;
    const network = new NeuralValueNetwork();
    expect(network.evaluate(state)).toEqual([0, 1, 0]);
    state.players[0]!.doubloons = 20;
    expect(network.evaluate(state)).toEqual([0.5, 0.5, 0]);
  });
});

describe('neural learning and portable weights', () => {
  it('backpropagation learns a shared winning feature across all three seats', () => {
    const examples = [
      sample([1, -1, 0], [1, 0, 0]),
      sample([0, 1, -1], [0, 1, 0]),
      sample([-1, 0, 1], [0, 0, 1]),
    ];
    const network = new NeuralValueNetwork({ hiddenSize: 16, seed: 7 });
    const before = network.loss(examples);
    for (let i = 0; i < 100; i++) network.trainBatch(examples, { learningRate: 0.02, l2: 0 });
    expect(network.loss(examples)).toBeLessThan(before * 0.05);
    for (const example of examples) {
      const probabilities = network.predict(example.inputs);
      const winner = example.target.indexOf(1);
      expect(probabilities[winner]).toBeGreaterThan(0.98);
      expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    }
  });

  it('roundtrips parameters and Adam state exactly without sharing weight arrays', () => {
    const examples = [sample([1, 0, -1], [1, 0, 0])];
    const network = new NeuralValueNetwork({ seed: 9, hiddenSize: 16 });
    for (let i = 0; i < 5; i++) network.trainBatch(examples);
    const json = network.toJSON({ games: 10 }, true);
    const restored = NeuralValueNetwork.fromJSON(JSON.parse(JSON.stringify(json)));
    expect(restored.predict(examples[0]!.inputs)).toEqual(network.predict(examples[0]!.inputs));
    network.trainBatch(examples);
    restored.trainBatch(examples);
    expect(restored.toJSON().parameters).toEqual(network.toJSON().parameters);
    const expected = network.predict(examples[0]!.inputs);
    json.parameters.fill(0);
    expect(network.predict(examples[0]!.inputs)).toEqual(expected);
  });

  it('rejects incompatible schemas, malformed weights and invalid training targets', () => {
    const network = new NeuralValueNetwork();
    expect(() => NeuralValueNetwork.fromJSON({ ...network.toJSON(), featureSchema: 'future-format' })).toThrow();
    expect(() => NeuralValueNetwork.fromJSON({ ...network.toJSON(), parameters: [0] })).toThrow();
    const poisoned = network.toJSON();
    poisoned.parameters[0] = Number.NaN;
    expect(() => NeuralValueNetwork.fromJSON(poisoned)).toThrow();
    expect(() => network.trainBatch([sample([1, 0, -1], [1, 1, 0])])).toThrow();
    expect(() => network.trainBatch([sample([1, 0, -1], [1, 0, 0])], { learningRate: -1 })).toThrow();
  });
});

describe('self-play dataset split', () => {
  const games: NeuralTrainingGame[] = [11, 22, 33, 44, 55].map(seed => ({
    seed, policies: ['policy', 'greedy', 'policy'], scores: [10, 9, 8], winners: ['player-0'],
    samples: [sample([1, 0, -1], [1, 0, 0]), sample([0.8, 0.2, -1], [1, 0, 0])],
  }));

  it('keeps every position from each game in one reproducible split', () => {
    const split = splitByGameSeed(games, 71);
    const validationSeeds = new Set(split.validation.map(game => game.seed));
    expect(split.training.length).toBe(4);
    expect(split.validation.length).toBe(1);
    expect(split.training.every(game => !validationSeeds.has(game.seed))).toBe(true);
    expect(splitByGameSeed([...games].reverse(), 71)).toEqual(split);
    expect(split.training.flatMap(game => game.samples)).toHaveLength(8);
  });

  it('rejects duplicate game seeds before training can leak games into validation', () => {
    const dataset = {
      format: 'puerto-rico-self-play', version: 1, featureSchema: NEURAL_FEATURE_SCHEMA,
      featureNames: [...NEURAL_FEATURE_NAMES], games,
    };
    expect(parseNeuralDataset(dataset)).toBe(dataset);
    expect(() => parseNeuralDataset({ ...dataset, games: [...games, games[0]] })).toThrow();
  });
});
