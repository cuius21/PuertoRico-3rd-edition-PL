import type { Bot } from './Bot';
import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import type { GamePhase } from '../../state/GamePhase';
import { PhaseType, type PlayerId } from '../../core/types';
import { HardcoreBot, type HardcoreSearchStats } from './HardcoreBot';
import { chooseHeuristicAction, hardcoreActionKey, scoreHardcoreAction } from './hardcorePolicy';
import { evaluateHardcoreState, terminalUtilities } from './hardcoreEvaluation';
import { cloneGameState, determinizeGameState } from './simulation';
import { serializeGameState } from '../game/GameSerializer';
import { generateMayorPlans, supportsMayorSearchState, type MayorPlan } from './mayorPlans';

export interface MayorSearchOptions {
  delegate?: Bot;
  timeBudgetMs?: number;
  maxBatches?: number;
  random?: () => number;
  candidateCount?: number;
  rolloutRounds?: number;
}
export interface MayorSearchStats {
  planCount: number;
  batches: number;
  rollouts: number;
  discardedRollouts: number;
  terminalRollouts: number;
  elapsedMs: number;
  generationMs: number;
  cacheHit: boolean;
  selectedBaseline: boolean;
  errors: number;
  selectedPlanIndex: number;
  planNames: string[];
  planSignatures: string[];
  planValues: number[];
}
interface CachedStep { before: string; key: string }
interface CachedPlan {
  state: GameState; phase: GamePhase; playerId: PlayerId; steps: CachedStep[];
  index: number; baseline: boolean;
}
function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function fingerprint(state: GameState): string { return JSON.stringify(serializeGameState(state)); }
function emptySearch(): HardcoreSearchStats {
  return { iterations: 0, elapsedMs: 0, maxTreeDepth: 0, terminalRollouts: 0, evaluatorErrors: 0, rootActions: [] };
}
function emptyMayor(): MayorSearchStats {
  return { planCount: 0, batches: 0, rollouts: 0, discardedRollouts: 0, terminalRollouts: 0,
    elapsedMs: 0, generationMs: 0, cacheHit: false, selectedBaseline: true, errors: 0,
    selectedPlanIndex: 0, planNames: [], planSignatures: [], planValues: [] };
}
function withChance<T>(random: () => number, run: () => T): T {
  const previous = Math.random;
  Math.random = random;
  try { return run(); }
  finally { Math.random = previous; }
}
function legalKey(state: GameState, playerId: PlayerId, key: string): Action {
  const action = state.getValidActions(playerId).find(a => hardcoreActionKey(a) === key);
  if (!action || !action.validate(state).ok) throw new Error('Mayor plan no longer matches legal actions');
  return action;
}
function applyPlan(state: GameState, playerId: PlayerId, plan: MayorPlan): void {
  for (const key of plan.actionKeys) {
    if (state.gameOver || state.getCurrentPhase().type !== PhaseType.Mayor || state.getCurrentPlayer().id !== playerId) {
      throw new Error('Mayor plan contains actions after its turn');
    }
    if (!state.apply(legalKey(state, playerId, key)).ok) throw new Error('Mayor plan action failed');
  }
  if (!state.gameOver && state.getCurrentPhase().type === PhaseType.Mayor && state.getCurrentPlayer().id === playerId) {
    throw new Error('Mayor plan leaves its turn incomplete');
  }
}
function rolloutAction(state: GameState, playerId: PlayerId, actions: Action[], random: () => number): Action {
  if (actions.length === 1 || actions.some(a => a.type === 'PLACE_WORKER') || random() > .16) {
    return chooseHeuristicAction(state, playerId, actions);
  }
  const scores = actions.map(a => scoreHardcoreAction(a, state, playerId)), best = Math.max(...scores);
  const weights = scores.map(v => Math.exp(Math.max(-12, (v - best) / 1.8))), total = weights.reduce((a, b) => a + b, 0);
  let draw = random();
  for (let i = 0; i < actions.length; i++) {
    draw -= .95 * weights[i]! / total + .05 / actions.length;
    if (draw <= 0) return actions[i]!;
  }
  return actions[actions.length - 1]!;
}
function finishRollout(state: GameState, targetRound: number, random: () => number): void {
  for (let step = 0; step < 2000 && !state.gameOver; step++) {
    if (state.roundNumber >= targetRound && state.getCurrentPhase().type === PhaseType.RoleSelection) return;
    const pid = state.getCurrentPlayer().id, actions = state.getValidActions(pid);
    if (!actions.length || !state.apply(rolloutAction(state, pid, actions, random)).ok) throw new Error('Mayor evaluation rollout failed');
  }
  if (!state.gameOver && !(state.roundNumber >= targetRound && state.getCurrentPhase().type === PhaseType.RoleSelection)) {
    throw new Error('Mayor evaluation rollout exceeded its safety limit');
  }
}

