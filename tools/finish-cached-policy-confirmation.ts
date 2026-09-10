import { existsSync, readFileSync, writeFileSync, linkSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deriveSeed, type ArenaOptions, type GameRecord } from './arena-core';
import { pairedComparison } from './neural-lab';

export const CACHED_MODEL_HASH = 'e3c194fa554452ae45cfe2b9e80ee66b86fc0c1df7fedde8b125e02be8756dcc';
export const CACHED_SOURCE_FILES = ['HardcoreBot.ts', 'ChampionBot.ts', 'hardcorePolicy.ts', 'hardcoreEvaluation.ts',
  'hardcoreWorkers.ts', 'simulation.ts', 'championWorkers.ts', 'championEvaluation.ts', 'championPolicy.ts',
  'championShipping.ts', 'neural/features.ts', 'neural/policyFeatures.ts', 'neural/policyNetwork.ts', 'neural/policyReadCache.ts'] as const;
export const CACHED_TOOL_FILES = ['policy-cache-lab.ts', 'policy-cache-worker.mjs', 'search-lab.ts', 'arena-core.ts', 'neural-lab.ts', 'worker-pool.ts'] as const;
const PLAN_PATH = 'reports/neural-policy/policy-active-cached-production-plan.json';
const MODEL_PATH = 'work/neural-policy/policy-league-active-456.json';
const OUTPUT = 'reports/neural-policy/policy-active-cached-production-result.json';
const SERIES = [
  { seed: 49091009, output: 'reports/neural-policy/policy-active-cached-confirm-650ms.json' },
  { seed: 50091013, output: 'reports/neural-policy/policy-active-cached-replication-650ms.json' },
] as const;
const SETTINGS = { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.08,
  rolloutPolicy: 'neural', neural: ['roleSelection', 'builder', 'trader', 'settler'], cachePolicy: true };
