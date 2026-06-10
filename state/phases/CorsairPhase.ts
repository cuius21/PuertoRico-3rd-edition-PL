import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, RoleType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { CorsairPiracyAction } from '../../actions/CorsairPiracyAction';
import { CorsairPlunderAction } from '../../actions/CorsairPlunderAction';
import { CorsairRaidAction } from '../../actions/CorsairRaidAction';
import { CorsairCaptureAction } from '../../actions/CorsairCaptureAction';
import { RoleSelectionPhase } from './RoleSelectionPhase';
import { RoundEndPhase } from './RoundEndPhase';

function nextPhaseAfterRole(state: GameState): GamePhase {
  const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
  return takenCount >= state.players.length ? new RoundEndPhase() : new RoleSelectionPhase();
}

// Faza korsarza: selektor wybiera JEDNĄ z czterech akcji pirackich.
// Żeton korsarza przechodzi na selektora — nie może ponownie wybrać Korsarza aż ktoś go "odbierze".
export class CorsairPhase implements GamePhase {
  readonly type = PhaseType.Corsair;
  private initialLogLength = 0;

  onEnter(state: GameState): void {
    this.initialLogLength = state.actionLog.length;
    state.currentPlayerIndex = state.roleSelectorIndex;
    state.corsairTokenHolderId = state.players[state.roleSelectorIndex]!.id;
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getRoleSelector().id !== playerId) return [];
    if (state.actionLog.length > this.initialLogLength) return [];

    const actions: Action[] = [];

    state.ships.forEach((ship, i) => {
      if (ship.loadedCount > 0) actions.push(new CorsairPiracyAction(playerId, i));
    });

    if (state.tradingHouse.occupiedCount() > 0) {
      actions.push(new CorsairPlunderAction(playerId));
    }

    if (state.supply.workersInMagistrate > state.players.length) {
      actions.push(new CorsairRaidAction(playerId));
    }

    for (const card of state.getAvailableRoleCards()) {
      if (card.type !== RoleType.Corsair) {
        actions.push(new CorsairCaptureAction(playerId, card.type));
      }
    }

    return actions;
  }

  checkTransition(state: GameState): GamePhase | null {
    if (state.actionLog.length > this.initialLogLength) {
      return nextPhaseAfterRole(state);
    }
    // Brak dostępnych akcji korsarza — automatyczne przejście
    const hasAction =
      state.ships.some(s => s.loadedCount > 0) ||
      state.tradingHouse.occupiedCount() > 0 ||
      state.supply.workersInMagistrate > state.players.length ||
      state.getAvailableRoleCards().some(c => c.type !== RoleType.Corsair);
    if (!hasAction) return nextPhaseAfterRole(state);
    return null;
  }
}
