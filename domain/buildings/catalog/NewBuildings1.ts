import { SmallUtilityBuilding } from '../SmallUtilityBuilding';
import { LargeBuilding } from '../LargeBuilding';
import { GoodType, BuildingCategory, BuildingPriceGroup, PlantationType } from '../../../core/types';
import { GOOD_PRICES } from '../../../core/constants';
import type { GameState } from '../../../state/GameState';
import type { Player } from '../../Player';
import type { Building } from '../Building';

// ── Rozszerzenie I: Nowe Budynki ────────────────────────────────────────────────
// Małe budynki użytkowe (tileSize=1, workerCapacity=1, chyba że zaznaczono inaczej)

// Grupa 1 (koszt 1–2)

export class Aqueduct extends SmallUtilityBuilding {
  readonly id = 'aqueduct';
  readonly displayName = 'Akwedukt';
  readonly displayNameEn = 'Aqueduct';
  readonly cost = 1;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group1;

  onProduce(state: GameState, player: Player, produced: Map<GoodType, number>): void {
    const largeProdMap: Partial<Record<string, GoodType>> = {
      largeIndigoPlant: GoodType.Indigo,
      largeSugarMill:   GoodType.Sugar,
    };
    for (const [buildingId, good] of Object.entries(largeProdMap) as [string, GoodType][]) {
      if (!produced.has(good)) continue;
      if (!player.island.getActiveBuildings().some(b => b.id === buildingId)) continue;
      const extra = state.supply.drawGoods(good, 1);
      if (extra > 0) {
        player.addStoredGoods(good, extra);
        produced.set(good, (produced.get(good) ?? 0) + extra);
      }
    }
  }
}

export class BlackMarket extends SmallUtilityBuilding {
  readonly id = 'blackMarket';
  readonly displayName = 'Czarny rynek';
  readonly displayNameEn = 'Black Market';
  readonly cost = 2;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group1;
  // Efekt obsługiwany w BuildAction: auto-zwrot zasobów gdy brakuje dublonów (maks. 3).
}

export class Hut extends SmallUtilityBuilding {
  readonly id = 'hut';
  readonly displayName = 'Szałas';
  readonly displayNameEn = 'Hut';
  readonly cost = 2;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group1;
  // Efekt: w fazie plantatora gracz może kłaść plantacje jako lasy (isForest=true).
  // Zniżka -1 dublon przy budowie za każde 2 lasy (obsługiwane w BuildAction).
}

// Grupa 2 (koszt 3–4)

export class Depot extends SmallUtilityBuilding {
  readonly id = 'depot';
  readonly displayName = 'Skład';
  readonly displayNameEn = 'Depot';
  readonly cost = 3;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group2;

  extraGoodsStorage(): number {
    return 3;
  }
}

export class Inn extends SmallUtilityBuilding {
  readonly id = 'inn';
  readonly displayName = 'Zajazd';
  readonly displayNameEn = 'Inn';
  readonly cost = 4;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group2;
  override readonly workerCapacity = 2;
  // Uproszczenie: robotnicy rozmieszczani normalnie w fazie burmistrza.
  // Oryginał: dowolny moment podczas dowolnej fazy.
}

// Grupa 3 (koszt 5–6)

export class TradingPost extends SmallUtilityBuilding {
  readonly id = 'tradingPost';
  readonly displayName = 'Faktoria';
  readonly displayNameEn = 'Trading Post';
  readonly cost = 5;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group3;

  allowsSellingWhenFull(): boolean {
    return true;
  }
  // Faktoria NIE daje bonusu Małego/Dużego targu.
}

export class Church extends SmallUtilityBuilding {
  readonly id = 'church';
  readonly displayName = 'Kościół';
  readonly displayNameEn = 'Church';
  readonly cost = 5;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group3;

  bonusVpOnBuild(_state: GameState, _player: Player, priceGroup: BuildingPriceGroup): number {
    switch (priceGroup) {
      case BuildingPriceGroup.Group1: return 0;
      case BuildingPriceGroup.Group2: return 1;
      case BuildingPriceGroup.Group3: return 1;
      case BuildingPriceGroup.Group4: return 2;
    }
  }
}

