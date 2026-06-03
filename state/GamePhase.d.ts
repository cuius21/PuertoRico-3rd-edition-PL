import type { GameState } from './GameState';
import type { Action } from '../actions/Action';
import type { PhaseType, PlayerId } from '../core/types';
export interface GamePhase {
    readonly type: PhaseType;
    getValidActions(state: GameState, playerId: PlayerId): Action[];
    onEnter(state: GameState): void;
    onExit(state: GameState): void;
    checkTransition(state: GameState): GamePhase | null;
}
//# sourceMappingURL=GamePhase.d.ts.map