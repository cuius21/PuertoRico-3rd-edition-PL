import { Building } from './Building';
import { BuildingCategory, BuildingPriceGroup } from '../../core/types';
import type { GameState } from '../../state/GameState';
import type { Player } from '../Player';
export declare abstract class LargeBuilding extends Building {
    readonly category = BuildingCategory.LargeUtility;
    readonly cost = 10;
    readonly victoryPoints = 4;
    readonly workerCapacity = 1;
    readonly tileSize = 2;
    readonly priceGroup = BuildingPriceGroup.Group4;
    abstract calculateEndGameBonus(state: GameState, player: Player): number;
}
//# sourceMappingURL=LargeBuilding.d.ts.map