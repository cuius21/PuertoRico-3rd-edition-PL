import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import type { PlayerId } from '../../core/types';

// Wspólny interfejs dla wszystkich botów. Każda implementacja (Random, Greedy, MCTS)
// dostaje pełny stan gry i swoje playerId, zwraca jedną akcję do wykonania.
// Gwarantowane: getValidActions(playerId) jest niepuste przed wywołaniem chooseAction.
export interface Bot {
  readonly name: string;
  chooseAction(state: GameState, playerId: PlayerId): Action;
}
