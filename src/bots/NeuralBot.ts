import type { Bot } from './Bot';
import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import type { PlayerId } from '../../core/types';
import { ChampionBot, type HardcoreOptions, type HardcoreSearchStats } from './ChampionBot';
import { HardcoreBot } from './HardcoreBot';
import { evaluateHardcoreState } from './hardcoreEvaluation';
import { heuristicPolicyProbabilities } from './neural/policyFeatures';
import { supportsNeuralState } from './neural/features';
import type { NeuralPolicyNetwork } from './neural/policyNetwork';
import { withPolicyReadCache } from './neural/policyReadCache';

type NeuralBotOptions = Pick<HardcoreOptions, 'timeBudgetMs' | 'maxIterations' | 'random'> & {
  /** Enable only for a separately validated cached search variant. Defaults to false. */
  cachePolicy?: boolean;
};
const LEARNED_PHASES: ReadonlySet<string> = new Set(['roleSelection', 'builder', 'trader', 'settler']);

/** Runtime adapter; the release factory must supply a separately validated model. */
export class NeuralBot implements Bot {
  readonly name = 'NeuralBot';
  private readonly learned: ChampionBot;
  private readonly fallback: HardcoreBot;
  private active: ChampionBot | HardcoreBot;

  constructor(model: NeuralPolicyNetwork, options: NeuralBotOptions = {}) {
    const { cachePolicy = false, ...searchOptions } = options;
    this.learned = new ChampionBot({ ...searchOptions, selectionRule: 'ucb', rolloutRounds: 2,
      rolloutExploration: 0.08, rolloutPolicy: 'neural', evaluatorWeight: 0,
      coordinatedWorkers: false, jointShipping: false,
      evaluator: { evaluate: evaluateHardcoreState,
        policy: (state, playerId, actions) => {
          if (!LEARNED_PHASES.has(state.getCurrentPhase().type)) return heuristicPolicyProbabilities(state, playerId, actions);
          return cachePolicy
            ? withPolicyReadCache(state, () => model.policyForLegalActions(state, playerId, actions))
            : model.policyForLegalActions(state, playerId, actions);
        } },
    });
    this.fallback = new HardcoreBot(searchOptions);
    this.active = this.learned;
  }

  get lastSearchStats(): HardcoreSearchStats { return this.active.lastSearchStats; }

  chooseAction(state: GameState, playerId: PlayerId): Action {
    // Model input describes three players and base buildings; preserve full Hardcore elsewhere.
    this.active = supportsNeuralState(state) ? this.learned : this.fallback;
    return this.active.chooseAction(state, playerId);
  }
}
