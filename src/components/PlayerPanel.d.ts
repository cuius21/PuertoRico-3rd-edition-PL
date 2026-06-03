import type { Player } from '../../domain/Player';
import type { PlayerSetup } from '../game/GameRunner';
interface Props {
    player: Player;
    setup: PlayerSetup;
    isActive: boolean;
    isGovernor: boolean;
    isSelector: boolean;
}
export declare function PlayerPanel({ player, setup, isActive, isGovernor, isSelector }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=PlayerPanel.d.ts.map