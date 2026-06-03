import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
export declare class TraderPhase implements GamePhase {
    readonly type = PhaseType.Trader;
    private initialLogLength;
    onEnter(state: GameState): void;
    onExit(_state: GameState): void;
    getValidActions(state: GameState, playerId: PlayerId): Action[];
    checkTransition(state: GameState): GamePhase | null;
}
//# sourceMappingURL=TraderPhase.d.ts.map