import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GameFactory } from '../state/GameFactory';
import { RoleSelectionPhase } from '../state/phases/RoleSelectionPhase';
import { ScoreCalculator } from '../state/ScoreCalculator';
import { PhaseType } from '../core/types';
import { GreedyBot } from '../src/bots/GreedyBot';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { chooseHeuristicAction } from '../src/bots/hardcorePolicy';
import { evaluateHardcoreState } from '../src/bots/hardcoreEvaluation';
import { encodeNeuralState, NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES, NEURAL_INPUT_SIZE } from '../src/bots/neural/features';
import { NeuralValueNetwork, seededNeuralRandom } from '../src/bots/neural/network';
import type { NeuralExample } from '../src/bots/neural/network';

export interface NeuralTrainingGame {
  seed: number;
  policies: string[];
  scores: number[];
  winners: string[];
  samples: NeuralExample[];
}

export interface NeuralDataset {
  format: 'puerto-rico-self-play';
  version: 1;
  featureSchema: typeof NEURAL_FEATURE_SCHEMA;
  featureNames: string[];
  games: NeuralTrainingGame[];
}

function writeJSON(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
}

export function parseNeuralDataset(value: unknown): NeuralDataset {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid neural dataset');
  const data = value as NeuralDataset;
  if (data.format !== 'puerto-rico-self-play' || data.version !== 1 || data.featureSchema !== NEURAL_FEATURE_SCHEMA ||
    JSON.stringify(data.featureNames) !== JSON.stringify(NEURAL_FEATURE_NAMES) || !Array.isArray(data.games)) {
    throw new Error('Incompatible neural dataset');
  }
  const seen = new Set<number>();
  for (const game of data.games) {
    if (!Number.isSafeInteger(game.seed) || seen.has(game.seed) || !Array.isArray(game.samples) || game.samples.length === 0) {
      throw new Error('Dataset has an invalid or duplicate game seed');
    }
    seen.add(game.seed);
    for (const sample of game.samples) {
      if (!Array.isArray(sample.inputs) || sample.inputs.length !== 3 || sample.inputs.some(row =>
        !Array.isArray(row) || row.length !== NEURAL_INPUT_SIZE || row.some(value => !Number.isFinite(value))) ||
        !Array.isArray(sample.target) || sample.target.length !== 3 ||
        sample.target.some(value => !Number.isFinite(value) || value < 0) ||
        Math.abs(sample.target.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) {
        throw new Error('Dataset contains an invalid training sample');
      }
      if (sample.baseline !== undefined && (!Array.isArray(sample.baseline) || sample.baseline.length !== 3 ||
        sample.baseline.some(value => !Number.isFinite(value) || value < 0) ||
        Math.abs(sample.baseline.reduce((sum, value) => sum + value, 0) - 1) > 1e-6)) {
        throw new Error('Dataset contains invalid baseline probabilities');
      }
    }
  }
  return data;
}

export interface NeuralSplitMetadata {
  trainingGameSeeds?: unknown;
  validationGameSeeds?: unknown;
}

function recordedSeeds(value: unknown, name: string): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(seed => !Number.isSafeInteger(seed)) ||
    new Set(value).size !== value.length) {
    throw new Error('Resumed model requires a nonempty, unique ' + name + ' seed list');
  }
  return value as number[];
}

