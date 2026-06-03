import { GoodType } from '../core/types';

// Ogólnodostępny statek transportowy. W grze są 3 statki, każdy o innej pojemności.
// Zasady:
// - jeden statek przewozi tylko jeden rodzaj towaru,
// - towar tego samego rodzaju nie może być jednocześnie na dwóch statkach,
// - pełny statek jest opróżniany na koniec fazy kapitana.
export class Ship {
  loadedGood: GoodType | null = null;
  loadedCount: number = 0;

  constructor(readonly capacity: number) {}

  isEmpty(): boolean {
    return this.loadedCount === 0;
  }

  isFull(): boolean {
    return this.loadedCount >= this.capacity;
  }

  remainingCapacity(): number {
    return this.capacity - this.loadedCount;
  }

  // Czy statek może przyjąć dany rodzaj towaru.
  // (Lokalna reguła pojedynczego statku - reguła "ten sam towar nie może być
  // na dwóch statkach" jest sprawdzana na poziomie GameState/ShippingRules.)
  canAccept(good: GoodType): boolean {
    if (this.isFull()) return false;
    if (this.loadedGood === null) return true;
    return this.loadedGood === good;
  }

  // Reset po opróżnieniu pełnego statku.
  unload(): void {
    this.loadedGood = null;
    this.loadedCount = 0;
  }
}
