import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PhaseType } from '../core/types';
import { MayorSearchBot } from '../src/bots/MayorSearchBot';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { chooseHeuristicAction } from '../src/bots/hardcorePolicy';
import { deserializeGameState, serializeGameState } from '../src/game/GameSerializer';
import { seededRandom, deriveSeed, withRandom } from './arena-core';

type Snapshot = ReturnType<typeof serializeGameState>;
const inputPath = 'work/mayor-search/snapshots-baseline-i24.json';
const outputPath = process.argv[2] ?? 'reports/mayor-search/real-snapshot-qa.json';
if (existsSync(outputPath)) throw new Error('Existing QA report will not be overwritten');
const bytes = readFileSync(inputPath);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const input = JSON.parse(bytes.toString('utf8')) as { snapshots: { state: Snapshot; stateHash: string; round: number; gameIndex: number }[] };
assert.equal(input.snapshots.length, 36);
const rows: Record<string, unknown>[] = [];

function baseline(snapshot: Snapshot) {
  const state = deserializeGameState(snapshot), pid = state.getCurrentPlayer().id;
  let steps = 0;
  while (!state.gameOver && state.getCurrentPhase().type === PhaseType.Mayor && state.getCurrentPlayer().id === pid) {
    assert.ok(steps++ < 60, 'Baseline worker turn exceeded 60 actions');
    assert.ok(state.apply(chooseHeuristicAction(state, pid)).ok);
  }
  return serializeGameState(state).players.find(player => player.id === pid)!;
}

function run(snapshot: Snapshot, index: number, timed: boolean) {
  const state = deserializeGameState(snapshot), pid = state.getCurrentPlayer().id;
  const bot = new MayorSearchBot({ delegate: new HardcoreBot({ timeBudgetMs: 0 }),
    timeBudgetMs: timed ? 650 : Infinity, maxBatches: timed ? 128 : 2, candidateCount: 8,
    rolloutRounds: 2, random: seededRandom(deriveSeed(62091023, index)) });
  const chance = seededRandom(deriveSeed(63091029, index));
  const trace: string[] = [], stats: NonNullable<typeof bot.lastMayorStats>[] = [];
  while (!state.gameOver && state.getCurrentPhase().type === PhaseType.Mayor && state.getCurrentPlayer().id === pid) {
    assert.ok(trace.length < 60, 'Planned worker turn exceeded 60 actions');
    const before = JSON.stringify(serializeGameState(state));
    const originalRandom = Math.random;
    let hostRandomCalls = 0;
    const action = withRandom(() => { hostRandomCalls++; return 0.123; }, () => bot.chooseAction(state, pid));
    assert.equal(Math.random, originalRandom, 'Host random function was replaced');
    assert.equal(hostRandomCalls, 0, 'Search consumed the host chance stream');
    assert.equal(JSON.stringify(serializeGameState(state)), before, 'Search mutated the live state');
    assert.ok(action.validate(state).ok, 'Illegal planned action');
    assert.ok(bot.lastMayorStats, 'Missing Mayor diagnostics');
    assert.equal(bot.lastMayorStats.errors, 0, 'Mayor simulation errors');
    stats.push(structuredClone(bot.lastMayorStats));
    trace.push(JSON.stringify(action));
    assert.ok(withRandom(chance, () => state.apply(action)).ok);
  }
  assert.ok(trace.length > 0);
  const player = serializeGameState(state).players.find(player => player.id === pid)!;
  return { trace, player, stats };
}

for (let index = 0; index < input.snapshots.length; index++) {
  const snapshot = input.snapshots[index]!;
  assert.equal(hash(JSON.stringify(snapshot.state)), snapshot.stateHash, 'Source snapshot changed');
  const first = run(snapshot.state, index, false), second = run(snapshot.state, index, false);
  assert.deepEqual(first.trace, second.trace, 'Fixed search produced different moves');
  assert.deepEqual(first.player, second.player, 'Fixed search produced different staffing');
  const stableStats = (values: typeof first.stats) => values.map(({ elapsedMs: _elapsed, generationMs: _generation, ...rest }) => rest);
  assert.deepEqual(stableStats(first.stats), stableStats(second.stats), 'Fixed search diagnostics differ');
  assert.equal(first.stats.filter(value => !value.cacheHit).length, 1, 'More than one plan computation for a worker turn');
  rows.push({ index, gameIndex: snapshot.gameIndex, round: snapshot.round,
    differentFromBaseline: JSON.stringify(first.player) !== JSON.stringify(baseline(snapshot.state)),
    actions: first.trace.length, first: first.stats[0], cacheHits: first.stats.filter(value => value.cacheHit).length });
}
const timings = [0, 1, 3].map(index => ({ index, ...run(input.snapshots[index]!.state, index, true) }));
const report = { format: 'puerto-rico-mayor-real-snapshot-qa', version: 1, purpose: 'Functional QA, not a strength result',
  evaluatedAt: new Date().toISOString(), inputPath, inputHash: hash(bytes), snapshots: rows,
  changedAllocations: rows.filter(row => row.differentFromBaseline).length, timings,
  checks: { legalActions: true, statePurity: true, hostRngUnconsumed: true,
    deterministicFixedBatches: true, cachedContinuation: true, noSimulationErrors: true } };
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report), { flag: 'wx' });
console.log(JSON.stringify({ outputPath, snapshots: rows.length, changedAllocations: report.changedAllocations,
  checks: report.checks, timings: timings.map(row => ({ index: row.index, first: row.stats[0] })) }, null, 2));
