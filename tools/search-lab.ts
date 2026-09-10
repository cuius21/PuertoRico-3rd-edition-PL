import { parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { ChampionBot, type HardcoreOptions as ChampionOptions } from '../src/bots/ChampionBot';
import { NeuralPolicyNetwork } from '../src/bots/neural/policyNetwork';
import { evaluateHardcoreState } from '../src/bots/hardcoreEvaluation';
import { heuristicPolicyProbabilities } from '../src/bots/neural/policyFeatures';
import { runGame, summarizeArena, type ArenaOptions, type GameRecord } from './arena-core';
import { pairedComparison } from './neural-lab';
import { runWorkerPool } from './worker-pool';

interface SearchVariant extends ChampionOptions { neural?: boolean | readonly string[] }
export const SEARCH_VARIANTS: Record<string, SearchVariant> = {
  dedup: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.16 },
  puct2: { selectionRule: 'puct', rolloutRounds: 2, rolloutExploration: 0.16, explorationConstant: 1.4 },
  puct4: { selectionRule: 'puct', rolloutRounds: 4, rolloutExploration: 0.08, explorationConstant: 1.4 },
  long4: { selectionRule: 'ucb', rolloutRounds: 4, rolloutExploration: 0.08 },
  long8: { selectionRule: 'ucb', rolloutRounds: 8, rolloutExploration: 0.04 },
  puct4clean: { selectionRule: 'puct', rolloutRounds: 4, rolloutExploration: 0, explorationConstant: 1.4 },
  neuralPrior: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.16, neural: true },
  neuralRollout: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.08, rolloutPolicy: 'neural', neural: true },
  neuralSelective: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.16, neural: ['roleSelection', 'builder', 'trader', 'settler'] },
  neuralSelectiveRollout: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.08, rolloutPolicy: 'neural', neural: ['roleSelection', 'builder', 'trader', 'settler'] },
  calm: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.08 },
  calm04: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.04 },
  workers: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.16, coordinatedWorkers: true },
  cargo: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.16, jointShipping: true },
  combined: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.16, coordinatedWorkers: true, jointShipping: true },
  combinedPuct: { selectionRule: 'puct', rolloutRounds: 2, rolloutExploration: 0.16, explorationConstant: 1.4, coordinatedWorkers: true, jointShipping: true },
};
interface SearchJob { index: number; variant: string }
interface SearchConfig { options: ArenaOptions; variants: Record<string, SearchVariant>; policyModel?: unknown }
interface SearchGameRecord extends GameRecord {
  search: { iterations: number[]; milliseconds: number[][]; evaluatorErrors: number[];
    neuralPolicyAttempts: number[]; neuralEvaluations: number[]; heuristicPolicyCalls: number[] };
}

function summarizeSearch(games: SearchGameRecord[], candidate: boolean) {
  let iterations = 0;
  let evaluatorErrors = 0, neuralPolicyAttempts = 0, neuralEvaluations = 0, heuristicPolicyCalls = 0;
  const durations: number[] = [];
  for (const game of games) {
    for (let seat = 0; seat < game.policies.length; seat++) {
      if ((seat === game.candidateSeat) !== candidate) continue;
      iterations += game.search.iterations[seat]!;
      evaluatorErrors += game.search.evaluatorErrors[seat]!;
      neuralPolicyAttempts += game.search.neuralPolicyAttempts[seat]!;
      neuralEvaluations += game.search.neuralEvaluations[seat]!;
      heuristicPolicyCalls += game.search.heuristicPolicyCalls[seat]!;
      durations.push(...game.search.milliseconds[seat]!);
    }
  }
  durations.sort((a, b) => a - b);
  return { searchedDecisions: durations.length, iterations, evaluatorErrors, neuralPolicyAttempts, neuralEvaluations, heuristicPolicyCalls,
    meanIterations: durations.length ? iterations / durations.length : 0,
    meanMs: durations.length ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : 0,
    p95Ms: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1]! : 0,
    maximumMs: durations.at(-1) ?? 0 };
}

