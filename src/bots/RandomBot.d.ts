import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import type { PlayerId } from '../../core/types';
import type { Bot } from './Bot';
export declare class RandomBot implements Bot {
    readonly name = "RandomBot";
    chooseAction(state: GameState, playerId: PlayerId): Action;
}
//# sourceMappingURL=RandomBot.d.ts.map