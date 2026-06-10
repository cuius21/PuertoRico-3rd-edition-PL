import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Faza kupca: Kancelaria z robotnikiem — zapłać 1 dublon, weź zakrytą plantację ze stosu i umieść na wyspie.
// asForest=true gdy gracz ma aktywny Szałas i chce złożyć ją jako las.
export class BuyPlantationFromDeckAction implements Action {
  readonly type = 'BUY_PLANTATION_FROM_DECK';

  constructor(
    readonly playerId: PlayerId,
    readonly asForest: boolean = false,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Trader) {
      return Err('Można kupić plantację tylko w fazie kupca');
    }
    const player = state.getPlayer(this.playerId)!;
    if (player.doubloons < 1) return Err('Potrzebujesz 1 dublona na zakup plantacji');
    if (!player.island.hasFreeRuralSlot()) return Err('Brak wolnych pól wiejskich na wyspie');
    if (!state.supply.plantationDecks.some(d => d.length > 0)) return Err('Brak zakrytych plantacji w stosach');
    if (this.asForest) {
      const hasHut = player.island.getActiveBuildings().some(b => b.id === 'hut');
      if (!hasHut) return Err('Potrzebujesz aktywnego Szałasu, aby położyć las');
    }
    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    player.doubloons--;
    state.supply.depositDoubloons(1);

    const deck = state.supply.plantationDecks.find(d => d.length > 0)!;
    const plantation = deck.pop()!;
    if (deck.length === 0) {
      state.supply.plantationDecks.splice(state.supply.plantationDecks.indexOf(deck), 1);
    }
    if (this.asForest) plantation.isForest = true;
    player.island.addPlantation(plantation);
  }
}
