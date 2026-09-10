import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type { PolicyDataset, TeacherGame } from './collect-policy';
import { selectReanalysisSamples } from './reanalyse-policy';
import { parsePolicyDataset, policyTrainingTargets, resolvePolicyTargetTemperature } from './train-policy';
import type { PolicyMetrics } from './train-policy';
import { NeuralPolicyNetwork, validatePolicyInput, validatePolicyDistribution } from '../src/bots/neural/policyNetwork';
import type { NeuralPolicyJSON } from '../src/bots/neural/policyNetwork';
import type { PolicyExample } from '../src/bots/neural/policyFeatures';
import { hardcoreActionKey } from '../src/bots/hardcorePolicy';
import { deserializeGameState } from '../src/game/GameSerializer';
import { encodePolicyInput, NEURAL_ACTION_VOCABULARY } from '../src/bots/neural/policyFeatures';
import { NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES } from '../src/bots/neural/features';
import { seededNeuralRandom } from '../src/bots/neural/network';

export const REANALYSIS_PHASES = ['roleSelection', 'builder', 'trader', 'settler'] as const;
export interface ReanalysisReplica {
  searchSeed: number; iterations: number; visits: number[]; values: number[]; actionKeys: string[];
  evaluatorErrors: number; neuralEvaluations: number;
}
export interface ReanalysisSample extends PolicyExample {
  sourceSampleIndex: number; snapshotHash: string; snapshotPath: string;
  original: PolicyExample; replicas: ReanalysisReplica[]; actionKeys: string[];
}
export interface PolicyReanalysis {
  format: 'puerto-rico-policy-reanalysis'; version: 1; status: 'complete';
  sourceDatasetSha256: string; initialModelSha256: string;
  featureSchema: string; featureNames: string[]; actionVocabulary: string[];
  config: { iterationsPerReplica: number; replicas: number; phases: string[]; statesPerPhase: number; [key: string]: unknown };
  metadata: {
    trainingGameSeeds: number[]; validationGameSeeds: number[];
    selectedTrainingGameSeeds: number[]; selectedValidationGameSeeds: number[];
    plannedSamplesByGame: { seed: number; split: 'training' | 'validation'; sourceSampleIndices: number[] }[];
    sourceHashes: Record<string, string>; toolHashes: Record<string, string>; [key: string]: unknown;
  };
  games: { seed: number; split: 'training' | 'validation'; record: TeacherGame['record']; samples: ReanalysisSample[] }[];
}
export interface ReanalysisHashes { sourceDatasetSha256: string; initialModelSha256: string; checkpointSha256: string; reanalysisSha256: string }
export interface IndexedPolicyExample { seed: number; sourceSampleIndex: number; kind: 'strong' | 'retention'; sample: PolicyExample }
export interface PreparedReanalysis {
  dataset: PolicyDataset; artifact: PolicyReanalysis; checkpoint: NeuralPolicyJSON; hashes: ReanalysisHashes;
  strongTraining: IndexedPolicyExample[]; strongValidation: PolicyExample[];
  oldTraining: IndexedPolicyExample[]; oldValidation: PolicyExample[]; oldActiveValidation: PolicyExample[];
  targetTemperature: number;
}
const digestPattern = /^[a-f0-9]{64}$/;
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const active = (phase: string) => (REANALYSIS_PHASES as readonly string[]).includes(phase);
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function seeds(value: unknown, name: string): number[] {
  check(Array.isArray(value) && value.length > 0 && value.every(n => Number.isSafeInteger(n)) && new Set(value).size === value.length,
    'Invalid or missing ' + name + ' seeds');
  return value as number[];
}
function sameSeeds(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every(seed => right.includes(seed));
}
function hashMap(value: unknown, name: string): asserts value is Record<string, string> {
  check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0, 'Missing ' + name);
  for (const [file, digest] of Object.entries(value)) check(file.length > 0 && typeof digest === 'string' && digestPattern.test(digest), 'Invalid ' + name + ' entry');
}
function finiteVector(value: unknown, length: number, name: string): asserts value is number[] {
  check(Array.isArray(value) && value.length === length && value.every(n => typeof n === 'number' && Number.isFinite(n)), 'Invalid ' + name);
}
function policyIdentity(sample: PolicyExample): unknown {
  return { input: sample.input, actionIds: sample.actionIds, baseline: sample.baseline, phase: sample.phase, mover: sample.mover };
}

