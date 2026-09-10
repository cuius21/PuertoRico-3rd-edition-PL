import { GameFactory } from '../state/GameFactory';
import type { GameState } from '../state/GameState';
import { RoleSelectionPhase } from '../state/phases/RoleSelectionPhase';
import { ScoreCalculator, type PlayerScore } from '../state/ScoreCalculator';
import type { Bot } from '../src/bots/Bot';
import type { Action } from '../actions/Action';

export type PolicyName = 'greedy' | 'mcts' | 'hardcore';
export type OpponentMode = PolicyName | 'mixed';
export type ExpansionOptions = NonNullable<Parameters<typeof GameFactory.create>[3]>;
export interface ArenaOptions {
  games: number;
  players: 3 | 4 | 5;
  seed: number;
  budgetMs: number;
  iterations?: number;
  maxMoves: number;
  candidate: PolicyName;
  opponents: OpponentMode;
  expansions: ExpansionOptions;
}
export interface GameRecord {
  gameIndex: number;
  environmentSeed: number;
  candidateSeat: number;
  policies: PolicyName[];
  status: 'completed' | 'incomplete' | 'invalid';
  moves: number;
  rounds: number;
  elapsedMs: number;
  decisionMs: number[];
  decisionCounts: number[];
  traceHash: string;
  reason: string;
  failure?: { stage: string; playerIndex: number; phase: string; action?: unknown };
  scores: PlayerScore[];
  winCredits: number[];
  candidateWinCredit: number | null;
  candidateScoreMargin: number | null;
}
export interface ArenaHooks {
  onDecision?: (event: { state: GameState; action: Action; gameIndex: number; move: number; playerIndex: number; policy: PolicyName }) => void;
  onComplete?: (event: { state: GameState; record: GameRecord }) => void;
}
export type BotFactory = (policy: PolicyName, random: () => number, seat: number, candidate: boolean) => Bot;

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
export function deriveSeed(seed: number, stream: number): number {
  let value = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

// The engine's setup and reshuffles use Math.random. Synchronous scoping keeps
// bot search consumption separate from the actual game's chance stream.
export function withRandom<T>(random: () => number, operation: () => T): T {
  const previous = Math.random;
  Math.random = random;
  try {
    const result = operation();
    if (result && typeof (result as { then?: unknown }).then === 'function') {
      throw new Error('withRandom only accepts synchronous operations');
    }
    return result;
  } finally {
    Math.random = previous;
  }
}
function updateHash(hash: number, value: string): number {
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}
export function policiesForGame(options: ArenaOptions, candidateSeat: number): PolicyName[] {
  const mixed: PolicyName[] = ['greedy', 'mcts', 'hardcore'];
  const policies = new Array<PolicyName>(options.players);
  policies[candidateSeat] = options.candidate;
  for (let offset = 1; offset < options.players; offset++) {
    policies[(candidateSeat + offset) % options.players] = options.opponents === 'mixed'
      ? mixed[(offset - 1) % mixed.length]!
      : options.opponents;
  }
  return policies;
}
export function runGame(options: ArenaOptions, gameIndex: number, createBot: BotFactory, hooks: ArenaHooks = {}): GameRecord {
  const start = performance.now();
  const candidateSeat = gameIndex % options.players;
  const environmentSeed = deriveSeed(options.seed, Math.floor(gameIndex / options.players));
  const chanceRandom = seededRandom(environmentSeed);
  const policies = policiesForGame(options, candidateSeat);
  const state = withRandom(chanceRandom, () => GameFactory.create(
    options.players,
    policies.map((policy, seat) => (seat === candidateSeat ? 'candidate' : 'opponent') + '-' + policy + '-' + seat),
    new RoleSelectionPhase(), options.expansions,
  ));
  const decisionRandoms = policies.map((_, seat) => seededRandom(deriveSeed(environmentSeed, 100 + (seat - candidateSeat + options.players) % options.players)));
  const bots = policies.map((policy, seat) => withRandom(decisionRandoms[seat]!, () => createBot(policy, decisionRandoms[seat]!, seat, seat === candidateSeat)));
  const decisionMs = policies.map(() => 0);
  const decisionCounts = policies.map(() => 0);
  let moves = 0;
  let traceHash = 2166136261;
  let status: GameRecord['status'] = 'incomplete';
  let reason = 'Move limit ' + options.maxMoves + ' reached before game over';
  let failure: GameRecord['failure'];

  while (!state.gameOver && moves < options.maxMoves) {
    const playerIndex = state.currentPlayerIndex;
    const playerId = state.getCurrentPlayer().id;
    let stage = 'legal-actions';
    let action: Action | undefined;
    try {
      if (state.getValidActions(playerId).length === 0) throw new Error('Non-terminal state has no legal actions');
      stage = 'choose-action';
      const decisionStart = performance.now();
      try {
        action = withRandom(decisionRandoms[playerIndex]!, () => bots[playerIndex]!.chooseAction(state, playerId));
      } finally {
        decisionMs[playerIndex]! += performance.now() - decisionStart;
        decisionCounts[playerIndex]!++;
      }
      stage = 'apply-action';
      const validation = action.validate(state);
      if (!validation.ok) throw new Error(validation.error);
      hooks.onDecision?.({ state, action, gameIndex, move: moves, playerIndex, policy: policies[playerIndex]! });
      traceHash = updateHash(traceHash, JSON.stringify(action));
      const result = withRandom(chanceRandom, () => state.apply(action!));
      if (!result.ok) throw new Error(result.error);
      moves++;
    } catch (error) {
      status = 'invalid';
      reason = error instanceof Error ? error.message : String(error);
      failure = { stage, playerIndex, phase: state.getCurrentPhase().type, ...(action ? { action } : {}) };
      break;
    }
  }
  if (state.gameOver && status !== 'invalid') {
    status = 'completed';
    reason = state.gameOverReason;
  }
  const scores = status === 'completed' ? ScoreCalculator.calculate(state) : [];
  const winners = scores.filter(score => score.rank === 1);
  const winCredits = state.players.map(player => winners.some(score => score.playerId === player.id) ? 1 / winners.length : 0);
  const candidateScore = scores.find(score => score.playerId === state.players[candidateSeat]!.id);
  const opponentBest = scores.length ? Math.max(...scores.filter(score => score.playerId !== state.players[candidateSeat]!.id).map(score => score.total)) : null;
  traceHash = updateHash(traceHash, JSON.stringify(scores));
  const record: GameRecord = {
    gameIndex, environmentSeed, candidateSeat, policies, status, moves, rounds: state.roundNumber,
    elapsedMs: performance.now() - start, decisionMs, decisionCounts,
    traceHash: traceHash.toString(16).padStart(8, '0'), reason,
    ...(failure ? { failure } : {}), scores, winCredits,
    candidateWinCredit: status === 'completed' ? winCredits[candidateSeat]! : null,
    candidateScoreMargin: candidateScore && opponentBest !== null ? candidateScore.total - opponentBest : null,
  };
  hooks.onComplete?.({ state, record });
  return record;
}
export function wilsonInterval(successes: number, trials: number): [number, number] | null {
  if (!trials) return null;
  const z = 1.959963984540054;
  const p = successes / trials;
  const scale = 1 + z * z / trials;
  const center = (p + z * z / (2 * trials)) / scale;
  const radius = z * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / scale;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
function summarizeGames(records: GameRecord[], independentSeeds: boolean) {
  const finished = records.filter(record => record.status === 'completed');
  const outrightWins = finished.filter(record => record.candidateWinCredit === 1).length;
  const sharedWins = finished.filter(record => record.candidateWinCredit! > 0 && record.candidateWinCredit! < 1).length;
  const winCredit = finished.reduce((sum, record) => sum + record.candidateWinCredit!, 0);
  return {
    scheduled: records.length, completed: finished.length,
    incomplete: records.filter(record => record.status === 'incomplete').length,
    invalid: records.filter(record => record.status === 'invalid').length,
    outrightWins, sharedWins, winCredit,
    winRate: finished.length ? winCredit / finished.length : null,
    outrightWinWilson95: independentSeeds ? wilsonInterval(outrightWins, finished.length) : null,
    meanScoreMargin: finished.length ? finished.reduce((sum, record) => sum + record.candidateScoreMargin!, 0) / finished.length : null,
    elapsedMs: records.reduce((sum, record) => sum + record.elapsedMs, 0),
  };
}

// Seat rotations within one environment seed are correlated; resample whole
// seed groups instead of treating each rotation as an independent trial.
function clusteredWinInterval(records: GameRecord[], seed: number): [number, number] | null {
  const groups = new Map<number, number[]>();
  for (const record of records) {
    if (record.status !== 'completed') continue;
    const values = groups.get(record.environmentSeed) ?? [];
    values.push(record.candidateWinCredit!);
    groups.set(record.environmentSeed, values);
  }
  const samples = [...groups.values()];
  if (samples.length < 2) return null;
  const means = samples.map(group => group.reduce((sum, value) => sum + value, 0) / group.length);
  if (means.every(value => value === means[0])) return null;
  const random = seededRandom(deriveSeed(seed, 999));
  const rates: number[] = [];
  for (let i = 0; i < 2000; i++) {
    let total = 0;
    let count = 0;
    for (let j = 0; j < samples.length; j++) {
      const group = samples[Math.floor(random() * samples.length)]!;
      total += group.reduce((sum, value) => sum + value, 0);
      count += group.length;
    }
    rates.push(total / count);
  }
  rates.sort((a, b) => a - b);
  return [rates[Math.floor(rates.length * 0.025)]!, rates[Math.ceil(rates.length * 0.975) - 1]!];
}
export function summarizeArena(options: ArenaOptions, records: GameRecord[]) {
  const policies = new Set(records.flatMap(record => record.policies));
  const fixedIterations = options.iterations !== undefined;
  const reproducible = !policies.has('mcts') && (!policies.has('hardcore') || fixedIterations);
  return {
    schemaVersion: 1, config: options,
    searchBudgets: {
      greedy: { type: 'heuristic' },
      mcts: { type: 'wall_clock', budgetMs: options.budgetMs },
      hardcore: fixedIterations
        ? { type: 'fixed_iterations', iterations: options.iterations }
        : { type: 'wall_clock', budgetMs: options.budgetMs },
    },
    reproducible,
    notes: [
      'The candidate rotates once through all seats for each environment seed. --games is the total number of games.',
      'Setup/chance and each bot have independent seeded streams. Wall-clock search is not bitwise reproducible.',
      'Only completed games contribute to wins and margins. Tied first places split one win equally.',
      'Winners and tiebreakers follow the current engine ScoreCalculator.',
      'Per-seat Wilson intervals measure outright wins. Overall fractional-credit interval bootstraps environment seeds (2000 resamples). Small samples are exploratory; degenerate bootstrap intervals are omitted.',
      ...(fixedIterations && policies.has('mcts') ? ['Hardcore has a fixed iteration budget; MCTS has a wall-clock budget. This is not an equal-compute comparison.'] : []),
    ],
    balancedSeats: records.length % options.players === 0,
    environmentSeeds: new Set(records.map(record => record.environmentSeed)).size,
    overall: { ...summarizeGames(records, false), winRateSeedBootstrap95: clusteredWinInterval(records, options.seed) },
    perSeat: Array.from({ length: options.players }, (_, seat) => ({ seat, ...summarizeGames(records.filter(record => record.candidateSeat === seat), true) })),
    games: records,
  };
}
