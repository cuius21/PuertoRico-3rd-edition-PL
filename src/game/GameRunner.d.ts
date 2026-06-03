import { GameState } from '../../state/GameState';
import type { Action } from '../../actions/Action';
import type { Bot } from '../bots/Bot';
import type { PlayerId } from '../../core/types';
export type PlayerSetup = {
    type: 'human';
    name: string;
} | {
    type: 'bot';
    name: string;
    bot: Bot;
};
export interface GameEvent {
    playerName: string;
    actionText: string;
    isBot: boolean;
}
export declare class GameRunner {
    readonly state: GameState;
    readonly playerSetups: readonly PlayerSetup[];
    readonly log: GameEvent[];
    constructor(playerSetups: PlayerSetup[], existingState?: GameState);
    getSetup(index: number): PlayerSetup;
    getCurrentSetup(): PlayerSetup;
    isCurrentPlayerHuman(): boolean;
    isGameOver(): boolean;
    getBotAction(): Action | null;
    applyAction(action: Action, label: string): boolean;
    currentPlayerId(): PlayerId;
    getValidActionsForCurrentPlayer(): Action[];
}
//# sourceMappingURL=GameRunner.d.ts.map