import { parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runGame, deriveSeed, seededRandom, type ArenaOptions, type GameRecord } from './arena-core';
import { runWorkerPool } from './worker-pool';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { ChampionBot, type HardcoreEvaluator } from '../src/bots/ChampionBot';
import { NeuralPolicyNetwork } from '../src/bots/neural/policyNetwork';
import { hardcoreActionKey } from '../src/bots/hardcorePolicy';
import { evaluateHardcoreState } from '../src/bots/hardcoreEvaluation';
import { NEURAL_FEATURE_SCHEMA, NEURAL_FEATURE_NAMES, encodeNeuralState } from '../src/bots/neural/features';
import { NEURAL_ACTION_VOCABULARY, encodePolicyInput, heuristicPolicyProbabilities, type PolicyExample } from '../src/bots/neural/policyFeatures';
import type { NeuralExample } from '../src/bots/neural/network';
import { PhaseType } from '../core/types';

export type TeacherMode = 'hardcore' | 'neural' | 'mixed';
export type TeacherPolicy = 'hardcore' | 'neuralSelectiveRollout';
export interface TeacherConfig {
  games: number; iterations: number; seed: number; exploration: number;
  /** Omitted in legacy configurations. */
  teacher?: TeacherMode;
  modelHash?: string;
}
export const NEURAL_TEACHER_PHASES = ['roleSelection', 'builder', 'trader', 'settler'] as const;
export const NEURAL_TEACHER_SETTINGS = {
  selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.08, rolloutPolicy: 'neural',
  evaluatorWeight: 0, coordinatedWorkers: false, jointShipping: false,
} as const;

export function parseTeacherMode(value?: string): TeacherMode {
  if (value === undefined) return 'hardcore';
  if (value !== 'hardcore' && value !== 'neural' && value !== 'mixed') throw new Error('Invalid --teacher');
  return value;
}

/** Counts 0/1/2/3 neural seats, rotating the first neural seat after each four-game cycle. */
export function teacherPoliciesForGame(mode: TeacherMode, index: number): TeacherPolicy[] {
  parseTeacherMode(mode);
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid teacher game index');
  if (mode === 'hardcore') return ['hardcore', 'hardcore', 'hardcore'];
  if (mode === 'neural') return ['neuralSelectiveRollout', 'neuralSelectiveRollout', 'neuralSelectiveRollout'];
  const policies: TeacherPolicy[] = ['hardcore', 'hardcore', 'hardcore'];
  const count = index % 4, first = Math.floor(index / 4) % 3;
  for (let seat = 0; seat < count; seat++) policies[(first + seat) % 3] = 'neuralSelectiveRollout';
  return policies;
}

export function createPolicyTeacher(policy: TeacherPolicy, iterations: number, random: () => number,
  model?: NeuralPolicyNetwork): HardcoreBot | ChampionBot {
  // Keep this branch and its random stream identical to the original collector.
  if (policy === 'hardcore') return new HardcoreBot({ maxIterations: iterations, timeBudgetMs: Infinity, random });
  if (policy !== 'neuralSelectiveRollout' || !model) throw new Error('Neural teacher requires a loaded policy model');
  return new ChampionBot({ maxIterations: iterations, timeBudgetMs: Infinity, random, ...NEURAL_TEACHER_SETTINGS,
    evaluator: createNeuralTeacherEvaluator(model),
  });
}

export function createNeuralTeacherEvaluator(model: NeuralPolicyNetwork): HardcoreEvaluator {
  return {
    evaluate: evaluateHardcoreState,
    policy: (state, playerId, actions) => (NEURAL_TEACHER_PHASES as readonly string[]).includes(state.getCurrentPhase().type)
      ? model.policyForLegalActions(state, playerId, actions)
      : heuristicPolicyProbabilities(state, playerId, actions),
  };
}

export interface PolicyTeacherMetadata {
  teacher: TeacherMode;
  modelHash: string | null;
  modelPath: string | null;
  neuralTeacher: (typeof NEURAL_TEACHER_SETTINGS & { phases: string[] }) | null;
  mixedSchedule: string | null;
  recordPolicyLabels: 'GameRecord.policies retains legacy arena seed labels; TeacherGame.teacherPolicies records actual bots';
}
interface TeacherWorkerConfig { config: TeacherConfig; policyModel?: unknown }

