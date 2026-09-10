import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { deriveSeed } from '../../tools/arena-core';
import { CACHED_MODEL_HASH, CACHED_SOURCE_FILES, CACHED_TOOL_FILES, combineCachedPolicyConfirmation,
  validateCachedConfirmationPlan, assertNoPartialCachedExperiment, reportEnvironmentSeeds, finishCachedPolicyConfirmationMain,
  type CachedConfirmationPlan, type CachedGateReport, type CachedGameRecord } from '../../tools/finish-cached-policy-confirmation';

const PLAN_PATH = 'reports/neural-policy/policy-active-cached-production-plan.json';
const roots: string[] = [];
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
function plan(): CachedConfirmationPlan {
  return { format: 'puerto-rico-cached-policy-production-plan', version: 1, createdAt: new Date(Date.now() - 2000).toISOString(),
    modelPath: 'work/neural-policy/policy-league-active-456.json', modelHash: CACHED_MODEL_HASH, variant: 'cached',
    settings: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.08, rolloutPolicy: 'neural',
      neural: ['roleSelection', 'builder', 'trader', 'settler'], cachePolicy: true },
    budget: { timeBudgetMs: 650, maximumIterations: 1500, workers: 4, gamesPerArm: 90, players: 3, maxMoves: 5000 },
    sourceHashes: Object.fromEntries(CACHED_SOURCE_FILES.map(file => [file, 'a'.repeat(64)])),
    toolHashes: Object.fromEntries(CACHED_TOOL_FILES.map(file => [file, 'b'.repeat(64)])),
    series: [
      { seed: 49091009, output: 'reports/neural-policy/policy-active-cached-confirm-650ms.json' },
      { seed: 50091013, output: 'reports/neural-policy/policy-active-cached-replication-650ms.json' }],
    output: 'reports/neural-policy/policy-active-cached-production-result.json', bootstrapSeed: 51091021,
    excludedEnvironmentSeeds: { training: [123], validation: [456], pilots: [789] },
    pilotReports: [{ path: 'reports/prior.json', sha256: 'd'.repeat(64) }] };
}
function outcome(game: CachedGameRecord, winners: number[]): void {
  game.scores = [0, 1, 2].map(seat => ({ playerId: 'player-' + seat, playerName: 'seat ' + seat,
    vpTokens: winners.includes(seat) ? 20 : 10, buildingVP: 0, largeBuildingBonus: 0, nobleVP: 0,
    total: winners.includes(seat) ? 20 : 10, doubloons: 0, goods: 0, rank: winners.includes(seat) ? 1 : winners.length + 1 }))
    .sort((a, b) => b.total - a.total);
  game.winCredits = [0, 1, 2].map(seat => winners.includes(seat) ? 1 / winners.length : 0);
  game.candidateWinCredit = game.winCredits[game.candidateSeat]!;
  game.candidateScoreMargin = winners.includes(game.candidateSeat) ? (winners.length > 1 ? 0 : 10) : -10;
}
function refresh(report: CachedGateReport): void {
  report.searchSummary = Object.fromEntries(Object.entries(report.summaries).map(([arm, summary]) => [arm,
    Object.fromEntries((['candidate', 'opponents'] as const).map(kind => {
      const totals = { searchedDecisions: 0, iterations: 0, evaluatorErrors: 0, neuralPolicyAttempts: 0, neuralEvaluations: 0, heuristicPolicyCalls: 0 };
      for (const game of summary.games) for (let seat = 0; seat < 3; seat++) {
        if ((seat === game.candidateSeat) !== (kind === 'candidate')) continue;
        totals.searchedDecisions += game.search.milliseconds[seat]!.length;
        for (const key of ['iterations', 'evaluatorErrors', 'neuralPolicyAttempts', 'neuralEvaluations', 'heuristicPolicyCalls'] as const) totals[key] += game.search[key][seat]!;
      }
      return [kind, totals];
    })) as CachedGateReport['searchSummary'][string] ]));
}
function series(p: CachedConfirmationPlan, index: number): CachedGateReport {
  const seed = p.series[index]!.seed;
  const games = (candidate: boolean): CachedGameRecord[] => Array.from({ length: 90 }, (_, gameIndex) => {
    const candidateSeat = gameIndex % 3, group = Math.floor(gameIndex / 3);
    const won = candidate && candidateSeat < (group % 2 === 0 ? 2 : 1);
    const inference = [0, 1, 2].map(seat => candidate && seat === candidateSeat ? 10 : 0);
    const game: CachedGameRecord = { gameIndex, candidateSeat, environmentSeed: deriveSeed(seed, group),
      policies: ['hardcore', 'hardcore', 'hardcore'], status: 'completed', moves: 100, rounds: 10,
      elapsedMs: 1, decisionMs: [1, 1, 1], decisionCounts: [34, 33, 33], traceHash: 'a123abcd', reason: 'completed fixture',
      scores: [], winCredits: [], candidateWinCredit: 0, candidateScoreMargin: 0,
      search: { iterations: [8, 8, 8], milliseconds: [[1], [1], [1]], evaluatorErrors: [0, 0, 0],
        neuralPolicyAttempts: [...inference], neuralEvaluations: [...inference], heuristicPolicyCalls: [0, 0, 0] } };
    outcome(game, [won ? candidateSeat : (candidateSeat + 1) % 3]); return game;
  });
  const report: CachedGateReport = { config: {
    options: { games: 90, players: 3, seed, budgetMs: 650, maxMoves: 5000, candidate: 'hardcore', opponents: 'hardcore',
      expansions: { festival: false, corsair: false, newBuildings: false, nobleBuildings: false } },
    variants: { cached: structuredClone(p.settings) } },
    workers: 4, maximumIterations: 1500, classification: 'production-confirmation', modelHash: p.modelHash, referenceModelHash: null,
    sourceHashes: { ...p.sourceHashes }, toolHashes: { ...p.toolHashes },
    summaries: { control: { games: games(false) }, cached: { games: games(true) } }, searchSummary: {} };
  refresh(report); return report;
}
function combine(p = plan(), a = series(p, 0), b = series(p, 1)) { return combineCachedPolicyConfirmation(p, a, b); }

