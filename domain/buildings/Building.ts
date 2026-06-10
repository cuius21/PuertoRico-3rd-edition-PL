import { BuildingCategory, BuildingPriceGroup, GoodType } from '../../core/types';
import type { Player } from '../Player';
import type { GameState } from '../../state/GameState';

// Hooki budynków. Konkretny budynek implementuje TYLKO te, których naprawdę używa.
// GameState w odpowiednim momencie wywołuje odpowiedni hook na każdym aktywnym
// budynku gracza, zbierając lub aplikując efekty.
//
// To zastępuje wielki switch typu "jeśli gracz ma Akwedukt, to..." rozproszony
// po fazach. Każdy budynek to lokalna jednostka wiedzy.
export interface BuildingEffects {
  // Faza budowniczego: modyfikuje koszt budowy budynku przez właściciela.
  modifyBuildCost?(state: GameState, player: Player, building: Building, baseCost: number): number;

  // Faza zarządcy: modyfikuje zestaw towarów wyprodukowanych przez gracza.
  // Mutuje `produced` (mapa good -> liczba znaczników).
  onProduce?(state: GameState, player: Player, produced: Map<GoodType, number>): void;

  // Faza kupca: modyfikuje cenę sprzedaży konkretnego towaru.
  modifySellPrice?(state: GameState, player: Player, good: GoodType, basePrice: number): number;

  // Faza kupca: czy gracz może sprzedać towar, który już jest na Targowisku.
  allowsSellingDuplicate?(state: GameState, player: Player, good: GoodType): boolean;

  // Faza kapitana: bonusowe PZ za załadunek. Przykład: Port - +1 PZ.
  bonusVpOnShipping?(state: GameState, player: Player, loadedCount: number): number;

  // Faza plantatora: gracz ciągnie dodatkową plantację z zakrytego stosu (Hacienda).
  drawsExtraPlantationFromPile?(): boolean;

  // Faza plantatora: po wzięciu plantacji/kamieniołomu, gracz kładzie na niej robotnika (Przytułek).
  placeColonistOnNewPlantation?(): boolean;

  // Faza burmistrza: po wybudowaniu budynku przez gracza, kładzie robotnika na nim (Uniwersytet).
  afterBuildCompleted?(state: GameState, player: Player, builtBuilding: Building): void;

  // Faza zarządcy: bonus dublonów wg liczby różnych wyprodukowanych towarów (Przetwórnia).
  factoryBonusDoubloons?(distinctGoodsCount: number): number;

  // Faza kapitana: gracz ma własny statek (Nabrzeże).
  hasOwnShip?(): boolean;

  // Faza kapitana: ile pełnych typów towarów może zachować po fazie kapitana (Magazyny).
  goodTypesToKeepAfterCaptain?(): number;

  // Koniec gry: bonus PZ z dużego budynku.
  calculateEndGameBonus?(state: GameState, player: Player): number;

  // Faza budowniczego: bonus PZ zdobyty natychmiast po wybudowaniu (Kościół).
  bonusVpOnBuild?(state: GameState, player: Player, priceGroup: BuildingPriceGroup): number;

  // Faza kapitana: na początku fazy, bonus PZ na gracza za pary takich samych towarów (Przeładownia).
  bonusVpAtCaptainStart?(state: GameState, player: Player): number;

  // Faza kapitana: bonus dublonów za każdy załadunek towaru (Latarnia morska).
  bonusDblPerLoad?(): number;

  // Faza kapitana: bonus dublonów dla selektora (Latarnia morska).
  bonusDblIfCaptainSelector?(): number;

  // Faza kapitana: liczba dodatkowych towarów (dowolnych) do zachowania po fazie (Skład).
  extraGoodsStorage?(): number;

  // Wszystkie fazy: podwaja przywilej selektora (Biblioteka).
  doublesRolePrivilege?(): boolean;

  // Faza kapitana: gracz ma prywatny statek z VP=1 za każde 2 załadowane towary (Przystań).
  hasPrivateMarinaShip?(): boolean;

  // Faza kupca: gracz może sprzedawać nawet gdy targowisko jest pełne (Faktoria).
  allowsSellingWhenFull?(): boolean;

  // === Rozszerzenie II: Szlachcic ===

  // Faza budowniczego: zniżka za robotnika w budynku (Gildia murarska, małe budynki).
  builderWorkerDiscount?(): number;

  // Faza budowniczego: zniżka za szlachcica w budynku (Gildia murarska, duże budynki).
  builderNobleDiscount?(): number;

  // Siedziba cechu: czy budynek liczy się jako duży budynek produkcyjny (Zakład jubilerski).
  countsAsLargeProductionBuilding?(): boolean;

  // Faza zarządcy: nagroda za robotnika w budynku (Kaplica — robotnik → +1 dbl).
  craftsmanWorkerReward?(): { doubloons?: number; vp?: number };

  // Faza zarządcy: nagroda za szlachcica w budynku (Kaplica — szlachcic → +1 PZ).
  craftsmanNobleReward?(): { doubloons?: number; vp?: number };

  // Faza zarządcy: budynek aktywny → +1 dbl za każdego szlachcica gracza (Zakład jubilerski).
  craftsmanNoblesDoublons?(): boolean;
}

// TypeScript trick: deklaracja interfejsu o tej samej nazwie co klasa
// jest z nią scalana. Dzięki temu typ `Building` zyskuje opcjonalne hooki
// z BuildingEffects, mimo że klasa nie implementuje ich w bazie.
// Konkretne podklasy (np. SmallMarket) nadpisują tylko te, których używają.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Building extends BuildingEffects {}

// Klasa bazowa wszystkich budynków. Konkretne typy żyją w domain/buildings/catalog/.
export abstract class Building {
  // Unikalny identyfikator typu budynku, np. "smallMarket". Stały dla całej klasy.
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly displayNameEn: string;

  abstract readonly cost: number;
  abstract readonly victoryPoints: number;
  abstract readonly workerCapacity: number;
  abstract readonly tileSize: 1 | 2;
  abstract readonly category: BuildingCategory;
  abstract readonly priceGroup: BuildingPriceGroup;

  // Aktualna obsada robotnikami i szlachcicami (stany mutowalne).
  occupiedWorkers: number = 0;
  occupiedNobles: number = 0;

  // Budynek jest aktywny gdy pracuje w nim co najmniej 1 robotnik lub szlachcic.
  isActive(): boolean {
    return this.occupiedWorkers > 0 || this.occupiedNobles > 0;
  }

  hasFreeWorkerSlot(): boolean {
    return this.occupiedWorkers + this.occupiedNobles < this.workerCapacity;
  }
}
