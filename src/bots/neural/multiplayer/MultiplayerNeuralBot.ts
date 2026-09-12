import type { Action } from '../../../../actions/Action';
import type { GameState } from '../../../../state/GameState';
import type { PlayerId } from '../../../../core/types';
import type { Bot } from '../../Bot';
import { ChampionBot, type HardcoreOptions } from '../../ChampionBot';
import { HardcoreBot } from '../../HardcoreBot';
import { evaluateHardcoreState } from '../../hardcoreEvaluation';
import { withPolicyReadCache } from '../policyReadCache';
import { supportsNeuralState } from './features';
import { heuristicPolicyProbabilities } from './policyFeatures';
import type { NeuralPolicyNetwork } from './policyNetwork';
import type { NeuralValueNetwork } from './valueNetwork';

const phases = new Set(['roleSelection','builder','trader','settler']);
type Options = Pick<HardcoreOptions,'timeBudgetMs'|'maxIterations'|'random'> & { value?: NeuralValueNetwork; valueWeight?: number };
/** Laboratory adapter. Never selected by the released game factory. */
export class MultiplayerNeuralBot implements Bot {
  readonly name = 'ExperimentalMultiplayerNeural';
  private readonly learned: ChampionBot;
  private readonly fallback: HardcoreBot;
  private active: ChampionBot | HardcoreBot;
  policyCalls = 0;
  valueCalls = 0;
  constructor(model: NeuralPolicyNetwork, options: Options = {}) {
    const {value,valueWeight = 0.25,...search}=options;
    this.learned = new ChampionBot({...search,selectionRule:'ucb',rolloutRounds:2,rolloutExploration:0.08,
      rolloutPolicy:'neural',coordinatedWorkers:false,jointShipping:false,evaluatorWeight:value ? valueWeight : 0,
      evaluator:{evaluate:state=>{this.valueCalls++;return value?.evaluate(state) ?? evaluateHardcoreState(state);},
        policy:(state,pid,actions)=>{
          if(!phases.has(state.getCurrentPhase().type))return heuristicPolicyProbabilities(state,pid,actions);
          this.policyCalls++;
          return withPolicyReadCache(state,()=>model.policyForLegalActions(state,pid,actions));
        }},
    });
    this.fallback = new HardcoreBot(search);
    this.active=this.learned;
  }
  get lastSearchStats(){return this.active.lastSearchStats;}
  chooseAction(state: GameState,pid:PlayerId):Action{
    this.active=supportsNeuralState(state)?this.learned:this.fallback;
    return this.active.chooseAction(state,pid);
  }
}
