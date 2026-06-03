import type { Action } from './Action';
import { type Result } from '../core/Result';
import { type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
export declare class TakeDoubloonAction implements Action {
    readonly playerId: PlayerId;
    readonly type = "TAKE_DOUBLOON";
    constructor(playerId: PlayerId);
    validate(state: GameState): Result<void, string>;
    execute(state: GameState): void;
}
//# sourceMappingURL=TakeDoubloonAction.d.ts.map