import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { GoodType, PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { SellGoodAction } from '../../actions/SellGoodAction';
import { PassAction } from '../../actions/PassAction';
import { RoleSelectionPhase } from './RoleSelectionPhase';
import { RoundEndPhase } from './RoundEndPhase';

const GOOD_TYPES = [
  GoodType.Corn, GoodType.Indigo, GoodType.Sugar,
  GoodType.Tobacco, GoodType.Coffee,
] as const;

function nextPhaseAfterRole(state: GameState): GamePhase {
  const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
  return takenCount >= state.players.length ? new RoundEndPhase() : new RoleSelectionPhase();
}

// Faza kupca: każdy gracz może sprzedać jeden towar na Targowisku (lub spasować).
// Kupiec (selektor) dostaje +1 dublon przywileju (obsługiwane przez SellGoodAction).
// Kukurydza ma cenę 0, więc sprzedaż jej nadal jest legalna (nie da dublonów).
export class TraderPhase implements GamePhase {
  readonly type = PhaseType.Trader;
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

    if (!state.tradingHouse.isFull()) {
      for (const good of GOOD_TYPES) {
        if (player.getStoredGoodCount(good) === 0) continue;

        // Towar już na targowisku — tylko z aktywnym Biurem
        if (state.tradingHouse.containsGood(good)) {
          const canDuplicate = player.island
            .getActiveBuildings()
            .some(b => b.allowsSellingDuplicate?.(state, player, good) === true);
          if (!canDuplicate) continue;
        }

        actions.push(new SellGoodAction(playerId, good));
      }
    }

    actions.push(new PassAction(playerId));
    return actions;
  }

  checkTransition(state: GameState): GamePhase | null {
    const actionsInPhase = state.actionLog.length - this.initialLogLength;
    if (actionsInPhase >= state.players.length) {
      return nextPhaseAfterRole(state);
    }
    return null;
  }
}
