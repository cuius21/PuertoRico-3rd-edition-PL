import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
export declare class RoundEndPhase implements GamePhase {
    readonly type = PhaseType.RoundEnd;
    onEnter(state: GameState): void;
    onExit(_state: GameState): void;
    getValidActions(_state: GameState, _playerId: PlayerId): Action[];
    checkTransition(state: GameState): GamePhase | null;
}
//# sourceMappingURL=RoundEndPhase.d.ts.map