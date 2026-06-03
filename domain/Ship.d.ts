import { GoodType } from '../core/types';
export declare class Ship {
    readonly capacity: number;
    loadedGood: GoodType | null;
    loadedCount: number;
    constructor(capacity: number);
    isEmpty(): boolean;
    isFull(): boolean;
    remainingCapacity(): number;
    canAccept(good: GoodType): boolean;
    unload(): void;
}
//# sourceMappingURL=Ship.d.ts.map