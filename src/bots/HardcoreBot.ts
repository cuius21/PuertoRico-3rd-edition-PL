import type { Bot } from './Bot';
import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import { PhaseType, type PlayerId } from '../../core/types';
import { determinizeGameState } from './simulation';
import { evaluateHardcoreState, terminalUtilities } from './hardcoreEvaluation';
import { chooseHeuristicAction, hardcoreActionKey, scoreHardcoreAction } from './hardcorePolicy';

export { chooseHeuristicAction } from './hardcorePolicy';
export { evaluateHardcoreState } from './hardcoreEvaluation';

export interface HardcoreEvaluator {
  /** Utilities in player order; terminal results always override this estimate. */
  evaluate(state: GameState): readonly number[];
  /** Optional nonnegative policy weights in the supplied legal-action order. */
  policy?(state: GameState, playerId: PlayerId, actions: readonly Action[]): readonly number[];
}
export interface HardcoreOptions {
  timeBudgetMs?: number;
  maxIterations?: number;
  random?: () => number;
  rolloutRounds?: number;
  evaluator?: HardcoreEvaluator;
  evaluatorWeight?: number;
}
export interface HardcoreSearchStats {
  iterations: number;
  elapsedMs: number;
  maxTreeDepth: number;
  terminalRollouts: number;
  evaluatorErrors: number;
  rootActions: { key: string; visits: number; value: number }[];
}
interface Node {
  visits: number;
  totals: number[];
  children: Map<string, Node>;
}
function node(players: number): Node {
  return { visits: 0, totals: new Array<number>(players).fill(0), children: new Map() };
}
function informationKey(state: GameState): string {
  // Different public draws branch separately; the concealed deck order never keys a node.
  return `${state.getCurrentPhase().type}:${state.currentPlayerIndex}:${state.supply.revealedPlantations.map(p => p.type).join(',')}`;
}

export class HardcoreBot implements Bot {
  readonly name = 'HardcoreBot';
  readonly timeBudgetMs: number;
  readonly maxIterations: number;
  private readonly random: () => number;
  private readonly rolloutRounds: number;
  private readonly evaluator: HardcoreEvaluator | undefined;
  private readonly evaluatorWeight: number;
  private valueEvaluatorFailed = false;
  private policyEvaluatorFailed = false;
  lastSearchStats: HardcoreSearchStats = { iterations: 0, elapsedMs: 0, maxTreeDepth: 0, terminalRollouts: 0, evaluatorErrors: 0, rootActions: [] };

  constructor(options: HardcoreOptions = {}) {
    this.timeBudgetMs = Math.max(0, options.timeBudgetMs !== undefined && !Number.isNaN(options.timeBudgetMs) ? options.timeBudgetMs : 650);
    this.maxIterations = Math.max(0, Math.floor(Number.isFinite(options.maxIterations) ? options.maxIterations! : 1500));
    this.random = options.random ?? Math.random;
    this.rolloutRounds = Math.max(1, Math.min(8, Math.floor(Number.isFinite(options.rolloutRounds) ? options.rolloutRounds! : 2)));
    this.evaluator = options.evaluator;
    this.evaluatorWeight = Math.max(0, Math.min(1, Number.isFinite(options.evaluatorWeight) ? options.evaluatorWeight! : 0.25));
  }

  chooseAction(state: GameState, playerId: PlayerId): Action {
    const previousRandom = Math.random;
    // Engine discard reshuffles are synchronous; restore the host RNG even on errors.
    Math.random = this.random;
    try { return this.search(state, playerId); }
    finally { Math.random = previousRandom; }
  }

