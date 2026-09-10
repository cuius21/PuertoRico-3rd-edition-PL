import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PolicyDataset, TeacherGame } from './collect-policy';
import type { PolicyExample } from '../src/bots/neural/policyFeatures';
import { NEURAL_ACTION_VOCABULARY } from '../src/bots/neural/policyFeatures';
import { NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES } from '../src/bots/neural/features';
import { NeuralPolicyNetwork, validatePolicyInput, validatePolicyDistribution } from '../src/bots/neural/policyNetwork';
import type { NeuralPolicyMode } from '../src/bots/neural/policyNetwork';
import { seededNeuralRandom } from '../src/bots/neural/network';

export function parsePolicyDataset(value: unknown): PolicyDataset {
  if (!value || typeof value !== 'object') throw new Error('Invalid policy dataset');
  const data = value as PolicyDataset;
  if (data.format !== 'puerto-rico-search-policy' || data.version !== 1 || data.featureSchema !== NEURAL_FEATURE_SCHEMA ||
    JSON.stringify(data.featureNames) !== JSON.stringify(NEURAL_FEATURE_NAMES) ||
    JSON.stringify(data.actionVocabulary) !== JSON.stringify(NEURAL_ACTION_VOCABULARY) || !Array.isArray(data.games)) {
    throw new Error('Incompatible policy dataset schema');
  }
  if (!data.config || !Number.isSafeInteger(data.config.games) || data.config.games < 1 ||
    !Number.isSafeInteger(data.config.iterations) || data.config.iterations < 1) throw new Error('Invalid policy dataset configuration');
  const seen = new Set<number>();
  for (const game of data.games) {
    if (!game || !Number.isSafeInteger(game.seed) || seen.has(game.seed) || !Array.isArray(game.samples) ||
      game.samples.length === 0 || !game.record || game.record.status !== 'completed' || game.record.environmentSeed !== game.seed) {
      throw new Error('Policy dataset requires unique complete games with matching environment seeds');
    }
    seen.add(game.seed);
    for (const sample of game.samples) {
      validatePolicyInput(sample);
      validatePolicyDistribution(sample.target, sample.actionIds.length, 'teacher target');
      if (typeof sample.phase !== 'string' || !sample.phase || !Number.isInteger(sample.mover) ||
        sample.mover < 0 || sample.mover > 2 || !Number.isSafeInteger(sample.teacherIterations) ||
        sample.teacherIterations < 1 || !Array.isArray(sample.teacherValues) ||
        sample.teacherValues.length !== sample.actionIds.length || sample.teacherValues.some(value => !Number.isFinite(value))) {
        throw new Error('Invalid policy teacher sample metadata');
      }
    }
  }
  return data;
}

export interface PolicySplitHistory { trainingGameSeeds?: unknown; validationGameSeeds?: unknown }
function seedList(value: unknown, name: string): number[] {
  if (!Array.isArray(value) || !value.length || value.some(seed => !Number.isSafeInteger(seed)) ||
    new Set(value).size !== value.length) throw new Error('Missing or invalid prior policy ' + name + ' seeds');
  return value as number[];
}
function fraction(seed: number): number {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
export function splitPolicyGames<T extends { seed: number }>(games: readonly T[], seed: number, previous?: PolicySplitHistory): {
  training: T[]; validation: T[];
} {
  const bySeed = new Map(games.map(game => [game.seed, game]));
  if (bySeed.size !== games.length) throw new Error('Duplicate policy game seed');
  if (previous) {
    const train = seedList(previous.trainingGameSeeds, 'training'), validation = seedList(previous.validationGameSeeds, 'validation');
    const seen = new Set(train);
    for (const gameSeed of validation) {
      if (seen.has(gameSeed)) throw new Error('Prior policy training and validation splits overlap');
      seen.add(gameSeed);
    }
    for (const gameSeed of seen) if (!bySeed.has(gameSeed)) throw new Error('Missing prior policy game seed in input dataset: ' + gameSeed);
    const split = { training: train.map(seed => bySeed.get(seed)!), validation: validation.map(seed => bySeed.get(seed)!) };
    for (const game of [...games].sort((a, b) => a.seed - b.seed)) {
      if (!seen.has(game.seed)) (fraction(game.seed) < 0.2 ? split.validation : split.training).push(game);
    }
    return split;
  }
  if (games.length < 2) throw new Error('Policy training requires at least two complete games');
  const ordered = [...games].sort((a, b) => fraction(a.seed ^ seed) - fraction(b.seed ^ seed) || a.seed - b.seed);
  const count = Math.max(1, Math.min(games.length - 1, Math.round(games.length * 0.2)));
  return { training: ordered.slice(count), validation: ordered.slice(0, count) };
}

export interface PolicyMetrics {
  samples: number;
  crossEntropy: number;
  targetEntropy: number;
  klDivergence: number;
  top1Accuracy: number;
}
export function measurePolicy(model: NeuralPolicyNetwork | null, samples: readonly PolicyExample[]): PolicyMetrics {
  if (!samples.length) throw new Error('Policy metrics require samples');
  let crossEntropy = 0, targetEntropy = 0, correct = 0;
  for (const sample of samples) {
    const probabilities = model ? model.predict(sample) : sample.baseline;
    validatePolicyDistribution(probabilities, sample.actionIds.length, 'prediction');
    validatePolicyDistribution(sample.target, sample.actionIds.length, 'target');
    let predicted = 0;
    for (let i = 1; i < probabilities.length; i++) if (probabilities[i]! > probabilities[predicted]!) predicted = i;
    if (sample.target[predicted]! >= Math.max(...sample.target) - 1e-12) correct++;
    for (let i = 0; i < probabilities.length; i++) {
      crossEntropy -= sample.target[i]! * Math.log(Math.max(1e-12, probabilities[i]!));
      targetEntropy -= sample.target[i]! * Math.log(Math.max(1e-12, sample.target[i]!));
    }
  }
  return { samples: samples.length, crossEntropy: crossEntropy / samples.length, targetEntropy: targetEntropy / samples.length,
    klDivergence: (crossEntropy - targetEntropy) / samples.length, top1Accuracy: correct / samples.length };
}

export interface PolicyTargetHistory { targetTemperature?: unknown }

function validateTargetTemperature(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.05 || value > 10) {
    throw new Error('Policy target temperature must be a finite number between 0.05 and 10');
  }
  return value;
}

