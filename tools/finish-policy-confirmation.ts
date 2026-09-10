import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { deriveSeed, type ArenaOptions, type GameRecord } from './arena-core';
import { pairedComparison } from './neural-lab';
import { searchLabMain } from './search-lab';

const MODEL_HASH = '7a6a25ed347f1c54cadf4d1e7baef5aa82270e575af9a6f9a0725a2abeff1241';
const VARIANT = 'neuralSelectiveRollout';
const SETTINGS = { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.08,
  rolloutPolicy: 'neural', neural: ['roleSelection', 'builder', 'trader', 'settler'] };
const SEEDS = [37090943, 39090953] as const;
interface GateReport {
  config: { options: ArenaOptions; variants: Record<string, unknown> };
  workers: number; maximumIterations: number; classification: string; modelHash: string;
  sourceHashes: Record<string, string>;
  summaries: Record<string, { games: GameRecord[] }>;
  searchSummary?: Record<string, { candidate: {
    evaluatorErrors: number; neuralPolicyAttempts: number; neuralEvaluations: number;
  } }>;
}
function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function read<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T; }
function hash(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

function validateSeries(report: GateReport, seed: number): void {
  const options = report.config.options;
  invariant(options.games === 90 && options.players === 3 && options.budgetMs === 650 &&
    options.iterations === undefined && options.seed === seed && options.candidate === 'hardcore' &&
    options.opponents === 'hardcore' && Object.values(options.expansions).every(value => value === false) &&
    report.workers === 4 && report.maximumIterations === 1500 &&
    report.classification === 'production-confirmation', 'Gate does not match the closed production plan');
  invariant(report.modelHash === MODEL_HASH, 'Unexpected model hash');
  invariant(JSON.stringify(report.config.variants) === JSON.stringify({ [VARIANT]: SETTINGS }), 'Changed candidate settings');
  invariant(Object.keys(report.sourceHashes).length === 13, 'Incomplete source fingerprint');
  for (const name of ['control', VARIANT]) {
    const games = report.summaries[name]?.games;
    invariant(games?.length === 90, 'Incomplete gate arm');
    invariant(new Set(games.map(game => game.gameIndex)).size === 90, 'Duplicate game index');
    for (const game of games) {
      invariant(Number.isInteger(game.gameIndex) && game.gameIndex >= 0 && game.gameIndex < 90 &&
        game.status === 'completed' && game.candidateSeat === game.gameIndex % 3 &&
        game.environmentSeed === deriveSeed(seed, Math.floor(game.gameIndex / 3)), 'Invalid game identity or status');
      invariant(game.winCredits.length === 3 && game.winCredits.every(credit => Number.isFinite(credit) && credit >= 0 && credit <= 1) &&
        Math.abs(game.winCredits.reduce((sum, value) => sum + value, 0) - 1) < 1e-12 &&
        game.candidateWinCredit === game.winCredits[game.candidateSeat] && Number.isFinite(game.candidateScoreMargin),
      'Invalid victory or score record');
    }
  }
}

function armSummary(games: GameRecord[]) {
  return { games: games.length, outrightWins: games.filter(game => game.candidateWinCredit === 1).length,
    sharedWins: games.filter(game => game.candidateWinCredit! > 0 && game.candidateWinCredit! < 1).length,
    winCredit: games.reduce((sum, game) => sum + game.candidateWinCredit!, 0),
    meanScoreMargin: games.reduce((sum, game) => sum + game.candidateScoreMargin!, 0) / games.length };
}

export function combinePolicyConfirmation(first: GateReport, second: GateReport, trainingSeeds: readonly number[]) {
  validateSeries(first, SEEDS[0]);
  validateSeries(second, SEEDS[1]);
  invariant(Object.entries(first.sourceHashes).every(([file, value]) => second.sourceHashes[file] === value), 'Candidate or baseline sources changed');
  const firstSeeds = new Set(first.summaries.control!.games.map(game => game.environmentSeed));
  const secondSeeds = new Set(second.summaries.control!.games.map(game => game.environmentSeed));
  invariant(firstSeeds.size === 30 && secondSeeds.size === 30 && [...secondSeeds].every(seed => !firstSeeds.has(seed)), 'Overlapping or incomplete environments');
  invariant(trainingSeeds.every(seed => !firstSeeds.has(seed) && !secondSeeds.has(seed)), 'Gate overlaps training or validation');
  const joined = (arm: string) => [...first.summaries[arm]!.games,
    ...second.summaries[arm]!.games.map(game => ({ ...game, gameIndex: game.gameIndex + 90 }))];
  const candidate = joined(VARIANT), control = joined('control');
  const perSeries = [first, second].map((report, i) => ({ seed: SEEDS[i]!,
    candidate: armSummary(report.summaries[VARIANT]!.games), control: armSummary(report.summaries.control!.games),
    comparison: pairedComparison(report.summaries[VARIANT]!.games, report.summaries.control!.games, SEEDS[i]!) }));
  const comparison = pairedComparison(candidate, control, 41090961);
  const inference = second.searchSummary?.[VARIANT]?.candidate;
  const checks = {
    completeLegalGames: true,
    positiveInBothSeries: perSeries.every(series => series.comparison.winRateDifference > 0),
    combinedLower95AboveZero: comparison.winRateDifference95 !== null && comparison.winRateDifference95[0]! > 0,
    noEvaluatorErrors: inference?.evaluatorErrors === 0,
    activeNeuralInference: Number.isSafeInteger(inference?.neuralEvaluations) && inference!.neuralEvaluations > 0 &&
      inference!.neuralEvaluations === inference!.neuralPolicyAttempts,
  };
  return { format: 'puerto-rico-closed-policy-confirmation', version: 1, modelHash: MODEL_HASH,
    sourceHashes: first.sourceHashes, sourceSeeds: [...SEEDS], scope: 'base game, three players, candidate versus two frozen Hardcore',
    budget: { timeBudgetMs: 650, maximumIterations: 1500, workers: 4, softWallClockLimit: true },
    perSeries, candidate: armSummary(candidate), control: armSummary(control), comparison,
    perSeat: [0, 1, 2].map(seat => ({ seat, candidate: armSummary(candidate.filter(game => game.candidateSeat === seat)),
      control: armSummary(control.filter(game => game.candidateSeat === seat)),
      comparison: pairedComparison(candidate.filter(game => game.candidateSeat === seat), control.filter(game => game.candidateSeat === seat), 41090961 + seat) })),
    inference, checks, strengthGatePassed: Object.values(checks).every(Boolean),
    deployment: 'Requires browser integration, release builds and deployment verification; no automatic promotion',
  };
}

export async function finishPolicyConfirmationMain(): Promise<void> {
  const firstPath = resolve('reports/neural-policy/policy-expanded-confirm-650ms.json');
  const secondPath = resolve('reports/neural-policy/policy-expanded-replication-650ms.json');
  const output = resolve('reports/neural-policy/policy-expanded-production-result.json');
  const lock = output + '.running';
  const modelPath = resolve('work/neural-policy/policy-focused-expanded.json');
  writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
  try {
    if (!existsSync(firstPath)) console.log(JSON.stringify({ waitingFor: firstPath, nextSeed: SEEDS[1] }));
    const deadline = Date.now() + 3 * 60 * 60 * 1000;
    while (!existsSync(firstPath)) {
      invariant(Date.now() < deadline, 'First series did not finish within three hours; inspect its existing handle');
      await delay(30_000);
    }
    const first = read<GateReport>(firstPath);
    validateSeries(first, SEEDS[0]);
    invariant(hash(modelPath) === MODEL_HASH, 'Frozen model changed on disk');
    for (const [file, expected] of Object.entries(first.sourceHashes)) {
      invariant(hash(resolve('src/bots', file)) === expected, 'Frozen source changed on disk: ' + file);
    }
    if (!existsSync(secondPath)) {
      invariant(!existsSync(secondPath + '.plan.json'), 'Replication already started; inspect its existing handle instead of restarting');
      console.log(JSON.stringify({ startingReplication: secondPath, seed: SEEDS[1], independentOfFirstResult: true }));
      await searchLabMain(['--variants', VARIANT, '--policy-model', modelPath, '--games', '90', '--budget-ms', '650',
        '--workers', '4', '--seed', String(SEEDS[1]), '--stage', 'production-confirmation', '--output', secondPath]);
    }
    const model = read<{ metadata: { trainingGameSeeds: number[]; validationGameSeeds: number[] } }>(modelPath);
    const result = combinePolicyConfirmation(first, read<GateReport>(secondPath),
      [...model.metadata.trainingGameSeeds, ...model.metadata.validationGameSeeds]);
    writeFileSync(output + '.tmp', JSON.stringify({ ...result, evaluatedAt: new Date().toISOString(),
      reportHashes: [hash(firstPath), hash(secondPath)], planHash: hash('reports/neural-policy/policy-expanded-production-plan.md') }));
    renameSync(output + '.tmp', output);
    console.log(JSON.stringify({ output, checks: result.checks, strengthGatePassed: result.strengthGatePassed,
      candidate: result.candidate, control: result.control, comparison: result.comparison }));
  } finally { unlinkSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await finishPolicyConfirmationMain();
