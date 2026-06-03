import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { TakePlantationAction } from '../../actions/TakePlantationAction';
import { PassAction } from '../../actions/PassAction';
import { refillRevealedPlantations } from '../GameFactory';
import { RoleSelectionPhase } from './RoleSelectionPhase';
import { RoundEndPhase } from './RoundEndPhase';

function nextPhaseAfterRole(state: GameState): GamePhase {
  const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
  return takenCount >= state.players.length ? new RoundEndPhase() : new RoleSelectionPhase();
}

// Faza plantatora: każdy gracz może wziąć jedną plantację lub kamieniołom.
// Selektor ma przywilej wzięcia kamieniołomu; inni tylko z aktywną Kuźnią.
// Po fazie: odrzuć pozostałe odkryte plantacje i dobierz nową pulę.
export class SettlerPhase implements GamePhase {
  readonly type = PhaseType.Settler;
  private initialLogLength = 0;

  onEnter(state: GameState): void {
    this.initialLogLength = state.actionLog.length;
    state.currentPlayerIndex = state.roleSelectorIndex;
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getCurrentPlayer().id !== playerId) return [];
    const player = state.getPlayer(playerId)!;
    const actions: Action[] = [];

    if (player.island.hasFreeRuralSlot()) {
      // Odkryte plantacje
      for (let i = 0; i < state.supply.revealedPlantations.length; i++) {
        actions.push(new TakePlantationAction(playerId, { kind: 'revealed', index: i }));
      }
      // Kamieniołom — selektor lub posiadacz aktywnej Kuźni
      if (state.supply.quarryStack.length > 0) {
        const isSelector = state.getRoleSelector().id === playerId;
        const hasSmithy = player.island.getActiveBuildings().some(b => b.id === 'smithy');
        if (isSelector || hasSmithy) {
          actions.push(new TakePlantationAction(playerId, { kind: 'quarry' }));
        }
      }
    }

    actions.push(new PassAction(playerId));
    return actions;
  }

  checkTransition(state: GameState): GamePhase | null {
    const actionsInPhase = state.actionLog.length - this.initialLogLength;
    if (actionsInPhase >= state.players.length) {
      // Odrzuć pozostałe odkryte plantacje i uzupełnij pulę
      state.supply.discardedPlantations.push(...state.supply.revealedPlantations);
      state.supply.revealedPlantations = [];
      state.supply.revealedPlantations = refillRevealedPlantations(
        state.supply,
        state.players.length + 1,
      );
      return nextPhaseAfterRole(state);
    }
    return null;
  }
}