describe('closed cached production gate', () => {
  it('pools 360 legal games over 60 environments without mutating records', () => {
    const p = plan(), a = series(p, 0), b = series(p, 1), before = JSON.stringify([p, a, b]);
    const result = combine(p, a, b);
    expect(result.strengthGatePassed).toBe(true);
    expect(result.comparison.pairedGames).toBe(180);
    expect(result.comparison.independentSeeds).toBe(60);
    expect(result.candidate.winCredit).toBe(90);
    expect(result.perSeat.map(seat => seat.candidate.games)).toEqual([60, 60, 60]);
    expect(JSON.stringify([p, a, b])).toBe(before);
  });
  it.each(['training', 'validation', 'pilots'] as const)('rejects overlap with %s environments', kind => {
    const p = plan(); p.excludedEnvironmentSeeds[kind].push(deriveSeed(p.series[0]!.seed, 0));
    expect(() => combine(p)).toThrow('overlaps');
  });
  it('requires exact settings, all 14 named sources and six named tools', () => {
    const rejectPlan = (change: (p: CachedConfirmationPlan) => void) => {
      const p = plan(); change(p); expect(() => validateCachedConfirmationPlan(p)).toThrow();
    };
    rejectPlan(p => { p.settings.cachePolicy = false; });
    rejectPlan(p => { p.settings.coordinatedWorkers = true; });
    rejectPlan(p => { p.modelHash = 'e'.repeat(64); });
    rejectPlan(p => { delete p.sourceHashes['neural/policyReadCache.ts']; p.sourceHashes.unrelated = 'a'.repeat(64); });
    rejectPlan(p => { delete p.toolHashes['worker-pool.ts']; });
    rejectPlan(p => { p.budget.timeBudgetMs = 100; });
    const p = plan(), b = series(p, 1); b.toolHashes['arena-core.ts'] = 'c'.repeat(64);
    expect(() => combine(p, series(p, 0), b)).toThrow('Tool hashes');
  });
  it('rejects changed seeds, opponents, iteration budget and partial or duplicate games', () => {
    for (const change of [
      (r: CachedGateReport) => { r.config.options.iterations = 1500; },
      (r: CachedGateReport) => { r.config.options.opponents = 'greedy'; },
      (r: CachedGateReport) => { r.summaries.control!.games.pop(); },
      (r: CachedGateReport) => { r.summaries.cached!.games[0]!.status = 'incomplete'; },
      (r: CachedGateReport) => { r.summaries.cached!.games[0]!.environmentSeed = 99; },
      (r: CachedGateReport) => { r.summaries.cached!.games[0]!.gameIndex = 1; },
    ]) {
      const p = plan(), b = series(p, 1); change(b); expect(() => combine(p, series(p, 0), b)).toThrow();
    }
  });
  it('accepts true shared victory but rejects arbitrary fractional credit and forged margins', () => {
    const p = plan(), a = series(p, 0), b = series(p, 1);
    outcome(a.summaries.cached!.games[0]!, [0, 1]);
    expect(combine(p, a, b).candidate.sharedWins).toBe(1);
    a.summaries.cached!.games[0]!.winCredits = [0.6, 0.4, 0];
    expect(() => combine(p, a, b)).toThrow('fractional victory');
    outcome(a.summaries.cached!.games[0]!, [0, 1]);
    a.summaries.cached!.games[0]!.candidateScoreMargin = 1;
    expect(() => combine(p, a, b)).toThrow('score margin');
  });
  it('checks game counters against summaries and requires NN activity in BOTH series', () => {
    const p = plan(), a = series(p, 0), b = series(p, 1);
    a.summaries.cached!.games[0]!.search.neuralEvaluations[0] = 0;
    expect(() => combine(p, a, b)).toThrow('summary does not match');
    refresh(a);
    expect(combine(p, a, b).strengthGatePassed).toBe(false);
    a.summaries.cached!.games[0]!.search.neuralPolicyAttempts[0] = 0; refresh(a);
    expect(combine(p, a, b).checks.activeNeuralInferenceInBothSeries).toBe(false);
  });
  it('fails for errors in either series or neural inference by a baseline', () => {
    for (const index of [0, 1]) {
      const p = plan(), rows = [series(p, 0), series(p, 1)];
      rows[index]!.summaries.cached!.games[0]!.search.evaluatorErrors[0] = 1; refresh(rows[index]!);
      expect(combine(p, rows[0]!, rows[1]!).checks.noEvaluatorErrors).toBe(false);
    }
    const p = plan(), a = series(p, 0), b = series(p, 1);
    a.summaries.control!.games[0]!.search.neuralEvaluations[1] = 1; refresh(a);
    expect(combine(p, a, b).checks.noBaselineNeuralInference).toBe(false);
  });
  it('does not promote from a positive pool when one series has no advantage', () => {
    const p = plan(), a = series(p, 0), b = series(p, 1);
    for (const game of b.summaries.cached!.games) outcome(game, [(game.candidateSeat + 1) % 3]);
    const result = combine(p, a, b);
    expect(result.comparison.winRateDifference).toBeGreaterThan(0);
    expect(result.checks.positiveInBothSeries).toBe(false);
    expect(result.strengthGatePassed).toBe(false);
  });
  it('extracts prior environment seeds across report formats without confusing master seeds', () => {
    expect(reportEnvironmentSeeds({ seed: 1, summaries: { cached: { games: [{ environmentSeed: 7 }] } },
      records: [{ environmentSeed: 8 }], config: { games: [{ environmentSeed: 7 }] } })).toEqual([7, 8]);
  });
});

function diskFixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'puerto-cached-confirmation-')); roots.push(root);
  const p = plan();
  const save = (path: string, data: unknown) => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
  };
  const bytes = readFileSync(resolve('work/neural-policy/policy-league-active-456.json'));
  const model = JSON.parse(bytes.toString('utf8')) as { metadata: { trainingGameSeeds: number[]; validationGameSeeds: number[] } };
  expect(hash(bytes)).toBe(CACHED_MODEL_HASH);
  save(p.modelPath, bytes);
  p.excludedEnvironmentSeeds.training = model.metadata.trainingGameSeeds;
  p.excludedEnvironmentSeeds.validation = model.metadata.validationGameSeeds;
  for (const file of CACHED_SOURCE_FILES) { save('src/bots/' + file, file); p.sourceHashes[file] = hash(file); }
  for (const file of CACHED_TOOL_FILES) { save('tools/' + file, file); p.toolHashes[file] = hash(file); }
  const prior = JSON.stringify({ games: [{ environmentSeed: 789 }] }); save('reports/prior.json', prior);
  p.pilotReports[0]!.sha256 = hash(prior); save(PLAN_PATH, p);
  const calls: number[] = [];
  const run = async (argv: string[]) => {
    const index = p.series.findIndex(row => row.seed === Number(argv[argv.indexOf('--seed') + 1]));
    expect(index).toBe(calls.length); calls.push(index);
    expect(argv[argv.indexOf('--variants') + 1]).toBe('cached');
    expect(argv).not.toContain('--iterations');
    expect(argv[argv.indexOf('--budget-ms') + 1]).toBe('650');
    const report = series(p, index);
    save(p.series[index]!.output + '.plan.json', { ...report, createdAt: new Date().toISOString() });
    save(p.series[index]!.output, report);
  };
  return { root, p, save, run, calls };
}

