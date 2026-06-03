import { GoodType } from '../core/types';
import { TRADING_HOUSE_SLOTS } from '../core/constants';

// Targowisko - 4 sloty na towary sprzedawane w fazie kupca.
// Domyślnie nie można sprzedawać towaru, który już tam leży
// (chyba że gracz ma aktywne Biuro handlowe - sprawdzane gdzie indziej).
export class TradingHouse {
  private readonly slots: (GoodType | null)[] = new Array(TRADING_HOUSE_SLOTS).fill(null);

  isFull(): boolean {
    return this.slots.every(slot => slot !== null);
  }

  containsGood(good: GoodType): boolean {
    return this.slots.includes(good);
  }

  occupiedCount(): number {
    return this.slots.filter(slot => slot !== null).length;
  }

  // Standardowa walidacja sprzedaży. Modyfikatory (Biuro handlowe) aplikowane
  // wyżej, w logice akcji SellGoodAction.
  canSellStandard(good: GoodType): boolean {
    return !this.isFull() && !this.containsGood(good);
  }

  // Wstawia towar do pierwszego wolnego slotu.
  addGood(good: GoodType): void {
    const freeIndex = this.slots.findIndex(slot => slot === null);
    if (freeIndex === -1) throw new Error('Trading house is full');
    this.slots[freeIndex] = good;
  }

  // Opróżnia targowisko (na koniec fazy kupca, gdy wszystkie 4 sloty zajęte).
  // Zwrócone towary wracają do globalnej puli (obsługa w fazie/akcji).
  clear(): GoodType[] {
    const goods = this.slots.filter((g): g is GoodType => g !== null);
    this.slots.fill(null);
    return goods;
  }

  // Snapshot dla widoku - read-only.
  getSlots(): readonly (GoodType | null)[] {
    return this.slots;
  }
}
