import type { Action } from './Action';
import { type Result } from '../core/Result';
import { type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
export declare class BuildAction implements Action {
    readonly playerId: PlayerId;
    readonly buildingId: string;
    readonly type = "BUILD";
    constructor(playerId: PlayerId, buildingId: string);
    validate(state: GameState): Result<void, string>;
    execute(state: GameState): void;
}
//# sourceMappingURL=BuildAction.d.ts.map