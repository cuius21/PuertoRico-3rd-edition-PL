import { Building } from './Building';
import { BuildingCategory, GoodType } from '../../core/types';
export declare abstract class ProductionBuilding extends Building {
    abstract readonly produces: GoodType;
    readonly category = BuildingCategory.Production;
}
//# sourceMappingURL=ProductionBuilding.d.ts.map