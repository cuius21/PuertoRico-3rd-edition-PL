import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import type { PolicyExample } from '../../src/bots/neural/policyFeatures';
import { NEURAL_ACTION_VOCABULARY } from '../../src/bots/neural/policyFeatures';
import { NEURAL_FEATURE_NAMES, NEURAL_FEATURE_SCHEMA, NEURAL_INPUT_SIZE } from '../../src/bots/neural/features';
import { NeuralPolicyNetwork } from '../../src/bots/neural/policyNetwork';
import { balancedReanalysisBatches, prepareReanalysisTraining, finetuneReanalysis, measureReanalysisPolicy,
  REANALYSIS_PHASES } from '../../tools/finetune-reanalysis';
import { createGame } from '../helpers';
import { serializeGameState } from '../../src/game/GameSerializer';
import { encodePolicyInput } from '../../src/bots/neural/policyFeatures';
import { hardcoreActionKey } from '../../src/bots/hardcorePolicy';
import { validateReanalysisSnapshot, reanalysisSHA256 } from '../../tools/finetune-reanalysis';
import type { ReanalysisSample } from '../../tools/finetune-reanalysis';
import { seededNeuralRandom } from '../../src/bots/neural/network';

function fixture() {
  const sample = (phase: string): PolicyExample => ({ input: new Array<number>(NEURAL_INPUT_SIZE).fill(0), actionIds: [0, 1],
    baseline: [0.5, 0.5], target: [0.5, 0.5], phase, mover: 0, teacherIterations: 4, teacherValues: [0.4, 0.4] });
  const games = [11, 22, 33].map(seed => ({ seed, samples: [...REANALYSIS_PHASES, 'captain'].map(sample), valueSamples: [],
    record: { status: 'completed', environmentSeed: seed } }));
  const base = { format: 'puerto-rico-search-policy', version: 1, featureSchema: NEURAL_FEATURE_SCHEMA,
    featureNames: [...NEURAL_FEATURE_NAMES], actionVocabulary: [...NEURAL_ACTION_VOCABULARY], config: { games: 3, iterations: 4, seed: 1, exploration: 0 }, games };
  const model = new NeuralPolicyNetwork({ hiddenSize: 4, seed: 4, policyMode: 'residual' });
  model.trainBatch([sample('roleSelection')], { learningRate: 0.0001, l2: 0 });
  const metadata = { trainingGameSeeds: [11, 22], validationGameSeeds: [33], targetTemperature: 0.25,
    games: 3, teacherIterations: 4, history: [{ previous: true }], customProvenance: { preserved: 'yes' } };
  const initial = model.toJSON(metadata), checkpoint = model.toJSON(metadata, true);
  const hashes = { sourceDatasetSha256: 'a'.repeat(64), initialModelSha256: 'b'.repeat(64),
    checkpointSha256: 'c'.repeat(64), reanalysisSha256: 'd'.repeat(64) };
  const artifact = { format: 'puerto-rico-policy-reanalysis', version: 1, status: 'complete',
    sourceDatasetSha256: hashes.sourceDatasetSha256, initialModelSha256: hashes.initialModelSha256,
    featureSchema: NEURAL_FEATURE_SCHEMA, featureNames: [...NEURAL_FEATURE_NAMES], actionVocabulary: [...NEURAL_ACTION_VOCABULARY],
    config: { iterationsPerReplica: 4, replicas: 2, phases: [...REANALYSIS_PHASES], statesPerPhase: 1 },
    metadata: { trainingGameSeeds: [11, 22], validationGameSeeds: [33], selectedTrainingGameSeeds: [11], selectedValidationGameSeeds: [33],
      plannedSamplesByGame: [{ seed: 11, split: 'training', sourceSampleIndices: [0, 1, 2, 3] },
        { seed: 33, split: 'validation', sourceSampleIndices: [0, 1, 2, 3] }],
      sourceHashes: { 'state/GameState.ts': 'e'.repeat(64) }, toolHashes: { 'tools/reanalysis.ts': 'f'.repeat(64) } },
    games: [games[0]!, games[2]!].map((game, index) => ({ seed: game.seed, split: index === 0 ? 'training' : 'validation', record: structuredClone(game.record),
      samples: game.samples.slice(0, 4).map((original, sourceSampleIndex) => ({ ...structuredClone(original), target: [0.75, 0.25],
        teacherIterations: 8, teacherValues: [0.6, 0.4], sourceSampleIndex, original: structuredClone(original),
        snapshotHash: '9'.repeat(64), snapshotPath: resolve('work/snapshot.json'), actionKeys: ['first', 'second'],
        replicas: [61, 72].map(searchSeed => ({ searchSeed, actionKeys: ['first', 'second'], iterations: 4, visits: [3, 1], values: [0.6, 0.4], evaluatorErrors: 0, neuralEvaluations: 2 })) })) })) };
  const prepare = () => prepareReanalysisTraining(base, artifact, initial, checkpoint, hashes);
  return { base, initial, checkpoint, artifact, hashes, prepare };
}

