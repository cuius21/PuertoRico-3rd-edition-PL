import { describe, expect, it } from 'vitest';
import { collectTeacherGame } from '../../tools/collect-policy';
import type { PolicyDataset } from '../../tools/collect-policy';
import { NeuralPolicyNetwork } from '../../src/bots/neural/policyNetwork';
import type { PolicyExample } from '../../src/bots/neural/policyFeatures';
import { NEURAL_INPUT_SIZE } from '../../src/bots/neural/features';
import { selectReanalysisSamples, planReanalysis, replayTeacherGame, analyseReplica, poolReanalysisSample,
  validateReanalysisConfig } from '../../tools/reanalyse-policy';
import type { ReanalysisConfig, ReanalysisReplica } from '../../tools/reanalyse-policy';

const config: ReanalysisConfig = { games: 2, trainingGames: 1, validationGames: 1, iterationsPerReplica: 2, replicas: 2,
  statesPerPhase: 4, phases: ['roleSelection', 'builder', 'trader', 'settler'], masterSeed: 46090989,
  workers: 2, cpuBudgetSeconds: 3300, policyReadCache: false };
function example(phase = 'builder', i = 0): PolicyExample {
  return { input: new Array<number>(NEURAL_INPUT_SIZE).fill(0), actionIds: [0, 1], baseline: [0.5, 0.5],
    target: [0.5 + i / 40, 0.5 - i / 40], phase, mover: 0, teacherIterations: 96, teacherValues: [0.3, 0.4] };
}

describe('strict policy reanalysis', () => {
  it('selects gap and spread positions reproducibly within the original whole-game split', () => {
    const samples = config.phases.flatMap(phase => Array.from({ length: 10 }, (_, i) => example(phase, i)));
    expect(selectReanalysisSamples(samples)).toEqual([0, 1, 4, 8, 10, 11, 14, 18, 20, 21, 24, 28, 30, 31, 34, 38]);
    const dataset = { games: [11, 22, 33, 44].map(seed => ({ seed, samples })) } as unknown as PolicyDataset;
    const metadata = { trainingGameSeeds: [11, 22], validationGameSeeds: [33, 44] };
    const a = planReanalysis(dataset, metadata, config), b = planReanalysis({ ...dataset, games: [...dataset.games].reverse() }, metadata, config);
    expect(a).toEqual(b);
    expect(a.plan).toHaveLength(2);
    expect(metadata.trainingGameSeeds).toContain(a.plan[0]!.game.seed);
    expect(metadata.validationGameSeeds).toContain(a.plan[1]!.game.seed);
    expect(() => planReanalysis(dataset, { trainingGameSeeds: [11, 22], validationGameSeeds: [22, 44] }, config)).toThrow('overlap');
    expect(() => planReanalysis(dataset, { trainingGameSeeds: [11], validationGameSeeds: [33, 44] }, config)).toThrow('exactly match');
    for (const seconds of [0, -1, NaN, 3301]) expect(() => validateReanalysisConfig({ ...config, cpuBudgetSeconds: seconds })).toThrow();
    expect(() => validateReanalysisConfig({ ...config, replicas: 1 })).toThrow();
  });

  it('pools raw visits with visit-weighted values and reports semantic ties without discarding concrete actions', () => {
    const original = { ...example(), actionIds: [1, 1, 2], baseline: [0.2, 0.2, 0.6],
      target: [0.25, 0.25, 0.5], teacherValues: [0.2, 0.3, 0.4] };
    const actionKeys = ['copy-0', 'copy-1', 'other'];
    const replica = (searchSeed: number, visits: number[], values: number[]): ReanalysisReplica => ({
      searchSeed, iterations: 4, actionKeys: [...actionKeys], visits, values, evaluatorErrors: 0, neuralEvaluations: 3, cpuSeconds: 0.01, elapsedMs: 4,
    });
    const replicas = [replica(11, [1, 3, 0], [0.2, 0.8, 0]), replica(12, [2, 0, 2], [0.5, 0, 0.7])];
    const pooled = poolReanalysisSample(original, 5, 'snapshot.json', 'f'.repeat(64), actionKeys, replicas, 4, 2);
    expect(pooled.target).toEqual([3 / 8, 3 / 8, 2 / 8]);
    expect(pooled.teacherIterations).toBe(8);
    expect(pooled.teacherValues[0]).toBeCloseTo(0.4, 12);
    expect(pooled.teacherValues[1]).toBeCloseTo(0.8, 12);
    expect(pooled.teacherValues[2]).toBeCloseTo(0.7, 12);
    expect(pooled.original).toBe(original);
    expect(pooled.semanticReplicaTopActionIds).toEqual([[1], [1, 2]]);
    expect(pooled.semanticReplicaTopAgreement).toBe(false);
    expect(pooled.actionIds).toEqual([1, 1, 2]);
    for (const bad of [
      { ...replicas[1]!, visits: [1, 0, 2] }, { ...replicas[1]!, evaluatorErrors: 1 },
      { ...replicas[1]!, neuralEvaluations: 0 }, { ...replicas[1]!, searchSeed: 11 },
      { ...replicas[1]!, actionKeys: [...actionKeys].reverse() },
    ]) expect(() => poolReanalysisSample(original, 5, 'snapshot.json', 'f'.repeat(64), actionKeys, [replicas[0]!, bad], 4, 2)).toThrow();
  });

  it('replays every original label before exposing snapshots, then runs independent legal neural replicas', () => {
    const teacher = { games: 1, iterations: 1, seed: 47090913, exploration: 0.08 };
    const original = collectTeacherGame(teacher, 0);
    const indices = selectReanalysisSamples(original.samples, 1);
    const snapshots = replayTeacherGame(teacher, original, indices);
    expect(snapshots.map(snapshot => snapshot.sourceSampleIndex)).toEqual(indices);
    const selected = snapshots[0]!, label = original.samples[selected.sourceSampleIndex]!;
    const model = new NeuralPolicyNetwork({ hiddenSize: 4, policyMode: 'standalone', seed: 13 });
    const a = analyseReplica(selected.snapshotJSON, selected.snapshotHash, selected.actionKeys, label, model, 101, 2);
    const cached = analyseReplica(selected.snapshotJSON, selected.snapshotHash, selected.actionKeys, label, model, 101, 2, true);
    expect(cached.visits).toEqual(a.visits);
    expect(cached.values).toEqual(a.values);
    const b = analyseReplica(selected.snapshotJSON, selected.snapshotHash, selected.actionKeys, label, model, 102, 2);
    const pooled = poolReanalysisSample(label, selected.sourceSampleIndex, 'snapshot.json', selected.snapshotHash,
      selected.actionKeys, [a, b], 2, 2);
    expect(pooled.teacherIterations).toBe(4);
    expect(pooled.target.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    expect(pooled.replicas.every(replica => replica.iterations === 2 && replica.neuralEvaluations > 0 && replica.evaluatorErrors === 0)).toBe(true);
    expect(() => analyseReplica(selected.snapshotJSON + ' ', selected.snapshotHash, selected.actionKeys, label, model, 103, 2)).toThrow('hash');
    const corrupt = structuredClone(original);
    corrupt.samples[0]!.teacherValues[0]! += 0.001;
    expect(() => replayTeacherGame(teacher, corrupt, indices)).toThrow('sample 0');
  }, 60000);
});
