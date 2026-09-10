import { Worker, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, mkdirSync, renameSync, linkSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parsePolicyDataset } from './train-policy';
import { runGame, deriveSeed, seededRandom, type ArenaOptions, type GameRecord } from './arena-core';
import { createPolicyTeacher, NEURAL_TEACHER_PHASES, type PolicyDataset, type TeacherConfig, type TeacherGame } from './collect-policy';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { hardcoreActionKey } from '../src/bots/hardcorePolicy';
import { evaluateHardcoreState } from '../src/bots/hardcoreEvaluation';
import { encodeNeuralState, NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES } from '../src/bots/neural/features';
import { encodePolicyInput, NEURAL_ACTION_VOCABULARY, type PolicyExample } from '../src/bots/neural/policyFeatures';
import { NeuralPolicyNetwork } from '../src/bots/neural/policyNetwork';
import { withPolicyReadCache } from '../src/bots/neural/policyReadCache';
import { serializeGameState, deserializeGameState } from '../src/game/GameSerializer';
import { PhaseType } from '../core/types';
import type { NeuralExample } from '../src/bots/neural/network';

export type ReanalysisSplit = 'training' | 'validation';
export interface ReanalysisConfig {
  games: number; trainingGames: number; validationGames: number; iterationsPerReplica: number; replicas: number;
  statesPerPhase: number; phases: string[]; masterSeed: number; workers: number; cpuBudgetSeconds: number; policyReadCache: boolean;
}
export interface ReplaySnapshot {
  sourceSampleIndex: number; snapshotJSON: string; snapshotHash: string; actionKeys: string[];
}
export interface ReanalysisReplica {
  searchSeed: number; iterations: number; actionKeys: string[]; visits: number[]; values: number[];
  evaluatorErrors: number; neuralEvaluations: number; cpuSeconds: number; elapsedMs: number;
}
export interface ReanalysisSample extends PolicyExample {
  sourceSampleIndex: number; snapshotHash: string; snapshotPath: string; actionKeys: string[]; original: PolicyExample;
  replicas: ReanalysisReplica[]; semanticReplicaTopActionIds: number[][]; semanticReplicaTopAgreement: boolean;
}
export interface ReanalysisGame { seed: number; split: ReanalysisSplit; record: GameRecord; samples: ReanalysisSample[] }
export interface ReanalysisArtifact {
  format: 'puerto-rico-policy-reanalysis'; version: 1; status: 'running' | 'complete' | 'aborted' | 'failed';
  sourceDatasetSha256: string; initialModelSha256: string; featureSchema: typeof NEURAL_FEATURE_SCHEMA;
  featureNames: string[]; actionVocabulary: string[]; config: ReanalysisConfig;
  metadata: {
    trainingGameSeeds: number[]; validationGameSeeds: number[]; selectedTrainingGameSeeds: number[]; selectedValidationGameSeeds: number[];
    sourceDatasetPath: string; initialModelPath: string; sourceHashes: Record<string, string>; toolHashes: Record<string, string>;
    sourceConfig: TeacherConfig; cpuSecondsUsed: number; completedReplicas: number; completedGames: number; replayedGames: number;
    [key: string]: unknown;
  };
  games: ReanalysisGame[];
}
interface PlannedGame { game: TeacherGame; split: ReanalysisSplit; selectedSampleIndices: number[] }
interface ReplayJob { kind: 'replay'; planIndex: number; game: TeacherGame; selectedSampleIndices: number[] }
interface ReplicaJob {
  kind: 'replica'; planIndex: number; sourceSampleIndex: number; replicaIndex: number; searchSeed: number;
  snapshotPath: string; snapshotHash: string; actionKeys: string[]; original: PolicyExample;
}
type Job = ReplayJob | ReplicaJob;
interface WorkerConfig { config: ReanalysisConfig; sourceConfig: TeacherConfig; model: unknown; budget: SharedArrayBuffer }
const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
function equal(actual: unknown, expected: unknown, label: string): void {
  if (!isDeepStrictEqual(actual, expected)) throw new Error('Replay mismatch: ' + label);
}
function integer(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('Invalid ' + name);
}
export function validateReanalysisConfig(config: ReanalysisConfig): void {
  integer(config.games, 2, 1000, 'games'); integer(config.trainingGames, 1, 1000, 'training-games');
  integer(config.validationGames, 1, 1000, 'validation-games');
  if (config.games !== config.trainingGames + config.validationGames) throw new Error('games must equal training-games + validation-games');
  integer(config.iterationsPerReplica, 1, 100000, 'iterations'); integer(config.replicas, 2, 16, 'replicas');
  integer(config.statesPerPhase, 1, 4, 'states-per-phase'); integer(config.masterSeed, 0, 0xffffffff, 'seed');
  integer(config.workers, 1, 16, 'workers');
  if (!Number.isFinite(config.cpuBudgetSeconds) || config.cpuBudgetSeconds <= 0 || config.cpuBudgetSeconds > 3300) throw new Error('CPU budget must be in (0, 3300] seconds');
  equal(config.phases, [...NEURAL_TEACHER_PHASES], 'configured active phases');
  if (typeof config.policyReadCache !== 'boolean') throw new Error('Invalid policy-read-cache');
}
function checkedSeedList(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.length || value.some(seed => !Number.isSafeInteger(seed)) ||
    new Set(value).size !== value.length) throw new Error('Invalid checkpoint ' + label + ' seeds');
  return [...value] as number[];
}
export function selectReanalysisSamples(samples: readonly PolicyExample[], perPhase = 4): number[] {
  integer(perPhase, 1, 4, 'states-per-phase');
  const selected = new Set<number>();
  for (const phase of NEURAL_TEACHER_PHASES) {
    const candidates = samples.map((sample, index) => ({ sample, index })).filter(row => row.sample.phase === phase);
    const gap = (sample: PolicyExample) => {
      const visits = sample.target.map(value => Math.round(value * sample.teacherIterations)).sort((a, b) => b - a);
      return visits[0]! - (visits[1] ?? 0);
    };
    const limit = Math.min(perPhase, candidates.length), uncertain = Math.min(Math.ceil(perPhase / 2), limit);
    const byGap = [...candidates].sort((a, b) => gap(a.sample) - gap(b.sample) || a.index - b.index);
    for (const row of byGap.slice(0, uncertain)) selected.add(row.index);
    const remaining = candidates.filter(row => !selected.has(row.index)), spread = limit - uncertain;
    for (let i = 0; i < spread; i++) selected.add(remaining[Math.floor((i + 0.5) * remaining.length / spread)]!.index);
  }
  return [...selected].sort((a, b) => a - b);
}
export function planReanalysis(dataset: PolicyDataset, modelMetadata: Record<string, unknown>, config: ReanalysisConfig): {
  plan: PlannedGame[]; trainingGameSeeds: number[]; validationGameSeeds: number[];
} {
  validateReanalysisConfig(config);
  const trainingGameSeeds = checkedSeedList(modelMetadata.trainingGameSeeds, 'training');
  const validationGameSeeds = checkedSeedList(modelMetadata.validationGameSeeds, 'validation');
  const train = new Set(trainingGameSeeds), validation = new Set(validationGameSeeds);
  if (validationGameSeeds.some(seed => train.has(seed))) throw new Error('Checkpoint game splits overlap');
  const bySeed = new Map(dataset.games.map(game => [game.seed, game]));
  if (bySeed.size !== dataset.games.length || train.size + validation.size !== bySeed.size ||
    [...train, ...validation].some(seed => !bySeed.has(seed))) throw new Error('Checkpoint splits do not exactly match source snapshot');
  const select = (seeds: number[], count: number, split: ReanalysisSplit): PlannedGame[] => {
    if (seeds.length < count) throw new Error('Not enough ' + split + ' games');
    return [...seeds].sort((a, b) => deriveSeed(config.masterSeed, a) - deriveSeed(config.masterSeed, b) || a - b)
      .slice(0, count).map(seed => {
        const game = bySeed.get(seed)!, selectedSampleIndices = selectReanalysisSamples(game.samples, config.statesPerPhase);
        if (!selectedSampleIndices.length) throw new Error('Selected game has no active-phase samples');
        return { game, split, selectedSampleIndices };
      });
  };
  return { plan: [...select(trainingGameSeeds, config.trainingGames, 'training'), ...select(validationGameSeeds, config.validationGames, 'validation')],
    trainingGameSeeds, validationGameSeeds };
}