export interface TeacherGame {
  seed: number;
  /** Optional only for datasets collected before teacher provenance was recorded. */
  teacherPolicies?: TeacherPolicy[];
  teacherModelHash?: string;
  samples: PolicyExample[];
  valueSamples: NeuralExample[];
  record: GameRecord;
}
export interface PolicyDataset {
  format: 'puerto-rico-search-policy'; version: 1;
  featureSchema: typeof NEURAL_FEATURE_SCHEMA;
  featureNames: string[];
  actionVocabulary: string[];
  config: TeacherConfig;
  metadata?: PolicyTeacherMetadata;
  games: TeacherGame[];
}

export function collectTeacherGame(config: TeacherConfig, index: number, model?: NeuralPolicyNetwork): TeacherGame {
  const mode = parseTeacherMode(config.teacher);
  if (mode !== 'hardcore' && !model) throw new Error('Neural or mixed collection requires a loaded policy model');
  const teacherPolicies = teacherPoliciesForGame(mode, index);
  const options: ArenaOptions = { games: config.games, players: 3, seed: config.seed,
    budgetMs: 650, iterations: config.iterations, maxMoves: 5000, candidate: 'hardcore',
    opponents: 'hardcore', expansions: { festival: false, corsair: false, newBuildings: false, nobleBuildings: false } };
  const bots: (HardcoreBot | ChampionBot)[] = [];
  const samples: PolicyExample[] = [];
  const valueSamples: NeuralExample[] = [];
  const random = seededRandom(deriveSeed(config.seed, 1000000 + index));
  const sampleRandom = seededRandom(deriveSeed(config.seed, 2000000 + index));
  let positions = 0;
  // One environment per index keeps game-level splits independent; selecting teachers consumes no RNG.
  const record = runGame(options, index * 3, (_policy, searchRandom, seat) => {
    const bot = createPolicyTeacher(teacherPolicies[seat]!, config.iterations, searchRandom, model);
    bots[seat] = bot;
    return { name: teacherPolicies[seat] === 'hardcore' ? 'TeacherHardcore' : 'TeacherNeuralSelectiveRollout', chooseAction(state, pid) {
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
    // Several physical copies of a building can produce identical action keys.
    // MCTS shares their child node; counting it once avoids duplicating its visits in the target.
    const actions = [...new Map(state.getValidActions(pid).map(action => [hardcoreActionKey(action), action])).values()];
    const stats = bots[playerIndex]!.lastSearchStats;
    if (teacherPolicies[playerIndex] !== 'hardcore' && stats.evaluatorErrors > 0) throw new Error('Neural teacher evaluator failed');
    if (actions.length > 1 && stats.iterations > 0) {
      const input = encodePolicyInput(state, pid, actions);
      if (input) {
        const byKey = new Map(stats.rootActions.map(action => [action.key, action]));
        const roots = actions.map(action => byKey.get(hardcoreActionKey(action))!);
        if (roots.some(root => !root)) throw new Error('Missing teacher root action');
        const total = roots.reduce((sum, root) => sum + root.visits, 0);
        if (total !== stats.iterations) throw new Error('Teacher visit count mismatch');
        samples.push({ ...input, phase: state.getCurrentPhase().type, mover: playerIndex,
          teacherIterations: stats.iterations, teacherValues: roots.map(root => root.value),
          target: roots.map(root => root.visits / total) });
      }
    }
    if (state.getCurrentPhase().type === PhaseType.RoleSelection) {
      positions++;
      const chosen = valueSamples.length < 24 ? valueSamples.length : Math.floor(sampleRandom() * positions);
      if (chosen < 24) valueSamples[chosen] = { inputs: encodeNeuralState(state), baseline: evaluateHardcoreState(state), target: [] };
    }
  } });
  if (record.status !== 'completed' || !samples.length || !valueSamples.length) throw new Error('Invalid teacher game: ' + JSON.stringify(record));
  for (const sample of valueSamples) sample.target = [...record.winCredits];
  return { seed: record.environmentSeed, teacherPolicies,
    ...(teacherPolicies.includes('neuralSelectiveRollout') && config.modelHash ? { teacherModelHash: config.modelHash } : {}),
    samples, valueSamples, record };
}

export function runPolicyCollectorWorker(): void {
  const data = workerData as TeacherWorkerConfig | TeacherConfig;
  const { config, policyModel }: TeacherWorkerConfig = 'config' in data ? data : { config: data };
  const model = policyModel === undefined ? undefined : NeuralPolicyNetwork.fromJSON(policyModel);
  parentPort!.on('message', (job: number) => {
    try { parentPort!.postMessage({ job, result: collectTeacherGame(config, job, model) }); }
    catch (error) { parentPort!.postMessage({ job, error: error instanceof Error ? error.stack : String(error) }); }
  });
  parentPort!.postMessage({ ready: true });
}

export async function policyCollectorMain(argv = process.argv.slice(2)): Promise<void> {
  const args = new Map<string, string>();
  const allowed = ['games', 'iterations', 'seed', 'workers', 'exploration', 'output', 'teacher', 'model'];
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    if (!key || !allowed.includes(key) || !value || args.has(key)) throw new Error('Invalid argument ' + argv[i]);
    args.set(key, value);
  }
  const integer = (key: string, fallback: number, min: number, max = 0xffffffff) => {
    const value = Number(args.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid --' + key);
    return value;
  };
  const config: TeacherConfig = { games: integer('games', 360, 1), iterations: integer('iterations', 96, 1),
    seed: integer('seed', 27090903, 0), exploration: Number(args.get('exploration') ?? 0.08) };
  if (!Number.isFinite(config.exploration) || config.exploration < 0 || config.exploration > 1) throw new Error('Invalid exploration');
  const teacher = parseTeacherMode(args.get('teacher'));
  config.teacher = teacher;
  const workerConfig: TeacherWorkerConfig = { config };
  let modelPath: string | null = null;
  if (teacher !== 'hardcore') {
    if (!args.has('model')) throw new Error('Neural and mixed teachers require --model');
    modelPath = resolve(args.get('model')!);
    const bytes = readFileSync(modelPath);
    workerConfig.policyModel = JSON.parse(bytes.toString('utf8'));
    NeuralPolicyNetwork.fromJSON(workerConfig.policyModel);
    config.modelHash = createHash('sha256').update(bytes).digest('hex');
  } else if (args.has('model')) {
    throw new Error('--model requires --teacher neural or mixed');
  }
  const metadata: PolicyTeacherMetadata = {
    teacher, modelHash: config.modelHash ?? null, modelPath,
    neuralTeacher: teacher === 'hardcore' ? null : { ...NEURAL_TEACHER_SETTINGS, phases: [...NEURAL_TEACHER_PHASES] },
    mixedSchedule: teacher === 'mixed' ? 'neural count = game index % 4; first neural seat = floor(index / 4) % 3; seats consecutive modulo 3' : null,
    recordPolicyLabels: 'GameRecord.policies retains legacy arena seed labels; TeacherGame.teacherPolicies records actual bots',
  };
  const workers = integer('workers', 4, 1, 16);
  const output = resolve(args.get('output') ?? 'work/neural-policy/teacher.dataset.json');
  mkdirSync(dirname(output), { recursive: true });
  const dataset: PolicyDataset = { format: 'puerto-rico-search-policy', version: 1,
    featureSchema: NEURAL_FEATURE_SCHEMA, featureNames: [...NEURAL_FEATURE_NAMES],
    actionVocabulary: [...NEURAL_ACTION_VOCABULARY], config, metadata, games: [] };
  const started = Date.now();
  await runWorkerPool<number, TeacherGame>(new URL('./collect-policy-worker.mjs', import.meta.url), workerConfig,
    Array.from({ length: config.games }, (_, index) => index), workers, (_job, result) => {
      dataset.games.push(result);
      if (dataset.games.length % 6 === 0 || dataset.games.length === config.games) {
        const sorted = [...dataset.games].sort((a, b) => a.seed - b.seed);
        writeFileSync(output + '.tmp', JSON.stringify({ ...dataset, games: sorted }));
        renameSync(output + '.tmp', output);
        console.log(JSON.stringify({ games: dataset.games.length, total: config.games,
          samples: dataset.games.reduce((sum, game) => sum + game.samples.length, 0), seconds: (Date.now() - started) / 1000 }));
      }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await policyCollectorMain();
