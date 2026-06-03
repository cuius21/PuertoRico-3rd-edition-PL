import type { Action } from './Action';
import { type Result } from '../core/Result';
import { type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
export type PlantationChoice = {
    kind: 'revealed';
    index: number;
} | {
    kind: 'quarry';
};
export declare class TakePlantationAction implements Action {
    readonly playerId: PlayerId;
    readonly choice: PlantationChoice;
    readonly type = "TAKE_PLANTATION";
    constructor(playerId: PlayerId, choice: PlantationChoice);
    validate(state: GameState): Result<void, string>;
    execute(state: GameState): void;
}
//# sourceMappingURL=TakePlantationAction.d.ts.map