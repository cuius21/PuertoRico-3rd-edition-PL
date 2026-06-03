import { BuildingCategory, BuildingPriceGroup, GoodType } from '../../core/types';
import type { Player } from '../Player';
import type { GameState } from '../../state/GameState';
export interface BuildingEffects {
    modifyBuildCost?(state: GameState, player: Player, building: Building, baseCost: number): number;
    onProduce?(state: GameState, player: Player, produced: Map<GoodType, number>): void;
    modifySellPrice?(state: GameState, player: Player, good: GoodType, basePrice: number): number;
    allowsSellingDuplicate?(state: GameState, player: Player, good: GoodType): boolean;
    bonusVpOnShipping?(state: GameState, player: Player, loadedCount: number): number;
    drawsExtraPlantationFromPile?(): boolean;
    placeColonistOnNewPlantation?(): boolean;
    afterBuildCompleted?(state: GameState, player: Player, builtBuilding: Building): void;
    factoryBonusDoubloons?(distinctGoodsCount: number): number;
    hasOwnShip?(): boolean;
    goodTypesToKeepAfterCaptain?(): number;
    calculateEndGameBonus?(state: GameState, player: Player): number;
}
export interface Building extends BuildingEffects {
}
export declare abstract class Building {
    abstract readonly id: string;
    abstract readonly displayName: string;
    abstract readonly displayNameEn: string;
    abstract readonly cost: number;
    abstract readonly victoryPoints: number;
    abstract readonly workerCapacity: number;
    abstract readonly tileSize: 1 | 2;
    abstract readonly category: BuildingCategory;
    abstract readonly priceGroup: BuildingPriceGroup;
    occupiedWorkers: number;
    isActive(): boolean;
    hasFreeWorkerSlot(): boolean;
}
//# sourceMappingURL=Building.d.ts.map