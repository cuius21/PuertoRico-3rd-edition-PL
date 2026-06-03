import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { GoodType, PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Faza zarządcy: przywilej selektora — dostaje 1 dodatkowy znacznik dowolnego
// wyprodukowanego przez siebie towaru.
export class CraftsmanBonusAction implements Action {
  readonly type = 'CRAFTSMAN_BONUS';

  constructor(
    readonly playerId: PlayerId,
    readonly good: GoodType,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Craftsman) {
      return Err('Przywilej zarządcy możliwy tylko w fazie zarządcy');
    }
    if (state.getRoleSelector().id !== this.playerId) {
      return Err('Tylko zarządca (selektor) może wziąć bonus');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej');
    }

    const player = state.getPlayer(this.playerId)!;
    if (player.island.getProductionCapacity(this.good) === 0) {
      return Err(`Nie produkujesz towaru ${this.good}`);
    }
    if (state.supply.getGoodsAvailable(this.good) === 0) {
      return Err(`Brak ${this.good} w puli globalnej`);
    }

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const taken = state.supply.drawGoods(this.good, 1);
    player.addStoredGoods(this.good, taken);
    state.advanceCurrentPlayer();
  }
}