const BUDGET = { timeBudgetMs: 650, maximumIterations: 1500, workers: 4, gamesPerArm: 90, players: 3, maxMoves: 5000 };
const COUNTERS = ['iterations', 'evaluatorErrors', 'neuralPolicyAttempts', 'neuralEvaluations', 'heuristicPolicyCalls'] as const;
type Counter = typeof COUNTERS[number];
type SearchTotals = Record<Counter, number> & { searchedDecisions: number };
export interface CachedConfirmationPlan {
  format: string; version: number; createdAt: string; modelPath: string; modelHash: string;
  variant: string; settings: Record<string, unknown>; budget: typeof BUDGET;
  sourceHashes: Record<string, string>; toolHashes: Record<string, string>;
  series: { seed: number; output: string }[]; output: string; bootstrapSeed: number;
  excludedEnvironmentSeeds: { training: number[]; validation: number[]; pilots: number[] };
  pilotReports: { path: string; sha256: string }[];
}
export interface CachedGameRecord extends GameRecord {
  search: Record<Counter, number[]> & { milliseconds: number[][] };
}
export interface CachedGateReport {
  config: { options: ArenaOptions; variants: Record<string, unknown> };
  workers: number; maximumIterations: number; classification: string; modelHash: string;
  referenceModelHash: string | null; sourceHashes: Record<string, string>; toolHashes: Record<string, string>;
  summaries: Record<string, { games: CachedGameRecord[] }>;
  searchSummary: Record<string, { candidate: SearchTotals; opponents: SearchTotals }>;
}
function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value) ?? 'undefined';
}
function equal(actual: unknown, expected: unknown, message: string): void {
  invariant(canonical(actual) === canonical(expected), message);
}
function hash(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function read<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T; }
function uint(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffffff; }
function nonnegative(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function seedSet(values: readonly number[], label: string): Set<number> {
  invariant(Array.isArray(values) && values.every(uint), 'Invalid seeds: ' + label);
  const set = new Set(values);
  invariant(set.size === values.length, 'Duplicate seeds: ' + label);
  return set;
}
function equalSeeds(actual: readonly number[], expected: readonly number[], label: string): void {
  equal([...seedSet(actual, label)].sort((a, b) => a - b), [...seedSet(expected, label)].sort((a, b) => a - b), 'Changed seed provenance: ' + label);
}
function fingerprints(hashes: Record<string, string>, files: readonly string[], label: string): void {
  invariant(hashes && typeof hashes === 'object', 'Missing ' + label + ' fingerprint');
  equal(Object.keys(hashes).sort(), [...files].sort(), 'Incomplete or unexpected ' + label + ' fingerprint');
  invariant(Object.values(hashes).every(value => /^[a-f0-9]{64}$/.test(value)), 'Invalid ' + label + ' hash');
}

export function validateCachedConfirmationPlan(plan: CachedConfirmationPlan): void {
  invariant(plan.format === 'puerto-rico-cached-policy-production-plan' && plan.version === 1 &&
    Number.isFinite(Date.parse(plan.createdAt)), 'Invalid prospective plan');
  invariant(plan.modelPath === MODEL_PATH && plan.modelHash === CACHED_MODEL_HASH && plan.variant === 'cached' &&
    plan.output === OUTPUT && plan.bootstrapSeed === 51091021, 'Changed closed candidate or output');
  equal(plan.series, SERIES, 'Changed closed series');
  equal(plan.settings, SETTINGS, 'Changed cached settings');
  equal(plan.budget, BUDGET, 'Changed closed budget');
  fingerprints(plan.sourceHashes, CACHED_SOURCE_FILES, 'source');
  fingerprints(plan.toolHashes, CACHED_TOOL_FILES, 'tool');
  const training = seedSet(plan.excludedEnvironmentSeeds.training, 'training');
  const validation = seedSet(plan.excludedEnvironmentSeeds.validation, 'validation');
  seedSet(plan.excludedEnvironmentSeeds.pilots, 'pilots');
  invariant(training.size > 0 && validation.size > 0 && [...training].every(seed => !validation.has(seed)), 'Invalid training/validation split');
  invariant(Array.isArray(plan.pilotReports) && plan.pilotReports.length > 0 &&
    new Set(plan.pilotReports.map(report => report.path)).size === plan.pilotReports.length &&
    plan.pilotReports.every(report => typeof report.path === 'string' && report.path.length > 0 && /^[a-f0-9]{64}$/.test(report.sha256)),
  'Invalid pilot provenance');
  const environments = SERIES.flatMap(series => Array.from({ length: 30 }, (_, i) => deriveSeed(series.seed, i)));
  invariant(new Set(environments).size === 60, 'Gate does not contain 60 disjoint environments');
  const excluded = new Set(Object.values(plan.excludedEnvironmentSeeds).flat());
  invariant(environments.every(seed => !excluded.has(seed)), 'Gate overlaps training, validation or prior experiments');
}

export function reportEnvironmentSeeds(report: unknown): number[] {
  const seeds = new Set<number>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'environmentSeed') { invariant(uint(item), 'Invalid prior environment seed'); seeds.add(item); }
      else if (item && typeof item === 'object') visit(item);
    }
  };
  visit(report);
  return [...seeds].sort((a, b) => a - b);
}

function expectedOptions(seed: number): ArenaOptions {
  return { games: 90, players: 3, seed, budgetMs: 650, maxMoves: 5000, candidate: 'hardcore', opponents: 'hardcore',
    expansions: { festival: false, corsair: false, newBuildings: false, nobleBuildings: false } };
}
function validateHeader(report: Omit<CachedGateReport, 'summaries' | 'searchSummary'>, plan: CachedConfirmationPlan, seed: number): void {
  equal(report.config.options, expectedOptions(seed), 'Changed gate options');
  equal(report.config.variants, { cached: SETTINGS }, 'Changed cached variant');
  invariant(report.workers === 4 && report.maximumIterations === 1500 && report.classification === 'production-confirmation' &&
    report.modelHash === plan.modelHash && report.referenceModelHash === null, 'Changed gate configuration or model');
  equal(report.sourceHashes, plan.sourceHashes, 'Source hashes differ from prospective plan');
  equal(report.toolHashes, plan.toolHashes, 'Tool hashes differ from prospective plan');
}