export class Marina extends SmallUtilityBuilding {
  readonly id = 'marina';
  readonly displayName = 'Przystań';
  readonly displayNameEn = 'Marina';
  readonly cost = 6;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group3;

  hasPrivateMarinaShip(): boolean {
    return true;
  }
}

// Grupa 4 (koszt 7–9)

export class TransferStation extends SmallUtilityBuilding {
  readonly id = 'transferStation';
  readonly displayName = 'Przeładownia';
  readonly displayNameEn = 'Transfer Station';
  readonly cost = 9;
  readonly victoryPoints = 3;
  readonly priceGroup = BuildingPriceGroup.Group4;

  bonusVpAtCaptainStart(_state: GameState, player: Player): number {
    let pairs = 0;
    for (const [, count] of player.storedGoods) {
      pairs += Math.floor(count / 2);
    }
    return pairs;
  }
}

export class Lighthouse extends SmallUtilityBuilding {
  readonly id = 'lighthouse';
  readonly displayName = 'Latarnia morska';
  readonly displayNameEn = 'Lighthouse';
  readonly cost = 7;
  readonly victoryPoints = 3;
  readonly priceGroup = BuildingPriceGroup.Group4;

  bonusDblPerLoad(): number {
    return 1;
  }

  bonusDblIfCaptainSelector(): number {
    return 1;
  }
}

export class Manufactory extends SmallUtilityBuilding {
  readonly id = 'manufactory';
  readonly displayName = 'Manufaktura';
  readonly displayNameEn = 'Manufactory';
  readonly cost = 8;
  readonly victoryPoints = 3;
  readonly priceGroup = BuildingPriceGroup.Group4;

  onProduce(state: GameState, player: Player, produced: Map<GoodType, number>): void {
    let maxNonCorn = 0;
    for (const [good, count] of produced) {
      if (good !== GoodType.Corn && count > maxNonCorn) maxNonCorn = count;
    }
    if (maxNonCorn > 1) {
      player.doubloons += state.supply.drawDoubloons(maxNonCorn - 1);
    }
  }
}

export class Library extends SmallUtilityBuilding {
  readonly id = 'library';
  readonly displayName = 'Biblioteka';
  readonly displayNameEn = 'Library';
  readonly cost = 8;
  readonly victoryPoints = 3;
  readonly priceGroup = BuildingPriceGroup.Group4;

  doublesRolePrivilege(): boolean {
    return true;
  }
}

// ── Duże budynki (tileSize=2, koszt=10) ────────────────────────────────────────

export class Monastery extends LargeBuilding {
  readonly id = 'monastery';
  readonly displayName = 'Klasztor';
  readonly displayNameEn = 'Monastery';

  calculateEndGameBonus(_state: GameState, player: Player): number {
    const types = [
      PlantationType.Corn, PlantationType.Indigo, PlantationType.Sugar,
      PlantationType.Tobacco, PlantationType.Coffee,
    ] as const;
    const TRIPLET_VP = [0, 1, 3, 6, 10] as const;
    let bonus = 0;
    for (const type of types) {
      const count = player.island.getPlantations().filter(p => p.type === type).length;
      if (count >= 3) {
        const idx = Math.min(Math.floor(count / 3), 4);
        bonus += TRIPLET_VP[idx] ?? 10;
      }
    }
    return bonus;
  }
}

export class Statue extends LargeBuilding {
  readonly id = 'statue';
  readonly displayName = 'Statua';
  readonly displayNameEn = 'Statue';
  override readonly victoryPoints = 8;
  override readonly workerCapacity = 0;

  override isActive(): boolean {
    return true; // zawsze aktywna — brak slotu na robotnika
  }

  calculateEndGameBonus(_state: GameState, _player: Player): number {
    return 8;
  }
}

// ── Kategorie LargeUtility dla nowych "dużych małych" budynków ─────────────────
// Budynki z VP=2+ i tileSize=1 traktowane jako LargeUtility (tak jak w grze bazowej).
for (const cls of [Inn, TradingPost, Church, Marina, TransferStation, Lighthouse, Manufactory, Library]) {
  Object.defineProperty(cls.prototype, 'category', {
    get() { return BuildingCategory.LargeUtility; },
    configurable: true,
  });
}

void GOOD_PRICES; // suppress unused import lint
