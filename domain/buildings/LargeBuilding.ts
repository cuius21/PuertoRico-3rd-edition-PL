import { Building } from './Building';
import { BuildingCategory, BuildingPriceGroup } from '../../core/types';
import type { GameState } from '../../state/GameState';
import type { Player } from '../Player';

// Duże budynki użytkowe (5 typów w grze podstawowej):
// - zajmują 2 sąsiednie pola miejskie (w pionie),
// - koszt: 10 dublonów,
// - PZ za samą obecność: 4,
// - dodatkowy bonus PZ na koniec gry (jeśli aktywne) - obliczany przez calculateEndGameBonus.
export abstract class LargeBuilding extends Building {
  readonly category = BuildingCategory.LargeUtility;
  readonly cost = 10;
  readonly victoryPoints = 4;
  readonly workerCapacity = 1;
  readonly tileSize = 2;
  readonly priceGroup = BuildingPriceGroup.Group4;

  // Bonus końcowy - WYMAGANY dla każdego dużego budynku, dlatego abstract.
  // Konkretne implementacje (Twierdza, Siedziba cechu, Urząd celny, Ratusz, Rezydencja)
  // zwrócą różne wartości.
  abstract override calculateEndGameBonus(state: GameState, player: Player): number;
}
