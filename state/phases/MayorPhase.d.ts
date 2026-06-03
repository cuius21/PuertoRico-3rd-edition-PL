import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
export declare class MayorPhase implements GamePhase {
    readonly type = PhaseType.Mayor;
    onEnter(state: GameState): void;
    onExit(_state: GameState): void;
    getValidActions(state: GameState, playerId: PlayerId): Action[];
    checkTransition(state: GameState): GamePhase | null;
    private refillMagistrate;
}
//# sourceMappingURL=MayorPhase.d.ts.map