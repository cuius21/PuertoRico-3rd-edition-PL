import { describe, expect, it } from 'vitest';
import { combinePolicyConfirmation } from '../../tools/finish-policy-confirmation';
import { deriveSeed, type GameRecord } from '../../tools/arena-core';
type Report = Parameters<typeof combinePolicyConfirmation>[0];

function series(seed: number): Report {
  const games = (candidate: boolean): GameRecord[] => Array.from({ length: 90 }, (_, gameIndex) => {
    const candidateSeat = gameIndex % 3, group = Math.floor(gameIndex / 3);
    const won = candidate && candidateSeat < (group % 2 === 0 ? 2 : 1);
    const credits = [0, 0, 0];
    credits[won ? candidateSeat : (candidateSeat + 1) % 3] = 1;
    return { gameIndex, candidateSeat, environmentSeed: deriveSeed(seed, group), policies: ['hardcore', 'hardcore', 'hardcore'],
      status: 'completed', moves: 100, rounds: 10, elapsedMs: 1, decisionMs: [1, 1, 1], decisionCounts: [1, 1, 1],
      traceHash: 'test-fixture', reason: '', scores: [], winCredits: credits, candidateWinCredit: Number(won),
      candidateScoreMargin: won ? 1 : -1 };
  });
  return { config: { options: { games: 90, players: 3, seed, budgetMs: 650, maxMoves: 5000,
    candidate: 'hardcore', opponents: 'hardcore', expansions: { festival: false, corsair: false, newBuildings: false, nobleBuildings: false } },
    variants: { neuralSelectiveRollout: { selectionRule: 'ucb', rolloutRounds: 2, rolloutExploration: 0.08,
      rolloutPolicy: 'neural', neural: ['roleSelection', 'builder', 'trader', 'settler'] } } },
    workers: 4, maximumIterations: 1500, classification: 'production-confirmation',
    modelHash: '7a6a25ed347f1c54cadf4d1e7baef5aa82270e575af9a6f9a0725a2abeff1241',
    sourceHashes: Object.fromEntries(Array.from({ length: 13 }, (_, i) => ['source' + i, 'a'.repeat(64)])),
    summaries: { control: { games: games(false) }, neuralSelectiveRollout: { games: games(true) } },
    searchSummary: { neuralSelectiveRollout: { candidate: { evaluatorErrors: 0, neuralEvaluations: 100, neuralPolicyAttempts: 100 } } },
  };
}

describe('closed two-series production confirmation', () => {
  it('combines independent environments without overwriting repeated game indices and verifies the fixed gate', () => {
    const a = series(37090943), b = series(39090953), before = JSON.stringify([a, b]);
    const result = combinePolicyConfirmation(a, b, [123]);
    expect(result.candidate.games).toBe(180);
    expect(result.control.games).toBe(180);
    expect(result.comparison.pairedGames).toBe(180);
    expect(result.comparison.independentSeeds).toBe(60);
    expect(result.candidate.winCredit).toBe(90);
    expect(result.control.winCredit).toBe(0);
    expect(result.strengthGatePassed).toBe(true);
    expect(result.perSeat.map(seat => seat.candidate.games)).toEqual([60, 60, 60]);
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it('rejects changed models, source code, budgets, partial games and training leakage', () => {
    const reject = (change: (report: Report) => void) => {
      const b = series(39090953); change(b);
      expect(() => combinePolicyConfirmation(series(37090943), b, [])).toThrow();
    };
    reject(b => { b.modelHash = 'b'.repeat(64); });
    reject(b => { b.sourceHashes.source0 = 'b'.repeat(64); });
    reject(b => { b.config.options.budgetMs = 100; });
    reject(b => { b.config.options.iterations = 24; });
    reject(b => { b.summaries.control!.games.pop(); });
    reject(b => { b.summaries.control!.games[0]!.status = 'incomplete'; });
    reject(b => { b.summaries.control!.games[0]!.winCredits = [1, 1, 0]; });
    expect(() => combinePolicyConfirmation(series(37090943), series(39090953), [deriveSeed(37090943, 0)]))
      .toThrow('overlaps training');
  });

  it('fails the strength gate when the second series has no advantage, even if the pooled result is positive', () => {
    const b = series(39090953);
    b.summaries.neuralSelectiveRollout!.games = structuredClone(b.summaries.control!.games);
    const result = combinePolicyConfirmation(series(37090943), b, []);
    expect(result.comparison.winRateDifference).toBeGreaterThan(0);
    expect(result.checks.positiveInBothSeries).toBe(false);
    expect(result.strengthGatePassed).toBe(false);
  });

  it('requires observed inference and no evaluator errors instead of trusting legal fallback wins', () => {
    const b = series(39090953);
    b.searchSummary!.neuralSelectiveRollout!.candidate.evaluatorErrors = 1;
    expect(combinePolicyConfirmation(series(37090943), b, []).strengthGatePassed).toBe(false);
    b.searchSummary!.neuralSelectiveRollout!.candidate.evaluatorErrors = 0;
    b.searchSummary!.neuralSelectiveRollout!.candidate.neuralEvaluations = 0;
    expect(combinePolicyConfirmation(series(37090943), b, []).strengthGatePassed).toBe(false);
    delete b.searchSummary;
    expect(combinePolicyConfirmation(series(37090943), b, []).strengthGatePassed).toBe(false);
  });
});
