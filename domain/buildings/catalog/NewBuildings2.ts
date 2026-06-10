import { SmallUtilityBuilding } from '../SmallUtilityBuilding';
import { LargeBuilding } from '../LargeBuilding';
import { BuildingPriceGroup, BuildingCategory } from '../../../core/types';
import type { GameState } from '../../../state/GameState';
import type { Player } from '../../Player';

// === Rozszerzenie II: Szlachcic ===
// Budynki dualne mają dwa tryby działania: z robotnikiem | ze szlachcicem.
// Efekty wywoływane są w fazach przez sprawdzenie occupiedWorkers vs occupiedNobles.

// ─── Grupa 1 (VP=1) ────────────────────────────────────────────────────────

// Kancelaria: faza kupca — z robotnikiem: kup plantację za 1 dbl; ze szlachcicem: sprzedaj plantację za 1 dbl.
export class Chancellery extends SmallUtilityBuilding {
  readonly id = 'chancellery';
  readonly displayName = 'Kancelaria';
  readonly displayNameEn = 'Chancellery';
  readonly cost = 2;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group1;
}

// Kaplica: faza zarządcy — z robotnikiem: +1 dbl; ze szlachcicem: +1 PZ.
export class Chapel extends SmallUtilityBuilding {
  readonly id = 'chapel';
  readonly displayName = 'Kaplica';
  readonly displayNameEn = 'Chapel';
  readonly cost = 3;
  readonly victoryPoints = 1;
  readonly priceGroup = BuildingPriceGroup.Group1;

  craftsmanWorkerReward(): { doubloons: number } { return { doubloons: 1 }; }
  craftsmanNobleReward(): { vp: number } { return { vp: 1 }; }
}

// ─── Grupa 2 (VP=2) ────────────────────────────────────────────────────────

// Domek myśliwski: faza plantatora — z robotnikiem: usuń plantację/las; ze szlachcicem: +2 PZ jeśli masz najwięcej wolnych pól wiejskich.
export class HuntingLodge extends SmallUtilityBuilding {
  readonly id = 'huntingLodge';
  readonly displayName = 'Domek myśliwski';
  readonly displayNameEn = 'Hunting Lodge';
  readonly cost = 4;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group2;
}

// Gildia murarska: faza budowniczego — z robotnikiem: -1 dbl na małe budynki; ze szlachcicem: -2 dbl na duże budynki.
export class MasonsGuild extends SmallUtilityBuilding {
  readonly id = 'masonsGuild';
  readonly displayName = 'Gildia murarska';
  readonly displayNameEn = 'Masons Guild';
  readonly cost = 5;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group2;

  builderWorkerDiscount(): number { return 1; }
  builderNobleDiscount(): number { return 2; }
}

// Skarbiec: faza kapitana, przed załadunkiem — dostarcz do X (= liczba szlachciców) różnych towarów → +1 PZ za każdy.
export class Treasury extends SmallUtilityBuilding {
  readonly id = 'treasury';
  readonly displayName = 'Skarbiec';
  readonly displayNameEn = 'Treasury';
  readonly cost = 6;
  readonly victoryPoints = 2;
  readonly priceGroup = BuildingPriceGroup.Group2;
}

// ─── Grupa 3 (VP=3) ────────────────────────────────────────────────────────

// Willa: faza burmistrza — gdy gracz otrzymuje pierwszego robotnika/szlachcica, bierze dodatkowego szlachcica z puli.
export class Villa extends SmallUtilityBuilding {
  readonly id = 'villa';
  readonly displayName = 'Willa';
  readonly displayNameEn = 'Villa';
  readonly cost = 7;
  readonly victoryPoints = 3;
  readonly priceGroup = BuildingPriceGroup.Group3;
}

// Zakład jubilerski: faza zarządcy — +1 dbl za każdego szlachcica na wyspie gracza.
// Liczy się jako duży budynek produkcyjny (Siedziba cechu: +2 PZ).
// Technicznie: SmallUtilityBuilding (1 slot), ale z flagą countsAsLargeProductionBuilding.
export class JewelersWorkshop extends SmallUtilityBuilding {
  readonly id = 'jewelersWorkshop';
  readonly displayName = 'Zakład jubilerski';
  readonly displayNameEn = "Jeweler's Workshop";
  readonly cost = 8;
  readonly victoryPoints = 3;
  readonly priceGroup = BuildingPriceGroup.Group3;

  countsAsLargeProductionBuilding(): boolean { return true; }
  craftsmanNoblesDoublons(): boolean { return true; }
}

// ─── Duże budynki (VP=4) ───────────────────────────────────────────────────

// Ogród pałacowy: koniec gry — +1 PZ za każdego szlachcica gracza (łącznie 2 PZ za szlachcica).
export class PalaceGarden extends LargeBuilding {
  readonly id = 'palaceGarden';
  readonly displayName = 'Ogród pałacowy';
  readonly displayNameEn = 'Palace Garden';

  calculateEndGameBonus(_state: GameState, player: Player): number {
    return player.getTotalNobles();
  }
}

// ─── Eksport zbiorczy ──────────────────────────────────────────────────────

export const NOBLE_BUILDING_IDS = [
  'chancellery', 'chapel', 'huntingLodge', 'masonsGuild',
  'treasury', 'villa', 'jewelersWorkshop', 'palaceGarden',
] as const;

// Budynki z efektem dualnym (inny efekt z robotnikiem vs szlachcicem)
export const DUAL_EFFECT_BUILDING_IDS = [
  'chancellery', 'chapel', 'huntingLodge', 'masonsGuild',
] as const;