/** Validates the immutable source relationships before any gradient update. */
export function prepareReanalysisTraining(baseValue: unknown, artifactValue: unknown, initialModelValue: unknown,
  checkpointValue: unknown, hashes: ReanalysisHashes): PreparedReanalysis {
  const dataset = parsePolicyDataset(baseValue);
  const initial = NeuralPolicyNetwork.fromJSON(initialModelValue).toJSON();
  const model = NeuralPolicyNetwork.fromJSON(checkpointValue), checkpoint = model.toJSON(undefined, true);
  check((checkpointValue as NeuralPolicyJSON).optimizer !== undefined && checkpoint.optimizer!.step > 0, 'Resume requires an existing Adam checkpoint');
  check(isDeepStrictEqual(initial, model.toJSON()), 'Initial model and Adam checkpoint differ in weights, architecture, or metadata');
  for (const digest of Object.values(hashes)) check(digestPattern.test(digest), 'Invalid input SHA256');
  const artifact = artifactValue as PolicyReanalysis;
  check(artifact && artifact.format === 'puerto-rico-policy-reanalysis' && artifact.version === 1 && artifact.status === 'complete',
    'Reanalysis must be complete with supported format/version');
  check(artifact.sourceDatasetSha256 === hashes.sourceDatasetSha256 && artifact.initialModelSha256 === hashes.initialModelSha256,
    'Reanalysis source dataset or initial model SHA256 mismatch');
  check(artifact.featureSchema === NEURAL_FEATURE_SCHEMA && isDeepStrictEqual(artifact.featureNames, NEURAL_FEATURE_NAMES) &&
    isDeepStrictEqual(artifact.actionVocabulary, NEURAL_ACTION_VOCABULARY), 'Incompatible reanalysis feature schema or vocabulary');
  const config = artifact.config;
  check(config && Number.isSafeInteger(config.iterationsPerReplica) && config.iterationsPerReplica > 0 &&
    Number.isSafeInteger(config.replicas) && config.replicas >= 2 && Number.isSafeInteger(config.statesPerPhase) && config.statesPerPhase > 0 && config.statesPerPhase <= 4 &&
    Array.isArray(config.phases) && config.phases.length === REANALYSIS_PHASES.length &&
    new Set(config.phases).size === config.phases.length && config.phases.every(active), 'Invalid reanalysis teacher configuration');
  const prior = checkpoint.metadata;
  const trainingSeeds = seeds(prior.trainingGameSeeds, 'checkpoint training'), validationSeeds = seeds(prior.validationGameSeeds, 'checkpoint validation');
  check(trainingSeeds.every(seed => !validationSeeds.includes(seed)), 'Checkpoint training and validation seeds overlap');
  check(sameSeeds([...trainingSeeds, ...validationSeeds], dataset.games.map(game => game.seed)), 'Source dataset does not exactly match checkpoint game history');
  check(artifact.metadata && isDeepStrictEqual(artifact.metadata.trainingGameSeeds, trainingSeeds) &&
    isDeepStrictEqual(artifact.metadata.validationGameSeeds, validationSeeds), 'Reanalysis changed the historical training/validation split');
  hashMap(artifact.metadata.sourceHashes, 'sourceHashes'); hashMap(artifact.metadata.toolHashes, 'toolHashes');
  const selectedTrain = seeds(artifact.metadata.selectedTrainingGameSeeds, 'selected training');
  const selectedVal = seeds(artifact.metadata.selectedValidationGameSeeds, 'selected validation');
  check(selectedTrain.every(seed => trainingSeeds.includes(seed)) && selectedVal.every(seed => validationSeeds.includes(seed)), 'Selected games crossed the training/validation split');
  check(Array.isArray(artifact.games) && artifact.games.length === selectedTrain.length + selectedVal.length &&
    new Set(artifact.games.map(game => game.seed)).size === artifact.games.length, 'Missing or duplicated reanalysis games');
  check(sameSeeds(artifact.games.filter(game => game.split === 'training').map(game => game.seed), selectedTrain) &&
    sameSeeds(artifact.games.filter(game => game.split === 'validation').map(game => game.seed), selectedVal), 'Reanalysis game splits do not match selected seeds');
  const planned = artifact.metadata.plannedSamplesByGame;
  check(Array.isArray(planned) && planned.length === artifact.games.length && new Set(planned.map(row => row.seed)).size === planned.length &&
    planned.every(row => artifact.games.some(game => game.seed === row.seed && game.split === row.split)), 'Missing or inconsistent committed sample plan');
  const bySeed = new Map(dataset.games.map(game => [game.seed, game]));
  const strongTraining: IndexedPolicyExample[] = [], strongValidation: PolicyExample[] = [];
  for (const game of artifact.games) {
    const originalGame = bySeed.get(game.seed)!;
    check(originalGame && isDeepStrictEqual(game.record, originalGame.record), 'Reanalysis changed the original game record');
    const indices = planned.find(row => row.seed === game.seed)!.sourceSampleIndices;
    check(Array.isArray(indices) && indices.length > 0 && indices.every(index => Number.isSafeInteger(index) && index >= 0) &&
      new Set(indices).size === indices.length && isDeepStrictEqual(indices, selectReanalysisSamples(originalGame.samples, config.statesPerPhase)),
      'Committed sample plan does not match deterministic source selection');
    check(Array.isArray(game.samples) && isDeepStrictEqual(game.samples.map(sample => sample.sourceSampleIndex), indices),
      'Reanalysis samples do not match the committed plan');
    for (const phase of config.phases) check(game.samples.filter(sample => sample.phase === phase).length <= config.statesPerPhase,
      'Reanalysis phase quota exceeds its maximum');
    for (const sample of game.samples) {
      check(Number.isSafeInteger(sample.sourceSampleIndex) && sample.sourceSampleIndex >= 0, 'Invalid source sample index');
      const original = originalGame.samples[sample.sourceSampleIndex];
      check(original && isDeepStrictEqual(sample.original, original), 'Reanalysis original sample differs from source dataset');
      validatePolicyInput(sample); validatePolicyDistribution(sample.target, sample.actionIds.length, 'raw pooled teacher target');
      check(active(sample.phase) && isDeepStrictEqual(policyIdentity(sample), policyIdentity(original)), 'Reanalysis changed source features, actions, baseline, phase, or mover');
      check(digestPattern.test(sample.snapshotHash) && typeof sample.snapshotPath === 'string' && isAbsolute(sample.snapshotPath), 'Invalid snapshot hash or path');
      check(Array.isArray(sample.actionKeys) && sample.actionKeys.length === sample.actionIds.length &&
        sample.actionKeys.every(key => typeof key === 'string' && key.length > 0) && new Set(sample.actionKeys).size === sample.actionKeys.length,
      'Missing or duplicated concrete action keys');
      check(Array.isArray(sample.replicas) && sample.replicas.length === config.replicas &&
        new Set(sample.replicas.map(replica => replica.searchSeed)).size === config.replicas, 'Invalid search replicas');
      const pooled = new Array<number>(sample.actionIds.length).fill(0), weighted = [...pooled];
      for (const replica of sample.replicas) {
        check(isDeepStrictEqual(replica.actionKeys, sample.actionKeys), 'Replica concrete action order differs from sample');
        check(Number.isSafeInteger(replica.searchSeed) && replica.iterations === config.iterationsPerReplica && replica.evaluatorErrors === 0 &&
          Number.isSafeInteger(replica.neuralEvaluations) && replica.neuralEvaluations > 0, 'Incomplete or failed neural teacher replica');
        finiteVector(replica.visits, pooled.length, 'replica visits'); finiteVector(replica.values, pooled.length, 'replica values');
        check(replica.visits.every(value => Number.isSafeInteger(value) && value >= 0) && sum(replica.visits) === replica.iterations,
          'Replica visits must be nonnegative integers summing to completed iterations');
        for (let index = 0; index < pooled.length; index++) {
          pooled[index]! += replica.visits[index]!;
          weighted[index]! += replica.visits[index]! * replica.values[index]!;
        }
      }
      check(sample.teacherIterations === config.iterationsPerReplica * config.replicas && sum(pooled) === sample.teacherIterations,
        'Pooled teacher iteration count mismatch');
      finiteVector(sample.teacherValues, pooled.length, 'pooled teacher values');
      for (let index = 0; index < pooled.length; index++) {
        check(Math.abs(sample.target[index]! - pooled[index]! / sample.teacherIterations) <= 1e-12, 'Target is not raw normalized pooled visits');
        const expectedValue = pooled[index]! > 0 ? weighted[index]! / pooled[index]! : 0;
        check(Math.abs(sample.teacherValues[index]! - expectedValue) <= 1e-12, 'Pooled teacher values are not visit-weighted');
      }
      if (game.split === 'training') strongTraining.push({ seed: game.seed, sourceSampleIndex: sample.sourceSampleIndex, kind: 'strong', sample });
      else strongValidation.push(sample);
    }
  }
  const oldTraining: IndexedPolicyExample[] = [];
  for (const seed of trainingSeeds) bySeed.get(seed)!.samples.forEach((sample, sourceSampleIndex) => {
    if (active(sample.phase)) oldTraining.push({ seed, sourceSampleIndex, kind: 'retention', sample });
  });
  const oldValidation = validationSeeds.flatMap(seed => bySeed.get(seed)!.samples);
  check(strongTraining.length > 0 && strongValidation.length > 0 && oldTraining.length > 0, 'Training and validation pools must not be empty');
  const targetTemperature = resolvePolicyTargetTemperature(0.25, prior);
  return { dataset, artifact, checkpoint, hashes, strongTraining, strongValidation, oldTraining, oldValidation,
    oldActiveValidation: oldValidation.filter(sample => active(sample.phase)), targetTemperature };
}

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [values[index], values[other]] = [values[other]!, values[index]!];
  }
  return values;
}
/** Every strong sample appears exactly once. Each batch, including the last, is exactly 1:1. */
export function balancedReanalysisBatches<T>(strong: readonly T[], retention: readonly T[], batchSize: number, random: () => number): T[][] {
  check(strong.length > 0 && retention.length > 0, 'Balanced batches require both training pools');
  check(Number.isSafeInteger(batchSize) && batchSize >= 2 && batchSize <= 4096 && batchSize % 2 === 0, 'Batch size must be even');
  const ordered = shuffle([...strong], random), old: T[] = [];
  while (old.length < ordered.length) old.push(...shuffle([...retention], random).slice(0, ordered.length - old.length));
  const batches: T[][] = [];
  for (let start = 0; start < ordered.length; start += batchSize / 2) {
    const length = Math.min(batchSize / 2, ordered.length - start);
    batches.push(shuffle([...ordered.slice(start, start + length), ...old.slice(start, start + length)], random));
  }
  return batches;
}

