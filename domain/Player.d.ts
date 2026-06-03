import { GoodType, type PlayerId } from '../core/types';
import { Island } from './Island';
export declare class Player {
    readonly id: PlayerId;
    readonly name: string;
    readonly island: Island;
    doubloons: number;
    victoryPointTokens: number;
    readonly storedGoods: Map<GoodType, number>;
    pendingWorkers: number;
    hasUsedCaptainBonusThisPhase: boolean;
    hasUsedWharfThisPhase: boolean;
    constructor(id: PlayerId, name: string, island?: Island);
    getTotalStoredGoods(): number;
    getStoredGoodCount(good: GoodType): number;
    addStoredGoods(good: GoodType, count: number): void;
    removeStoredGoods(good: GoodType, count: number): void;
    resetCaptainPhaseFlags(): void;
}
//# sourceMappingURL=Player.d.ts.map