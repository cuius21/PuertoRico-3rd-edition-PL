import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import type { PlayerId } from '../../core/types';
export interface Bot {
    readonly name: string;
    chooseAction(state: GameState, playerId: PlayerId): Action;
}
//# sourceMappingURL=Bot.d.ts.map