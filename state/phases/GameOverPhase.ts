import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';

// Faza terminalna — gra zakończona. Brak akcji, brak przejść.
export class GameOverPhase implements GamePhase {
  readonly type = PhaseType.GameOver;
  onEnter(_state: GameState): void {}
  onExit(_state: GameState): void {}
  getValidActions(_state: GameState, _playerId: PlayerId): Action[] { return []; }
  checkTransition(_state: GameState): GamePhase | null { return null; }
}
