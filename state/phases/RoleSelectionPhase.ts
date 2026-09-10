import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, RoleType, type PlayerId } from '../../core/types';
import type { GamePhase, PhaseProgress } from '../GamePhase';
import { SelectRoleAction } from '../../actions/SelectRoleAction';
import { SettlerPhase } from './SettlerPhase';
import { MayorPhase } from './MayorPhase';
import { BuilderPhase } from './BuilderPhase';
import { CraftsmanPhase } from './CraftsmanPhase';
import { TraderPhase } from './TraderPhase';
import { CaptainPhase } from './CaptainPhase';
import { ProspectorPhase } from './ProspectorPhase';
import { CorsairPhase } from './CorsairPhase';

function phaseForRole(role: RoleType): GamePhase {
  switch (role) {
    case RoleType.Settler:    return new SettlerPhase();
    case RoleType.Mayor:      return new MayorPhase();
    case RoleType.Builder:    return new BuilderPhase();
    case RoleType.Craftsman:  return new CraftsmanPhase();
    case RoleType.Trader:     return new TraderPhase();
    case RoleType.Captain:    return new CaptainPhase();
    case RoleType.Prospector: return new ProspectorPhase();
    case RoleType.Corsair:    return new CorsairPhase();
  }
}

// Faza wyboru postaci: gracze po kolei (od gubernatora) wybierają jedną z dostępnych kart.
export class RoleSelectionPhase implements GamePhase {
  readonly type = PhaseType.RoleSelection;
  private initialLogLength = 0;

  getProgress(state: GameState): PhaseProgress {
    return { actionsTaken: state.actionLog.length - this.initialLogLength };
  }

  restoreProgress(state: GameState, progress: PhaseProgress): void {
    this.initialLogLength = state.actionLog.length - (progress.actionsTaken ?? 0);
  }

  onEnter(state: GameState): void {
    this.initialLogLength = state.actionLog.length;
    // Ustal kto wybiera: gubernator + liczba już wybranych kart
    const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
    state.currentPlayerIndex = (state.governorIndex + takenCount) % state.players.length;
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getCurrentPlayer().id !== playerId) return [];
    // Przekazujemy indeks karty — przy dwóch Poszukiwaczach gracz może wybrać konkretną
    // kartę (np. tę z większą liczbą nagromadzonych dublonów).
    return state.getAvailableRoleCards().map(card => {
      const idx = state.roleCards.indexOf(card);
      return new SelectRoleAction(playerId, card.type, idx);
    }).filter(action => action.validate(state).ok);
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
