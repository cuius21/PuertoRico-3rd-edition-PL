import { Building } from './Building';
import { BuildingCategory, GoodType } from '../../core/types';

// Budynek produkcyjny przetwarza plantacje danego rodzaju na towary w fazie zarządcy.
// Liczba slotów robotników = maksymalna liczba znaczników towaru produkowanych w jednej fazie.
//
// Kukurydza NIE potrzebuje budynku produkcyjnego - jest produkowana wprost z plantacji,
// więc ProductionBuilding nie ma podtypu dla kukurydzy.
export abstract class ProductionBuilding extends Building {
  abstract readonly produces: GoodType;
  readonly category = BuildingCategory.Production;
}