/** Replay only the original Hardcore generator. No neural/cache/deeper search is allowed in this stage. */
export function replayTeacherGame(config: TeacherConfig, original: TeacherGame, selectedSampleIndices: readonly number[]): ReplaySnapshot[] {
  if ((config.teacher ?? 'hardcore') !== 'hardcore' ||
    original.teacherPolicies?.some(policy => policy !== 'hardcore')) throw new Error('Replay currently requires an original Hardcore collection');
  const index = original.record.gameIndex / 3;
  integer(index, 0, config.games - 1, 'original record.gameIndex / 3');
  equal(deriveSeed(config.seed, index), original.seed, 'original environment seed');
  const selected = new Set(selectedSampleIndices);
  if (selected.size !== selectedSampleIndices.length || selectedSampleIndices.some(i => !Number.isSafeInteger(i) || i < 0 || i >= original.samples.length)) {
    throw new Error('Invalid snapshot sample indices');
  }
  const options: ArenaOptions = { games: config.games, players: 3, seed: config.seed, budgetMs: 650,
    iterations: config.iterations, maxMoves: 5000, candidate: 'hardcore', opponents: 'hardcore',
    expansions: { festival: false, corsair: false, newBuildings: false, nobleBuildings: false } };
  const bots: HardcoreBot[] = [], snapshots: ReplaySnapshot[] = [], valueSamples: NeuralExample[] = [];
  const random = seededRandom(deriveSeed(config.seed, 1000000 + index));
  const sampleRandom = seededRandom(deriveSeed(config.seed, 2000000 + index));
  let sampleIndex = 0, positions = 0;
  const record = runGame(options, index * 3, (_policy, searchRandom, seat) => {
    const bot = new HardcoreBot({ maxIterations: config.iterations, timeBudgetMs: Infinity, random: searchRandom });
    bots[seat] = bot;
    return { name: 'TeacherHardcore', chooseAction(state, pid) {
      const action = bot.chooseAction(state, pid);
      if (state.roundNumber > 4 || random() >= config.exploration || !bot.lastSearchStats.iterations) return action;
      const legal = state.getValidActions(pid);
      const most = Math.max(...bot.lastSearchStats.rootActions.map(a => a.visits));
      const plausible = new Set(bot.lastSearchStats.rootActions.filter(a => a.visits >= most * 0.5).map(a => a.key));
      const choices = legal.filter(a => plausible.has(hardcoreActionKey(a)));
      return choices[Math.floor(random() * choices.length)] ?? action;
    } };
  }, { onDecision({ state, playerIndex }) {
    const pid = state.getCurrentPlayer().id;
    const actions = [...new Map(state.getValidActions(pid).map(action => [hardcoreActionKey(action), action])).values()];
    const stats = bots[playerIndex]!.lastSearchStats;
    if (actions.length > 1 && stats.iterations > 0) {
      const input = encodePolicyInput(state, pid, actions);
      if (input) {
        const byKey = new Map(stats.rootActions.map(action => [action.key, action]));
        const roots = actions.map(action => byKey.get(hardcoreActionKey(action))!);
        if (roots.some(root => !root) || sum(roots.map(root => root.visits)) !== stats.iterations) throw new Error('Replay root visit mismatch');
        const actual: PolicyExample = { ...input, phase: state.getCurrentPhase().type, mover: playerIndex,
          teacherIterations: stats.iterations, teacherValues: roots.map(root => root.value),
          target: roots.map(root => root.visits / stats.iterations) };
        equal(actual, original.samples[sampleIndex], 'sample ' + sampleIndex);
        if (selected.has(sampleIndex)) {
          const snapshotJSON = JSON.stringify(serializeGameState(state));
          snapshots.push({ sourceSampleIndex: sampleIndex, snapshotJSON, snapshotHash: sha256(snapshotJSON),
            actionKeys: actions.map(hardcoreActionKey) });
        }
        sampleIndex++;
      }
    }
    if (state.getCurrentPhase().type === PhaseType.RoleSelection) {
      positions++;
      const chosen = valueSamples.length < 24 ? valueSamples.length : Math.floor(sampleRandom() * positions);
      if (chosen < 24) valueSamples[chosen] = { inputs: encodeNeuralState(state), baseline: evaluateHardcoreState(state), target: [] };
    }
  } });
  if (record.status !== 'completed') throw new Error('Replay failed: ' + JSON.stringify(record));
  equal(sampleIndex, original.samples.length, 'sample count');
  for (const sample of valueSamples) sample.target = [...record.winCredits];
  equal(valueSamples, original.valueSamples, 'value samples');
  for (const field of ['traceHash', 'moves', 'scores', 'rounds', 'environmentSeed', 'winCredits', 'decisionCounts', 'reason'] as const) {
    equal(record[field], original.record[field], 'final record.' + field);
  }
  equal(snapshots.length, selected.size, 'snapshot count');
  return snapshots; // Nothing is persisted or reanalysed until every comparison above succeeds.
}

