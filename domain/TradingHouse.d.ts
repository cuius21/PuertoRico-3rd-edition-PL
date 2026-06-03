import { GoodType } from '../core/types';
export declare class TradingHouse {
    private readonly slots;
    isFull(): boolean;
    containsGood(good: GoodType): boolean;
    occupiedCount(): number;
    canSellStandard(good: GoodType): boolean;
    addGood(good: GoodType): void;
    clear(): GoodType[];
    getSlots(): readonly (GoodType | null)[];
}
//# sourceMappingURL=TradingHouse.d.ts.map