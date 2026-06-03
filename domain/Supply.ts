import { GoodType } from '../core/types';
import { Building } from './buildings/Building';
import { Plantation } from './Plantation';

// Globalne zasoby gry - wszystko, co nie należy do żadnego z graczy.
// Klasa-kontener z metodami operującymi na pulach, by trzymać niezmienniki
// (np. nie zejść poniżej zera).
export class Supply {
  // === BANK ===
  doubloonsInBank: number = 0;
  victoryPointPool: number = 0;

  // === ROBOTNICY ===
  // Robotnicy w głównej puli (poza Magistratem - źródło przywileju burmistrza).
  workersPool: number = 0;
  // Robotnicy aktualnie w Magistracie (do rozdania w fazie burmistrza).
  workersInMagistrate: number = 0;

  // === TOWARY ===
  // Pula znaczników towarów do produkcji.
  readonly goodsPool: Map<GoodType, number> = new Map([
    [GoodType.Corn, 0],
    [GoodType.Indigo, 0],
    [GoodType.Sugar, 0],
    [GoodType.Tobacco, 0],
    [GoodType.Coffee, 0],
  ]);

  // === PLANTACJE ===
  // Zakryte stosy plantacji (liczba stosów zależna od liczby graczy).
  plantationDecks: Plantation[][] = [];

  // Aktualnie odkryta pula plantacji do wyboru.
  revealedPlantations: Plantation[] = [];

  // Plantacje odrzucone na koniec fazy plantatora - tasowane na nowe stosy gdy wyczerpią się stosy zakryte.
  discardedPlantations: Plantation[] = [];

  // Stos kamieniołomów.
  quarryStack: Plantation[] = [];

  // === BUDYNKI ===
  // Dostępne na planszy głównej budynki (małe użytkowe w 2 egz., produkcyjne też w 2,
  // duże po 1 - dokładną kompozycję ustalamy w GameFactory podczas setupu).
  availableBuildings: Building[] = [];

  // === OPERACJE NA BANKU ===

  drawDoubloons(amount: number): number {
    const taken = Math.min(amount, this.doubloonsInBank);
    this.doubloonsInBank -= taken;
    return taken;
  }

  depositDoubloons(amount: number): void {
    this.doubloonsInBank += amount;
  }

  drawVictoryPoints(amount: number): number {
    const taken = Math.min(amount, this.victoryPointPool);
    this.victoryPointPool -= taken;
    return taken;
  }

  hasVictoryPointsLeft(): boolean {
    return this.victoryPointPool > 0;
  }

  // === OPERACJE NA ROBOTNIKACH ===

  drawWorkerFromPool(): boolean {
    if (this.workersPool > 0) {
      this.workersPool--;
      return true;
    }
    return false;
  }

  returnWorkersToPool(count: number): void {
    this.workersPool += count;
  }

  // === OPERACJE NA TOWARACH ===

  drawGoods(good: GoodType, amount: number): number {
    const available = this.goodsPool.get(good) ?? 0;
    const taken = Math.min(amount, available);
    this.goodsPool.set(good, available - taken);
    return taken;
  }

  returnGoods(good: GoodType, amount: number): void {
    this.goodsPool.set(good, (this.goodsPool.get(good) ?? 0) + amount);
  }

  getGoodsAvailable(good: GoodType): number {
    return this.goodsPool.get(good) ?? 0;
  }

  // === OPERACJE NA BUDYNKACH ===

  takeBuilding(buildingId: string): Building | null {
    const idx = this.availableBuildings.findIndex(b => b.id === buildingId);
    if (idx === -1) return null;
    return this.availableBuildings.splice(idx, 1)[0] ?? null;
  }

  hasBuildingAvailable(buildingId: string): boolean {
    return this.availableBuildings.some(b => b.id === buildingId);
  }
}
