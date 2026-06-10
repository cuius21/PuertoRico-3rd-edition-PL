import { Building } from './Building';
import { BuildingCategory } from '../../core/types';

// Małe budynki użytkowe: 1 pole na planszy miejskiej, 1 slot na robotnika,
// PZ w zakresie 1-3 (zależnie od grupy cenowej).
export abstract class SmallUtilityBuilding extends Building {
  readonly category = BuildingCategory.SmallUtility;
  readonly tileSize: 1 = 1;
  readonly workerCapacity: number = 1;
}