/** Experimental base-game wrapper; one complete staffing search per player's Mayor turn. */
export class MayorSearchBot implements Bot {
  readonly name = 'MayorSearchBot';
  readonly delegate: Bot;
  readonly timeBudgetMs: number;
  readonly maxBatches: number;
  readonly candidateCount: number;
  readonly rolloutRounds: number;
  private readonly random: () => number;
  private cached: CachedPlan | null = null;
  lastSearchStats: HardcoreSearchStats = emptySearch();
  lastMayorStats: MayorSearchStats | null = null;

  constructor(options: MayorSearchOptions = {}) {
    this.delegate = options.delegate ?? new HardcoreBot();
    this.timeBudgetMs = options.timeBudgetMs ?? 650;
    this.maxBatches = options.maxBatches ?? 1500;
    this.candidateCount = options.candidateCount ?? 10;
    this.rolloutRounds = options.rolloutRounds ?? 2;
    // Planner randomness has its own stream and never draws from the live engine RNG.
    this.random = options.random ?? seeded((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0);
    if (!(this.timeBudgetMs >= 0) || (this.timeBudgetMs !== Infinity && !Number.isFinite(this.timeBudgetMs)) ||
      !Number.isSafeInteger(this.maxBatches) || this.maxBatches < 0 ||
      !Number.isSafeInteger(this.candidateCount) || this.candidateCount < 6 || this.candidateCount > 12 ||
      !Number.isSafeInteger(this.rolloutRounds) || this.rolloutRounds < 1 || this.rolloutRounds > 8) {
      throw new Error('Invalid Mayor search configuration');
    }
  }

  chooseAction(state: GameState, playerId: PlayerId): Action {
    const started = performance.now();
    this.lastMayorStats = null; this.lastSearchStats = emptySearch();
    if (state.getCurrentPhase().type !== PhaseType.Mayor || !supportsMayorSearchState(state)) {
      this.cached = null;
      const action = this.delegate.chooseAction(state, playerId);
      const stats = (this.delegate as Bot & { lastSearchStats?: HardcoreSearchStats }).lastSearchStats;
      if (stats) this.lastSearchStats = { ...stats, rootActions: stats.rootActions.map(row => ({ ...row })) };
      else this.lastSearchStats.elapsedMs = performance.now() - started;
      return action;
    }
    const stats = this.lastMayorStats = emptyMayor();
    try {
      const cachedAction = this.fromCache(state, playerId);
      if (cachedAction) { stats.cacheHit = true; stats.selectedBaseline = this.cached!.baseline; return cachedAction; }
      this.cached = null;
      const player = state.getPlayer(playerId);
      if (!player || state.getCurrentPlayer().id !== playerId) throw new Error('Not this player\'s Mayor turn');
      // A reload or outside action partway through staffing must not reuse an earlier full allocation.
      if (player.island.getTotalEmployedWorkers() > 0) return this.delegate.chooseAction(state, playerId);
      const deadline = started + this.timeBudgetMs;
      const generationStarted = performance.now();
      const plans = withChance(seeded(0), () => generateMayorPlans(state, playerId, this.candidateCount,
        () => performance.now() >= deadline || this.maxBatches === 0));
      stats.generationMs = performance.now() - generationStarted;
      stats.planCount = plans.length; stats.planNames = plans.map(p => p.name); stats.planSignatures = plans.map(p => p.signature);
      const totals = new Array<number>(plans.length).fill(0);
      const mover = state.getPlayerIndex(playerId), targetRound = state.roundNumber + this.rolloutRounds;
      while (plans.length > 1 && stats.batches < this.maxBatches && performance.now() < deadline) {
        const seed = () => {
          const value = this.random();
          if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Mayor random must be in [0, 1)');
          return Math.floor(value * 4294967296);
        };
        const hiddenSeed = seed(), chanceSeed = seed(), policySeed = seed();
        const values: number[] = [];
        let failed = false;
        for (const plan of plans) {
          if (performance.now() >= deadline) break;
          stats.rollouts++;
          try {
            const sim = determinizeGameState(state, seeded(hiddenSeed));
            withChance(seeded(chanceSeed), () => {
              applyPlan(sim, playerId, plan);
              finishRollout(sim, targetRound, seeded(policySeed));
            });
            const utilities = sim.gameOver ? terminalUtilities(sim) : evaluateHardcoreState(sim);
            if (utilities.length !== state.players.length || !utilities.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) {
              throw new Error('Invalid Mayor rollout utility');
            }
            values.push(utilities[mover]!);
            if (sim.gameOver) stats.terminalRollouts++;
          } catch {
            stats.errors++; failed = true; break;
          }
        }
        if (failed || values.length !== plans.length) {
          stats.discardedRollouts += values.length + (failed ? 1 : 0);
          break;
        }
        for (let i = 0; i < values.length; i++) totals[i]! += values[i]!;
        stats.batches++;
      }
      stats.planValues = totals.map(value => stats.batches ? value / stats.batches : 0);
      let selected = 0;
      if (stats.errors === 0) for (let i = 1; i < plans.length; i++) if (totals[i]! > totals[selected]!) selected = i;
      stats.selectedPlanIndex = selected; stats.selectedBaseline = plans[selected]!.baseline;
      this.remember(state, playerId, plans[selected]!);
      return legalKey(state, playerId, plans[selected]!.actionKeys[0]!);
    } catch {
      stats.errors++;
      this.cached = null;
      return chooseHeuristicAction(state, playerId);
    } finally {
      stats.elapsedMs = performance.now() - started;
      this.lastSearchStats = { ...emptySearch(), elapsedMs: stats.elapsedMs, evaluatorErrors: stats.errors };
    }
  }

  private fromCache(state: GameState, playerId: PlayerId): Action | null {
    const cache = this.cached;
    if (!cache || cache.state !== state || cache.phase !== state.getCurrentPhase() || cache.playerId !== playerId) return null;
    const current = fingerprint(state);
    for (const index of [cache.index, cache.index + 1]) {
      const step = cache.steps[index];
      if (step?.before !== current) continue;
      const action = state.getValidActions(playerId).find(a => hardcoreActionKey(a) === step.key);
      if (!action || !action.validate(state).ok) return null;
      cache.index = index;
      return action;
    }
    return null;
  }

  private remember(state: GameState, playerId: PlayerId, plan: MayorPlan): void {
    const sim = cloneGameState(state), steps: CachedStep[] = [];
    withChance(seeded(0), () => {
      for (const key of plan.actionKeys) {
        steps.push({ before: fingerprint(sim), key });
        if (!sim.apply(legalKey(sim, playerId, key)).ok) throw new Error('Cannot cache Mayor action');
      }
    });
    this.cached = { state, phase: state.getCurrentPhase(), playerId, steps, index: 0, baseline: plan.baseline };
  }
}
