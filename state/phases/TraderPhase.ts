import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { GoodType, PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { SellGoodAction } from '../../actions/SellGoodAction';
import { PassAction } from '../../actions/PassAction';
import { BuyPlantationFromDeckAction } from '../../actions/BuyPlantationFromDeckAction';
import { SellPlantationAction } from '../../actions/SellPlantationAction';
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
    // Resetuj flagę Faktorii dla każdego gracza
    for (const player of state.players) {
      player.hasUsedFactoriaThisPhase = false;
    }
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getCurrentPlayer().id !== playerId) return [];
    const player = state.getPlayer(playerId)!;
    const actions: Action[] = [];

    const hasFaktoria = !player.hasUsedFactoriaThisPhase &&
      player.island.getActiveBuildings().some(b => b.allowsSellingWhenFull?.() === true);

    if (!state.tradingHouse.isFull()) {
      for (const good of GOOD_TYPES) {
        if (player.getStoredGoodCount(good) === 0) continue;

        if (state.tradingHouse.containsGood(good)) {
          const canDuplicate = player.island
            .getActiveBuildings()
            .some(b => b.allowsSellingDuplicate?.(state, player, good) === true);
          if (!canDuplicate) continue;
        }

        actions.push(new SellGoodAction(playerId, good));
      }
    }

    // Faktoria: może sprzedawać nawet gdy targowisko jest pełne (lub towar jest duplikatem)
    if (hasFaktoria) {
      for (const good of GOOD_TYPES) {
        if (player.getStoredGoodCount(good) === 0) continue;
        // Dodaj tylko jeśli nie ma już zwykłej akcji sprzedaży dla tego towaru
        const alreadyOffered = actions.some(
          a => (a as SellGoodAction).type === 'SELL_GOOD' && (a as SellGoodAction).good === good && !(a as SellGoodAction).useFactoria,
        );
        if (!alreadyOffered) {
          actions.push(new SellGoodAction(playerId, good, true));
        }
      }
    }

    // Kancelaria z robotnikiem: kup plantację z zakrytego stosu za 1 dbl
    const chancelleryWorker = player.island.getBuildings().find(
      b => b.id === 'chancellery' && b.occupiedWorkers > 0,
    );
    if (chancelleryWorker) {
      if (player.doubloons >= 1 &&
          player.island.hasFreeRuralSlot() &&
          state.supply.plantationDecks.some(d => d.length > 0)) {
        const hasHut = player.island.getActiveBuildings().some(b => b.id === 'hut');
        actions.push(new BuyPlantationFromDeckAction(playerId, false));
        if (hasHut) actions.push(new BuyPlantationFromDeckAction(playerId, true));
      }
    }

    // Kancelaria ze szlachcicem: sprzedaj plantację za 1 dbl
    const chancelleryNoble = player.island.getBuildings().find(
      b => b.id === 'chancellery' && b.occupiedNobles > 0,
    );
    if (chancelleryNoble) {
      const slots = player.island.getPlantationSlots();
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] !== null) {
          actions.push(new SellPlantationAction(playerId, i, true));
        }
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