describe('reanalysis immutable source and label checks', () => {
  it('uses only historical training games and active phases for retention', () => {
    const f = fixture(), prepared = f.prepare();
    expect(prepared.oldTraining).toHaveLength(8);
    expect(new Set(prepared.oldTraining.map(entry => entry.seed))).toEqual(new Set([11, 22]));
    expect(prepared.oldTraining.every(entry => REANALYSIS_PHASES.includes(entry.sample.phase as typeof REANALYSIS_PHASES[number]))).toBe(true);
    expect(prepared.strongTraining.map(entry => entry.seed)).toEqual([11, 11, 11, 11]);
    expect(prepared.oldValidation).toHaveLength(5);
    expect(prepared.oldActiveValidation).toHaveLength(4);
    expect(prepared.strongValidation).toHaveLength(4);
  });

  it('rejects hash mismatch and incomplete artifacts', () => {
    const f = fixture(); f.artifact.sourceDatasetSha256 = '0'.repeat(64);
    expect(f.prepare).toThrow(/SHA256/);
    f.artifact.sourceDatasetSha256 = f.hashes.sourceDatasetSha256; f.artifact.status = 'running';
    expect(f.prepare).toThrow(/complete/);
  });

  it('requires matching model weights and a real Adam optimizer', () => {
    const f = fixture(); f.initial.parameters[0]! += 0.1;
    expect(f.prepare).toThrow(/differ/);
    f.initial.parameters[0] = f.checkpoint.parameters[0]!;
    delete f.checkpoint.optimizer;
    expect(f.prepare).toThrow(/Adam/);
  });

  it('rejects missing, overlapping, moved, or newly invented split seeds', () => {
    const f = fixture(); f.artifact.metadata.trainingGameSeeds = [11, 33];
    expect(f.prepare).toThrow(/split/);
    f.artifact.metadata.trainingGameSeeds = [11, 22]; f.artifact.metadata.selectedTrainingGameSeeds = [33];
    expect(f.prepare).toThrow(/split/);
    f.artifact.metadata.selectedTrainingGameSeeds = [11]; f.artifact.games[0]!.split = 'validation';
    expect(f.prepare).toThrow(/splits/);
  });

  it('rejects modified original labels, inputs, action order, and source indices', () => {
    const f = fixture(), sample = f.artifact.games[0]!.samples[0]!;
    sample.original.target = [0.9, 0.1]; expect(f.prepare).toThrow(/original sample/);
    sample.original.target = [0.5, 0.5]; sample.input[0] = 0.2; expect(f.prepare).toThrow(/source features/);
    sample.input[0] = 0; sample.actionIds.reverse(); expect(f.prepare).toThrow(/source features/);
    sample.actionIds.reverse(); sample.sourceSampleIndex = 100; expect(f.prepare).toThrow(/samples/);
  });

  it('rejects missing planned samples or duplicated source positions', () => {
    const f = fixture(); f.artifact.games[0]!.samples.pop(); expect(f.prepare).toThrow(/samples/);
    const next = fixture(); next.artifact.games[0]!.samples[1]!.sourceSampleIndex = 0;
    expect(next.prepare).toThrow(/samples/);
  });

  it('accepts fewer available Trader positions while preserving the committed game and sample plan', () => {
    const f = fixture();
    f.artifact.config.statesPerPhase = 4;
    f.base.games[0]!.samples.splice(2, 1); // This chosen game has no Trader decision to relabel.
    f.artifact.games[0]!.samples = f.artifact.games[0]!.samples.filter(sample => sample.phase !== 'trader');
    f.artifact.games[0]!.samples.forEach((sample, index) => { sample.sourceSampleIndex = index; });
    f.artifact.metadata.plannedSamplesByGame[0]!.sourceSampleIndices = [0, 1, 2];
    const prepared = f.prepare();
    expect(prepared.strongTraining).toHaveLength(3);
    expect(prepared.strongTraining.every(entry => entry.seed === 11)).toBe(true);
    expect(prepared.strongTraining.map(entry => entry.sample.phase)).toEqual(['roleSelection', 'builder', 'settler']);
    expect(prepared.strongValidation).toHaveLength(4);
    expect(prepared.checkpoint.metadata.trainingGameSeeds).toEqual([11, 22]);
    expect(prepared.checkpoint.metadata.validationGameSeeds).toEqual([33]);
  });

  it('rejects changing the committed selection even when labels and plan are edited together', () => {
    const f = fixture();
    f.artifact.games[0]!.samples.pop();
    f.artifact.metadata.plannedSamplesByGame[0]!.sourceSampleIndices.pop();
    expect(f.prepare).toThrow(/deterministic source selection/);
    const missing = fixture();
    missing.artifact.metadata.plannedSamplesByGame = [];
    expect(missing.prepare).toThrow(/sample plan/);
  });

  it('requires integer complete replica visits and real successful neural inference', () => {
    const f = fixture(), replica = f.artifact.games[0]!.samples[0]!.replicas[0]!;
    replica.visits = [2.5, 1.5]; expect(f.prepare).toThrow(/visits/);
    replica.visits = [2, 1]; expect(f.prepare).toThrow(/visits/);
    replica.visits = [3, 1]; replica.neuralEvaluations = 0; expect(f.prepare).toThrow(/replica/);
    replica.neuralEvaluations = 2; replica.evaluatorErrors = 1; expect(f.prepare).toThrow(/replica/);
    replica.evaluatorErrors = 0; replica.values[0] = NaN; expect(f.prepare).toThrow(/values/);
  });

  it('rejects a reordered concrete action vector in a replica', () => {
    const f = fixture(); f.artifact.games[0]!.samples[0]!.replicas[0]!.actionKeys.reverse();
    expect(f.prepare).toThrow(/concrete action order/);
  });

  it('rejects already sharpened targets and incorrectly pooled values', () => {
    const f = fixture(), sample = f.artifact.games[0]!.samples[0]!;
    sample.target = [81 / 82, 1 / 82]; expect(f.prepare).toThrow(/raw normalized/);
    sample.target = [0.75, 0.25]; sample.teacherValues[0] = 0.7;
    expect(f.prepare).toThrow(/visit-weighted/);
  });

  it('does not change the inherited target temperature', () => {
    const f = fixture(); f.initial.metadata.targetTemperature = 1; f.checkpoint.metadata.targetTemperature = 1;
    expect(f.prepare).toThrow(/temperature/);
  });
});