export interface ReanalysisMetrics { raw: PolicyMetrics; sharpened: PolicyMetrics; semanticRaw: PolicyMetrics; semanticSharpened: PolicyMetrics }
function emptyMetrics(): PolicyMetrics { return { samples: 0, crossEntropy: 0, targetEntropy: 0, klDivergence: 0, top1Accuracy: 0 }; }
function addMetrics(result: PolicyMetrics, probabilities: readonly number[], target: readonly number[]): void {
  let predicted = 0;
  for (let i = 1; i < probabilities.length; i++) if (probabilities[i]! > probabilities[predicted]!) predicted = i;
  result.samples++;
  if (target[predicted]! >= Math.max(...target) - 1e-12) result.top1Accuracy++;
  for (let i = 0; i < target.length; i++) {
    result.crossEntropy -= target[i]! * Math.log(Math.max(1e-12, probabilities[i]!));
    result.targetEntropy -= target[i]! * Math.log(Math.max(1e-12, target[i]!));
  }
}
function aggregate(values: readonly number[], ids: readonly number[]): number[] {
  const groups = new Map<number, number>();
  ids.forEach((id, index) => groups.set(id, (groups.get(id) ?? 0) + values[index]!));
  return [...groups.values()];
}
/** Semantic metrics are diagnostics only: concrete action targets and runtime choices stay intact. */
export function measureReanalysisPolicy(model: NeuralPolicyNetwork, samples: readonly PolicyExample[], temperature: number): ReanalysisMetrics {
  check(samples.length > 0, 'Metrics require samples');
  const transformed = policyTrainingTargets(samples, temperature);
  const result = { raw: emptyMetrics(), sharpened: emptyMetrics(), semanticRaw: emptyMetrics(), semanticSharpened: emptyMetrics() };
  samples.forEach((sample, index) => {
    const probabilities = model.predict(sample), sharp = transformed[index]!.target;
    addMetrics(result.raw, probabilities, sample.target); addMetrics(result.sharpened, probabilities, sharp);
    const semanticPrediction = aggregate(probabilities, sample.actionIds);
    addMetrics(result.semanticRaw, semanticPrediction, aggregate(sample.target, sample.actionIds));
    addMetrics(result.semanticSharpened, semanticPrediction, aggregate(sharp, sample.actionIds));
  });
  for (const value of Object.values(result)) {
    value.crossEntropy /= value.samples; value.targetEntropy /= value.samples; value.top1Accuracy /= value.samples;
    value.klDivergence = value.crossEntropy - value.targetEntropy;
  }
  return result;
}
function aliasCounts(samples: readonly PolicyExample[]): unknown {
  let aliases = 0, sharedLogitUnequalTargets = 0;
  for (const sample of samples) {
    if (new Set(sample.actionIds).size < sample.actionIds.length) aliases++;
    if (sample.actionIds.some((id, i) => sample.actionIds.some((other, j) => i < j && id === other &&
      Math.abs(sample.baseline[i]! - sample.baseline[j]!) <= 1e-12 && Math.abs(sample.target[i]! - sample.target[j]!) > 1e-12))) sharedLogitUnequalTargets++;
  }
  return { samples: samples.length, withActionIdAliases: aliases, sharedLogitUnequalTargets };
}
export interface ReanalysisTrainingOptions { epochs?: number; batchSize?: number; patience?: number; seed?: number; learningRate?: number; l2?: number }
export function finetuneReanalysis(prepared: PreparedReanalysis, options: ReanalysisTrainingOptions = {}, onEpoch?: (value: unknown) => void): {
  model: NeuralPolicyJSON; checkpoint: NeuralPolicyJSON; report: Record<string, unknown>;
} {
  const epochs = options.epochs ?? 10, batchSize = options.batchSize ?? 64, patience = options.patience ?? 3;
  const seed = options.seed ?? 47090997, learningRate = options.learningRate ?? 1e-4, l2 = options.l2 ?? 1e-5;
  check(Number.isSafeInteger(epochs) && epochs >= 1 && epochs <= 10 && Number.isSafeInteger(patience) && patience >= 1 && patience <= 10, 'Use 1-10 epochs and patience');
  check(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff && Number.isFinite(learningRate) && learningRate > 0 && learningRate <= 0.001 &&
    Number.isFinite(l2) && l2 >= 0, 'Invalid reanalysis optimizer options');
  check(Number.isSafeInteger(batchSize) && batchSize >= 2 && batchSize <= 4096 && batchSize % 2 === 0, 'Batch size must be even');
  const model = NeuralPolicyNetwork.fromJSON(prepared.checkpoint), temperature = prepared.targetTemperature;
  const transform = (entries: readonly IndexedPolicyExample[]) => entries.map(entry => ({ ...entry,
    sample: policyTrainingTargets([entry.sample], temperature)[0]! }));
  const strong = transform(prepared.strongTraining), retention = transform(prepared.oldTraining);
  const measurements = (network: NeuralPolicyNetwork) => ({
    strongValidation: measureReanalysisPolicy(network, prepared.strongValidation, temperature),
    oldValidation: measureReanalysisPolicy(network, prepared.oldValidation, temperature),
    oldActiveValidation: measureReanalysisPolicy(network, prepared.oldActiveValidation, temperature),
  });
  const initial = measurements(model);
  let bestMetrics = initial, best = model.toJSON(undefined, true), bestEpoch = 0;
  const history: unknown[] = [], random = seededNeuralRandom(seed);
  for (let epoch = 1; epoch <= epochs; epoch++) {
    const batches = balancedReanalysisBatches(strong, retention, batchSize, random);
    let loss = 0, count = 0;
    for (const batch of batches) {
      loss += model.trainBatch(batch.map(entry => entry.sample), { learningRate, l2 }) * batch.length;
      count += batch.length;
    }
    const metrics = measurements(model);
    const improved = metrics.strongValidation.sharpened.crossEntropy < bestMetrics.strongValidation.sharpened.crossEntropy - 1e-4;
    if (improved) { best = model.toJSON(undefined, true); bestMetrics = metrics; bestEpoch = epoch; }
    const record = { epoch, trainingLoss: loss / count, strongTrainingSamples: strong.length, retentionSamples: strong.length,
      batches: batches.length, batchOrderSha256: createHash('sha256').update(JSON.stringify(batches.map(batch => batch.map(entry =>
        [entry.kind, entry.seed, entry.sourceSampleIndex])))).digest('hex'), metrics, bestEpoch };
    history.push(record); onEpoch?.(record);
    if (epoch - bestEpoch >= patience) break;
  }
  const selected = NeuralPolicyNetwork.fromJSON(best);
  const delta = (current: PolicyMetrics, previous: PolicyMetrics) => ({ crossEntropy: current.crossEntropy - previous.crossEntropy,
    top1Accuracy: current.top1Accuracy - previous.top1Accuracy });
  const phaseMetrics = Object.fromEntries(REANALYSIS_PHASES.map(phase => {
    const samples = prepared.oldActiveValidation.filter(sample => sample.phase === phase);
    return [phase, { initial: measureReanalysisPolicy(NeuralPolicyNetwork.fromJSON(prepared.checkpoint), samples, temperature),
      selected: measureReanalysisPolicy(selected, samples, temperature) }];
  }));
  const report = {
    format: 'puerto-rico-policy-reanalysis-finetune', version: 1, hashes: prepared.hashes,
    previousReanalysisProvenance: structuredClone(prepared.checkpoint.metadata.reanalysisProvenance ?? null),
    config: { seed, epochs, batchSize, patience, learningRate, l2, targetTemperature: temperature, phases: REANALYSIS_PHASES },
    checkpointSelection: 'strongValidation.sharpened.crossEntropy; initial checkpoint is eligible; minimum improvement 0.0001',
    metricDefinitions: {
      raw: 'Concrete-action cross-entropy/top1 against original or pooled raw teacher visits.',
      sharpened: 'Same concrete targets normalized after power 1/0.25, applied exactly once after split; training and checkpoint selection objective.',
      semantic: 'Diagnostic sums over actionId of predictions and raw/sharpened concrete targets; no action merging or target replacement.',
      top1: 'Prediction is among maximum-target actions; ties accepted.',
      scope: 'Reanalysis relabels existing states. It creates no new games and is not an arena strength result.',
      legacyMetadata: 'Top-level checkpoint metadata is preserved as original training provenance. Current fine-tune metrics are in reanalysisProvenance.',
    },
    reanalysisConfig: structuredClone(prepared.artifact.config), reanalysisMetadata: structuredClone(prepared.artifact.metadata),
    originalCollectionConfig: structuredClone(prepared.dataset.config), originalDatasetMetadata: structuredClone(prepared.dataset.metadata ?? null),
    trainingGameSeeds: [...prepared.checkpoint.metadata.trainingGameSeeds as number[]],
    validationGameSeeds: [...prepared.checkpoint.metadata.validationGameSeeds as number[]],
    originalGames: prepared.dataset.games.length, newGames: 0, reanalysedGames: prepared.artifact.games.length,
    samples: { strongTraining: strong.length, strongValidation: prepared.strongValidation.length, retentionPool: retention.length,
      oldValidation: prepared.oldValidation.length, oldActiveValidation: prepared.oldActiveValidation.length },
    initial, selected: bestMetrics, bestEpoch, epochsRun: history.length,
    optimizer: { initialStep: prepared.checkpoint.optimizer!.step, selectedStep: best.optimizer!.step },
    parametersChanged: best.parameters.some((value, index) => !Object.is(value, prepared.checkpoint.parameters[index])),
    oldActiveRegression: { raw: delta(bestMetrics.oldActiveValidation.raw, initial.oldActiveValidation.raw),
      sharpened: delta(bestMetrics.oldActiveValidation.sharpened, initial.oldActiveValidation.sharpened) },
    aliases: { strongTraining: aliasCounts(prepared.strongTraining.map(entry => entry.sample)), strongValidation: aliasCounts(prepared.strongValidation),
      oldActiveValidation: aliasCounts(prepared.oldActiveValidation) },
    selectedStrongTraining: measureReanalysisPolicy(selected, prepared.strongTraining.map(entry => entry.sample), temperature),
    oldActivePhases: phaseMetrics, history,
    deployment: 'candidate-requires-independent-arena-gate',
  };
  const metadata = { ...structuredClone(prepared.checkpoint.metadata), reanalysisProvenance: report };
  return { model: selected.toJSON(metadata), checkpoint: selected.toJSON(metadata, true), report };
}

