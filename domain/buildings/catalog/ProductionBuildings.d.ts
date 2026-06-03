import { ProductionBuilding } from '../ProductionBuilding';
import { GoodType, BuildingPriceGroup } from '../../../core/types';
export declare class SmallIndigoPlant extends ProductionBuilding {
    readonly id = "smallIndigoPlant";
    readonly displayName = "Ma\u0142a Farbiarnia";
    readonly displayNameEn = "Small Indigo Plant";
    readonly cost = 1;
    readonly victoryPoints = 1;
    readonly workerCapacity = 1;
    readonly tileSize = 1;
    readonly priceGroup = BuildingPriceGroup.Group1;
    readonly produces = GoodType.Indigo;
}
export declare class LargeIndigoPlant extends ProductionBuilding {
    readonly id = "largeIndigoPlant";
    readonly displayName = "Farbiarnia";
    readonly displayNameEn = "Large Indigo Plant";
    readonly cost = 3;
    readonly victoryPoints = 2;
    readonly workerCapacity = 3;
    readonly tileSize = 1;
    readonly priceGroup = BuildingPriceGroup.Group2;
    readonly produces = GoodType.Indigo;
}
export declare class SmallSugarMill extends ProductionBuilding {
    readonly id = "smallSugarMill";
    readonly displayName = "Ma\u0142a Cukrownia";
    readonly displayNameEn = "Small Sugar Mill";
    readonly cost = 2;
    readonly victoryPoints = 1;
    readonly workerCapacity = 1;
    readonly tileSize = 1;
    readonly priceGroup = BuildingPriceGroup.Group1;
    readonly produces = GoodType.Sugar;
}
export declare class LargeSugarMill extends ProductionBuilding {
    readonly id = "largeSugarMill";
    readonly displayName = "Cukrownia";
    readonly displayNameEn = "Large Sugar Mill";
    readonly cost = 4;
    readonly victoryPoints = 2;
    readonly workerCapacity = 3;
    readonly tileSize = 1;
    readonly priceGroup = BuildingPriceGroup.Group2;
    readonly produces = GoodType.Sugar;
}
export declare class TobaccoStorage extends ProductionBuilding {
    readonly id = "tobaccoStorage";
    readonly displayName = "Sk\u0142ad Tytoniu";
    readonly displayNameEn = "Tobacco Storage";
    readonly cost = 5;
    readonly victoryPoints = 3;
    readonly workerCapacity = 3;
    readonly tileSize = 1;
    readonly priceGroup = BuildingPriceGroup.Group3;
    readonly produces = GoodType.Tobacco;
}
export declare class CoffeeRoaster extends ProductionBuilding {
    readonly id = "coffeeRoaster";
    readonly displayName = "Palnia Kawy";
    readonly displayNameEn = "Coffee Roaster";
    readonly cost = 6;
    readonly victoryPoints = 3;
    readonly workerCapacity = 2;
    readonly tileSize = 1;
    readonly priceGroup = BuildingPriceGroup.Group3;
    readonly produces = GoodType.Coffee;
}
//# sourceMappingURL=ProductionBuildings.d.ts.map