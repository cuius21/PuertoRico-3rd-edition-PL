import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES, NEURAL_INPUT_SIZE } from '../../src/bots/neural/features';
import { NEURAL_ACTION_VOCABULARY } from '../../src/bots/neural/policyFeatures';
import type { PolicyExample } from '../../src/bots/neural/policyFeatures';
import { NeuralPolicyNetwork } from '../../src/bots/neural/policyNetwork';
import { trainPolicyMain, resolvePolicySelectionPhases, policySelectionSamples,
  policyTrainingTargets, measurePolicy } from '../../tools/train-policy';

function sample(phase: string): PolicyExample {
  return { input: new Array<number>(NEURAL_INPUT_SIZE).fill(0), actionIds: [0, 1], baseline: [0.1, 0.9],
    target: [1, 0], phase, mover: 0, teacherIterations: 96, teacherValues: [0.6, 0.4] };
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puerto-selection-phases-')), input = join(directory, 'dataset.json');
  const games = [11, 22].map(seed => ({ seed, samples: [sample('builder'), sample('captain')],
    valueSamples: [], record: { status: 'completed', environmentSeed: seed } }));
  writeFileSync(input, JSON.stringify({ format: 'puerto-rico-search-policy', version: 1,
    featureSchema: NEURAL_FEATURE_SCHEMA, featureNames: [...NEURAL_FEATURE_NAMES],
    actionVocabulary: [...NEURAL_ACTION_VOCABULARY], config: { games: 2, seed: 1, iterations: 96, exploration: 0 }, games }));
  const args = ['--input', input, '--epochs', '3', '--patience', '1', '--hidden-size', '4',
    '--batch-size', '8', '--seed', '13', '--target-temperature', '0.5'];
  return { directory, input, games, args };
}
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('policy checkpoint selection phases', () => {
  it('validates names, inherits saved criteria, permits explicit changes and rejects an empty selected validation set', () => {
    expect(resolvePolicySelectionPhases()).toBeNull();
    expect(resolvePolicySelectionPhases(undefined, {})).toBeNull();
    expect(resolvePolicySelectionPhases('builder,roleSelection')).toEqual(['roleSelection', 'builder']);
    expect(resolvePolicySelectionPhases(undefined, { selectionPhases: ['builder'] })).toEqual(['builder']);
    expect(resolvePolicySelectionPhases('captain', { selectionPhases: ['builder'] })).toEqual(['captain']);
    expect(resolvePolicySelectionPhases('all', { selectionPhases: ['builder'] })).toBeNull();
    for (const phases of ['', 'unknown', 'builder,', 'builder,builder', 'all,builder']) {
      expect(() => resolvePolicySelectionPhases(phases)).toThrow();
    }
    expect(() => resolvePolicySelectionPhases(undefined, { selectionPhases: 'builder' })).toThrow();
    expect(() => policySelectionSamples([sample('captain')], ['builder'])).toThrow('No validation samples');
    const original = [sample('builder')];
    expect(policySelectionSamples(original, null)).toBe(original);
  });

  it('keeps default training weights and optimizer identical to explicitly selecting every observed phase', async () => {
    const data = fixture(), a = join(data.directory, 'default.json'), b = join(data.directory, 'explicit-all.json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await trainPolicyMain([...data.args, '--output', a]);
      await trainPolicyMain([...data.args, '--output', b, '--selection-phases', 'builder,captain']);
    } finally { log.mockRestore(); }
    const old = read(a + '.checkpoint.json'), explicit = read(b + '.checkpoint.json');
    expect(old.metadata.bestEpoch).toBeGreaterThan(0);
    expect(old.parameters).toEqual(explicit.parameters);
    expect(old.optimizer).toEqual(explicit.optimizer);
    expect(old.metadata.validation).toEqual(explicit.metadata.validation);
    expect(old.metadata.validationTargetCrossEntropy).toBe(explicit.metadata.validationTargetCrossEntropy);
    expect(old.metadata.selectionTargetCrossEntropy).toBe(old.metadata.validationTargetCrossEntropy);
    expect(old.metadata.selectionPhases).toBeNull();
    expect(old.metadata.trainingGameSeeds).toEqual(explicit.metadata.trainingGameSeeds);
    expect(old.metadata.validationGameSeeds).toEqual(explicit.metadata.validationGameSeeds);
  });

  it('selects improving active-phase loss despite worsening total loss, while still training all phases', async () => {
    const data = fixture(), total = join(data.directory, 'total.json'), active = join(data.directory, 'active.json');
    const observedBatches: string[][] = [];
    const trainBatch = NeuralPolicyNetwork.prototype.trainBatch;
    const train = vi.spyOn(NeuralPolicyNetwork.prototype, 'trainBatch').mockImplementation(function (this: NeuralPolicyNetwork, samples, options) {
      observedBatches.push(samples.map(example => (example as PolicyExample).phase).sort());
      return trainBatch.call(this, samples, options);
    });
    // Controlled validation trace isolates checkpoint selection from network fitting.
    const loss = vi.spyOn(NeuralPolicyNetwork.prototype, 'loss').mockImplementation(function (this: NeuralPolicyNetwork, samples) {
      const step = this.toJSON({}, true).optimizer!.step;
      return samples.every(example => (example as PolicyExample).phase === 'builder') ? 1 - step * 0.1 : 1 + step * 0.2;
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await trainPolicyMain([...data.args, '--output', total]);
      await trainPolicyMain([...data.args, '--output', active, '--selection-phases', 'builder']);
      const full = read(total), chosen = read(active), checkpoint = read(active + '.checkpoint.json');
      expect(full.metadata.bestEpoch).toBe(0);
      expect(full.metadata.epochsRun).toBe(1);
      expect(chosen.metadata.bestEpoch).toBe(3);
      expect(chosen.metadata.epochsRun).toBe(3);
      expect(chosen.metadata.selectionValidationSamples).toBe(1);
      expect(chosen.metadata.selectionTargetCrossEntropy).toBeCloseTo(0.7, 12);
      expect(chosen.metadata.validationTargetCrossEntropy).toBeCloseTo(1.6, 12);
      expect(chosen.metadata.history.map((row: { selectionTargetCrossEntropy: number }) => row.selectionTargetCrossEntropy))
        .toEqual([0.9, 0.8, 0.7]);
      expect(checkpoint.optimizer.step).toBe(3);
      expect(observedBatches.every(phases => JSON.stringify(phases) === JSON.stringify(['builder', 'captain']))).toBe(true);
      const selected = NeuralPolicyNetwork.fromJSON(checkpoint);
      const validation = data.games.filter(game => chosen.metadata.validationGameSeeds.includes(game.seed)).flatMap(game => game.samples);
      expect(chosen.metadata.validation).toEqual(measurePolicy(selected, validation));
    } finally { log.mockRestore(); train.mockRestore(); loss.mockRestore(); }
  });

  it('recomputes the initial criterion on resume and records explicit changes without changing temperature or game membership', async () => {
    const data = fixture(), first = join(data.directory, 'first.json'), inherited = join(data.directory, 'inherited.json'),
      changed = join(data.directory, 'changed.json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await trainPolicyMain([...data.args, '--output', first, '--selection-phases', 'builder']);
      const resume = read(first + '.checkpoint.json');
      resume.metadata.selectionTargetCrossEntropy = -999;
      writeFileSync(first + '.checkpoint.json', JSON.stringify(resume));
      const args = ['--input', data.input, '--epochs', '1', '--resume', first + '.checkpoint.json'];
      await trainPolicyMain([...args, '--output', inherited]);
      await trainPolicyMain([...args, '--output', changed, '--selection-phases', 'captain']);
      const keep = read(inherited).metadata, update = read(changed).metadata;
      expect(keep.selectionPhases).toEqual(['builder']);
      expect(keep.selectionCriterionChangedOnResume).toBe(false);
      expect(update.selectionPhases).toEqual(['captain']);
      expect(update.previousSelectionPhases).toEqual(['builder']);
      expect(update.selectionCriterionChangedOnResume).toBe(true);
      expect(update.targetTemperature).toBe(0.5);
      expect(update.trainingGameSeeds).toEqual(resume.metadata.trainingGameSeeds);
      expect(update.validationGameSeeds).toEqual(resume.metadata.validationGameSeeds);
      const samples = data.games.filter(game => update.validationGameSeeds.includes(game.seed)).flatMap(game => game.samples);
      const expected = NeuralPolicyNetwork.fromJSON(resume).loss(policySelectionSamples(policyTrainingTargets(samples, 0.5), ['captain']));
      expect(update.initialSelectionTargetCrossEntropy).toBe(expected);
      expect(keep.initialSelectionTargetCrossEntropy).toBeGreaterThan(0);
    } finally { log.mockRestore(); }
  });
});
