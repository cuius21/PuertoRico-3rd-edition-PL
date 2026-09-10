import { parentPort, workerData } from 'node:worker_threads';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, linkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Bot } from '../src/bots/Bot';
import type { HardcoreSearchStats } from '../src/bots/HardcoreBot';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { NeuralBot } from '../src/bots/NeuralBot';
import { NeuralPolicyNetwork } from '../src/bots/neural/policyNetwork';
import { runGame, summarizeArena, type ArenaOptions, type GameRecord } from './arena-core';
import { pairedComparison } from './neural-lab';
import { runWorkerPool } from './worker-pool';

export type MayorVariant = 'control' | 'mayorHardcore' | 'mayorNeural' | 'neural';
export interface MayorJob { index: number; variant: MayorVariant }
export interface MayorObservation {
  planCount: number; batches: number; rollouts: number; elapsedMs: number; cacheHit: boolean; selectedBaseline: boolean; errors: number;
  generationMs?: number; completedBatches?: number; discardedRollouts?: number; terminalRollouts?: number;
}
export interface MayorLabConfig {
  options: ArenaOptions; variants: MayorVariant[]; workers: number; output: string;
  mayor: { timeBudgetMs: number; maxBatches: number; candidateCount: number; rolloutRounds: number };
  modelPath?: string; policyModel?: unknown;
}
interface DecisionObservation {
  phase: string; actualMs: number; searchIterations: number; searchElapsedMs: number; evaluatorErrors: number;
  neuralPolicyCalls: number; neuralPredictions: number; cachePolicyCalls: number;
  illegal: boolean; threw: boolean; mayor: MayorObservation | null;
}
export interface SeatObservations { decisions: DecisionObservation[] }
export interface MayorGameRecord extends GameRecord {
  actualPolicies: string[];
  observations: SeatObservations[];
}