export function reanalysisSHA256(data: string | Buffer): string { return createHash('sha256').update(data).digest('hex'); }
/** Reconstructs legal actions and encoded reads; this never applies an action or performs search. */
export function validateReanalysisSnapshot(sample: ReanalysisSample, bytes: string | Buffer): void {
  check(reanalysisSHA256(bytes) === sample.snapshotHash, 'Reanalysis snapshot hash mismatch: ' + sample.snapshotPath);
  const state = deserializeGameState(JSON.parse(bytes.toString()));
  const playerId = state.getCurrentPlayer().id;
  const actions = [...new Map(state.getValidActions(playerId).map(action => [hardcoreActionKey(action), action])).values()];
  check(isDeepStrictEqual(actions.map(hardcoreActionKey), sample.actionKeys) && actions.every(action => action.validate(state).ok),
    'Snapshot legal concrete actions differ from reanalysis sample');
  const encoded = encodePolicyInput(state, playerId, actions);
  check(encoded && isDeepStrictEqual({ ...encoded, phase: state.getCurrentPhase().type,
    mover: state.players.findIndex(player => player.id === playerId) }, policyIdentity(sample)),
    'Snapshot features, baseline, actions, phase, or mover differ from reanalysis sample');
}
function verifyReferencedFiles(artifact: PolicyReanalysis, sourceRoot: string): void {
  for (const map of [artifact.metadata.sourceHashes, artifact.metadata.toolHashes]) for (const [file, expected] of Object.entries(map)) {
    const absolute = resolve(sourceRoot, file), path = relative(sourceRoot, absolute);
    check(!isAbsolute(file) && path !== '..' && !path.startsWith('..\\') && !path.startsWith('../'), 'Unsafe reanalysis source hash path');
    check(reanalysisSHA256(readFileSync(absolute)) === expected, 'Reanalysis source/tool hash mismatch: ' + file);
  }
  for (const game of artifact.games) for (const sample of game.samples) {
    validateReanalysisSnapshot(sample, readFileSync(sample.snapshotPath));
  }
}
export async function finetuneReanalysisMain(argv = process.argv.slice(2)): Promise<void> {
  const args = new Map<string, string>();
  const allowed = ['base-dataset', 'reanalysis', 'initial-model', 'resume', 'output', 'source-root', 'epochs', 'batch-size', 'patience', 'seed', 'learning-rate', 'l2'];
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, ''), value = argv[i + 1];
    check(key && allowed.includes(key) && value !== undefined && !value.startsWith('--') && !args.has(key), 'Invalid fine-tune argument: ' + argv[i]);
    args.set(key, value);
  }
  for (const key of ['base-dataset', 'reanalysis', 'initial-model', 'resume']) check(args.has(key), 'Missing --' + key);
  const paths = Object.fromEntries(['base-dataset', 'reanalysis', 'initial-model', 'resume'].map(key => [key, resolve(args.get(key)!)]));
  const files = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(path)]));
  const hashes: ReanalysisHashes = { sourceDatasetSha256: reanalysisSHA256(files['base-dataset']!), reanalysisSha256: reanalysisSHA256(files['reanalysis']!),
    initialModelSha256: reanalysisSHA256(files['initial-model']!), checkpointSha256: reanalysisSHA256(files['resume']!) };
  const prepared = prepareReanalysisTraining(JSON.parse(files['base-dataset']!.toString('utf8')), JSON.parse(files['reanalysis']!.toString('utf8')),
    JSON.parse(files['initial-model']!.toString('utf8')), JSON.parse(files['resume']!.toString('utf8')), hashes);
  const sourceRoot = resolve(args.get('source-root') ?? process.cwd());
  verifyReferencedFiles(prepared.artifact, sourceRoot);
  const trainingTools = ['tools/finetune-reanalysis.ts', 'tools/train-policy.ts', 'tools/reanalyse-policy.ts', 'tools/register-typescript.mjs'];
  const trainingToolHashes = Object.fromEntries(trainingTools.map(file => [file, reanalysisSHA256(readFileSync(resolve(sourceRoot, file)))]));
  const output = resolve(args.get('output') ?? 'work/neural-policy/policy-reanalysis.json');
  const outputs = [output, output + '.checkpoint.json', output + '.report.json'];
  check(outputs.every(path => !Object.values(paths).some(input => input.toLowerCase() === path.toLowerCase())), 'Output would overwrite a training input');
  check(outputs.every(path => !existsSync(path)), 'Fine-tune output already exists; use a new output path');
  const options: ReanalysisTrainingOptions = {};
  for (const [flag, key] of [['epochs', 'epochs'], ['batch-size', 'batchSize'], ['patience', 'patience'], ['seed', 'seed'],
    ['learning-rate', 'learningRate'], ['l2', 'l2']] as const) if (args.has(flag)) options[key] = Number(args.get(flag));
  const result = finetuneReanalysis(prepared, options, record => console.log(JSON.stringify(record)));
  for (const [file, expected] of Object.entries(trainingToolHashes)) {
    check(reanalysisSHA256(readFileSync(resolve(sourceRoot, file))) === expected, 'Training tool changed during fine-tune: ' + file);
  }
  result.report.trainingToolHashes = trainingToolHashes;
  result.model.metadata.reanalysisProvenance = result.report;
  result.checkpoint.metadata.reanalysisProvenance = result.report;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(outputs[0]!, JSON.stringify(result.model), { flag: 'wx' }); writeFileSync(outputs[1]!, JSON.stringify(result.checkpoint), { flag: 'wx' });
  writeFileSync(outputs[2]!, JSON.stringify({ ...result.report, paths, output }), { flag: 'wx' });
  console.log(JSON.stringify({ output, report: outputs[2], bestEpoch: result.report.bestEpoch, epochsRun: result.report.epochsRun,
    oldActiveRegression: result.report.oldActiveRegression }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await finetuneReanalysisMain();
