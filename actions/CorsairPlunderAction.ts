import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Grabież: korsarz bierze wszystkie towary z targowiska,
// otrzymuje 1 PZ za każdy towar, towary wracają do puli.
export class CorsairPlunderAction implements Action {
  readonly type = 'CORSAIR_PLUNDER';

  constructor(readonly playerId: PlayerId) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Corsair) {
      return Err('Grabież możliwa tylko w fazie Korsarza');
    }
    if (state.getRoleSelector().id !== this.playerId) {
      return Err('Tylko selektor może wykonać akcję korsarza');
    }
    if (state.tradingHouse.occupiedCount() === 0) {
      return Err('Targowisko jest puste');
    }
    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const goods = state.tradingHouse.clear();
    player.victoryPointTokens += state.supply.drawVictoryPoints(goods.length);
    for (const good of goods) {
      state.supply.returnGoods(good, 1);
    }
  }
}
