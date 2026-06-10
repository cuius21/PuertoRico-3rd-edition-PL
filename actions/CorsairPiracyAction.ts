import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Piractwo: korsarz bierze wszystkie towary z jednego statku (max 3 zatrzymuje,
// resztę zwraca do puli), statek zostaje opróżniony.
export class CorsairPiracyAction implements Action {
  readonly type = 'CORSAIR_PIRACY';

  constructor(
    readonly playerId: PlayerId,
    readonly shipIndex: number,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Corsair) {
      return Err('Piractwo możliwe tylko w fazie Korsarza');
    }
    if (state.getRoleSelector().id !== this.playerId) {
      return Err('Tylko selektor może wykonać akcję korsarza');
    }
    const ship = state.ships[this.shipIndex];
    if (!ship) return Err(`Statek o indeksie ${this.shipIndex} nie istnieje`);
    if (ship.loadedCount === 0) return Err('Ten statek jest pusty');
    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const ship = state.ships[this.shipIndex]!;
    const good = ship.loadedGood!;
    const total = ship.loadedCount;

    const corsairTakes = Math.min(total, 3);
    const returned = total - corsairTakes;

    player.storedGoods.set(good, (player.storedGoods.get(good) ?? 0) + corsairTakes);
    if (returned > 0) state.supply.returnGoods(good, returned);

    ship.loadedGood = null;
    ship.loadedCount = 0;
  }
}
