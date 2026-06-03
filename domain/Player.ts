import { GoodType, type PlayerId } from '../core/types';
import { Island } from './Island';

function createEmptyGoodMap(): Map<GoodType, number> {
  return new Map<GoodType, number>([
    [GoodType.Corn, 0],
    [GoodType.Indigo, 0],
    [GoodType.Sugar, 0],
    [GoodType.Tobacco, 0],
    [GoodType.Coffee, 0],
  ]);
}

// Stan pojedynczego gracza.
//
// Uwaga konstrukcyjna: która postać jest aktualnie wybrana przez gracza w tej rundzie
// NIE jest tu trzymane - jedyne źródło prawdy to RoleCard.takenBy. Konkretny gracz
// jest pytany przez GameState/fazę (np. "kto wybrał Kupca?" - sprawdź roleCards).
//
// PZ trzymamy odkryte (ukrywanie tylko na poziomie widoku per nasze ustalenia).
export class Player {
  doubloons: number = 0;
  victoryPointTokens: number = 0;

  // Towary w San Juan (poza fazą kapitana - dowolna ilość; po fazie kapitana
  // limit 1 znacznik chyba że magazyny - logika w CaptainPhase).
  readonly storedGoods: Map<GoodType, number> = createEmptyGoodMap();

  // Workers received in Mayor phase, waiting to be placed.
  pendingWorkers: number = 0;

  // Workers kept between Mayor phases (player chose not to place them last round).
  heldWorkers: number = 0;

  // Flagi efektów jednorazowych w fazie kapitana - resetowane na początku każdej fazy.
  hasUsedCaptainBonusThisPhase: boolean = false;
  hasUsedWharfThisPhase: boolean = false;

  constructor(
    readonly id: PlayerId,
    readonly name: string,
    readonly island: Island = new Island(),
  ) {}

  // === TOWARY ===

  getTotalStoredGoods(): number {
    let sum = 0;
    for (const count of this.storedGoods.values()) sum += count;
    return sum;
  }

  getStoredGoodCount(good: GoodType): number {
    return this.storedGoods.get(good) ?? 0;
  }

  addStoredGoods(good: GoodType, count: number): void {
    this.storedGoods.set(good, this.getStoredGoodCount(good) + count);
  }

  removeStoredGoods(good: GoodType, count: number): void {
    const current = this.getStoredGoodCount(good);
    if (current < count) {
      throw new Error(`Player ${this.id} has only ${current} of ${good}, cannot remove ${count}`);
    }
    this.storedGoods.set(good, current - count);
  }

  // === FLAGI FAZY ===

  resetCaptainPhaseFlags(): void {
    this.hasUsedCaptainBonusThisPhase = false;
    this.hasUsedWharfThisPhase = false;
  }
}
