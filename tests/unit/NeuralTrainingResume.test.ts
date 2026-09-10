import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { GameFactory } from '../../state/GameFactory';
import { GameState } from '../../state/GameState';
import { NEURAL_INPUT_SIZE, NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES } from '../../src/bots/neural/features';
import { generateTrainingGames, splitByGameSeed, trainNeuralMain } from '../../tools/train-neural';
import type { NeuralTrainingGame } from '../../tools/train-neural';

function game(seed: number): NeuralTrainingGame {
  return {
    seed, policies: ['policy', 'policy', 'greedy'], scores: [12, 10, 9], winners: ['player-0'],
    samples: [{
      inputs: [0, 1, 2].map(() => new Array<number>(NEURAL_INPUT_SIZE).fill(0)),
      target: [1, 0, 0],
    }],
  };
}

describe('resumed self-play validation assignments', () => {
  const previous = { trainingGameSeeds: [11, 22, 33, 44], validationGameSeeds: [55] };
  const oldGames = [11, 22, 33, 44, 55].map(game);

  it('preserves all historical memberships when the dataset and generation seed change', () => {
    const additions = Array.from({ length: 50 }, (_, i) => game(100000 + i * 7919));
    const split = splitByGameSeed([...oldGames, ...additions], 98765, previous);
    const trainingSeeds = new Set(split.training.map(game => game.seed));
    const validationSeeds = new Set(split.validation.map(game => game.seed));
    for (const seed of previous.trainingGameSeeds) {
      expect(trainingSeeds.has(seed)).toBe(true);
      expect(validationSeeds.has(seed)).toBe(false);
    }
    for (const seed of previous.validationGameSeeds) {
      expect(validationSeeds.has(seed)).toBe(true);
      expect(trainingSeeds.has(seed)).toBe(false);
    }
    expect(new Set([...trainingSeeds, ...validationSeeds]).size).toBe(oldGames.length + additions.length);
  });

  it('assigns new seeds consistently across later additions, input orders and run seeds', () => {
    const additions = Array.from({ length: 30 }, (_, i) => game(200000 + i * 7919));
    const first = splitByGameSeed([...oldGames, ...additions.slice(0, 10)], 71, previous);
    const expanded = splitByGameSeed([...oldGames, ...additions].reverse(), 444, previous);
    const expandedValidation = new Set(expanded.validation.map(game => game.seed));
    for (const entry of first.training) expect(expandedValidation.has(entry.seed)).toBe(false);
    for (const entry of first.validation) expect(expandedValidation.has(entry.seed)).toBe(true);
    const secondMetadata = {
      trainingGameSeeds: first.training.map(game => game.seed),
      validationGameSeeds: first.validation.map(game => game.seed),
    };
    const resumedAgain = splitByGameSeed([...oldGames, ...additions], 999, secondMetadata);
    expect(new Set(resumedAgain.training.map(game => game.seed))).toEqual(new Set(expanded.training.map(game => game.seed)));
    expect(new Set(resumedAgain.validation.map(game => game.seed))).toEqual(expandedValidation);
  });

  it('hashes neighboring new game seeds into an approximately twenty-percent holdout', () => {
    const additions = Array.from({ length: 1000 }, (_, i) => ({ ...oldGames[0]!, seed: 10000 + i }));
    const split = splitByGameSeed([...oldGames, ...additions], 71, previous);
    const newHoldoutCount = split.validation.length - previous.validationGameSeeds.length;
    expect(newHoldoutCount).toBeGreaterThan(150);
    expect(newHoldoutCount).toBeLessThan(250);
  });

  it('rejects overlaps, duplicates, missing history and recorded seeds absent from the dataset', () => {
    expect(() => splitByGameSeed(oldGames, 71, { trainingGameSeeds: [11], validationGameSeeds: [11] })).toThrow(/overlap/);
    expect(() => splitByGameSeed(oldGames, 71, { trainingGameSeeds: [11, 11], validationGameSeeds: [55] })).toThrow(/unique/);
    expect(() => splitByGameSeed(oldGames, 71, {})).toThrow(/requires/);
    expect(() => splitByGameSeed(oldGames, 71, { trainingGameSeeds: [11, 999], validationGameSeeds: [55] })).toThrow(/absent/);
    expect(() => splitByGameSeed([...oldGames, oldGames[0]!], 71, previous)).toThrow(/Duplicate/);
  });
});

describe('self-play random streams', () => {
  it('exploration draws cannot change engine chance outcomes when all chosen actions are the same', () => {
    const actualCreate = GameFactory.create;
    const actualActions = GameState.prototype.getValidActions;
    const createSpy = vi.spyOn(GameFactory, 'create').mockImplementation((...args) => {
      const state = actualCreate(...args);
      // The first Settler role must reshuffle, making accidental RNG consumption observable.
      state.supply.discardedPlantations.push(...state.supply.plantationDecks.flat());
      state.supply.plantationDecks = [];
      return state;
    });
    const actionsSpy = vi.spyOn(GameState.prototype, 'getValidActions').mockImplementation(function (this: GameState, playerId) {
      return actualActions.call(this, playerId).slice(0, 1);
    });
    const hostRandom = Math.random;
    try {
      const options = { games: 1, seed: 8123, iterations: 0, maxActions: 4000 };
      const noExploration = generateTrainingGames({ ...options, exploration: 0 });
      const alwaysExplore = generateTrainingGames({ ...options, exploration: 1 });
      expect(noExploration.discarded).toBe(0);
      expect(noExploration.games).toHaveLength(1);
      expect(alwaysExplore).toEqual(noExploration);
      expect(Math.random).toBe(hostRandom);
    } finally {
      actionsSpy.mockRestore();
      createSpy.mockRestore();
    }
  });
});

it('writes a resumable checkpoint when the initial model remains best', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'puerto-checkpoint-test-'));
  const input = join(directory, 'data.json');
  const output = join(directory, 'model.json');
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    writeFileSync(input, JSON.stringify({
      format: 'puerto-rico-self-play', version: 1,
      featureSchema: NEURAL_FEATURE_SCHEMA, featureNames: NEURAL_FEATURE_NAMES,
      games: [game(11), game(22)],
    }));
    // Equal zero input rows always predict a uniform outcome, so no epoch improves validation.
    await trainNeuralMain(['--input', input, '--games', '0', '--epochs', '1', '--output', output]);
    const model = JSON.parse(readFileSync(output, 'utf8'));
    const checkpoint = JSON.parse(readFileSync(output + '.checkpoint.json', 'utf8'));
    expect(model.metadata.bestEpoch).toBe(0);
    expect(checkpoint.parameters).toEqual(model.parameters);
    expect(checkpoint.metadata).toEqual(model.metadata);
    expect(checkpoint.optimizer.step).toBe(0);
  } finally {
    log.mockRestore();
    const absolute = resolve(directory);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !absolute.includes('puerto-checkpoint-test-')) {
      throw new Error('Unexpected test directory');
    }
    rmSync(absolute, { recursive: true, force: true });
  }
});