const variants = ['mayorHardcore', 'mayorNeural', 'neural'] as const;
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function sha(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
export function parseMayorLabArgs(argv: string[]): MayorLabConfig {
  const allowed = ['games', 'seed', 'workers', 'variants', 'budget-ms', 'iterations', 'mayor-budget-ms',
    'mayor-batches', 'mayor-candidates', 'mayor-rounds', 'max-moves', 'model', 'output'];
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.startsWith('--') ? argv[i]!.slice(2) : '', value = argv[i + 1];
    assert(allowed.includes(key) && value !== undefined && value.length > 0 && !value.startsWith('--') && !args.has(key), 'Invalid or repeated argument: ' + argv[i]);
    args.set(key, value);
  }
  const integer = (key: string, fallback: number, min: number, max = 0xffffffff) => {
    const value = Number(args.get(key) ?? fallback);
    assert(Number.isSafeInteger(value) && value >= min && value <= max, 'Invalid --' + key); return value;
  };
  const games = integer('games', 18, 6);
  const names = (args.get('variants') ?? 'mayorHardcore').split(',') as MayorVariant[];
  assert(new Set(names).size === names.length && names.every(name => variants.includes(name as typeof variants[number])), 'Invalid variants');
  assert(!names.includes('mayorHardcore') || names.length === 1, 'Screen mayorHardcore independently of neural variants');
  // Both complete seat rotations and equal cyclic arm positions are needed.
  assert(games % 3 === 0 && games % (names.length + 1) === 0, 'Use complete seat rotations and balanced arm order');
  const needsModel = names.some(name => name === 'mayorNeural' || name === 'neural');
  assert(needsModel === args.has('model'), needsModel ? 'Neural variants require --model' : '--model is unused by mayorHardcore');
  const budgetMs = integer('budget-ms', 50, 1, 650);
  return { options: { games, players: 3, seed: integer('seed', 54091033, 0), budgetMs,
      maxMoves: integer('max-moves', 5000, 1, 10000), candidate: 'hardcore', opponents: 'hardcore',
      expansions: { festival: false, corsair: false, newBuildings: false, nobleBuildings: false },
      ...(args.has('iterations') ? { iterations: integer('iterations', 8, 1, 1500) } : {}) },
    variants: ['control', ...names], workers: integer('workers', 4, 1, 16),
    mayor: { timeBudgetMs: integer('mayor-budget-ms', budgetMs, 1, 650), maxBatches: integer('mayor-batches', 32, 1, 1000),
      candidateCount: integer('mayor-candidates', 6, 6, 12), rolloutRounds: integer('mayor-rounds', 2, 1, 8) },
    output: resolve(args.get('output') ?? 'reports/mayor/mayor-screening.json'),
    ...(needsModel ? { modelPath: resolve(args.get('model')!) } : {}) };
}
export function mayorJobs(config: Pick<MayorLabConfig, 'options' | 'variants'>): MayorJob[] {
  return Array.from({ length: config.options.games }, (_, index) => {
    const offset = index % config.variants.length;
    return [...config.variants.slice(offset), ...config.variants.slice(0, offset)].map(variant => ({ index, variant }));
  }).flat();
}
export function mayorBudgetDescription(config: MayorLabConfig) {
  return {
    nonMayor: { timeBudgetMs: config.options.iterations === undefined ? config.options.budgetMs : null,
      timeBudgetMode: config.options.iterations === undefined ? 'soft-wall-clock' : 'unlimited-clock-fixed-iterations',
      maxIterations: config.options.iterations ?? 1500, appliesTo: 'all delegates and frozen Hardcore opponents/control' },
    mayor: { ...config.mayor, scope: 'One new plan search per staffing allocation, then cached actions; no repeated search budget on cache hits',
      maximumAllowedRequestedBudgetMs: 650, clockLimitIsSoft: true, batchesAreAnAdditionalUpperLimit: true },
    sameNominalWallClockBudget: config.options.iterations === undefined && config.options.budgetMs === config.mayor.timeBudgetMs,
    exactProductionNonMayorSettings: config.options.budgetMs === 650 && config.options.iterations === undefined,
    timingComparison: 'Mayor planning adds work where the original Hardcore uses its staffing heuristic. Compare actual entire-game decisionMs and per-phase observations; equal iterations are not equal work.',
    reproducibility: 'Setup/chance and per-seat bot RNG streams are separate. Wall-clock stopping, including Mayor under --iterations, prevents bitwise reproducibility.',
  };
}
export function summarizeMayorObservations(games: MayorGameRecord[], candidate: boolean) {
  const rows = games.flatMap(game => game.observations.flatMap((seat, index) => (index === game.candidateSeat) === candidate ? seat.decisions : []));
  const mayors = rows.filter(row => row.phase === 'mayor');
  const plans = mayors.filter(row => row.mayor !== null && !row.mayor.cacheHit);
  const hits = mayors.filter(row => row.mayor?.cacheHit);
  const sum = (items: DecisionObservation[], select: (row: DecisionObservation) => number) => items.reduce((total, row) => total + select(row), 0);
  const durations = rows.map(row => row.actualMs).sort((a, b) => a - b);
  const contractViolations = rows.filter(row => {
    if (!numeric(row.actualMs) || !numeric(row.searchElapsedMs) || !Number.isSafeInteger(row.searchIterations) || row.searchIterations < 0) return true;
    const m = row.mayor;
    if (!m) return false;
    if (row.phase !== 'mayor' || ![m.planCount, m.batches, m.rollouts, m.errors].every(value => Number.isSafeInteger(value) && value >= 0) || !numeric(m.elapsedMs)) return true;
    return m.cacheHit && (m.planCount !== 0 || m.batches !== 0 || m.rollouts !== 0 || row.searchIterations !== 0);
  }).length;
  return { decisions: rows.length, actualMs: sum(rows, row => row.actualMs),
    nonMayorActualMs: sum(rows.filter(row => row.phase !== 'mayor'), row => row.actualMs), mayorActualMs: sum(mayors, row => row.actualMs),
    searchIterations: sum(rows, row => row.searchIterations), searchElapsedMs: sum(rows, row => row.searchElapsedMs),
    meanMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    p95Ms: durations[Math.ceil(durations.length * .95) - 1] ?? 0, maximumMs: durations.at(-1) ?? 0,
    mayorDecisions: mayors.length, planningDecisions: plans.length, cacheHits: hits.length,
    baselineSelections: plans.filter(row => row.mayor!.selectedBaseline).length,
    alternativeSelections: plans.filter(row => !row.mayor!.selectedBaseline).length,
    planCount: sum(plans, row => row.mayor!.planCount), batches: sum(plans, row => row.mayor!.batches),
    rollouts: sum(plans, row => row.mayor!.rollouts), planningMs: sum(plans, row => row.mayor!.elapsedMs),
    maximumPlanningMs: Math.max(0, ...plans.map(row => row.mayor!.elapsedMs)),
    maximumCacheHitMs: Math.max(0, ...hits.map(row => row.mayor!.elapsedMs)),
    cacheHitMs: sum(hits, row => row.mayor!.elapsedMs), candidateGenerationMs: sum(plans, row => row.mayor!.generationMs ?? 0),
    discardedRollouts: sum(plans, row => row.mayor!.discardedRollouts ?? 0), terminalRollouts: sum(plans, row => row.mayor!.terminalRollouts ?? 0),
    plannerErrors: sum(mayors, row => row.mayor?.errors ?? 0), evaluatorErrors: sum(rows, row => row.evaluatorErrors),
    illegalActions: rows.filter(row => row.illegal).length, thrownDecisions: rows.filter(row => row.threw).length, contractViolations,
    neuralPolicyCalls: sum(rows, row => row.neuralPolicyCalls), neuralPredictions: sum(rows, row => row.neuralPredictions),
    cachePolicyCalls: sum(rows, row => row.cachePolicyCalls) };
}

