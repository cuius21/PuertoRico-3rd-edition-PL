import { describe, expect, it } from 'vitest';
import { GreedyBot } from '../../src/bots/GreedyBot';
import { PassAction } from '../../actions/PassAction';
import { parseArenaArgs } from '../../tools/arena-cli';
import { policiesForGame, runGame, seededRandom, summarizeArena, wilsonInterval, withRandom, type ArenaOptions, type GameRecord } from '../../tools/arena-core';

const options: ArenaOptions = {
  games: 6, players: 3, seed: 17, budgetMs: 1, iterations: 8, maxMoves: 5000,
  candidate: 'hardcore', opponents: 'greedy',
  expansions: { festival: false, corsair: false, newBuildings: false, nobleBuildings: false },
};
const greedyFactory = () => new GreedyBot();

describe('arena random streams', () => {
  it('replays seeded streams and restores Math.random after nested calls and errors', () => {
    const first = seededRandom(777);
    const second = seededRandom(777);
    expect(Array.from({ length: 20 }, first)).toEqual(Array.from({ length: 20 }, second));
    const original = Math.random;
    withRandom(() => 0.25, () => {
      expect(Math.random()).toBe(0.25);
      withRandom(() => 0.75, () => expect(Math.random()).toBe(0.75));
      expect(Math.random()).toBe(0.25);
    });
    expect(() => withRandom(() => 0, () => { throw new Error('test'); })).toThrow('test');
    expect(Math.random).toBe(original);
  });

  it('rejects asynchronous scopes before leaking the replacement RNG', () => {
    const original = Math.random;
    expect(() => withRandom(() => 0, () => Promise.resolve(3))).toThrow('synchronous');
    expect(Math.random).toBe(original);
  });

  it('bot random draws do not change actual game chance or full move traces', () => {
    const first = runGame(options, 0, greedyFactory);
    const second = runGame(options, 0, () => {
      const greedy = new GreedyBot();
      return {
        name: 'noisy greedy',
        chooseAction(state, playerId) {
          for (let i = 0; i < 53; i++) Math.random();
          return greedy.chooseAction(state, playerId);
        },
      };
    });
    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    expect(second.traceHash).toBe(first.traceHash);
    expect(second.moves).toBe(first.moves);
    expect(second.scores).toEqual(first.scores);
  });
});

