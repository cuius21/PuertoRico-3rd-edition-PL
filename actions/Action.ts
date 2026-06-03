import type { GameState } from '../state/GameState';
import type { Result } from '../core/Result';
import type { PlayerId } from '../core/types';

// Command pattern - każdy ruch gracza to obiekt akcji.
// Walidacja oddzielona od wykonania pozwala na: bezpieczne UI, testy, replay, undo.
export interface Action {
  // Tag dyskryminujący - przyda się przy serializacji i logowaniu.
  readonly type: string;

  // Gracz, który próbuje wykonać akcję.
  readonly playerId: PlayerId;

  // Walidacja - czysta funkcja, nie mutuje stanu.
  validate(state: GameState): Result<void, string>;

  // Wykonanie - mutuje stan. Wywoływać TYLKO po pomyślnej walidacji.
  // GameState.apply() gwarantuje tę kolejność.
  execute(state: GameState): void;
}