  private search(state: GameState, playerId: PlayerId): Action {
    const actions = state.getValidActions(playerId);
    if (actions.length === 0) throw new Error('HardcoreBot: no valid actions');
    const started = performance.now();
    this.lastSearchStats = { iterations: 0, elapsedMs: 0, maxTreeDepth: 0, terminalRollouts: 0, evaluatorErrors: 0, rootActions: [] };
    this.valueEvaluatorFailed = false;
    this.policyEvaluatorFailed = false;
    const fallback = chooseHeuristicAction(state, playerId, actions);
    if (actions.length === 1 || actions.some(a => a.type === 'PLACE_WORKER') ||
      this.maxIterations === 0 || this.timeBudgetMs === 0) return fallback;
    const root = node(state.players.length);
    const playerIndex = state.getPlayerIndex(playerId);
    const deadline = started + this.timeBudgetMs;
    const rootKeys = actions.map(hardcoreActionKey);
    const rootPrior = this.priors(state, playerId, actions);
    const targetRound = state.roundNumber + this.rolloutRounds;
    while (this.lastSearchStats.iterations < this.maxIterations && performance.now() < deadline) {
      const sim = determinizeGameState(state, this.random);
      const path = [root];
      let current = root;
      let depth = 0;
      let steps = 0;
      while (!sim.gameOver && steps++ < 1800) {
        if (depth > 0 && sim.roundNumber >= targetRound && sim.getCurrentPhase().type === PhaseType.RoleSelection) break;
        const pid = sim.getCurrentPlayer().id;
        const legal = depth === 0 ? actions : sim.getValidActions(pid);
        if (legal.length === 0) break;
        if (depth > 0 && (legal.length === 1 || legal.some(a => a.type === 'PLACE_WORKER'))) {
          if (!sim.apply(chooseHeuristicAction(sim, pid, legal)).ok) break;
          continue;
        }
        const keys = depth === 0 ? rootKeys : legal.map(a => `${informationKey(sim)}:${hardcoreActionKey(a)}`);
        const priors = depth === 0 ? rootPrior : this.priors(sim, pid, legal);
        const mover = sim.getPlayerIndex(pid);
        let selected = 0;
        let best = -Infinity;
        for (let i = 0; i < legal.length; i++) {
          const child = current.children.get(keys[i]!);
          const value = !child ? 100 + priors[i]! : child.totals[mover]! / Math.max(1, child.visits) +
            0.42 * Math.sqrt(Math.log(current.visits + 1) / Math.max(1, child.visits)) +
            0.22 * priors[i]! * Math.sqrt(current.visits + 1) / (child.visits + 1);
          if (value > best) { best = value; selected = i; }
        }
        const key = keys[selected]!;
        const expanded = !current.children.has(key);
        let child = current.children.get(key);
        if (!child) { child = node(state.players.length); current.children.set(key, child); }
        if (!sim.apply(legal[selected]!).ok) break;
        current = child;
        path.push(current);
        depth++;
        if (expanded || depth >= 80) break;
      }
      this.rollout(sim, targetRound);
      const values = this.evaluate(sim);
      for (const visited of path) {
        visited.visits++;
        for (let p = 0; p < values.length; p++) visited.totals[p]! += values[p]!;
      }
      this.lastSearchStats.iterations++;
      this.lastSearchStats.maxTreeDepth = Math.max(this.lastSearchStats.maxTreeDepth, depth);
      if (sim.gameOver) this.lastSearchStats.terminalRollouts++;
    }
    let selected = actions.indexOf(fallback);
    let bestVisits = -1;
    let bestValue = -Infinity;
    this.lastSearchStats.rootActions = rootKeys.map((key, i) => {
      const child = root.children.get(key);
      const visits = child?.visits ?? 0;
      const value = visits > 0 ? child!.totals[playerIndex]! / visits : 0;
      if (visits > bestVisits || (visits === bestVisits && value > bestValue)) {
        bestVisits = visits; bestValue = value; selected = i;
      }
      return { key, visits, value };
    });
    this.lastSearchStats.elapsedMs = performance.now() - started;
    return this.lastSearchStats.iterations === 0 ? fallback : actions[selected]!;
  }

  private priors(state: GameState, pid: PlayerId, actions: readonly Action[]): number[] {
    let learned: readonly number[] | undefined;
    if (!this.policyEvaluatorFailed) {
      try { learned = this.evaluator?.policy?.(state, pid, actions); }
      catch { this.policyEvaluatorFailed = true; this.lastSearchStats.evaluatorErrors++; }
    }
    if (learned && learned.length === actions.length && learned.every(v => Number.isFinite(v) && v >= 0)) {
      const sum = learned.reduce((a, b) => a + b, 0);
      if (sum > 0) return learned.map(v => 0.95 * v / sum + 0.05 / actions.length);
    }
    const scores = actions.map(a => scoreHardcoreAction(a, state, pid));
    const best = Math.max(...scores);
    const weights = scores.map(v => Math.exp(Math.max(-12, (v - best) / 1.8)));
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(v => 0.95 * v / sum + 0.05 / actions.length);
  }

  private rollout(state: GameState, targetRound: number): void {
    for (let step = 0; step < 2000 && !state.gameOver; step++) {
      if (state.roundNumber >= targetRound && state.getCurrentPhase().type === PhaseType.RoleSelection) return;
      const pid = state.getCurrentPlayer().id;
      const actions = state.getValidActions(pid);
      if (actions.length === 0) return;
      let action: Action;
      if (actions.length === 1 || actions.some(a => a.type === 'PLACE_WORKER') || this.random() > 0.16) {
        action = chooseHeuristicAction(state, pid, actions);
      } else {
        const priors = this.priors(state, pid, actions);
        let sample = this.random();
        let selected = actions.length - 1;
        for (let i = 0; i < actions.length; i++) {
          sample -= priors[i]!;
          if (sample <= 0) { selected = i; break; }
        }
        action = actions[selected]!;
      }
      if (!state.apply(action).ok) return;
    }
    // A pathological long game still completes staffing before economic evaluation.
    for (let i = 0; i < 500 && !state.gameOver && state.getCurrentPhase().type === PhaseType.Mayor; i++) {
      const pid = state.getCurrentPlayer().id;
      const actions = state.getValidActions(pid);
      if (actions.length === 0 || !state.apply(chooseHeuristicAction(state, pid, actions)).ok) break;
    }
  }

  private evaluate(state: GameState): number[] {
    if (state.gameOver) return terminalUtilities(state);
    const base = evaluateHardcoreState(state);
    let learned: readonly number[] | undefined;
    if (!this.valueEvaluatorFailed) {
      try { learned = this.evaluator?.evaluate(state); }
      catch { this.valueEvaluatorFailed = true; this.lastSearchStats.evaluatorErrors++; }
    }
    if (!learned || learned.length !== base.length || !learned.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) return base;
    return base.map((value, i) => value * (1 - this.evaluatorWeight) + learned[i]! * this.evaluatorWeight);
  }
}