export async function runMayorWorker(): Promise<void> {
  const { MayorSearchBot } = await import('../src/bots/MayorSearchBot');
  const config = workerData as MayorLabConfig;
  const model = config.policyModel ? NeuralPolicyNetwork.fromJSON(config.policyModel) : null;
  let current = { neuralPolicyCalls: 0, neuralPredictions: 0, cachePolicyCalls: 0 };
  if (model) {
    const predict = model.predict.bind(model), policy = model.policyForLegalActions.bind(model);
    model.predict = input => { current.neuralPredictions++; return predict(input); };
    model.policyForLegalActions = (state, playerId, actions) => {
      current.neuralPolicyCalls++;
      if (Object.prototype.hasOwnProperty.call(state.players[0]!.island, 'getBuildings')) current.cachePolicyCalls++;
      return policy(state, playerId, actions);
    };
  }
  parentPort!.on('message', (job: MayorJob) => {
    try {
      const observations: SeatObservations[] = Array.from({ length: 3 }, () => ({ decisions: [] }));
      const actualPolicies: string[] = [];
      const result = runGame(config.options, job.index, (_label, random, seat, candidate) => {
        const choice = candidate ? job.variant : 'control';
        const common = { timeBudgetMs: config.options.iterations === undefined ? config.options.budgetMs : Infinity,
          maxIterations: config.options.iterations ?? 1500, random };
        const delegate = choice === 'mayorNeural' || choice === 'neural'
          ? new NeuralBot(model!, { ...common, cachePolicy: true }) : new HardcoreBot(common);
        const bot = choice.startsWith('mayor') ? new MayorSearchBot({ delegate, random, ...config.mayor }) : delegate;
        actualPolicies[seat] = choice === 'control' ? 'HardcoreBot' : choice;
        return { name: bot.name, chooseAction(state, playerId) {
          const phase = state.getCurrentPhase().type, started = performance.now();
          current = { neuralPolicyCalls: 0, neuralPredictions: 0, cachePolicyCalls: 0 };
          let illegal = false, threw = false;
          try {
            const action = bot.chooseAction(state, playerId); illegal = !action.validate(state).ok; return action;
          } catch (error) { threw = true; throw error; }
          finally {
            const stats = bot.lastSearchStats as HardcoreSearchStats;
            const rawMayor = choice.startsWith('mayor') ? (bot as InstanceType<typeof MayorSearchBot>).lastMayorStats : null;
            observations[seat]!.decisions.push({ phase, actualMs: performance.now() - started,
              searchIterations: stats.iterations, searchElapsedMs: stats.elapsedMs, evaluatorErrors: stats.evaluatorErrors,
              ...current, illegal, threw, mayor: rawMayor ? { ...rawMayor } : null });
          }
        } } satisfies Bot;
      });
      parentPort!.postMessage({ job, result: { ...result, actualPolicies, observations } satisfies MayorGameRecord });
    } catch (error) { parentPort!.postMessage({ job, error: error instanceof Error ? error.stack : String(error) }); }
  });
  parentPort!.postMessage({ ready: true });
}

