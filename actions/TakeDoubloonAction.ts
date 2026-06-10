import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Faza poszukiwacza: jedyna akcja - selektor postaci dostaje 1 dublon z banku.
// Pozostali gracze NIE wykonują żadnej akcji w tej fazie.
//
// "Brak akcji! Poszukiwacz otrzymuje jeden dublon z banku."
export class TakeDoubloonAction implements Action {
  readonly type = 'TAKE_DOUBLOON';

  constructor(readonly playerId: PlayerId) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Prospector) {
      return Err('Dublon poszukiwacza można wziąć tylko w fazie poszukiwacza');
    }
    if (state.getRoleSelector().id !== this.playerId) {
      return Err('Tylko gracz, który wybrał poszukiwacza, dostaje dublon');
    }
    if (state.supply.doubloonsInBank === 0) {
      // Skrajny przypadek - mało prawdopodobny, ale obsługujemy.
      return Err('Bank jest pusty');
    }
    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    // Biblioteka: poszukiwacz dostaje 2 dublony zamiast 1
    const hasLibrary = player.island.getActiveBuildings().some(b => b.doublesRolePrivilege?.());
    const amount = hasLibrary ? 2 : 1;
    const taken = state.supply.drawDoubloons(amount);
    player.doubloons += taken;
    // Brak advance - faza jednoosobowa, ProspectorPhase.checkTransition() ją zamknie.
  }
}