/** Legacy checkpoints used the original visit distribution, equivalent to temperature 1. */
export function resolvePolicyTargetTemperature(requested?: number, previous?: PolicyTargetHistory): number {
  if (requested !== undefined) validateTargetTemperature(requested);
  if (previous === undefined) return requested ?? 1;
  const recorded = previous.targetTemperature === undefined ? 1 : validateTargetTemperature(previous.targetTemperature);
  if (requested !== undefined && requested !== recorded) {
    throw new Error('Cannot change policy target temperature when resuming: checkpoint uses ' + recorded);
  }
  return recorded;
}

/** Power of probabilities equals power of visits after renormalization; zero visits stay zero. */
export function sharpenPolicyTarget(target: readonly number[], temperature: number): number[] {
  validateTargetTemperature(temperature);
  validatePolicyDistribution(target, target.length, 'teacher target');
  if (temperature === 1) return [...target];
  const logs = target.map(value => value === 0 ? -Infinity : Math.log(value) / temperature);
  const maximum = Math.max(...logs);
  const weights = logs.map(value => Math.exp(value - maximum));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(value => value / total);
}

/** Call on each already-separated game split; preserve the dataset and original metric targets. */
export function policyTrainingTargets(samples: readonly PolicyExample[], temperature: number): PolicyExample[] {
  validateTargetTemperature(temperature);
  return samples.map(sample => ({ ...sample, target: sharpenPolicyTarget(sample.target, temperature) }));
}

export const POLICY_SELECTION_PHASES = ['roleSelection', 'builder', 'trader', 'settler', 'captain', 'craftsman'] as const;
export interface PolicySelectionHistory { selectionPhases?: unknown }

function validateSelectionPhases(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.some(phase => typeof phase !== 'string' ||
    !(POLICY_SELECTION_PHASES as readonly string[]).includes(phase)) || new Set(value).size !== value.length) {
    throw new Error('Invalid selection phases; use unique policy phase names or all');
  }
  // Phase order is immaterial to selection, so persist a canonical list.
  return POLICY_SELECTION_PHASES.filter(phase => value.includes(phase));
}

export function resolvePolicySelectionPhases(requested?: string, previous?: PolicySelectionHistory): string[] | null {
  const inherited = validateSelectionPhases(previous?.selectionPhases);
  if (requested === undefined) return inherited;
  if (requested.trim() === 'all') return null;
  return validateSelectionPhases(requested.split(',').map(phase => phase.trim()));
}

export function policySelectionSamples(samples: readonly PolicyExample[], phases: readonly string[] | null): readonly PolicyExample[] {
  const selected = phases === null ? samples : samples.filter(sample => phases.includes(sample.phase));
  if (selected.length === 0) throw new Error('No validation samples in the selected phases');
  return selected;
}