describe('arena scheduling and game outcomes', () => {
  it('rotates exactly one candidate through matching environment seeds', () => {
    const records = Array.from({ length: 6 }, (_, index) => runGame({ ...options, maxMoves: 1 }, index, greedyFactory));
    expect(records.map(record => record.candidateSeat)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(new Set(records.slice(0, 3).map(record => record.environmentSeed)).size).toBe(1);
    expect(records[0]!.environmentSeed).not.toBe(records[3]!.environmentSeed);
    for (const record of records) {
      expect(record.policies.filter(policy => policy === 'hardcore')).toHaveLength(1);
      expect(record.policies[record.candidateSeat]).toBe('hardcore');
    }
    expect(policiesForGame({ ...options, players: 5, opponents: 'mixed' }, 2))
      .toEqual(['hardcore', 'greedy', 'hardcore', 'greedy', 'mcts']);
  });

  it('does not score a truncated game or count it as a loss', () => {
    const record = runGame({ ...options, maxMoves: 1 }, 0, greedyFactory);
    expect(record.status).toBe('incomplete');
    expect(record.scores).toEqual([]);
    expect(record.candidateWinCredit).toBeNull();
    expect(record.candidateScoreMargin).toBeNull();
    const summary = summarizeArena(options, [record]);
    expect(summary.overall.completed).toBe(0);
    expect(summary.overall.incomplete).toBe(1);
    expect(summary.overall.winRate).toBeNull();
    expect(summary.overall.meanScoreMargin).toBeNull();
  });

  it('records a rejected action as invalid with enough context to reproduce it', () => {
    const record = runGame(options, 0, () => ({
      name: 'invalid', chooseAction: () => new PassAction('unknown-player'),
    }));
    expect(record.status).toBe('invalid');
    expect(record.failure?.stage).toBe('apply-action');
    expect(record.failure?.playerIndex).toBe(0);
    expect(record.moves).toBe(0);
    expect(record.scores).toEqual([]);
    expect(summarizeArena(options, [record]).overall.invalid).toBe(1);
  });

  it('emits decision and completion hooks and scores full games', () => {
    let decisions = 0;
    let completed: GameRecord | undefined;
    const record = runGame(options, 1, greedyFactory, {
      onDecision(event) {
        expect(event.action.playerId).toBe(event.state.players[event.playerIndex]!.id);
        expect(event.gameIndex).toBe(1);
        expect(event.move).toBe(decisions++);
      },
      onComplete(event) { completed = event.record; },
    });
    expect(record.status).toBe('completed');
    expect(completed).toBe(record);
    expect(decisions).toBe(record.moves);
    expect(record.scores).toHaveLength(3);
    expect(record.winCredits.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(record.decisionCounts.reduce((sum, value) => sum + value, 0)).toBe(record.moves);
  });

  it('separates fractional tied wins from Bernoulli outright-win intervals', () => {
    const actual = runGame(options, 0, greedyFactory);
    const records: GameRecord[] = [
      { ...actual, candidateSeat: 0, environmentSeed: 1, candidateWinCredit: 0.5, candidateScoreMargin: 0 },
      { ...actual, candidateSeat: 0, environmentSeed: 2, candidateWinCredit: 1, candidateScoreMargin: 2 },
      { ...actual, candidateSeat: 1, environmentSeed: 1, status: 'incomplete', scores: [], candidateWinCredit: null, candidateScoreMargin: null },
    ];
    const summary = summarizeArena(options, records);
    expect(summary.overall.winRate).toBe(0.75);
    expect(summary.overall.sharedWins).toBe(1);
    expect(summary.overall.outrightWins).toBe(1);
    expect(summary.overall.meanScoreMargin).toBe(1);
    expect(summary.overall.outrightWinWilson95).toBeNull();
    expect(summary.perSeat[0]!.outrightWinWilson95).toEqual(wilsonInterval(1, 2));
    expect(summary.overall.winRateSeedBootstrap95).toEqual([0.5, 1]);
  });

  it('labels wall-clock MCTS as non-reproducible under fixed Hardcore iterations', () => {
    const record = runGame({ ...options, opponents: 'mcts', maxMoves: 1 }, 0, greedyFactory);
    expect(summarizeArena(options, [record]).reproducible).toBe(false);
    const greedyRecord = runGame({ ...options, maxMoves: 1 }, 0, greedyFactory);
    expect(summarizeArena(options, [greedyRecord]).reproducible).toBe(true);
  });
});

describe('arena CLI validation', () => {
  it('parses all budgets and explicitly selects expansion rules', () => {
    const parsed = parseArenaArgs(['--games', '20', '--players', '5', '--seed', '0', '--budget-ms', '2.5', '--iterations', '10',
      '--opponents', 'mixed', '--expansions', 'festival,nobles', '--max-moves', '9', '--output', 'report.json', '--quiet']);
    expect(parsed.options).toEqual({
      games: 20, players: 5, seed: 0, budgetMs: 2.5, iterations: 10, maxMoves: 9,
      candidate: 'hardcore', opponents: 'mixed',
      expansions: { festival: true, corsair: false, newBuildings: false, nobleBuildings: true },
    });
    expect(parsed.output).toBe('report.json');
    expect(parsed.quiet).toBe(true);
  });

  it.each([
    ['--games', '0'], ['--players', '2'], ['--iterations', '-1'], ['--seed', '4294967296'],
    ['--budget-ms', 'Infinity'], ['--wat', '1'], ['--opponents', 'random'], ['--games'],
    ['--games', '3', '--games', '6'], ['--expansions', 'unknown'],
  ])('rejects malformed arguments %s %s', (...args) => {
    expect(() => parseArenaArgs(args)).toThrow();
  });

  it('accepts zero iterations for heuristic ablation and omits degenerate bootstrap intervals', () => {
    expect(parseArenaArgs(['--iterations', '0']).options.iterations).toBe(0);
    const actual = runGame(options, 0, greedyFactory);
    const summary = summarizeArena(options, [
      { ...actual, environmentSeed: 1, candidateWinCredit: 1 },
      { ...actual, environmentSeed: 2, candidateWinCredit: 1 },
    ]);
    expect(summary.overall.winRateSeedBootstrap95).toBeNull();
  });

  it('has base rules and no fixed iteration cap by default', () => {
    const parsed = parseArenaArgs([]);
    expect(Object.values(parsed.options.expansions).every(value => value === false)).toBe(true);
    expect(parsed.options.iterations).toBeUndefined();
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});