export function analyseReplica(snapshotJSON: string, snapshotHash: string, actionKeys: readonly string[], original: PolicyExample,
  model: NeuralPolicyNetwork, searchSeed: number, iterations: number, cache = false): ReanalysisReplica {
  if (sha256(snapshotJSON) !== snapshotHash) throw new Error('Snapshot hash mismatch');
  const state = deserializeGameState(JSON.parse(snapshotJSON) as Parameters<typeof deserializeGameState>[0]);
  equal(JSON.stringify(serializeGameState(state)), snapshotJSON, 'snapshot serialization round trip');
  const pid = state.getCurrentPlayer().id;
  const actions = [...new Map(state.getValidActions(pid).map(action => [hardcoreActionKey(action), action])).values()];
  equal(actions.map(hardcoreActionKey), actionKeys, 'snapshot actionKeys');
  const input = encodePolicyInput(state, pid, actions);
  equal(input, { input: original.input, actionIds: original.actionIds, baseline: original.baseline }, 'snapshot policy input');
  equal(state.getCurrentPhase().type, original.phase, 'snapshot phase');
  equal(state.currentPlayerIndex, original.mover, 'snapshot mover');
  if (!(NEURAL_TEACHER_PHASES as readonly string[]).includes(original.phase)) throw new Error('Inactive reanalysis phase');
  let neuralEvaluations = 0;
  const predict = model.predict, policy = model.policyForLegalActions;
  model.predict = function (value) { neuralEvaluations++; return predict.call(this, value); };
  if (cache) model.policyForLegalActions = function (game, playerId, legal) {
    return withPolicyReadCache(game, () => policy.call(this, game, playerId, legal));
  };
  try {
    const bot = createPolicyTeacher('neuralSelectiveRollout', iterations, seededRandom(searchSeed), model);
    const selected = bot.chooseAction(state, pid);
    if (!selected.validate(state).ok || !new Set(actions.map(hardcoreActionKey)).has(hardcoreActionKey(selected))) throw new Error('Illegal reanalysis decision');
    const stats = bot.lastSearchStats, byKey = new Map(stats.rootActions.map(root => [root.key, root]));
    if (stats.iterations !== iterations || stats.evaluatorErrors !== 0 || neuralEvaluations <= 0 ||
      byKey.size !== actionKeys.length || actionKeys.some(key => !byKey.has(key))) throw new Error('Invalid neural reanalysis search statistics');
    const roots = actionKeys.map(key => byKey.get(key)!);
    const replica: ReanalysisReplica = { searchSeed, iterations, actionKeys: [...actionKeys], visits: roots.map(root => root.visits), values: roots.map(root => root.value),
      evaluatorErrors: stats.evaluatorErrors, neuralEvaluations, elapsedMs: stats.elapsedMs, cpuSeconds: 0 };
    validateReplica(replica, actionKeys.length, iterations);
    return replica;
  } finally { model.predict = predict; model.policyForLegalActions = policy; }
}
export function validateReplica(replica: ReanalysisReplica, actions: number, expectedIterations: number): void {
  if (replica.iterations !== expectedIterations || replica.actionKeys.length !== actions || new Set(replica.actionKeys).size !== actions || replica.visits.length !== actions || replica.values.length !== actions ||
    replica.visits.some(value => !Number.isSafeInteger(value) || value < 0) || sum(replica.visits) !== expectedIterations ||
    replica.values.some(value => !Number.isFinite(value)) || replica.evaluatorErrors !== 0 ||
    !Number.isSafeInteger(replica.neuralEvaluations) || replica.neuralEvaluations <= 0) throw new Error('Invalid replica visits/values/evaluator counters');
}
export function semanticTopActionIds(ids: readonly number[], visits: readonly number[]): number[] {
  const totals = new Map<number, number>();
  ids.forEach((id, i) => totals.set(id, (totals.get(id) ?? 0) + visits[i]!));
  const maximum = Math.max(...totals.values());
  return [...totals].filter(([, count]) => count === maximum).map(([id]) => id).sort((a, b) => a - b);
}
export function poolReanalysisSample(original: PolicyExample, sourceSampleIndex: number, snapshotPath: string, snapshotHash: string,
  actionKeys: string[], replicas: ReanalysisReplica[], expectedIterations: number, expectedReplicas: number): ReanalysisSample {
  if (replicas.length !== expectedReplicas || new Set(replicas.map(replica => replica.searchSeed)).size !== replicas.length) throw new Error('Missing or dependent replicas');
  for (const replica of replicas) { validateReplica(replica, original.actionIds.length, expectedIterations); equal(replica.actionKeys, actionKeys, 'replica actionKeys'); }
  const visits = original.actionIds.map((_, i) => sum(replicas.map(replica => replica.visits[i]!)));
  const total = expectedIterations * expectedReplicas;
  equal(sum(visits), total, 'pooled iterations');
  const semanticReplicaTopActionIds = replicas.map(replica => semanticTopActionIds(original.actionIds, replica.visits));
  return { ...original, target: visits.map(value => value / total), teacherIterations: total,
    teacherValues: visits.map((count, i) => count === 0 ? 0 : sum(replicas.map(replica => replica.values[i]! * replica.visits[i]!)) / count),
    sourceSampleIndex, snapshotHash, snapshotPath, actionKeys: [...actionKeys], original,
    replicas, semanticReplicaTopActionIds,
    semanticReplicaTopAgreement: semanticReplicaTopActionIds.every(ids => isDeepStrictEqual(ids, semanticReplicaTopActionIds[0])) };
}

