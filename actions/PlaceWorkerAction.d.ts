import type { Action } from './Action';
import { type Result } from '../core/Result';
import { type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
export type WorkerTarget = {
    kind: 'plantation';
    slotIndex: number;
} | {
    kind: 'building';
    buildingId: string;
};
export declare class PlaceWorkerAction implements Action {
    readonly playerId: PlayerId;
    readonly target: WorkerTarget;
    readonly type = "PLACE_WORKER";
    constructor(playerId: PlayerId, target: WorkerTarget);
    validate(state: GameState): Result<void, string>;
    execute(state: GameState): void;
}
//# sourceMappingURL=PlaceWorkerAction.d.ts.map