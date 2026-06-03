import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import type { PlayerId } from '../../core/types';
import type { Bot } from './Bot';

// Najprostszy bot: losuje jedną z legalnych akcji.
// Służy jako baseline oraz do testowania UI bez działającego AI.
export class RandomBot implements Bot {
  readonly name = 'RandomBot';

  chooseAction(state: GameState, playerId: PlayerId): Action {
    const actions = state.getValidActions(playerId);
    if (actions.length === 0) throw new Error(`RandomBot: no valid actions for ${playerId}`);
    const idx = Math.floor(Math.random() * actions.length);
    return actions[idx]!;
  }
}