function threadCPU(): { user: number; system: number } {
  const fn = (process as unknown as { threadCpuUsage?: () => { user: number; system: number } }).threadCpuUsage;
  if (typeof fn !== 'function') throw new Error('Reanalysis requires Node process.threadCpuUsage');
  return fn.call(process);
}
export function runReanalysisWorker(): void {
  const data = workerData as WorkerConfig, budget = new BigInt64Array(data.budget);
  const model = NeuralPolicyNetwork.fromJSON(data.model);
  let previous = { user: 0, system: 0 };
  parentPort!.on('message', (message: { id: number; job: Job }) => {
    if (Atomics.load(budget, 0) >= Atomics.load(budget, 1)) {
      parentPort!.postMessage({ id: message.id, skipped: true }); return;
    }
    let result: unknown, error: string | undefined;
    try {
      result = message.job.kind === 'replay'
        ? replayTeacherGame(data.sourceConfig, message.job.game, message.job.selectedSampleIndices)
        : analyseReplica(readFileSync(message.job.snapshotPath, 'utf8'), message.job.snapshotHash, message.job.actionKeys, message.job.original,
          model, message.job.searchSeed, data.config.iterationsPerReplica, data.config.policyReadCache);
    } catch (cause) { error = cause instanceof Error ? cause.stack ?? cause.message : String(cause); }
    const current = threadCPU(), micros = current.user + current.system - previous.user - previous.system;
    previous = current; Atomics.add(budget, 0, BigInt(Math.max(0, micros)));
    if (message.job.kind === 'replica' && result) (result as ReanalysisReplica).cpuSeconds = Math.max(0, micros) / 1e6;
    parentPort!.postMessage({ id: message.id, result, error, cpuSeconds: Math.max(0, micros) / 1e6 });
  });
  parentPort!.postMessage({ ready: true });
}

