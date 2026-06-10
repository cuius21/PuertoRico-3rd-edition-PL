import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, GoodType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Gracz z aktywnym Magazynem (Małym lub Dużym) wybiera które typy towaru zachować
// po fazie Kapitana. Wybrane typy są zachowywane w całości; reszta zostaje odrzucona.
export class SelectStorageAction implements Action {
  readonly type = 'SELECT_STORAGE';

  constructor(
    readonly playerId: PlayerId,
    readonly keepTypes: readonly GoodType[],
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Captain) {
      return Err('Wybór magazynu możliwy tylko w fazie Kapitana');
    }
    if (!state.captainStoragePending) {
      return Err('Nie trwa faza wyboru magazynu');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('Nie twoja kolej');
    }
    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const keepSet = new Set<GoodType>(this.keepTypes);

    for (const good of Object.values(GoodType) as GoodType[]) {
      const count = player.getStoredGoodCount(good);
      if (count > 0 && !keepSet.has(good)) {
        player.removeStoredGoods(good, count);
        state.supply.returnGoods(good, count);
      }
    }
    state.captainStoragePending = false;
  }
}
