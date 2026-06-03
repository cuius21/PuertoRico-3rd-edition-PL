import type { Action } from './Action';
import { type Result } from '../core/Result';
import { type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
export declare class MayorPassAction implements Action {
    readonly playerId: PlayerId;
    readonly type = "MAYOR_PASS";
    constructor(playerId: PlayerId);
    validate(state: GameState): Result<void, string>;
    execute(state: GameState): void;
}
//# sourceMappingURL=MayorPassAction.d.ts.map