function validateGame(game: CachedGameRecord, seed: number): void {
  invariant(Number.isInteger(game.gameIndex) && game.gameIndex >= 0 && game.gameIndex < 90 &&
    game.status === 'completed' && !game.failure && game.candidateSeat === game.gameIndex % 3 &&
    game.environmentSeed === deriveSeed(seed, Math.floor(game.gameIndex / 3)), 'Invalid game identity or status');
  equal(game.policies, ['hardcore', 'hardcore', 'hardcore'], 'Changed opponent labels');
  invariant(Number.isSafeInteger(game.moves) && game.moves > 0 && game.moves <= 5000 &&
    Number.isSafeInteger(game.rounds) && game.rounds > 0 && /^[a-f0-9]{8}$/.test(game.traceHash), 'Invalid completion trace');
  invariant(game.scores.length === 3 && new Set(game.scores.map(score => score.playerId)).size === 3 &&
    game.scores.every(score => /^player-[0-2]$/.test(score.playerId) &&
      [score.vpTokens, score.buildingVP, score.largeBuildingBonus, score.nobleVP, score.total, score.doubloons, score.goods].every(nonnegative) &&
      score.total === score.vpTokens + score.buildingVP + score.largeBuildingBonus + score.nobleVP && score.nobleVP === 0), 'Invalid final scores');
  const sorted = [...game.scores].sort((a, b) => b.total - a.total || b.doubloons - a.doubloons || b.goods - a.goods);
  const sameScore = (a: typeof sorted[number], b: typeof sorted[number]) =>
    a.total === b.total && a.doubloons === b.doubloons && a.goods === b.goods;
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i && !sameScore(sorted[i]!, sorted[i - 1]!)) rank = i + 1;
    invariant(sorted[i]!.rank === rank, 'Incorrect rank or tiebreak');
  }
  const winners = sorted.filter(score => sameScore(score, sorted[0]!));
  const credits = [0, 1, 2].map(seat => winners.some(score => score.playerId === 'player-' + seat) ? 1 / winners.length : 0);
  equal(game.winCredits, credits, 'Incorrect fractional victory credits');
  const own = sorted.find(score => score.playerId === 'player-' + game.candidateSeat)!;
  const bestOpponent = Math.max(...sorted.filter(score => score !== own).map(score => score.total));
  invariant(game.candidateWinCredit === credits[game.candidateSeat] && game.candidateScoreMargin === own.total - bestOpponent,
    'Incorrect candidate victory or score margin');
  invariant(game.search && Array.isArray(game.search.milliseconds) && game.search.milliseconds.length === 3 &&
    game.search.milliseconds.every(rows => Array.isArray(rows) && rows.every(nonnegative)), 'Missing search timing records');
  for (const key of COUNTERS) invariant(Array.isArray(game.search[key]) && game.search[key].length === 3 &&
    game.search[key].every(value => Number.isSafeInteger(value) && value >= 0), 'Invalid search counter: ' + key);
}
function searchTotals(games: CachedGameRecord[], candidate: boolean): SearchTotals {
  const result = { iterations: 0, evaluatorErrors: 0, neuralPolicyAttempts: 0, neuralEvaluations: 0, heuristicPolicyCalls: 0, searchedDecisions: 0 };
  for (const game of games) for (let seat = 0; seat < 3; seat++) {
    if ((seat === game.candidateSeat) !== candidate) continue;
    for (const key of COUNTERS) result[key] += game.search[key][seat]!;
    result.searchedDecisions += game.search.milliseconds[seat]!.length;
  }
  return result;
}
export function validateCachedSeries(report: CachedGateReport, plan: CachedConfirmationPlan, seed: number): void {
  validateHeader(report, plan, seed);
  equal(Object.keys(report.summaries).sort(), ['cached', 'control'], 'Unexpected or missing gate arm');
  for (const arm of ['cached', 'control']) {
    const games = report.summaries[arm]!.games;
    invariant(games.length === 90 && new Set(games.map(game => game.gameIndex)).size === 90, 'Incomplete or duplicate gate games');
    for (const game of games) validateGame(game, seed);
    for (const kind of ['candidate', 'opponents'] as const) {
      const total = searchTotals(games, kind === 'candidate'), summary = report.searchSummary?.[arm]?.[kind];
      invariant(summary, 'Missing per-arm inference summary');
      for (const key of [...COUNTERS, 'searchedDecisions'] as const) {
        invariant(summary[key] === total[key], 'Search summary does not match game records: ' + arm + '/' + kind + '/' + key);
      }
    }
  }
}
function armSummary(games: GameRecord[]) {
  return { games: games.length, outrightWins: games.filter(game => game.candidateWinCredit === 1).length,
    sharedWins: games.filter(game => game.candidateWinCredit! > 0 && game.candidateWinCredit! < 1).length,
    winCredit: games.reduce((sum, game) => sum + game.candidateWinCredit!, 0),
    meanScoreMargin: games.reduce((sum, game) => sum + game.candidateScoreMargin!, 0) / games.length };
}

