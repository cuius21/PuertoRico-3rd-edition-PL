import type { Action } from './Action';
import { type Result } from '../core/Result';
import { GoodType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
export type ShipTarget = {
    kind: 'ship';
    shipIndex: number;
} | {
    kind: 'wharf';
};
export declare class LoadShipAction implements Action {
    readonly playerId: PlayerId;
    readonly target: ShipTarget;
    readonly good: GoodType;
    readonly type = "LOAD_SHIP";
    constructor(playerId: PlayerId, target: ShipTarget, good: GoodType);
    validate(state: GameState): Result<void, string>;
    execute(state: GameState): void;
}
//# sourceMappingURL=LoadShipAction.d.ts.map