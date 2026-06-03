import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
export declare class GameOverPhase implements GamePhase {
    readonly type = PhaseType.GameOver;
    onEnter(_state: GameState): void;
    onExit(_state: GameState): void;
    getValidActions(_state: GameState, _playerId: PlayerId): Action[];
    checkTransition(_state: GameState): GamePhase | null;
}
//# sourceMappingURL=GameOverPhase.d.ts.map