describe('cached confirmation driver filesystem lifecycle', () => {
  it('runs both series sequentially even after a first-series strength loss and publishes once', async () => {
    const f = diskFixture();
    await finishCachedPolicyConfirmationMain({ projectRoot: f.root, runSeries: async argv => {
      await f.run(argv);
      if (f.calls.length === 1) {
        const report = series(f.p, 0);
        for (const game of report.summaries.cached!.games) outcome(game, [(game.candidateSeat + 1) % 3]);
        f.save(f.p.series[0]!.output, report);
      }
    } });
    expect(f.calls).toEqual([0, 1]);
    const result = JSON.parse(readFileSync(resolve(f.root, f.p.output), 'utf8'));
    expect(result.strengthGatePassed).toBe(false);
    expect(result.assetsVerifiedAfterEverySeriesAndAtEnd).toBe(true);
    expect(existsSync(resolve(f.root, f.p.output + '.running'))).toBe(false);
    await expect(finishCachedPolicyConfirmationMain({ projectRoot: f.root, runSeries: f.run })).rejects.toThrow('already exists');
  });
  it.each(['.plan.json', '.progress.json', '.tmp', '.plan.json.tmp', '.progress.json.tmp', '.running'])('refuses a partial experiment %s without starting games', async suffix => {
    const f = diskFixture(); f.save(f.p.series[1]!.output + suffix, 'partial');
    expect(() => assertNoPartialCachedExperiment(resolve(f.root, f.p.series[1]!.output))).toThrow('partial experiment');
    await expect(finishCachedPolicyConfirmationMain({ projectRoot: f.root, runSeries: f.run })).rejects.toThrow('partial experiment');
    expect(f.calls).toEqual([]);
    expect(readFileSync(resolve(f.root, f.p.series[1]!.output + suffix), 'utf8')).toBe('partial');
  });
  it('does not replace or delete an existing lock', async () => {
    const f = diskFixture(); f.save(f.p.output + '.running', 'another owner');
    await expect(finishCachedPolicyConfirmationMain({ projectRoot: f.root, runSeries: f.run })).rejects.toThrow();
    expect(readFileSync(resolve(f.root, f.p.output + '.running'), 'utf8')).toBe('another owner');
    expect(f.calls).toEqual([]);
  });
  it.each([0, 1])('checks on-disk source hashes after series %i before final publication', async corruptAfter => {
    const f = diskFixture();
    await expect(finishCachedPolicyConfirmationMain({ projectRoot: f.root, runSeries: async argv => {
      await f.run(argv);
      if (f.calls.length === corruptAfter + 1) f.save('src/bots/neural/policyReadCache.ts', 'changed');
    } })).rejects.toThrow('Frozen source changed');
    expect(f.calls).toHaveLength(corruptAfter + 1);
    expect(existsSync(resolve(f.root, f.p.output))).toBe(false);
    expect(existsSync(resolve(f.root, f.p.output + '.running'))).toBe(false);
  });
  it('rejects source/tool/model/plan mutation and changed prior reports before starting', async () => {
    for (const file of ['tools/arena-core.ts', 'src/bots/HardcoreBot.ts', 'work/neural-policy/policy-league-active-456.json', 'reports/prior.json']) {
      const f = diskFixture(); f.save(file, 'changed');
      await expect(finishCachedPolicyConfirmationMain({ projectRoot: f.root, runSeries: f.run })).rejects.toThrow('changed on disk');
      expect(f.calls).toEqual([]);
    }
  });
  it('rejects stale retrospective series timestamps', async () => {
    const f = diskFixture();
    await expect(finishCachedPolicyConfirmationMain({ projectRoot: f.root, runSeries: async argv => {
      await f.run(argv);
      f.save(f.p.series[0]!.output + '.plan.json', { ...series(f.p, 0), createdAt: f.p.createdAt });
    } })).rejects.toThrow('prospective plan');
    expect(f.calls).toEqual([0]);
  });
});
