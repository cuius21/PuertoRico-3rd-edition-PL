import type { PlayerSetup } from '../game/GameRunner';
import type { GameState } from '../../state/GameState';
interface Props {
    setups: PlayerSetup[];
    savedState?: GameState;
    onReturnToMenu: () => void;
}
export declare function GameScreen({ setups, savedState, onReturnToMenu }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=GameScreen.d.ts.map