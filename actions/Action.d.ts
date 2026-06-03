import type { GameState } from '../state/GameState';
import type { Result } from '../core/Result';
import type { PlayerId } from '../core/types';
export interface Action {
    readonly type: string;
    readonly playerId: PlayerId;
    validate(state: GameState): Result<void, string>;
    execute(state: GameState): void;
}
//# sourceMappingURL=Action.d.ts.map