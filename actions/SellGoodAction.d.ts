import type { Action } from './Action';
import { type Result } from '../core/Result';
import { GoodType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
export declare class SellGoodAction implements Action {
    readonly playerId: PlayerId;
    readonly good: GoodType;
    readonly type = "SELL_GOOD";
    constructor(playerId: PlayerId, good: GoodType);
    validate(state: GameState): Result<void, string>;
    execute(state: GameState): void;
}
//# sourceMappingURL=SellGoodAction.d.ts.map