function writeJSON(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

export async function trainPolicyMain(argv = process.argv.slice(2)): Promise<void> {
  const args = new Map<string, string>();
  const allowed = ['input', 'output', 'epochs', 'seed', 'hidden-size', 'policy-mode', 'learning-rate', 'batch-size', 'patience', 'resume', 'l2', 'target-temperature', 'selection-phases'];
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, ''), value = argv[i + 1];
    if (!key || !allowed.includes(key) || value === undefined || value.startsWith('--') || args.has(key)) throw new Error('Invalid policy training argument: ' + argv[i]);
    args.set(key, value);
  }
  if (!args.has('input')) throw new Error('Policy training requires --input teacher.dataset.json');
  const integer = (key: string, fallback: number, min: number, max = 0xffffffff): number => {
    const value = Number(args.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid --' + key);
    return value;
  };
  const rate = Number(args.get('learning-rate') ?? 0.001), l2 = Number(args.get('l2') ?? 0.00001);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1 || !Number.isFinite(l2) || l2 < 0) throw new Error('Invalid learning rate or L2');
  const seed = integer('seed', 27090911, 0), epochs = integer('epochs', 30, 1);
  const batchSize = integer('batch-size', 64, 1, 4096), patience = integer('patience', 5, 1);
  const mode = args.get('policy-mode') ?? 'residual';
  if (mode !== 'residual' && mode !== 'standalone') throw new Error('Invalid --policy-mode');
  const input = resolve(args.get('input')!), output = resolve(args.get('output') ?? 'work/neural-policy/policy-candidate.json');
  const dataset = parsePolicyDataset(JSON.parse(readFileSync(input, 'utf8')));
  const datasetProvenance = structuredClone(dataset.metadata ?? null);
  const model = args.has('resume')
    ? NeuralPolicyNetwork.fromJSON(JSON.parse(readFileSync(resolve(args.get('resume')!), 'utf8')))
    : new NeuralPolicyNetwork({ seed, hiddenSize: integer('hidden-size', 64, 1, 256), policyMode: mode as NeuralPolicyMode });
  if ((args.has('policy-mode') && model.policyMode !== mode) ||
    (args.has('hidden-size') && model.hiddenSize !== integer('hidden-size', 64, 1, 256))) throw new Error('Cannot change policy architecture when resuming');
  const prior = args.has('resume') ? model.toJSON().metadata : undefined;
  const targetTemperature = resolvePolicyTargetTemperature(
    args.has('target-temperature') ? Number(args.get('target-temperature')) : undefined, prior);
  const previousSelectionPhases = resolvePolicySelectionPhases(undefined, prior);
  const selectionPhases = resolvePolicySelectionPhases(args.get('selection-phases'), prior);
  const selectionCriterionChangedOnResume = prior !== undefined &&
    JSON.stringify(previousSelectionPhases) !== JSON.stringify(selectionPhases);
  const split = splitPolicyGames(dataset.games, seed, prior);
  const trainingOriginal = split.training.flatMap(game => game.samples), validation = split.validation.flatMap(game => game.samples);
  // Split games first, then derive independent targets. Original visits remain the reporting reference.
  const training = policyTrainingTargets(trainingOriginal, targetTemperature);
  const validationTargets = policyTrainingTargets(validation, targetTemperature);
  const selectionTargets = policySelectionSamples(validationTargets, selectionPhases);
  const baseline = measurePolicy(null, validation), initial = measurePolicy(model, validation);
  const baselineTargetCrossEntropy = targetTemperature === 1 ? baseline.crossEntropy : measurePolicy(null, validationTargets).crossEntropy;
  const initialTargetCrossEntropy = targetTemperature === 1 ? initial.crossEntropy : model.loss(validationTargets);
  const baselineSelectionTargetCrossEntropy = selectionPhases === null ? baselineTargetCrossEntropy : measurePolicy(null, selectionTargets).crossEntropy;
  const initialSelectionTargetCrossEntropy = selectionPhases === null ? initialTargetCrossEntropy : model.loss(selectionTargets);
  let bestMetrics = initial, bestTargetCrossEntropy = initialTargetCrossEntropy,
    bestSelectionTargetCrossEntropy = initialSelectionTargetCrossEntropy, bestEpoch = 0, best = model.toJSON({}, true);
  const history: { epoch: number; trainingLoss: number; validationTargetCrossEntropy: number;
    selectionTargetCrossEntropy: number; validation: PolicyMetrics }[] = [];
  const splitMetadata = {
    trainingGameSeeds: split.training.map(game => game.seed), validationGameSeeds: split.validation.map(game => game.seed),
  };
  const targetMetadata = {
    targetTemperature, checkpointSelection: 'selectionTargetCrossEntropy',
    selectionPhases, selectionValidationSamples: selectionTargets.length,
    previousSelectionPhases: prior === undefined ? null : previousSelectionPhases,
    selectionCriterionChangedOnResume,
    selectionPhaseSource: args.has('selection-phases') ? 'explicit' : prior === undefined ? 'default' : 'inherited',
    targetTransform: 'normalize(originalTeacherVisits ** (1 / targetTemperature)); applied after whole-game split',
    reportingTarget: 'original teacher visit distribution for baseline, initial, validation, training and phases',
    trainingLossDefinition: 'average minibatch cross-entropy against transformed targets',
  };
  const random = seededNeuralRandom(seed ^ 0xa5a5a5a5);
  console.log(JSON.stringify({ games: dataset.games.length, trainingSamples: training.length, validationSamples: validation.length,
    policyMode: model.policyMode, ...targetMetadata, baseline, initial, baselineTargetCrossEntropy, initialTargetCrossEntropy,
    baselineSelectionTargetCrossEntropy, initialSelectionTargetCrossEntropy }));
  for (let epoch = 1; epoch <= epochs; epoch++) {
    for (let i = training.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [training[i], training[j]] = [training[j]!, training[i]!];
    }
    let loss = 0;
    for (let start = 0; start < training.length; start += batchSize) {
      const batch = training.slice(start, start + batchSize);
      loss += model.trainBatch(batch, { learningRate: rate, l2 }) * batch.length;
    }
    const validationMetrics = measurePolicy(model, validation);
    const validationTargetCrossEntropy = targetTemperature === 1 ? validationMetrics.crossEntropy : model.loss(validationTargets);
    const selectionTargetCrossEntropy = selectionPhases === null ? validationTargetCrossEntropy : model.loss(selectionTargets);
    history.push({ epoch, trainingLoss: loss / training.length, validationTargetCrossEntropy, selectionTargetCrossEntropy, validation: validationMetrics });
    if (selectionTargetCrossEntropy < bestSelectionTargetCrossEntropy - 0.0001) {
      bestMetrics = validationMetrics;
      bestTargetCrossEntropy = validationTargetCrossEntropy;
      bestSelectionTargetCrossEntropy = selectionTargetCrossEntropy;
      bestEpoch = epoch;
      best = model.toJSON({}, true);
      writeJSON(output + '.checkpoint.json', model.toJSON({ ...splitMetadata, ...targetMetadata, seed, games: dataset.games.length, epoch,
        datasetProvenance,
        baseline, initial, baselineTargetCrossEntropy, initialTargetCrossEntropy, validationTargetCrossEntropy,
        baselineSelectionTargetCrossEntropy, initialSelectionTargetCrossEntropy, selectionTargetCrossEntropy,
        validation: validationMetrics, policyMode: model.policyMode }, true));
    }
    console.log(JSON.stringify({ ...history[history.length - 1], bestEpoch }));
    if (epoch - bestEpoch >= patience) break;
  }
  const selected = NeuralPolicyNetwork.fromJSON(best);
  const phases: Record<string, { baseline: PolicyMetrics; learned: PolicyMetrics }> = {};
  for (const phase of new Set(validation.map(sample => sample.phase))) {
    const samples = validation.filter(sample => sample.phase === phase);
    phases[phase] = { baseline: measurePolicy(null, samples), learned: measurePolicy(selected, samples) };
  }
  const metadata = {
    datasetProvenance,
    ...splitMetadata, ...targetMetadata, trainedAt: new Date().toISOString(), algorithm: 'masked-state-MLP-teacher-visit-cross-entropy-Adam',
    policyMode: model.policyMode, dataset: input, seed, games: dataset.games.length, requestedCollectionGames: dataset.config.games,
    collectionComplete: dataset.games.length === dataset.config.games, teacherIterations: dataset.config.iterations,
    trainingSamples: training.length, validationSamples: validation.length, baseline, initial, validation: bestMetrics,
    baselineTargetCrossEntropy, initialTargetCrossEntropy, validationTargetCrossEntropy: bestTargetCrossEntropy,
    baselineSelectionTargetCrossEntropy, initialSelectionTargetCrossEntropy, selectionTargetCrossEntropy: bestSelectionTargetCrossEntropy,
    bestEpoch, epochsRun: history.length, training: measurePolicy(selected, trainingOriginal),
    trainingTargetCrossEntropy: selected.loss(training), phases, history,
    top1Definition: 'predicted action is among teacher maximum-visit actions; ties accepted',
    resumedFrom: args.get('resume') ?? null, deployment: 'candidate-requires-independent-arena-gate',
  };
  writeJSON(output + '.checkpoint.json', selected.toJSON(metadata, true));
  writeJSON(output, selected.toJSON(metadata));
  writeJSON(output + '.report.json', metadata);
  console.log(JSON.stringify({ model: output, report: output + '.report.json', bestEpoch, targetTemperature,
    baselineTargetCrossEntropy, validationTargetCrossEntropy: bestTargetCrossEntropy,
    selectionPhases, selectionTargetCrossEntropy: bestSelectionTargetCrossEntropy, baseline, validation: bestMetrics }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await trainPolicyMain();
