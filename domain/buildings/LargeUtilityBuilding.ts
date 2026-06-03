import { Building } from './Building';
import { BuildingCategory } from '../../core/types';

// Duże budynki użytkowe (tileSize=1): Factory, Uniwersytet, Port, Nabrzeże, Duży Targ, Duży Magazyn.
// VP=2, workerCapacity=1. Różnią się od LargeBuilding (tileSize=2) - te mają normalny rozmiar pola.
export abstract class LargeUtilityBuilding extends Building {
  readonly category = BuildingCategory.LargeUtility;
  readonly tileSize = 1;
  readonly workerCapacity = 1;
  readonly victoryPoints = 2;
}