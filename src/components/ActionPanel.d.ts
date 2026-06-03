import type { GameState } from '../../state/GameState';
import type { GameRunner, PlayerSetup } from '../game/GameRunner';
import type { Action } from '../../actions/Action';
interface Props {
    runner: GameRunner;
    state: GameState;
    currentSetup: PlayerSetup;
    onAction: (action: Action) => void;
    isWaitingForBot: boolean;
}
export declare function ActionPanel({ runner, state, currentSetup, onAction, isWaitingForBot }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=ActionPanel.d.ts.map