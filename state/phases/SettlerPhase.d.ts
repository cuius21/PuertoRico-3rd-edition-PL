import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
export declare class SettlerPhase implements GamePhase {
    readonly type = PhaseType.Settler;
    private initialLogLength;
    onEnter(state: GameState): void;
    onExit(_state: GameState): void;
    getValidActions(state: GameState, playerId: PlayerId): Action[];
    checkTransition(state: GameState): GamePhase | null;
}
//# sourceMappingURL=SettlerPhase.d.ts.map