export function mayorRuntimeHashes(project: string, entries: string[]): Record<string, string> {
  const pending = entries.map(file => resolve(project, file)), visited = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    assert(existsSync(file), 'Missing runtime/helper file: ' + file);
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)(['"])([^'"]+)\1/g)) {
      const specifier = match[2]!;
      if (!specifier.startsWith('.')) continue;
      const base = resolve(dirname(file), specifier);
      const resolved = [base, base + '.ts', base + '.tsx', base + '.mjs', base + '.js', base + '/index.ts'].find(path => existsSync(path) && /\.(?:[cm]?js|tsx?)$/.test(path));
      assert(resolved, 'Cannot fingerprint local import: ' + specifier + ' from ' + file);
      if (!visited.has(resolved)) pending.push(resolved);
    }
  }
  return Object.fromEntries([...visited].sort().map(file => [relative(project, file).replaceAll('\\', '/'), sha(file)]));
}
function saveProgress(path: string, data: unknown) {
  writeFileSync(path + '.tmp', JSON.stringify(data)); renameSync(path + '.tmp', path);
}
export async function mayorLabMain(argv = process.argv.slice(2)): Promise<void> {
  const config = parseMayorLabArgs(argv);
  const output = config.output;
  mkdirSync(dirname(output), { recursive: true });
  for (const suffix of ['', '.plan.json', '.progress.json', '.tmp', '.plan.json.tmp', '.progress.json.tmp', '.failure.json']) {
    assert(!existsSync(output + suffix), 'Experiment already exists; use a new output: ' + output + suffix);
  }
  const lock = output + '.running';
  writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
  try {
    let modelHash: string | null = null, parameterHash: string | null = null;
    if (config.modelPath) {
      modelHash = sha(config.modelPath);
      const data: unknown = JSON.parse(readFileSync(config.modelPath, 'utf8'));
      const model = NeuralPolicyNetwork.fromJSON(data);
      parameterHash = createHash('sha256').update(JSON.stringify(model.toJSON().parameters)).digest('hex');
      assert(parameterHash === '290f01f3ad7e3e8d6baf027064ae581653ce7b72341e1106784d27e621049b82', 'Use exactly the public NN456active parameter set');
      config.policyModel = data;
    }
    const project = resolve('.');
    const runtimeHashes = mayorRuntimeHashes(project, ['tools/mayor-lab.ts', 'tools/mayor-worker.mjs']);
    const verifyFrozen = () => {
      for (const [file, expected] of Object.entries(runtimeHashes)) assert(sha(resolve(project, file)) === expected, 'Runtime/helper changed: ' + file);
      if (config.modelPath) assert(sha(config.modelPath) === modelHash, 'Model changed during experiment');
    };
    const budget = mayorBudgetDescription(config), jobs = mayorJobs(config);
    const { policyModel: _model, ...publicConfig } = config;
    const plan = { format: 'puerto-rico-mayor-search-screening', version: 1, createdAt: new Date().toISOString(),
      config: publicConfig, budget, modelHash, parameterHash, runtimeHashes, jobs,
      scheduling: 'Cyclic arm order advances one position per game index; full seat rotations and balanced arm positions. Worker completion order can vary.',
      nodeVersion: process.version, nodeV8: process.versions.v8,
      typescriptVersion: (JSON.parse(readFileSync(resolve('node_modules/typescript/package.json'), 'utf8')) as { version: string }).version,
      victory: 'Original ScoreCalculator with doubloon/goods tiebreaks; fractional credit only for actual ties. Paired bootstrap groups all three seats by environment seed.',
      policyLabels: 'GameRecord.policies keeps original RNG labels; actualPolicies names the effective bots.',
      scope: 'Base game, three players, screening only; no automatic promotion or strength claim from throughput.' };
    writeFileSync(output + '.plan.json', JSON.stringify(plan), { flag: 'wx' });
    const records: Record<string, MayorGameRecord[]> = Object.fromEntries(config.variants.map(variant => [variant, []]));
    const received = new Set<string>();
    const started = Date.now();
    try {
      await runWorkerPool<MayorJob, MayorGameRecord>(new URL('./mayor-worker.mjs', import.meta.url), config, jobs, config.workers, (job, result) => {
        const id = job.variant + '/' + job.index;
        assert(!received.has(id) && records[job.variant] && result.gameIndex === job.index, 'Duplicate or mismatched worker result');
        received.add(id); records[job.variant]!.push(result);
        if (received.size % 6 === 0 || received.size === jobs.length) {
          saveProgress(output + '.progress.json', { config: publicConfig, records });
          console.log(JSON.stringify({ finished: received.size, total: jobs.length, wallSeconds: (Date.now() - started) / 1000 }));
        }
      });
    } catch (error) {
      writeFileSync(output + '.failure.json', JSON.stringify({ error: String(error), received: received.size, records }), { flag: 'wx' });
      throw error;
    }
    for (const games of Object.values(records)) games.sort((a, b) => a.gameIndex - b.gameIndex);
    const summaries = Object.fromEntries(config.variants.map(arm => [arm, summarizeArena(config.options, records[arm]!)]));
    const metrics = Object.fromEntries(config.variants.map(arm => [arm, {
      candidate: summarizeMayorObservations(records[arm]!, true), opponents: summarizeMayorObservations(records[arm]!, false) }]));
    const completeLegalGames = Object.values(records).every(games => games.length === config.options.games && games.every(game => game.status === 'completed'));
    const comparisons = completeLegalGames ? Object.fromEntries(config.variants.filter(arm => arm !== 'control')
      .map(arm => [arm, pairedComparison(records[arm]!, records.control!, config.options.seed)])) : null;
    const mayorVsNeural = completeLegalGames && records.mayorNeural && records.neural
      ? pairedComparison(records.mayorNeural, records.neural, config.options.seed) : null;
    const allMetrics = Object.values(metrics).flatMap(value => [value.candidate, value.opponents]);
    const quality = { completeLegalGames,
      noPlannerOrEvaluatorErrors: allMetrics.every(row => row.plannerErrors === 0 && row.evaluatorErrors === 0),
      noIllegalOrThrownActions: allMetrics.every(row => row.illegalActions === 0 && row.thrownDecisions === 0),
      cacheSearchContract: allMetrics.every(row => row.contractViolations === 0),
      activePlannerWhenRequested: config.variants.filter(arm => arm.startsWith('mayor')).every(arm =>
        records[arm]!.every(game => summarizeMayorObservations([game], true).planningDecisions > 0)),
      actualPlanComparisonsWhenRequested: config.variants.filter(arm => arm.startsWith('mayor')).every(arm => records[arm]!.some(game => game.observations[game.candidateSeat]!.decisions.some(row => row.mayor !== null && row.mayor.planCount > 1 && row.mayor.batches > 0))),
      activeNeuralWhenRequested: config.variants.filter(arm => arm === 'neural' || arm === 'mayorNeural').every(arm =>
        records[arm]!.every(game => {
          const row = summarizeMayorObservations([game], true);
          return row.neuralPredictions > 0 && row.neuralPredictions === row.neuralPolicyCalls && row.cachePolicyCalls > 0;
        })) };
    verifyFrozen();
    writeFileSync(output + '.tmp', JSON.stringify({ ...plan, summaries, metrics, comparisons, mayorVsNeural, quality,
      interpretable: Object.values(quality).every(Boolean), wallSeconds: (Date.now() - started) / 1000,
      runtimeHashesUnchanged: true }), { flag: 'wx' });
    linkSync(output + '.tmp', output); unlinkSync(output + '.tmp');
    console.log(JSON.stringify({ output, quality, comparisons, mayorVsNeural, metrics }, null, 2));
  } finally { unlinkSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await mayorLabMain();
