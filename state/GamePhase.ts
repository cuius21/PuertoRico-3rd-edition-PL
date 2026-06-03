import type { GameState } from './GameState';
import type { Action } from '../actions/Action';
import type { PhaseType, PlayerId } from '../core/types';

// State pattern - aktualna faza gry decyduje:
// - jakie akcje są legalne,
// - kiedy zmieniamy fazę,
// - co dzieje się przy wejściu i wyjściu z fazy.
//
// Każda faza (Settler, Mayor, ...) będzie osobną klasą implementującą ten interfejs.
export interface GamePhase {
  readonly type: PhaseType;

  // Zbiór legalnych akcji w aktualnym momencie dla danego gracza.
  // To centralne API dla UI ("jakie przyciski pokazać") i AI ("jakie ruchy rozważyć").
  getValidActions(state: GameState, playerId: PlayerId): Action[];

  // Hook wywoływany raz, gdy faza staje się aktywną fazą GameState.
  // Tu np. faza Craftsman robi produkcję wszystkich graczy.
  onEnter(state: GameState): void;

  // Hook wywoływany raz, gdy GameState porzuca tę fazę.
  onExit(state: GameState): void;

  // Po każdej zaaplikowanej akcji - faza decyduje, czy przejść dalej.
  // Zwraca nową fazę albo null jeśli zostajemy.
  checkTransition(state: GameState): GamePhase | null;
}
