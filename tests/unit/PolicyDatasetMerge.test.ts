import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES, NEURAL_INPUT_SIZE } from '../../src/bots/neural/features';
import { NEURAL_ACTION_VOCABULARY } from '../../src/bots/neural/policyFeatures';
import type { PolicyExample } from '../../src/bots/neural/policyFeatures';
import { mergePolicyDatasets, mergePolicyMain } from '../../tools/merge-policy';
import { parsePolicyDataset } from '../../tools/train-policy';

function source(seed: number, neural = false) {
  const sample: PolicyExample = { input: new Array<number>(NEURAL_INPUT_SIZE).fill(0), actionIds: [0, 1],
    baseline: [0.6, 0.4], target: [0.5, 0.5], phase: 'roleSelection', mover: 0,
    teacherIterations: 96, teacherValues: [0.5, 0.5] };
  return { path: 'source-' + seed + '.json', sha256: 'a'.repeat(64), dataset: {
    format: 'puerto-rico-search-policy', version: 1, featureSchema: NEURAL_FEATURE_SCHEMA,
    featureNames: [...NEURAL_FEATURE_NAMES], actionVocabulary: [...NEURAL_ACTION_VOCABULARY],
    config: { games: 1, iterations: 96, seed, exploration: 0.08,
      ...(neural ? { teacher: 'neural', modelHash: 'b'.repeat(64) } : {}) },
    ...(neural ? { metadata: { teacher: 'neural', modelHash: 'b'.repeat(64), originalNote: 'frozen expert' } } : {}),
    games: [{ seed, ...(neural ? { teacherPolicies: ['neuralSelectiveRollout', 'neuralSelectiveRollout', 'neuralSelectiveRollout'],
      teacherModelHash: 'b'.repeat(64) } : {}), originalTeacherNote: 'preserve',
      samples: [sample], valueSamples: [], record: { status: 'completed', environmentSeed: seed, policies: ['hardcore', 'hardcore', 'hardcore'] } }],
  } };
}

describe('complete policy dataset merge', () => {
  it('concatenates unchanged samples in source order while preserving and normalizing teacher provenance', () => {
    const a = source(22), b = source(11, true), before = JSON.stringify([a, b]);
    const merged = mergePolicyDatasets([a, b]);
    expect(merged.games.map(game => game.seed)).toEqual([22, 11]);
    expect(merged.games[0]!.samples).toBe(a.dataset.games[0]!.samples);
    expect(merged.games[1]!.samples).toBe(b.dataset.games[0]!.samples);
    expect(merged.games[0]!.record).toBe(a.dataset.games[0]!.record);
    expect(merged.games[0]!.teacherPolicies).toEqual(['hardcore', 'hardcore', 'hardcore']);
    expect(merged.games[1]!.teacherPolicies).toEqual(b.dataset.games[0]!.teacherPolicies);
    expect(merged.games[1]!.teacherModelHash).toBe('b'.repeat(64));
    expect(merged.games[1]).toHaveProperty('originalTeacherNote', 'preserve');
    expect(merged.games[0]!.mergeSources).toEqual([{ path: resolve(a.path), sha256: a.sha256, originalGameIndex: 0 }]);
    expect(merged.metadata.sourceDatasets[1]!.metadata).toEqual(b.dataset.metadata);
    expect(merged.metadata.sourceDatasets[0]!.normalizedHardcoreGames).toBe(1);
    expect(merged.config.games).toBe(2);
    expect(merged.config.iterations).toBe(96);
    expect(merged.config.teacher).toBe('mixed');
    expect(parsePolicyDataset(merged)).toBe(merged);
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it('rejects duplicate seeds, incomplete sources, incompatible schemas and dishonest iteration labels', () => {
    const reject = (change: (value: ReturnType<typeof source>) => void) => {
      const other = source(2); change(other);
      expect(() => mergePolicyDatasets([source(1), other])).toThrow();
    };
    reject(value => { value.dataset.games[0]!.seed = 1; value.dataset.games[0]!.record.environmentSeed = 1; });
    reject(value => { value.dataset.config.games = 2; });
    reject(value => { value.dataset.games[0]!.record.status = 'incomplete'; });
    reject(value => { value.dataset.featureNames.reverse(); });
    reject(value => { value.dataset.actionVocabulary.reverse(); });
    reject(value => { value.dataset.config.iterations = 48; value.dataset.games[0]!.samples[0]!.teacherIterations = 48; });
    reject(value => { value.dataset.games[0]!.samples[0]!.teacherIterations = 48; });
    expect(() => mergePolicyDatasets([source(1)])).toThrow('at least two');
  });

  it('rejects ambiguous neural provenance and retains separate hashes when sources use different models', () => {
    const missing = source(2, true);
    delete missing.dataset.games[0]!.teacherPolicies;
    expect(() => mergePolicyDatasets([source(1), missing])).toThrow('cannot be inferred');
    const contradictory = source(2, true);
    contradictory.dataset.games[0]!.teacherModelHash = 'c'.repeat(64);
    expect(() => mergePolicyDatasets([source(1), contradictory])).toThrow('contradictory');
    const secondModel = source(2, true);
    secondModel.dataset.config.modelHash = 'c'.repeat(64);
    secondModel.dataset.metadata!.modelHash = 'c'.repeat(64);
    secondModel.dataset.games[0]!.teacherModelHash = 'c'.repeat(64);
    const result = mergePolicyDatasets([source(1, true), secondModel]);
    expect(result.metadata.modelHashes).toEqual(['b'.repeat(64), 'c'.repeat(64)]);
    expect(result.metadata.modelHash).toBeNull();
    expect(result.config.modelHash).toBeUndefined();
    expect(result.games.map(game => game.teacherModelHash)).toEqual(['b'.repeat(64), 'c'.repeat(64)]);
  });

  it('records actual file hashes and refuses to overwrite an input or previous output', () => {
    const directory = mkdtempSync(join(tmpdir(), 'puerto-policy-merge-'));
    const a = join(directory, 'a.json'), b = join(directory, 'b.json'), output = join(directory, 'merged.json');
    writeFileSync(a, JSON.stringify(source(1).dataset)); writeFileSync(b, JSON.stringify(source(2, true).dataset));
    const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    const before = [hash(a), hash(b)];
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mergePolicyMain(['--input', a, '--input', b, '--output', output]);
      const merged = JSON.parse(readFileSync(output, 'utf8'));
      expect(merged.metadata.sourceDatasets.map((entry: { sha256: string }) => entry.sha256)).toEqual(before);
      expect(merged.metadata.sourceDatasets.map((entry: { path: string }) => entry.path)).toEqual([a, b]);
      expect(() => mergePolicyMain(['--input', a, '--input', b, '--output', a])).toThrow();
      expect(() => mergePolicyMain(['--input', a, '--input', b, '--output', output])).toThrow();
    } finally { log.mockRestore(); }
    expect([hash(a), hash(b)]).toEqual(before);
  });
});
