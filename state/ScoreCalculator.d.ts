import type { GameState } from './GameState';
import type { PlayerId } from '../core/types';
export interface PlayerScore {
    playerId: PlayerId;
    playerName: string;
    vpTokens: number;
    buildingVP: number;
    largeBuildingBonus: number;
    total: number;
    doubloons: number;
    goods: number;
    rank: number;
}
export declare class ScoreCalculator {
    static calculate(state: GameState): PlayerScore[];
    static getWinners(state: GameState): PlayerScore[];
    static printSummary(state: GameState): void;
}
//# sourceMappingURL=ScoreCalculator.d.ts.map