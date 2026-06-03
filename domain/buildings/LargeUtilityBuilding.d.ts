import { Building } from './Building';
import { BuildingCategory } from '../../core/types';
export declare abstract class LargeUtilityBuilding extends Building {
    readonly category = BuildingCategory.LargeUtility;
    readonly tileSize = 1;
    readonly workerCapacity = 1;
    readonly victoryPoints = 2;
}
//# sourceMappingURL=LargeUtilityBuilding.d.ts.map