export function runSearchLabWorker(): void {
  const config = workerData as SearchConfig;
  const policy = config.policyModel ? NeuralPolicyNetwork.fromJSON(config.policyModel) : undefined;
  let predictions = 0;
  if (policy) {
    const predict = policy.predict.bind(policy);
    // Count actual inference separately from policy calls that may use the heuristic fallback.
    policy.predict = input => { predictions++; return predict(input); };
  }
  parentPort!.on('message', (job: SearchJob) => {
    try {
      const bots: (ChampionBot | HardcoreBot)[] = [];
      const search: SearchGameRecord['search'] = {
        iterations: new Array<number>(config.options.players).fill(0),
        milliseconds: Array.from({ length: config.options.players }, () => []),
        evaluatorErrors: new Array<number>(config.options.players).fill(0),
        neuralPolicyAttempts: new Array<number>(config.options.players).fill(0),
        neuralEvaluations: new Array<number>(config.options.players).fill(0),
        heuristicPolicyCalls: new Array<number>(config.options.players).fill(0),
      };
      const result = runGame(config.options, job.index, (_policy, random, _seat, candidate) => {
        const common = { timeBudgetMs: config.options.iterations === undefined ? config.options.budgetMs : Infinity,
          maxIterations: config.options.iterations ?? 1500, random };
        const variant = config.variants[job.variant];
        const bot = candidate && job.variant !== 'control' ? new ChampionBot({ ...common, ...variant,
          ...(variant?.neural ? { evaluator: { evaluate: evaluateHardcoreState,
            policy: (state, playerId, actions) => {
              if (Array.isArray(variant.neural) && !variant.neural.includes(state.getCurrentPhase().type)) {
                search.heuristicPolicyCalls[_seat]!++;
                return heuristicPolicyProbabilities(state, playerId, actions);
              }
              search.neuralPolicyAttempts[_seat]!++;
              const before = predictions;
              try { return policy!.policyForLegalActions(state, playerId, actions); }
              finally { search.neuralEvaluations[_seat]! += predictions - before; }
            } },
            evaluatorWeight: 0 } : {}) }) : new HardcoreBot(common);
        bots[_seat] = bot;
        return bot;
      }, { onDecision: ({ playerIndex }) => {
        const stats = bots[playerIndex]!.lastSearchStats;
        search.evaluatorErrors[playerIndex]! += stats.evaluatorErrors;
        if (stats.iterations > 0) {
          search.iterations[playerIndex]! += stats.iterations;
          search.milliseconds[playerIndex]!.push(stats.elapsedMs);
        }
      } });
      parentPort!.postMessage({ job, result: { ...result, search } });
    } catch (error) { parentPort!.postMessage({ job, error: error instanceof Error ? error.stack : String(error) }); }
  });
  parentPort!.postMessage({ ready: true });
}

function save(output: string, data: unknown) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output + '.tmp', JSON.stringify(data));
  renameSync(output + '.tmp', output);
}

