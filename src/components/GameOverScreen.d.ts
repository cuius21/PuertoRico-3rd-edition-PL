import type { GameState } from '../../state/GameState';
import type { GameRunner } from '../game/GameRunner';
interface Props {
    state: GameState;
    runner: GameRunner;
    onReturnToMenu: () => void;
}
export declare function GameOverScreen({ state, runner, onReturnToMenu }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=GameOverScreen.d.ts.map