import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import { type PlayerId } from '../../core/types';
import type { Bot } from './Bot';
export declare class GreedyBot implements Bot {
    readonly name = "GreedyBot";
    chooseAction(state: GameState, playerId: PlayerId): Action;
    private score;
    private scoreRole;
    private scorePlantation;
    private valuePlantation;
    private scoreBuilding;
    private bestAffordable;
    private scorePlaceWorker;
    private scoreLoad;
    private plantNeed;
}
//# sourceMappingURL=GreedyBot.d.ts.map