class BudgetExceeded extends Error {}
async function runUnits(config: WorkerConfig, jobs: Job[], receive: (job: Job, result: unknown) => void): Promise<void> {
  const workers: Worker[] = [], budget = new BigInt64Array(config.budget);
  if (Atomics.load(budget, 0) >= Atomics.load(budget, 1)) throw new BudgetExceeded('CPU budget reached before starting worker stage');
  let next = 0, complete = 0, skipped = 0, stopping = false;
  try {
    await new Promise<void>((finish, fail) => {
      if (!jobs.length) { finish(); return; }
      const dispatch = (worker: Worker) => {
        if (next >= jobs.length) return;
        if (Atomics.load(budget, 0) >= Atomics.load(budget, 1)) {
          if (complete === next) fail(new BudgetExceeded('CPU budget reached between complete work units'));
          return;
        }
        const id = next++; worker.postMessage({ id, job: jobs[id] });
      };
      for (let i = 0; i < Math.min(config.config.workers, jobs.length); i++) {
        const worker = new Worker(new URL('./reanalyse-policy-worker.mjs', import.meta.url), { workerData: config });
        workers.push(worker);
        worker.on('error', fail);
        worker.on('exit', code => { if (!stopping && complete < jobs.length) fail(new Error('Unexpected reanalysis worker exit ' + code)); });
        worker.on('message', (message: { ready?: boolean; id: number; result?: unknown; error?: string; skipped?: boolean }) => {
          try {
            if (message.ready) { dispatch(worker); return; }
            complete++;
            if (message.skipped) skipped++;
            if (message.error) { fail(new Error(message.error)); return; }
            if (!message.skipped) receive(jobs[message.id]!, message.result);
            if (complete === jobs.length) {
              if (skipped > 0) fail(new BudgetExceeded('CPU budget reached before remaining work units')); 
              else finish();
            } else if (Atomics.load(budget, 0) >= Atomics.load(budget, 1)) {
              // Wait for already-running units; never terminate the middle of a replay/search for a budget stop.
              if (complete === next) fail(new BudgetExceeded('CPU budget reached after completed work unit'));
            } else dispatch(worker);
          } catch (error) { fail(error); }
        });
      }
    });
  } finally { stopping = true; await Promise.all(workers.map(worker => worker.terminate())); }
}

