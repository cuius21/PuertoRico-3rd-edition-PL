import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { TakeDoubloonAction } from '../../actions/TakeDoubloonAction';
import { RoleSelectionPhase } from './RoleSelectionPhase';
import { RoundEndPhase } from './RoundEndPhase';

function nextPhaseAfterRole(state: GameState): GamePhase {
  const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
  return takenCount >= state.players.length ? new RoundEndPhase() : new RoleSelectionPhase();
}

// Faza poszukiwacza: selektor dostaje 1 dublon, nikt inny nie wykonuje akcji.
export class ProspectorPhase implements GamePhase {
  readonly type = PhaseType.Prospector;
  private initialLogLength = 0;

  onEnter(state: GameState): void {
    this.initialLogLength = state.actionLog.length;
    state.currentPlayerIndex = state.roleSelectorIndex;
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getRoleSelector().id !== playerId) return [];
    if (state.actionLog.length > this.initialLogLength) return [];
    return [new TakeDoubloonAction(playerId)];
  }

  checkTransition(state: GameState): GamePhase | null {
    if (state.actionLog.length > this.initialLogLength) {
      return nextPhaseAfterRole(state);
    }
    // Poszukiwacz bez dublonów w banku — natychmiastowe przejście
    if (state.supply.doubloonsInBank === 0) {
      return nextPhaseAfterRole(state);
    }
    return null;
  }
}
