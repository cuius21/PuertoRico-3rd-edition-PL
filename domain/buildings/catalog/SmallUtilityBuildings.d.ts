import { SmallUtilityBuilding } from '../SmallUtilityBuilding';
import { GoodType, BuildingPriceGroup } from '../../../core/types';
import type { GameState } from '../../../state/GameState';
import type { Player } from '../../Player';
import type { Building } from '../Building';
export declare class SmallMarket extends SmallUtilityBuilding {
    readonly id = "smallMarket";
    readonly displayName = "Ma\u0142y Targ";
    readonly displayNameEn = "Small Market";
    readonly cost = 1;
    readonly victoryPoints = 1;
    readonly priceGroup = BuildingPriceGroup.Group1;
    modifySellPrice(_state: GameState, _player: Player, _good: GoodType, basePrice: number): number;
}
export declare class Smithy extends SmallUtilityBuilding {
    readonly id = "smithy";
    readonly displayName = "Ku\u017Ania";
    readonly displayNameEn = "Smithy";
    readonly cost = 2;
    readonly victoryPoints = 1;
    readonly priceGroup = BuildingPriceGroup.Group1;
}
export declare class Hacienda extends SmallUtilityBuilding {
    readonly id = "hacienda";
    readonly displayName = "Hacienda";
    readonly displayNameEn = "Hacienda";
    readonly cost = 2;
    readonly victoryPoints = 1;
    readonly priceGroup = BuildingPriceGroup.Group1;
    drawsExtraPlantationFromPile(): boolean;
}
export declare class Hospice extends SmallUtilityBuilding {
    readonly id = "hospice";
    readonly displayName = "Przytu\u0142ek";
    readonly displayNameEn = "Hospice";
    readonly cost = 3;
    readonly victoryPoints = 1;
    readonly priceGroup = BuildingPriceGroup.Group2;
    placeColonistOnNewPlantation(): boolean;
}
export declare class SmallWarehouse extends SmallUtilityBuilding {
    readonly id = "smallWarehouse";
    readonly displayName = "Ma\u0142y Magazyn";
    readonly displayNameEn = "Small Warehouse";
    readonly cost = 3;
    readonly victoryPoints = 1;
    readonly priceGroup = BuildingPriceGroup.Group2;
    goodTypesToKeepAfterCaptain(): number;
}
export declare class Office extends SmallUtilityBuilding {
    readonly id = "office";
    readonly displayName = "Biuro Handlowe";
    readonly displayNameEn = "Office";
    readonly cost = 5;
    readonly victoryPoints = 1;
    readonly priceGroup = BuildingPriceGroup.Group3;
    allowsSellingDuplicate(_state: GameState, _player: Player, _good: GoodType): boolean;
}
export declare class LargeMarket extends SmallUtilityBuilding {
    readonly id = "largeMarket";
    readonly displayName = "Du\u017Cy Targ";
    readonly displayNameEn = "Large Market";
    readonly cost = 5;
    readonly victoryPoints = 2;
    readonly priceGroup = BuildingPriceGroup.Group3;
    modifySellPrice(_state: GameState, _player: Player, _good: GoodType, basePrice: number): number;
}
export declare class LargeWarehouse extends SmallUtilityBuilding {
    readonly id = "largeWarehouse";
    readonly displayName = "Du\u017Cy Magazyn";
    readonly displayNameEn = "Large Warehouse";
    readonly cost = 6;
    readonly victoryPoints = 2;
    readonly priceGroup = BuildingPriceGroup.Group3;
    goodTypesToKeepAfterCaptain(): number;
}
export declare class Factory extends SmallUtilityBuilding {
    readonly id = "factory";
    readonly displayName = "Przetw\u00F3rnia";
    readonly displayNameEn = "Factory";
    readonly cost = 7;
    readonly victoryPoints = 2;
    readonly priceGroup = BuildingPriceGroup.Group4;
    factoryBonusDoubloons(distinctGoodsCount: number): number;
}
export declare class University extends SmallUtilityBuilding {
    readonly id = "university";
    readonly displayName = "Uniwersytet";
    readonly displayNameEn = "University";
    readonly cost = 8;
    readonly victoryPoints = 2;
    readonly priceGroup = BuildingPriceGroup.Group4;
    afterBuildCompleted(state: GameState, _player: Player, builtBuilding: Building): void;
}
export declare class Harbour extends SmallUtilityBuilding {
    readonly id = "harbour";
    readonly displayName = "Port";
    readonly displayNameEn = "Harbour";
    readonly cost = 8;
    readonly victoryPoints = 2;
    readonly priceGroup = BuildingPriceGroup.Group4;
    bonusVpOnShipping(_state: GameState, _player: Player, _loadedCount: number): number;
}
export declare class Wharf extends SmallUtilityBuilding {
    readonly id = "wharf";
    readonly displayName = "Nabrze\u017Ce";
    readonly displayNameEn = "Wharf";
    readonly cost = 9;
    readonly victoryPoints = 2;
    readonly priceGroup = BuildingPriceGroup.Group4;
    hasOwnShip(): boolean;
}
//# sourceMappingURL=SmallUtilityBuildings.d.ts.map