import { describe, expect, it } from 'vitest';
import { createGame } from '../helpers';
import { NeuralValueNetwork, type NeuralExample } from '../../src/bots/neural/network';
import { NEURAL_INPUT_SIZE, NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES } from '../../src/bots/neural/features';
import { evaluateHardcoreState } from '../../src/bots/hardcoreEvaluation';
import { generateTrainingGames, parseNeuralDataset } from '../../tools/train-neural';
import { pairedComparison } from '../../tools/neural-lab';
import type { GameRecord } from '../../tools/arena-core';

describe('residual neural value', () => {
  it('starts at the existing evaluation and preserves that prior when serialized', () => {
    const state = createGame();
    state.players[0]!.doubloons = 15;
    state.players[1]!.victoryPointTokens = 10;
    const model = new NeuralValueNetwork({ valueMode: 'residual', seed: 18 });
    const restored = NeuralValueNetwork.fromJSON(JSON.parse(JSON.stringify(model.toJSON())));
    const baseline = evaluateHardcoreState(state);
    expect(model.toJSON().version).toBe(2);
    expect(restored.valueMode).toBe('residual');
    for (let i = 0; i < 3; i++) expect(restored.evaluate(state)[i]).toBeCloseTo(baseline[i]!, 12);
  });

  it('learns a correction when a baseline consistently favors the wrong player', () => {
    const inputs = [1, 0, -1].map(value => {
      const row = new Array<number>(NEURAL_INPUT_SIZE).fill(0);
      row[0] = value;
      return row;
    });
    const samples: NeuralExample[] = [0, 1, 2].map(offset => ({
      inputs: [0, 1, 2].map(i => inputs[(i + offset) % 3]!),
      baseline: [0, 1, 2].map(i => [0.1, 0.2, 0.7][(i + offset) % 3]!),
      target: [0, 1, 2].map(i => Number((i + offset) % 3 === 0)),
    }));
    const model = new NeuralValueNetwork({ valueMode: 'residual', hiddenSize: 8, seed: 21 });
    const initial = model.loss(samples);
    for (let i = 0; i < 100; i++) model.trainBatch(samples, { learningRate: 0.02 });
    expect(model.loss(samples)).toBeLessThan(initial * 0.03);
    const restored = NeuralValueNetwork.fromJSON(model.toJSON({}, true));
    model.trainBatch(samples);
    restored.trainBatch(samples);
    expect(restored.toJSON().parameters).toEqual(model.toJSON().parameters);
    expect(() => model.predict(inputs)).toThrow(/baseline/);
    expect(() => model.predict(inputs, [1, 1, 1])).toThrow();
    expect(() => NeuralValueNetwork.fromJSON({ ...model.toJSON(), version: 1 })).toThrow();
  });
});

it('collects baseline values from reproducible all-Hardcore games independent of worker partitioning', () => {
  const options = { games: 2, seed: 1190, iterations: 1, maxActions: 5000,
    league: 'hardcore' as const, exploration: 0, samplesPerGame: 4 };
  const together = generateTrainingGames(options);
  const separated = [0, 1].flatMap(gameOffset => generateTrainingGames({ ...options, games: 1, gameOffset }).games);
  expect(together.discarded).toBe(0);
  expect(together.games).toEqual(separated);
  expect(together.games.every(game => game.policies.every(policy => policy === 'search'))).toBe(true);
  expect(together.games.every(game => game.samples.length === 4 && game.samples.every(sample => sample.baseline?.length === 3))).toBe(true);
  const dataset = { format: 'puerto-rico-self-play', version: 1, featureSchema: NEURAL_FEATURE_SCHEMA,
    featureNames: [...NEURAL_FEATURE_NAMES], games: together.games };
  expect(parseNeuralDataset(dataset)).toBe(dataset);
  const corrupted = structuredClone(dataset);
  corrupted.games[0]!.samples[0]!.baseline = [1, 1, 0];
  expect(() => parseNeuralDataset(corrupted)).toThrow(/baseline/);
});

it('pairs comparisons by seed and seat and accounts for the measured control', () => {
  const records = [0, 1, 2, 3, 4, 5].map(gameIndex => ({ gameIndex,
    environmentSeed: Math.floor(gameIndex / 3), candidateSeat: gameIndex % 3,
    status: 'completed', candidateWinCredit: Number(gameIndex % 3 === 0), candidateScoreMargin: 0,
  } as GameRecord));
  const identical = pairedComparison(records, [...records].reverse(), 78);
  expect(identical.winRateDifference).toBe(0);
  expect(identical.winRateDifference95).toBeNull();
  const candidate = structuredClone(records);
  candidate[1]!.candidateWinCredit = 1;
  candidate[1]!.candidateScoreMargin = 3;
  const improved = pairedComparison(candidate, records, 78);
  expect(improved.winRateDifference).toBeCloseTo(1 / 6);
  expect(improved.meanScoreMarginDifference).toBe(0.5);
  expect(improved.independentSeeds).toBe(2);
  candidate[0]!.environmentSeed = 999;
  expect(() => pairedComparison(candidate, records, 78)).toThrow(/match/);
  expect(() => pairedComparison(records, records.slice(1), 78)).toThrow(/Unmatched/);
});
