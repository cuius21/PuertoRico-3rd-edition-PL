import { SmallUtilityBuilding } from '../SmallUtilityBuilding';
import { GoodType, BuildingCategory, BuildingPriceGroup } from '../../../core/types';
import type { GameState } from '../../../state/GameState';
import type { Player } from '../../Player';
import type { Building } from '../Building';

// --- Małe budynki użytkowe (tileSize=1, workerCapacity=1) ---

export class SmallMarket extends SmallUtilityBuilding {
  readonly id = 'smallMarket';
  readonly displayName = 'Mały Targ';
  readonly displayNameEn = 'Small Market';
  readonly cost = 1;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group1;

  modifySellPrice(_state: GameState, _player: Player, _good: GoodType, basePrice: number): number {
    return basePrice + 1;
  }
}

export class Smithy extends SmallUtilityBuilding {
  readonly id = 'smithy';
  readonly displayName = 'Kuźnia';
  readonly displayNameEn = 'Smithy';
  readonly cost = 2;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group1;
  // Pozwala na 1 dodatkową zniżkę z kamieniołomu ponad limit grupy cenowej.
  // Obsługiwane bezpośrednio w BuilderPhase przez sprawdzenie hasBuildingOfType('smithy').
}

export class Hacienda extends SmallUtilityBuilding {
  readonly id = 'hacienda';
  readonly displayName = 'Hacienda';
  readonly displayNameEn = 'Hacienda';
  readonly cost = 2;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group1;

  drawsExtraPlantationFromPile(): boolean {
    return true;
  }
}

export class Hospice extends SmallUtilityBuilding {
  readonly id = 'hospice';
  readonly displayName = 'Przytułek';
  readonly displayNameEn = 'Hospice';
  readonly cost = 3;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group2;

  placeColonistOnNewPlantation(): boolean {
    return true;
  }
}

export class SmallWarehouse extends SmallUtilityBuilding {
  readonly id = 'smallWarehouse';
  readonly displayName = 'Mały Magazyn';
  readonly displayNameEn = 'Small Warehouse';
  readonly cost = 3;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group2;

  goodTypesToKeepAfterCaptain(): number {
    return 1;
  }
}

export class Office extends SmallUtilityBuilding {
  readonly id = 'office';
  readonly displayName = 'Biuro Handlowe';
  readonly displayNameEn = 'Office';
  readonly cost = 5;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group3;

  allowsSellingDuplicate(_state: GameState, _player: Player, _good: GoodType): boolean {
    return true;
  }
}

// --- Duże budynki użytkowe (tileSize=1, workerCapacity=1, VP=2) ---

export class LargeMarket extends SmallUtilityBuilding {
  readonly id = 'largeMarket';
  readonly displayName = 'Duży Targ';
  readonly displayNameEn = 'Large Market';
  readonly cost = 5;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group3;

  modifySellPrice(_state: GameState, _player: Player, _good: GoodType, basePrice: number): number {
    return basePrice + 2;
  }
}

export class LargeWarehouse extends SmallUtilityBuilding {
  readonly id = 'largeWarehouse';
  readonly displayName = 'Duży Magazyn';
  readonly displayNameEn = 'Large Warehouse';
  readonly cost = 6;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group3;

  goodTypesToKeepAfterCaptain(): number {
    return 2;
  }
}

export class Factory extends SmallUtilityBuilding {
  readonly id = 'factory';
  readonly displayName = 'Przetwórnia';
  readonly displayNameEn = 'Factory';
  readonly cost = 7;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group4;

  // Tablica: distinctCount -> dubony (0:0, 1:0, 2:1, 3:2, 4:3, 5:5)
  factoryBonusDoubloons(distinctGoodsCount: number): number {
    const table = [0, 0, 1, 2, 3, 5];
    return table[distinctGoodsCount] ?? 5;
  }
}

export class University extends SmallUtilityBuilding {
  readonly id = 'university';
  readonly displayName = 'Uniwersytet';
  readonly displayNameEn = 'University';
  readonly cost = 8;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group4;

  afterBuildCompleted(state: GameState, _player: Player, builtBuilding: Building): void {
    if (state.supply.workersPool > 0) {
      state.supply.workersPool--;
      builtBuilding.occupiedWorkers++;
    }
  }
}

export class Harbour extends SmallUtilityBuilding {
  readonly id = 'harbour';
  readonly displayName = 'Port';
  readonly displayNameEn = 'Harbour';
  readonly cost = 8;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group4;

  bonusVpOnShipping(_state: GameState, _player: Player, _loadedCount: number): number {
    return 1;
  }
}

export class Wharf extends SmallUtilityBuilding {
  readonly id = 'wharf';
  readonly displayName = 'Nabrzeże';
  readonly displayNameEn = 'Wharf';
  readonly cost = 9;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group4;

  hasOwnShip(): boolean {
    return true;
  }
}

// Nadpisujemy kategorię dla "dużych" budynków użytkowych, by były widoczne jako LargeUtility.
// Nie mają innej klasy bazowej - tileSize=1 i workerCapacity=1 dzielą z małymi.
const LARGE_UTILITY_OVERRIDES: string[] = [
  'largeMarket', 'largeWarehouse', 'factory', 'university', 'harbour', 'wharf',
];

for (const cls of [LargeMarket, LargeWarehouse, Factory, University, Harbour, Wharf]) {
  Object.defineProperty(cls.prototype, 'category', {
    get() { return BuildingCategory.LargeUtility; },
    configurable: true,
  });
}

// Suppress unused variable warning for the array used only in the loop above.
void LARGE_UTILITY_OVERRIDES;