describe('deterministic balanced reanalysis epochs', () => {
  it('visits every strong example once and keeps even the partial batch balanced', () => {
    const strong = ['s0', 's1', 's2', 's3', 's4'], retention = ['r0', 'r1', 'r2'];
    const batches = balancedReanalysisBatches(strong, retention, 4, seededNeuralRandom(1));
    expect(batches.map(batch => batch.length)).toEqual([4, 4, 2]);
    for (const batch of batches) expect(batch.filter(value => value.startsWith('s')).length).toBe(batch.length / 2);
    expect(batches.flat().filter(value => value.startsWith('s')).sort()).toEqual(strong);
    expect(batches).toEqual(balancedReanalysisBatches(strong, retention, 4, seededNeuralRandom(1)));
    expect(strong).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(() => balancedReanalysisBatches(strong, retention, 3, seededNeuralRandom(1))).toThrow(/even/);
  });

  it('samples retention without replacement until its pool is exhausted', () => {
    const strong = [10, 11, 12], retention = [0, 1, 2, 3, 4, 5];
    const batches = balancedReanalysisBatches(strong, retention, 8, seededNeuralRandom(100));
    expect(new Set(batches.flat().filter(value => value < 10)).size).toBe(3);
  });
});

describe('bounded fine-tuning and metric semantics', () => {
  it('continues Adam, preserves metadata and has reproducible parameter updates', () => {
    const f = fixture(), before = structuredClone(f.base), prepared = f.prepare();
    const first = finetuneReanalysis(prepared, { epochs: 2, batchSize: 4, learningRate: 0.001, l2: 0 });
    const second = finetuneReanalysis(prepared, { epochs: 2, batchSize: 4, learningRate: 0.001, l2: 0 });
    expect(first.model.parameters).toEqual(second.model.parameters);
    expect(first.checkpoint.optimizer).toEqual(second.checkpoint.optimizer);
    expect(first.report.parametersChanged).toBe(true);
    expect(first.checkpoint.optimizer!.step).toBeGreaterThan(f.checkpoint.optimizer!.step);
    expect(first.checkpoint.optimizer!.step).toBeLessThanOrEqual(f.checkpoint.optimizer!.step + 4);
    for (const [key, value] of Object.entries(f.checkpoint.metadata)) expect(first.model.metadata[key]).toEqual(value);
    expect(first.report.newGames).toBe(0);
    expect(first.report.trainingGameSeeds).toEqual([11, 22]);
    expect(first.report.validationGameSeeds).toEqual([33]);
    expect(first.model.metadata.reanalysisProvenance).toEqual(first.report);
    expect(first.model.optimizer).toBeUndefined();
    expect(f.base).toEqual(before);
  });

  it('retains the previous fine-tune provenance when repeating the workflow', () => {
    const f = fixture(), previous = { hashes: { source: 'earlier' }, bestEpoch: 2, history: [{ epoch: 1 }] };
    f.initial.metadata.reanalysisProvenance = structuredClone(previous);
    f.checkpoint.metadata.reanalysisProvenance = structuredClone(previous);
    const result = finetuneReanalysis(f.prepare(), { epochs: 1, l2: 0 });
    expect(result.report.previousReanalysisProvenance).toEqual(previous);
    expect(result.report.previousReanalysisProvenance).not.toBe(f.checkpoint.metadata.reanalysisProvenance);
    expect(result.model.metadata.reanalysisProvenance).toEqual(result.report);
    expect(f.checkpoint.metadata.reanalysisProvenance).toEqual(previous);
  });

  it('writes the unchanged initial optimizer when no validation improvement qualifies', () => {
    const f = fixture();
    for (const game of f.artifact.games) for (const sample of game.samples) {
      sample.target = [0.5, 0.5];
      for (const replica of sample.replicas) replica.visits = [2, 2];
    }
    const result = finetuneReanalysis(f.prepare(), { epochs: 3, patience: 1, l2: 0 });
    expect(result.report.bestEpoch).toBe(0);
    expect(result.report.epochsRun).toBe(1);
    expect(result.report.parametersChanged).toBe(false);
    expect(result.checkpoint.optimizer).toEqual(f.checkpoint.optimizer);
    expect(result.model.parameters).toEqual(f.initial.parameters);
  });

  it('reports raw and sharpened concrete CE separately from semantic diagnostics', () => {
    const model = new NeuralPolicyNetwork({ hiddenSize: 4, policyMode: 'residual' });
    const sample: PolicyExample = { input: new Array(NEURAL_INPUT_SIZE).fill(0), actionIds: [0, 0, 1],
      baseline: [0.2, 0.2, 0.6], target: [0.4, 0.4, 0.2], phase: 'settler', mover: 0, teacherIterations: 10, teacherValues: [0, 0, 0] };
    const metrics = measureReanalysisPolicy(model, [sample], 0.25);
    expect(metrics.raw.crossEntropy).toBeCloseTo(-0.8 * Math.log(0.2) - 0.2 * Math.log(0.6), 12);
    expect(metrics.semanticRaw.crossEntropy).toBeCloseTo(-0.8 * Math.log(0.4) - 0.2 * Math.log(0.6), 12);
    expect(metrics.sharpened.crossEntropy).not.toBe(metrics.raw.crossEntropy);
    expect(sample.target).toEqual([0.4, 0.4, 0.2]);
  });

  it('rejects unbounded epochs or an odd minibatch', () => {
    const prepared = fixture().prepare();
    expect(() => finetuneReanalysis(prepared, { epochs: 11 })).toThrow(/1-10/);
    expect(() => finetuneReanalysis(prepared, { batchSize: 63 })).toThrow(/even/);
  });
});

it('verifies snapshot bytes and the exact legal concrete action order without search', () => {
  const state = createGame(), playerId = state.getCurrentPlayer().id;
  const actions = [...new Map(state.getValidActions(playerId).map(action => [hardcoreActionKey(action), action])).values()];
  const encoded = encodePolicyInput(state, playerId, actions)!;
  const bytes = JSON.stringify(serializeGameState(state));
  const sample = { ...encoded, phase: state.getCurrentPhase().type,
    mover: state.players.findIndex(player => player.id === playerId), actionKeys: actions.map(hardcoreActionKey),
    snapshotHash: reanalysisSHA256(bytes), snapshotPath: resolve('work/snapshot.json') } as ReanalysisSample;
  expect(() => validateReanalysisSnapshot(sample, bytes)).not.toThrow();
  expect(() => validateReanalysisSnapshot(sample, bytes + ' ')).toThrow(/snapshot hash/);
  sample.actionKeys.reverse();
  expect(() => validateReanalysisSnapshot(sample, bytes)).toThrow(/legal concrete actions/);
  sample.actionKeys.reverse(); sample.input[0]! += 0.1;
  expect(() => validateReanalysisSnapshot(sample, bytes)).toThrow(/Snapshot features/);
});