const SOURCE_FILES = ['HardcoreBot.ts', 'ChampionBot.ts', 'hardcorePolicy.ts', 'hardcoreEvaluation.ts', 'hardcoreWorkers.ts', 'simulation.ts',
  'championWorkers.ts', 'championEvaluation.ts', 'championPolicy.ts', 'championShipping.ts', 'neural/features.ts', 'neural/policyFeatures.ts',
  'neural/policyNetwork.ts', 'neural/policyReadCache.ts'].map(file => 'src/bots/' + file).concat('src/game/GameSerializer.ts');
const TOOL_FILES = ['tools/reanalyse-policy.ts', 'tools/reanalyse-policy-worker.mjs', 'tools/collect-policy.ts', 'tools/arena-core.ts',
  'tools/register-typescript.mjs', 'tools/train-policy.ts'];
function atomicJSON(path: string, value: unknown): void {
  const temp = path + '.tmp'; writeFileSync(temp, JSON.stringify(value)); renameSync(temp, path);
}
function exclusiveJSON(path: string, value: unknown, temporary: string): void {
  writeFileSync(temporary, JSON.stringify(value), { flag: 'wx' });
  try { linkSync(temporary, path); } finally { unlinkSync(temporary); }
}
export async function reanalysePolicyMain(argv = process.argv.slice(2)): Promise<void> {
  const allowed = ['input', 'model', 'output', 'games', 'training-games', 'validation-games', 'iterations', 'replicas',
    'states-per-phase', 'seed', 'workers', 'cpu-budget-seconds', 'policy-read-cache'];
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, ''), value = argv[i + 1];
    if (!key || !allowed.includes(key) || value === undefined || value.startsWith('--') || args.has(key)) throw new Error('Invalid reanalysis argument: ' + argv[i]);
    args.set(key, value);
  }
  if (!args.has('output')) throw new Error('Reanalysis requires a fresh --output path');
  const cache = args.get('policy-read-cache') ?? 'false';
  if (cache !== 'true' && cache !== 'false') throw new Error('policy-read-cache must be true or false');
  const config: ReanalysisConfig = {
    games: Number(args.get('games') ?? 20), trainingGames: Number(args.get('training-games') ?? 16),
    validationGames: Number(args.get('validation-games') ?? 4), iterationsPerReplica: Number(args.get('iterations') ?? 384),
    replicas: Number(args.get('replicas') ?? 2), statesPerPhase: Number(args.get('states-per-phase') ?? 4),
    phases: [...NEURAL_TEACHER_PHASES], masterSeed: Number(args.get('seed') ?? 46090989), workers: Number(args.get('workers') ?? 2),
    cpuBudgetSeconds: Number(args.get('cpu-budget-seconds') ?? 3300), policyReadCache: cache === 'true',
  };
  validateReanalysisConfig(config); threadCPU();
  const sourceDatasetPath = resolve(args.get('input') ?? 'work/neural-policy/teacher-expanded.dataset.json');
  const initialModelPath = resolve(args.get('model') ?? 'work/neural-policy/policy-focused-expanded.json');
  const sourceBytes = readFileSync(sourceDatasetPath), modelBytes = readFileSync(initialModelPath);
  const dataset = parsePolicyDataset(JSON.parse(sourceBytes.toString('utf8'))), modelJSON = JSON.parse(modelBytes.toString('utf8')) as unknown;
  const model = NeuralPolicyNetwork.fromJSON(modelJSON);
  const { plan, trainingGameSeeds, validationGameSeeds } = planReanalysis(dataset, model.toJSON().metadata, config);
  if ((dataset.config.teacher ?? 'hardcore') !== 'hardcore') throw new Error('Reanalysis input must be the original Hardcore collection');
  const hashes = (files: string[]) => Object.fromEntries(files.map(file => [file, sha256(readFileSync(resolve(file)))]));
  const sourceHashes = hashes(SOURCE_FILES), toolHashes = hashes(TOOL_FILES);
  const output = resolve(args.get('output')!), work = output + '.work';
  if (existsSync(output) || existsSync(work)) throw new Error('Reanalysis output/work directory already exists');
  mkdirSync(dirname(output), { recursive: true }); mkdirSync(work);
  mkdirSync(join(work, 'snapshots')); mkdirSync(join(work, 'replicas'));
  const budget = new SharedArrayBuffer(16), counters = new BigInt64Array(budget);
  Atomics.store(counters, 1, BigInt(Math.floor(config.cpuBudgetSeconds * 1e6)));
  const workerConfig: WorkerConfig = { config, sourceConfig: dataset.config, model: modelJSON, budget };
  const artifact: ReanalysisArtifact = {
    format: 'puerto-rico-policy-reanalysis', version: 1, status: 'running',
    sourceDatasetSha256: sha256(sourceBytes), initialModelSha256: sha256(modelBytes), featureSchema: NEURAL_FEATURE_SCHEMA,
    featureNames: [...NEURAL_FEATURE_NAMES], actionVocabulary: [...NEURAL_ACTION_VOCABULARY], config,
    metadata: { trainingGameSeeds, validationGameSeeds,
      selectedTrainingGameSeeds: plan.filter(row => row.split === 'training').map(row => row.game.seed),
      selectedValidationGameSeeds: plan.filter(row => row.split === 'validation').map(row => row.game.seed),
      plannedSamplesByGame: plan.map(row => ({ seed: row.game.seed, split: row.split, sourceSampleIndices: [...row.selectedSampleIndices] })),
      sourceDatasetPath, initialModelPath, sourceHashes, toolHashes, sourceConfig: dataset.config,
      cpuSecondsUsed: 0, completedReplicas: 0, completedGames: 0, replayedGames: 0,
      selection: 'Per phase: two smallest integer visit gaps, then two midpoint-spaced indices from remaining positions; fewer if unavailable.',
      replay: 'Every policy/value sample and final trace/moves/scores checked strictly before persisting snapshots; original Hardcore only, no read cache.',
      cpuAccounting: 'Sum of process.threadCpuUsage checkpoints across workers; checked between full replay games or single replicas. Overshoot bounded by currently running units (at most workers), not a hard mid-unit deadline.',
      neuralEvaluationsDefinition: 'Actual NeuralPolicyNetwork.predict invocations, not heuristic fallback or policy adapter calls.',
      semanticDefinition: 'Sum concrete visits by actionId, retain all tied maximum IDs; diagnostic only, never substitutes concrete replay checks.',
      replicaSeedDerivation: 'deriveSeed(masterSeed, 100000 + replica job ordinal in planned game/sample/replica order)',
      createdAt: new Date().toISOString(),
    },
    games: plan.map(row => ({ seed: row.game.seed, split: row.split, record: row.game.record, samples: [] })),
  };
  const progress = () => {
    artifact.metadata.cpuSecondsUsed = Number(Atomics.load(counters, 0)) / 1e6;
    atomicJSON(join(work, 'progress.json'), artifact);
  };
  const snapshots = new Map<string, { snapshot: ReplaySnapshot; path: string }>();
  progress();
  try {
    await runUnits(workerConfig, plan.map((row, planIndex) => ({ kind: 'replay', planIndex, game: row.game,
      selectedSampleIndices: row.selectedSampleIndices })), (job, result) => {
      if (job.kind !== 'replay') throw new Error('Unexpected replay result');
      for (const snapshot of result as ReplaySnapshot[]) {
        const path = join(work, 'snapshots', job.game.seed + '-' + snapshot.sourceSampleIndex + '.json');
        writeFileSync(path, snapshot.snapshotJSON, { flag: 'wx' });
        if (sha256(readFileSync(path)) !== snapshot.snapshotHash) throw new Error('Saved snapshot hash mismatch');
        snapshots.set(job.planIndex + ':' + snapshot.sourceSampleIndex, { snapshot, path });
      }
      artifact.metadata.replayedGames++; progress();
      console.log(JSON.stringify({ stage: 'replay', games: artifact.metadata.replayedGames, total: config.games, cpuSeconds: artifact.metadata.cpuSecondsUsed }));
    });
    const jobs: ReplicaJob[] = [];
    for (const [planIndex, row] of plan.entries()) for (const sourceSampleIndex of row.selectedSampleIndices) {
      const saved = snapshots.get(planIndex + ':' + sourceSampleIndex)!;
      for (let replicaIndex = 0; replicaIndex < config.replicas; replicaIndex++) jobs.push({
        kind: 'replica', planIndex, sourceSampleIndex, replicaIndex, searchSeed: deriveSeed(config.masterSeed, 100000 + jobs.length),
        snapshotPath: saved.path, snapshotHash: saved.snapshot.snapshotHash, actionKeys: saved.snapshot.actionKeys,
        original: row.game.samples[sourceSampleIndex]!,
      });
    }
    const replicas = new Map<string, ReanalysisReplica[]>();
    await runUnits(workerConfig, jobs, (job, result) => {
      if (job.kind !== 'replica') throw new Error('Unexpected replica result');
      const replica = result as ReanalysisReplica, key = job.planIndex + ':' + job.sourceSampleIndex;
      validateReplica(replica, job.original.actionIds.length, config.iterationsPerReplica);
      atomicJSON(join(work, 'replicas', artifact.games[job.planIndex]!.seed + '-' + job.sourceSampleIndex + '-' + job.replicaIndex + '.json'),
        { sourceSampleIndex: job.sourceSampleIndex, snapshotHash: job.snapshotHash, ...replica });
      const group = replicas.get(key) ?? [];
      group[job.replicaIndex] = replica; replicas.set(key, group);
      artifact.metadata.completedReplicas++;
      if (group.filter(Boolean).length === config.replicas) {
        const game = artifact.games[job.planIndex]!;
        game.samples.push(poolReanalysisSample(job.original, job.sourceSampleIndex, job.snapshotPath, job.snapshotHash,
          job.actionKeys, group, config.iterationsPerReplica, config.replicas));
        game.samples.sort((a, b) => a.sourceSampleIndex - b.sourceSampleIndex);
        if (game.samples.length === plan[job.planIndex]!.selectedSampleIndices.length) artifact.metadata.completedGames++;
      }
      progress();
      if (artifact.metadata.completedReplicas % 8 === 0 || artifact.metadata.completedReplicas === jobs.length) {
        console.log(JSON.stringify({ stage: 'reanalysis', replicas: artifact.metadata.completedReplicas, total: jobs.length,
          games: artifact.metadata.completedGames, cpuSeconds: artifact.metadata.cpuSecondsUsed }));
      }
    });
    equal(artifact.metadata.completedGames, config.games, 'completed reanalysis games');
    equal(sha256(readFileSync(sourceDatasetPath)), artifact.sourceDatasetSha256, 'source dataset unchanged');
    equal(sha256(readFileSync(initialModelPath)), artifact.initialModelSha256, 'initial model unchanged');
    equal(hashes(SOURCE_FILES), sourceHashes, 'runtime hashes unchanged'); equal(hashes(TOOL_FILES), toolHashes, 'tool hashes unchanged');
    artifact.status = 'complete'; artifact.metadata.finishedAt = new Date().toISOString(); progress();
    exclusiveJSON(output, artifact, join(work, 'final.tmp'));
    console.log(JSON.stringify({ output, status: artifact.status, games: artifact.games.length,
      samples: artifact.games.reduce((total, game) => total + game.samples.length, 0), cpuSeconds: artifact.metadata.cpuSecondsUsed }));
  } catch (error) {
    artifact.status = error instanceof BudgetExceeded ? 'aborted' : 'failed';
    artifact.metadata.failure = error instanceof Error ? error.message : String(error); progress();
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await reanalysePolicyMain();