export function combineCachedPolicyConfirmation(plan: CachedConfirmationPlan, first: CachedGateReport, second: CachedGateReport) {
  validateCachedConfirmationPlan(plan);
  const reports = [first, second];
  reports.forEach((report, i) => validateCachedSeries(report, plan, SERIES[i]!.seed));
  const joined = (arm: string) => reports.flatMap((report, i) => report.summaries[arm]!.games
    .map(game => ({ ...game, gameIndex: game.gameIndex + i * 90 })));
  const candidate = joined('cached'), control = joined('control');
  const comparison = pairedComparison(candidate, control, plan.bootstrapSeed);
  const perSeries = reports.map((report, i) => ({ seed: SERIES[i]!.seed,
    candidate: armSummary(report.summaries.cached!.games), control: armSummary(report.summaries.control!.games),
    comparison: pairedComparison(report.summaries.cached!.games, report.summaries.control!.games, SERIES[i]!.seed),
    inference: { candidate: searchTotals(report.summaries.cached!.games, true), opponents: searchTotals(report.summaries.cached!.games, false),
      control: { candidate: searchTotals(report.summaries.control!.games, true), opponents: searchTotals(report.summaries.control!.games, false) } },
  }));
  const everyGameHasNeuralInference = candidate.every(game => {
    const seat = game.candidateSeat;
    return game.search.neuralEvaluations[seat]! > 0 && game.search.neuralEvaluations[seat] === game.search.neuralPolicyAttempts[seat];
  });
  const noBaselineNeuralInference = perSeries.every(series => [series.inference.opponents, series.inference.control.candidate, series.inference.control.opponents]
    .every(total => total.neuralPolicyAttempts === 0 && total.neuralEvaluations === 0));
  const checks = {
    completeLegalGames: candidate.length + control.length === 360,
    sixtyDisjointEnvironmentSeeds: comparison.independentSeeds === 60,
    disjointTrainingValidationAndPriorExperiments: true,
    frozenCandidateAndTools: true,
    positiveInBothSeries: perSeries.every(series => series.comparison.winRateDifference > 0),
    combinedLower95AboveZero: comparison.winRateDifference95 !== null && comparison.winRateDifference95[0]! > 0,
    activeNeuralInferenceInBothSeries: everyGameHasNeuralInference,
    noBaselineNeuralInference,
    noEvaluatorErrors: [...candidate, ...control].every(game => game.search.evaluatorErrors.every(errors => errors === 0)),
  };
  return { format: 'puerto-rico-closed-cached-policy-confirmation', version: 1, modelHash: plan.modelHash, variant: 'cached',
    settings: plan.settings, sourceHashes: plan.sourceHashes, toolHashes: plan.toolHashes, sourceSeeds: SERIES.map(series => series.seed),
    scope: 'Base game, three players, cached NN456active versus two frozen Hardcore; separate all-Hardcore control',
    budget: { ...plan.budget, softWallClockLimit: true },
    perSeries, candidate: armSummary(candidate), control: armSummary(control), comparison,
    perSeat: [0, 1, 2].map(seat => ({ seat, candidate: armSummary(candidate.filter(game => game.candidateSeat === seat)),
      control: armSummary(control.filter(game => game.candidateSeat === seat)),
      comparison: pairedComparison(candidate.filter(game => game.candidateSeat === seat), control.filter(game => game.candidateSeat === seat), plan.bootstrapSeed + seat) })),
    checks, strengthGatePassed: Object.values(checks).every(Boolean),
    deployment: 'No automatic promotion; requires integration QA, release builds and deployment verification',
  };
}

