import { GameRunner, type PlayerSetup } from '../game/GameRunner';
import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
export interface ActionFeedItem {
    playerName: string;
    actionText: string;
    isBot: boolean;
}
export declare function useGameRunner(setups: PlayerSetup[], savedState?: GameState): {
    runner: GameRunner;
    state: GameState;
    tick: number;
    applyHumanAction: (action: Action) => void;
    roundNotice: string | null;
    actionFeed: ActionFeedItem | null;
    roundLog: ActionFeedItem[];
    isWaitingForBot: boolean;
};
//# sourceMappingURL=useGameRunner.d.ts.map