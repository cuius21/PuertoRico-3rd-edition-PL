import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Faza burmistrza: gracz kończy rozmieszczanie robotników.
// Nieumieszczone robotniki zostają przy graczu (heldWorkers) i będą dostępne w następnej fazie burmistrza.
export class MayorPassAction implements Action {
  readonly type = 'MAYOR_PASS';

  constructor(readonly playerId: PlayerId) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Mayor) {
      return Err('Pasowanie w fazie burmistrza możliwe tylko podczas tej fazy');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej');
    }
    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    if (player.pendingWorkers > 0) {
      player.heldWorkers += player.pendingWorkers;
      player.pendingWorkers = 0;
    }
    if (player.pendingNobles > 0) {
      player.heldNobles += player.pendingNobles;
      player.pendingNobles = 0;
    }
    state.advanceCurrentPlayer();
  }
}