export function assertNoPartialCachedExperiment(output: string): void {
  if (existsSync(output)) return;
  for (const suffix of ['.plan.json', '.progress.json', '.tmp', '.plan.json.tmp', '.progress.json.tmp', '.running']) {
    invariant(!existsSync(output + suffix), 'Existing partial experiment; inspect instead of restarting: ' + output + suffix);
  }
}
export interface CachedDriverOptions {
  projectRoot?: string;
  runSeries?: (argv: string[]) => Promise<unknown>;
}
export async function finishCachedPolicyConfirmationMain(options: CachedDriverOptions = {}): Promise<void> {
  const project = resolve(options.projectRoot ?? '.');
  const planPath = resolve(project, PLAN_PATH);
  const planHash = hash(planPath), plan = read<CachedConfirmationPlan>(planPath);
  validateCachedConfirmationPlan(plan);
  invariant(Date.parse(plan.createdAt) <= Date.now(), 'Prospective plan is dated in the future');
  const output = resolve(project, plan.output), lock = output + '.running';
  invariant(!existsSync(output) && !existsSync(output + '.tmp'), 'Final output already exists; it will not be overwritten');
  writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), planHash }), { flag: 'wx' });
  try {
    const assertFrozenAssets = () => {
      invariant(hash(planPath) === planHash, 'Prospective plan changed on disk');
      invariant(hash(resolve(project, plan.modelPath)) === plan.modelHash, 'Frozen model changed on disk');
      for (const [file, expected] of Object.entries(plan.sourceHashes)) invariant(hash(resolve(project, 'src/bots', file)) === expected, 'Frozen source changed on disk: ' + file);
      for (const [file, expected] of Object.entries(plan.toolHashes)) invariant(hash(resolve(project, 'tools', file)) === expected, 'Frozen tool changed on disk: ' + file);
      for (const report of plan.pilotReports) invariant(hash(resolve(project, report.path)) === report.sha256, 'Prior report changed on disk: ' + report.path);
    };
    assertFrozenAssets();
    const model = read<{ metadata: { trainingGameSeeds: number[]; validationGameSeeds: number[] } }>(resolve(project, plan.modelPath));
    equalSeeds(model.metadata.trainingGameSeeds, plan.excludedEnvironmentSeeds.training, 'model training');
    equalSeeds(model.metadata.validationGameSeeds, plan.excludedEnvironmentSeeds.validation, 'model validation');
    const pilots = new Set(plan.pilotReports.flatMap(report => reportEnvironmentSeeds(read(resolve(project, report.path)))));
    equalSeeds([...pilots], plan.excludedEnvironmentSeeds.pilots, 'prior reports');
    for (const series of plan.series) assertNoPartialCachedExperiment(resolve(project, series.output));
    invariant(!existsSync(resolve(project, plan.series[1]!.output)) || existsSync(resolve(project, plan.series[0]!.output)), 'Second series exists without first series');
    const run = options.runSeries ?? (async (argv: string[]) => {
      invariant(project === resolve('.'), 'Default tournament runner requires project working directory');
      const { policyCacheLabMain } = await import('./policy-cache-lab');
      return policyCacheLabMain(argv);
    });
    const reports: CachedGateReport[] = [], reportHashes: string[] = [];
    let previousStart = Date.parse(plan.createdAt);
    for (const series of plan.series) {
      const path = resolve(project, series.output);
      assertFrozenAssets();
      if (!existsSync(path)) {
        assertNoPartialCachedExperiment(path);
        console.log(JSON.stringify({ startingSeries: path, seed: series.seed, independentOfEarlierResult: true }));
        try {
          await run(['--variants', 'cached', '--policy-model', resolve(project, plan.modelPath), '--games', '90',
            '--players', '3', '--expansions', 'base', '--budget-ms', '650', '--workers', '4',
            '--seed', String(series.seed), '--stage', 'production-confirmation', '--output', path]);
        } finally { assertFrozenAssets(); }
      }
      assertFrozenAssets();
      const report = read<CachedGateReport>(path);
      validateCachedSeries(report, plan, series.seed);
      const recordedPlan = read<CachedGateReport & { createdAt: string }>(path + '.plan.json');
      validateHeader(recordedPlan, plan, series.seed);
      const started = Date.parse(recordedPlan.createdAt);
      invariant(Number.isFinite(started) && started > Date.parse(plan.createdAt) && started >= previousStart && started <= Date.now(),
        'Series was not started after the prospective plan in declared order');
      previousStart = started;
      reports.push(report); reportHashes.push(hash(path));
    }
    const result = combineCachedPolicyConfirmation(plan, reports[0]!, reports[1]!);
    assertFrozenAssets();
    plan.series.forEach((series, i) => invariant(hash(resolve(project, series.output)) === reportHashes[i], 'Completed report changed during confirmation'));
    const final = { ...result, evaluatedAt: new Date().toISOString(), planHash, reportHashes,
      driverHash: hash(fileURLToPath(import.meta.url)), assetsVerifiedAfterEverySeriesAndAtEnd: true };
    writeFileSync(output + '.tmp', JSON.stringify(final), { flag: 'wx' });
    // A hard link publishes complete bytes atomically and fails if output already exists.
    linkSync(output + '.tmp', output);
    unlinkSync(output + '.tmp');
    console.log(JSON.stringify({ output, checks: result.checks, strengthGatePassed: result.strengthGatePassed, comparison: result.comparison }));
  } finally { unlinkSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await finishCachedPolicyConfirmationMain();
