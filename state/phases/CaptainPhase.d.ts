import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
export declare class CaptainPhase implements GamePhase {
    readonly type = PhaseType.Captain;
    private consecutivePasses;
    private storageDone;
    onEnter(state: GameState): void;
    onExit(state: GameState): void;
    getValidActions(state: GameState, playerId: PlayerId): Action[];
    checkTransition(state: GameState): GamePhase | null;
    private canPlayerLoad;
    private buildLoadActions;
    private processStorage;
    private processPlayerStorage;
}
//# sourceMappingURL=CaptainPhase.d.ts.map