import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import type { PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Pasowanie - gracz rezygnuje z wykonania akcji w swojej sub-turze.
// "Wszystkie postacie, poza poszukiwaczem, oferują akcję i przywilej.
//  Po wybraniu postaci musisz podjąć decyzję, czy wykonujesz akcję..."
//
// Zasady akceptacji pasowania (kiedy w ogóle jest legalne) są egzekwowane
// przez fazę przez getValidActions() - tu sprawdzamy tylko własność tury.
//
// W fazie kapitana, jeśli gracz MOŻE załadować, MUSI - więc faza po prostu
// nie zwróci PassAction w liście dostępnych akcji.
export class PassAction implements Action {
  readonly type = 'PASS';

  constructor(readonly playerId: PlayerId) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej');
    }
    return OkVoid;
  }

  execute(state: GameState): void {
    // Pasowanie kończy sub-turę gracza - przesuwamy wskaźnik dalej.
    state.advanceCurrentPlayer();
  }
}
