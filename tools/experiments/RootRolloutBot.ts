import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GameState } from '../../state/GameState';
import type { Bot } from '../../src/bots/Bot';
import type { HardcoreSearchStats } from '../../src/bots/ChampionBot';
import { chooseHeuristicAction, hardcoreActionKey } from '../../src/bots/hardcorePolicy';
import { evaluateHardcoreState, terminalUtilities } from '../../src/bots/hardcoreEvaluation';
import { determinizeGameState } from '../../src/bots/simulation';
import { heuristicPolicyProbabilities } from '../../src/bots/neural/policyFeatures';
import { seededRandom, withRandom } from '../arena-core';

type Policy = (state: GameState, player: PlayerId, actions: readonly Action[]) => readonly number[];
interface Options {
  random: () => number;
  maxIterations: number;
  timeBudgetMs: number;
  policy?: Policy;
  exploration?: number;
}
const unique = (actions: Action[]) => [...new Map(actions.map(a => [hardcoreActionKey(a), a])).values()];

/** Research only: one branching decision followed by two rounds of policy rollouts. */
export class RootRolloutBot implements Bot {
  readonly name = 'ExperimentalRootRollout';
  lastSearchStats: HardcoreSearchStats = this.emptyStats();
  completedBlocks = 0;
  private emptyStats(): HardcoreSearchStats {
    return { iterations: 0, elapsedMs: 0, maxTreeDepth: 0, terminalRollouts: 0, evaluatorErrors: 0, rootActions: [] };
  }
  constructor(private readonly options: Options) {
    if (!Number.isSafeInteger(options.maxIterations) || options.maxIterations < 0 ||
      !(options.timeBudgetMs >= 0) || !Number.isFinite(options.exploration ?? 0.08) ||
      (options.exploration ?? 0.08) < 0 || (options.exploration ?? 0.08) > 1) throw new Error('Invalid root rollout options');
  }
  chooseAction(state: GameState, playerId: PlayerId): Action {
    const started = performance.now();
    this.lastSearchStats = this.emptyStats();
    this.completedBlocks = 0;
    const actions = unique(state.getValidActions(playerId));
    if (!actions.length) throw new Error('No legal root action');
    const fallback = chooseHeuristicAction(state, playerId, actions);
    if (actions.length === 1 || actions.some(a => a.type === 'PLACE_WORKER') ||
      this.options.maxIterations < actions.length || this.options.timeBudgetMs === 0) return fallback;
    const totals = actions.map(() => 0);
    const mover = state.getPlayerIndex(playerId);
    const targetRound = state.roundNumber + 2;
    while (this.lastSearchStats.iterations + actions.length <= this.options.maxIterations &&
      performance.now() - started < this.options.timeBudgetMs) {
      const seed = Math.floor(this.options.random() * 4294967296) >>> 0;
      const values: number[] = [];
      // A complete block gives every alternative the same chance seed and sample count.
      // Partial blocks consume time but do not bias the result toward earlier actions.
      for (const action of actions) {
        if (performance.now() - started >= this.options.timeBudgetMs) break;
        const random = seededRandom(seed);
        const value = withRandom(random, () => {
          const sim = determinizeGameState(state, random);
          if (!sim.apply(action).ok) throw new Error('Root action failed on a determinization');
          this.rollout(sim, targetRound, random);
          if (sim.gameOver) this.lastSearchStats.terminalRollouts++;
          return (sim.gameOver ? terminalUtilities(sim) : evaluateHardcoreState(sim))[mover]!;
        });
        values.push(value);
        this.lastSearchStats.iterations++;
      }
      if (values.length !== actions.length) break;
      values.forEach((value, i) => { totals[i]! += value; });
      this.completedBlocks++;
    }
    let selected = actions.indexOf(fallback);
    if (this.completedBlocks) {
      for (let i = 0; i < totals.length; i++) if (totals[i]! > totals[selected]! + 1e-12) selected = i;
    }
    this.lastSearchStats.rootActions = actions.map((a, i) => ({ key: hardcoreActionKey(a),
      visits: this.completedBlocks, value: this.completedBlocks ? totals[i]! / this.completedBlocks : 0 }));
    this.lastSearchStats.maxTreeDepth = this.completedBlocks ? 1 : 0;
    this.lastSearchStats.elapsedMs = performance.now() - started;
    return actions[selected]!;
  }
  private rollout(state: GameState, targetRound: number, random: () => number): void {
    for (let step = 0; step < 2500 && !state.gameOver; step++) {
      if (state.roundNumber >= targetRound && state.getCurrentPhase().type === PhaseType.RoleSelection) return;
      const pid = state.getCurrentPlayer().id;
      const actions = unique(state.getValidActions(pid));
      if (!actions.length) throw new Error('Non-terminal rollout has no actions');
      let selected = chooseHeuristicAction(state, pid, actions);
      if (actions.length > 1 && !actions.some(a => a.type === 'PLACE_WORKER')) {
        const explore = random() < (this.options.exploration ?? 0.08);
        if (this.options.policy || explore) {
          const probabilities = this.options.policy?.(state, pid, actions) ?? heuristicPolicyProbabilities(state, pid, actions);
          if (probabilities.length !== actions.length || probabilities.some(p => !Number.isFinite(p) || p < 0)) {
            this.lastSearchStats.evaluatorErrors++;
            throw new Error('Invalid rollout policy');
          }
          const sum = probabilities.reduce((s, p) => s + p, 0);
          if (!(sum > 0)) throw new Error('Empty policy distribution');
          const priors = probabilities.map(p => 0.95 * p / sum + 0.05 / actions.length);
          let index = 0;
          if (explore) {
            let draw = random();
            index = actions.length - 1;
            for (let i = 0; i < priors.length; i++) { draw -= priors[i]!; if (draw <= 0) { index = i; break; } }
          } else for (let i = 1; i < priors.length; i++) if (priors[i]! > priors[index]!) index = i;
          selected = actions[index]!;
        }
      }
      if (!state.apply(selected).ok) throw new Error('Invalid rollout action');
    }
    if (!state.gameOver) throw new Error('Root rollout exceeded its safety bound');
  }
}
