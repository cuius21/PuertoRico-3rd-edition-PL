import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, RoleType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { SelectRoleAction } from '../../actions/SelectRoleAction';
import { SettlerPhase } from './SettlerPhase';
import { MayorPhase } from './MayorPhase';
import { BuilderPhase } from './BuilderPhase';
import { CraftsmanPhase } from './CraftsmanPhase';
import { TraderPhase } from './TraderPhase';
import { CaptainPhase } from './CaptainPhase';
import { ProspectorPhase } from './ProspectorPhase';

function phaseForRole(role: RoleType): GamePhase {
  switch (role) {
    case RoleType.Settler:    return new SettlerPhase();
    case RoleType.Mayor:      return new MayorPhase();
    case RoleType.Builder:    return new BuilderPhase();
    case RoleType.Craftsman:  return new CraftsmanPhase();
    case RoleType.Trader:     return new TraderPhase();
    case RoleType.Captain:    return new CaptainPhase();
    case RoleType.Prospector: return new ProspectorPhase();
  }
}

// Faza wyboru postaci: gracze po kolei (od gubernatora) wybierają jedną z dostępnych kart.
export class RoleSelectionPhase implements GamePhase {
  readonly type = PhaseType.RoleSelection;
  private initialLogLength = 0;

  onEnter(state: GameState): void {
    this.initialLogLength = state.actionLog.length;
    // Ustal kto wybiera: gubernator + liczba już wybranych kart
    const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
    state.currentPlayerIndex = (state.governorIndex + takenCount) % state.players.length;
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getCurrentPlayer().id !== playerId) return [];
    return state.getAvailableRoleCards().map(
      card => new SelectRoleAction(playerId, card.type),
    );
  }

  checkTransition(state: GameState): GamePhase | null {
    if (state.actionLog.length <= this.initialLogLength) return null;

    // Rola właśnie wybrana — selektor ma przypisaną kartę
    const selector = state.getRoleSelector();
    const takenCard = state.roleCards.find(c => c.takenBy === selector.id);
    if (!takenCard) return null;

    return phaseForRole(takenCard.type);
  }
}