export async function searchLabMain(argv = process.argv.slice(2)) {
  const args = new Map<string, string>();
  const allowed = ['games', 'seed', 'budget-ms', 'iterations', 'workers', 'variants', 'output', 'policy-model', 'stage', 'players', 'expansions'];
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
  const games = integer('games', 18, 3);
  const players = integer('players', 3, 3, 5) as 3 | 4 | 5;
  if (games % players) throw new Error('Use full seat rotations');
  const expansion = args.get('expansions') ?? 'base';
  if (!['base', 'all'].includes(expansion)) throw new Error('Invalid expansions');
  const extras = expansion === 'all';
  const options: ArenaOptions = { games, players, seed: integer('seed', 28090901, 0),
    budgetMs: integer('budget-ms', 80, 1), maxMoves: 5000, candidate: 'hardcore', opponents: 'hardcore',
    expansions: { festival: extras, corsair: extras, newBuildings: extras, nobleBuildings: extras },
    ...(args.has('iterations') ? { iterations: integer('iterations', 24, 0) } : {}) };
  const names = (args.get('variants') ?? 'dedup,puct2,puct4,long4,long8,puct4clean').split(',');
  if (new Set(names).size !== names.length || names.some(name => !SEARCH_VARIANTS[name])) throw new Error('Invalid variants');
  const config: SearchConfig = { options, variants: Object.fromEntries(names.map(name => [name, SEARCH_VARIANTS[name]!])) };
  let modelHash: string | null = null;
  if (names.some(name => SEARCH_VARIANTS[name]!.neural)) {
    if (players !== 3 || extras) throw new Error('Neural policy experiments require the base game with three players');
    if (!args.has('policy-model')) throw new Error('Neural variants require --policy-model');
    const bytes = readFileSync(resolve(args.get('policy-model')!));
    config.policyModel = JSON.parse(bytes.toString('utf8'));
    NeuralPolicyNetwork.fromJSON(config.policyModel);
    modelHash = createHash('sha256').update(bytes).digest('hex');
  }
  const stage = args.get('stage') ?? 'screening';
  if (!['screening', 'confirmation', 'production-confirmation'].includes(stage)) throw new Error('Invalid stage');
  if (stage !== 'screening' && names.length !== 1) throw new Error('Confirm one frozen variant at a time');
  if (stage === 'production-confirmation' && (options.budgetMs < 650 || options.iterations !== undefined)) throw new Error('Production confirmation requires full wall-clock budget');
  const workers = integer('workers', 4, 1, 16);
  const output = resolve(args.get('output') ?? 'reports/neural-policy/search-pilot.json');
  const sourceHashes = Object.fromEntries(['HardcoreBot.ts', 'ChampionBot.ts', 'hardcorePolicy.ts', 'hardcoreEvaluation.ts', 'hardcoreWorkers.ts', 'simulation.ts',
    'championWorkers.ts', 'championEvaluation.ts', 'championPolicy.ts', 'championShipping.ts',
    'neural/features.ts', 'neural/policyFeatures.ts', 'neural/policyNetwork.ts']
    .map(file => [file, createHash('sha256').update(readFileSync(resolve('src/bots', file))).digest('hex')]));
  const labels = ['control', ...names];
  const toolHashes = Object.fromEntries(['search-lab.ts', 'arena-core.ts', 'neural-lab.ts', 'worker-pool.ts']
    .map(file => [file, createHash('sha256').update(readFileSync(resolve('tools', file))).digest('hex')]));
  const records: Record<string, SearchGameRecord[]> = Object.fromEntries(labels.map(label => [label, []]));
  const jobs = Array.from({ length: games }, (_, index) => labels.map(variant => ({ index, variant }))).flat();
  const started = Date.now();
  let finished = 0;
  save(output + '.plan.json', { createdAt: new Date().toISOString(), config, workers, sourceHashes, toolHashes,
    classification: stage, modelHash, maximumIterations: 1500 });
  await runWorkerPool<SearchJob, SearchGameRecord>(new URL('./search-lab-worker.mjs', import.meta.url), config, jobs, workers, (job, result) => {
    if (result.status !== 'completed') throw new Error('Invalid search trial: ' + JSON.stringify(result));
    records[job.variant]!.push(result);
    finished++;
    if (finished % 6 === 0 || finished === jobs.length) {
      save(output + '.progress.json', { config, records });
      console.log(JSON.stringify({ finished, total: jobs.length, seconds: (Date.now() - started) / 1000 }));
    }
  });
  for (const rows of Object.values(records)) rows.sort((a, b) => a.gameIndex - b.gameIndex);
  const summaries = Object.fromEntries(labels.map(label => [label, summarizeArena(options, records[label]!) ]));
  const comparisons = Object.fromEntries(names.map(name => [name, pairedComparison(records[name]!, records.control!, options.seed)]));
  const searchSummary = Object.fromEntries(labels.map(label => [label, {
    candidate: summarizeSearch(records[label]!, true), opponents: summarizeSearch(records[label]!, false),
  }]));
  save(output, { config, workers, sourceHashes, toolHashes, maximumIterations: 1500, summaries, comparisons, wallSeconds: (Date.now() - started) / 1000,
    classification: stage, modelHash, searchSummary });
  console.log(JSON.stringify({ overall: Object.fromEntries(Object.entries(summaries).map(([name, report]) => [name, report.overall])), comparisons, searchSummary, output }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await searchLabMain();