function validationFraction(seed: number): number {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function splitByGameSeed(
  games: readonly NeuralTrainingGame[],
  seed: number,
  previous?: NeuralSplitMetadata,
): { training: NeuralTrainingGame[]; validation: NeuralTrainingGame[] } {
  const bySeed = new Map(games.map(game => [game.seed, game]));
  if (bySeed.size !== games.length) throw new Error('Duplicate dataset game seed');
  if (previous) {
    const trainingSeeds = recordedSeeds(previous.trainingGameSeeds, 'training');
    const validationSeeds = recordedSeeds(previous.validationGameSeeds, 'validation');
    const assigned = new Set(trainingSeeds);
    for (const gameSeed of validationSeeds) {
      if (assigned.has(gameSeed)) throw new Error('Resumed model training and validation seeds overlap');
      assigned.add(gameSeed);
    }
    for (const gameSeed of assigned) {
      if (!bySeed.has(gameSeed)) {
        throw new Error('Recorded model seed ' + gameSeed + ' is absent from --input dataset; supply the matching previous dataset');
      }
    }
    const training = trainingSeeds.map(gameSeed => bySeed.get(gameSeed)!);
    const validation = validationSeeds.map(gameSeed => bySeed.get(gameSeed)!);
    // Membership of new games depends only on their seed, never on dataset size or a later run's seed.
    for (const game of [...games].sort((a, b) => a.seed - b.seed)) {
      if (assigned.has(game.seed)) continue;
      const holdout = validationFraction(game.seed) < 0.2;
      (holdout ? validation : training).push(game);
    }
    return { training, validation };
  }
  if (games.length < 2) throw new Error('At least two complete games are required for a game-separated validation set');
  const ordered = [...games].sort((a, b) =>
    seededNeuralRandom(a.seed ^ seed ^ 0x7f4a7c15)() - seededNeuralRandom(b.seed ^ seed ^ 0x7f4a7c15)() || a.seed - b.seed);
  const count = Math.min(games.length - 1, Math.max(1, Math.round(games.length * 0.2)));
  return { training: ordered.slice(count), validation: ordered.slice(0, count) };
}

export interface GenerateOptions {
  games: number;
  seed: number;
  iterations: number;
  maxActions: number;
  exploration: number;
  model?: NeuralValueNetwork;
  league?: 'mixed' | 'hardcore';
  samplesPerGame?: number;
  gameOffset?: number;
}

export function generateTrainingGames(options: GenerateOptions, usedSeeds = new Set<number>()): {
  games: NeuralTrainingGame[]; discarded: number;
} {
  const complete: NeuralTrainingGame[] = [];
  let discarded = 0;
  const greedy = new GreedyBot();
  const sampleLimit = options.samplesPerGame ?? 12;
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 1) throw new Error('Invalid samples per game');
  if (options.games > 0 && options.league === 'hardcore' && options.iterations < 1) throw new Error('Hardcore league requires search iterations');
  for (let localIndex = 0; localIndex < options.games; localIndex++) {
    const gameIndex = localIndex + (options.gameOffset ?? 0);
    let gameSeed = (options.seed + Math.imul(gameIndex + 1, 0x9e3779b1)) >>> 0;
    while (usedSeeds.has(gameSeed)) gameSeed = (gameSeed + 1) >>> 0;
    usedSeeds.add(gameSeed);
    const chanceRandom = seededNeuralRandom(gameSeed);
    const explorationRandom = seededNeuralRandom(gameSeed ^ 0xb5297a4d);
    const sampleRandom = seededNeuralRandom(gameSeed ^ 0x51ed270b);
    const searchRandom = seededNeuralRandom(gameSeed ^ 0x68bc21eb);
    const previousRandom = Math.random;
    Math.random = chanceRandom;
    try {
      const state = GameFactory.create(3, ['A', 'B', 'C'], new RoleSelectionPhase());
      const candidate = options.iterations > 0 ? 'search' : 'policy';
      const league = options.league === 'hardcore' ? ['search', 'search', 'search'] :
        [candidate, 'policy', gameIndex % 3 === 2 ? 'policy' : 'greedy'];
      const policies = league.map((_policy, seat) => league[(seat + gameIndex) % 3]!);
      const search = new HardcoreBot({
        timeBudgetMs: Infinity, maxIterations: options.iterations, rolloutRounds: 2, random: searchRandom,
        ...(options.model ? { evaluator: options.model, evaluatorWeight: 0.25 } : {}),
      });
      const searchBots = options.league === 'hardcore' ? [0, 1, 2].map(seat => new HardcoreBot({
        timeBudgetMs: Infinity, maxIterations: options.iterations, rolloutRounds: 2,
        random: seededNeuralRandom(gameSeed ^ Math.imul(seat + 1, 0x68bc21eb)),
        ...(options.model ? { evaluator: options.model, evaluatorWeight: 0.25 } : {}),
      })) : [search, search, search];
      const samples: { inputs: number[][]; baseline: number[] }[] = [];
      let seen = 0;
      let steps = 0;
      let invalid = false;
      while (!state.gameOver && steps < options.maxActions) {
        if (state.getCurrentPhase().type === PhaseType.RoleSelection) {
          seen++;
          const chosen = samples.length < sampleLimit ? samples.length : Math.floor(sampleRandom() * seen);
          if (chosen < sampleLimit) samples[chosen] = { inputs: encodeNeuralState(state), baseline: evaluateHardcoreState(state) };
        }
        const player = state.getCurrentPlayer();
        const actions = state.getValidActions(player.id);
        if (actions.length === 0) { invalid = true; break; }
        const policy = policies[state.currentPlayerIndex]!;
        const action = explorationRandom() < options.exploration ? actions[Math.floor(explorationRandom() * actions.length)]! :
          policy === 'search' ? searchBots[state.currentPlayerIndex]!.chooseAction(state, player.id) :
          policy === 'greedy' ? greedy.chooseAction(state, player.id) : chooseHeuristicAction(state, player.id, actions);
        const key = JSON.stringify(action);
        if (!actions.some(candidate => JSON.stringify(candidate) === key) || !state.apply(action).ok) { invalid = true; break; }
        steps++;
      }
      if (!state.gameOver || invalid || samples.length === 0) { discarded++; continue; }
      const winners = ScoreCalculator.getWinners(state).map(winner => winner.playerId);
      const target = state.players.map(player => winners.includes(player.id) ? 1 / winners.length : 0);
      const scores = ScoreCalculator.calculate(state);
      complete.push({
        seed: gameSeed, policies, scores: state.players.map(player => scores.find(score => score.playerId === player.id)!.total),
        winners, samples: samples.map(sample => ({ ...sample, target: [...target] })),
      });
    } catch (error) {
      discarded++;
      console.error(JSON.stringify({ discardedSeed: gameSeed, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      Math.random = previousRandom;
    }
    if ((localIndex + 1) % 25 === 0) console.log(JSON.stringify({ generated: localIndex + 1, completed: complete.length, discarded }));
  }
  return { games: complete, discarded };
}

function argumentsMap(argv: string[]): Map<string, string> {
  const options = new Map<string, string>();
  const allowed = new Set(['games', 'epochs', 'seed', 'output', 'iterations', 'input', 'resume',
    'batch-size', 'hidden-size', 'learning-rate', 'patience', 'exploration', 'max-actions', 'dataset-output',
    'league', 'samples-per-game', 'value-mode']);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    if (!key || !allowed.has(key) || value === undefined || value.startsWith('--')) {
      throw new Error('Expected supported --option value; received ' + argv[i]);
    }
    options.set(key, value);
  }
  return options;
}

export async function trainNeuralMain(argv = process.argv.slice(2)): Promise<void> {
  const args = argumentsMap(argv);
  const numberOption = (key: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number => {
    const value = Number(args.get(key) ?? fallback);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid --' + key);
    return value;
  };
  const integerOption = (key: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number => {
    const value = numberOption(key, fallback, min, max);
    if (!Number.isSafeInteger(value)) throw new Error('--' + key + ' must be an integer');
    return value;
  };
  const seed = integerOption('seed', 73191, 0, 0xffffffff);
  const games = integerOption('games', args.has('input') ? 0 : 300, 0);
  const epochs = integerOption('epochs', 20, 1);
  const iterations = integerOption('iterations', 0, 0);
  const batchSize = integerOption('batch-size', 32, 1, 4096);
  const patience = integerOption('patience', 5, 1);
  const learningRate = numberOption('learning-rate', 0.001, Number.MIN_VALUE, 1);
  const output = resolve(args.get('output') ?? '.hardcore-work/neural-candidate.json');
  const valueMode = args.get('value-mode') ?? 'standalone';
  const league = args.get('league') ?? 'mixed';
  if (valueMode !== 'standalone' && valueMode !== 'residual') throw new Error('Invalid --value-mode');
  if (league !== 'mixed' && league !== 'hardcore') throw new Error('Invalid --league');
  const model = args.has('resume')
    ? NeuralValueNetwork.fromJSON(JSON.parse(readFileSync(resolve(args.get('resume')!), 'utf8')))
    : new NeuralValueNetwork({ seed, hiddenSize: integerOption('hidden-size', 32, 1, 256), valueMode });
  if (args.has('value-mode') && model.valueMode !== valueMode) throw new Error('Cannot change --value-mode when resuming');
  const dataset: NeuralDataset = args.has('input')
    ? parseNeuralDataset(JSON.parse(readFileSync(resolve(args.get('input')!), 'utf8')))
    : { format: 'puerto-rico-self-play', version: 1, featureSchema: NEURAL_FEATURE_SCHEMA, featureNames: [...NEURAL_FEATURE_NAMES], games: [] };
  const previousSplit = args.has('resume') ? model.toJSON().metadata : undefined;
  // Reject missing or incompatible history before generating expensive search games.
  if (previousSplit) splitByGameSeed(dataset.games, seed, previousSplit);
  if (model.valueMode === 'residual' && dataset.games.some(game => game.samples.some(sample => !sample.baseline))) {
    throw new Error('Residual training requires a dataset with baseline probabilities');
  }
  const generated = generateTrainingGames({
    games, seed, iterations, maxActions: integerOption('max-actions', 4000, 1),
    league, samplesPerGame: integerOption('samples-per-game', 12, 1, 1000),
    exploration: numberOption('exploration', 0.04, 0, 1),
    ...(args.has('resume') ? { model } : {}),
  }, new Set(dataset.games.map(game => game.seed)));
  dataset.games.push(...generated.games);
  const datasetOutput = resolve(args.get('dataset-output') ?? output + '.dataset.json');
  writeJSON(datasetOutput, dataset);
  const split = splitByGameSeed(dataset.games, seed, previousSplit);
  const training = split.training.flatMap(game => game.samples);
  const validation = split.validation.flatMap(game => game.samples);
  const initialValidationLoss = model.loss(validation);
  const baselineValidationLoss = validation.every(sample => sample.baseline) ? validation.reduce((sum, sample) =>
    sum - sample.target.reduce((loss, credit, i) => loss + credit * Math.log(Math.max(1e-12, sample.baseline![i]!)), 0), 0) / validation.length : null;
  let bestLoss = initialValidationLoss;
  let bestEpoch = 0;
  let bestTrainingLoss = model.loss(training);
  let best = model.toJSON({}, true);
  const random = seededNeuralRandom(seed ^ 0xa5a5a5a5);
  const history: { epoch: number; trainingLoss: number; validationLoss: number }[] = [];
  for (let epoch = 1; epoch <= epochs; epoch++) {
    for (let i = training.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [training[i], training[j]] = [training[j]!, training[i]!];
    }
    let loss = 0;
    for (let start = 0; start < training.length; start += batchSize) {
      const batch = training.slice(start, start + batchSize);
      loss += model.trainBatch(batch, { learningRate }) * batch.length;
    }
    const trainingLoss = loss / training.length;
    const validationLoss = model.loss(validation);
    history.push({ epoch, trainingLoss, validationLoss });
    if (validationLoss < bestLoss - 0.0001) {
      bestLoss = validationLoss;
      bestEpoch = epoch;
      bestTrainingLoss = trainingLoss;
      best = model.toJSON({}, true);
      writeJSON(output + '.checkpoint.json', model.toJSON({
        seed, games: dataset.games.length, epoch, trainingLoss, validationLoss,
        trainingGameSeeds: split.training.map(game => game.seed), validationGameSeeds: split.validation.map(game => game.seed),
      }, true));
    }
    console.log(JSON.stringify({ epoch, trainingLoss, validationLoss, bestEpoch }));
    if (epoch - bestEpoch >= patience) break;
  }
  const metadata = {
    trainedAt: new Date().toISOString(), algorithm: 'shared-player-MLP-softmax-Adam',
    trainingKind: dataset.games.some(game => game.policies.includes('search')) ? 'search-self-play' : 'teacher-policy-self-play',
    deployment: 'candidate-requires-independent-arena-gate', seed, games: dataset.games.length,
    examples: training.length + validation.length, trainingGameSeeds: split.training.map(game => game.seed),
    validationGameSeeds: split.validation.map(game => game.seed), requestedEpochs: epochs, epochsRun: history.length,
    bestEpoch, trainingLoss: bestTrainingLoss, validationLoss: bestLoss, initialValidationLoss, baselineValidationLoss,
    uniformLoss: Math.log(3), discardedGames: generated.discarded, searchIterations: games > 0 ? iterations : null,
    resumedFrom: args.get('resume') ?? null,
    validationAssignment: previousSplit ? 'preserved-model-seeds-plus-hash-v1' : 'initial-game-separated-split-v1',
    randomStreams: 'engine-exploration-sampling-search-separated-v1', history,
    valueMode: model.valueMode, generationLeague: games > 0 ? league : null,
    dataPolicies: [...new Set(dataset.games.flatMap(game => game.policies))],
  };
  const selectedModel = NeuralValueNetwork.fromJSON(best);
  // Epoch zero can remain the best model after a resumed run.
  writeJSON(output + '.checkpoint.json', selectedModel.toJSON(metadata, true));
  writeJSON(output, selectedModel.toJSON(metadata));
  console.log(JSON.stringify({ model: output, dataset: datasetOutput, ...metadata }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await trainNeuralMain();
}
