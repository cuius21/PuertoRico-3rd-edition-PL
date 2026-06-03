import { GoodType } from '../core/types';
import { Building } from './buildings/Building';
import { Plantation } from './Plantation';
export declare class Supply {
    doubloonsInBank: number;
    victoryPointPool: number;
    workersPool: number;
    workersInMagistrate: number;
    readonly goodsPool: Map<GoodType, number>;
    plantationDecks: Plantation[][];
    revealedPlantations: Plantation[];
    discardedPlantations: Plantation[];
    quarryStack: Plantation[];
    availableBuildings: Building[];
    drawDoubloons(amount: number): number;
    depositDoubloons(amount: number): void;
    drawVictoryPoints(amount: number): number;
    hasVictoryPointsLeft(): boolean;
    drawWorkerFromPool(): boolean;
    returnWorkersToPool(count: number): void;
    drawGoods(good: GoodType, amount: number): number;
    returnGoods(good: GoodType, amount: number): void;
    getGoodsAvailable(good: GoodType): number;
    takeBuilding(buildingId: string): Building | null;
    hasBuildingAvailable(buildingId: string): boolean;
}
//# sourceMappingURL=Supply.d.ts.map