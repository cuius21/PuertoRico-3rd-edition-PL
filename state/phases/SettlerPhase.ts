import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { TakePlantationAction } from '../../actions/TakePlantationAction';
import { PassAction } from '../../actions/PassAction';
import { SellPlantationAction } from '../../actions/SellPlantationAction';
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

    // Domek myśliwski ze szlachcicem: +2 PZ jeśli masz największą liczbę wolnych pól wiejskich.
    // Sprawdzamy przed fazą (zanim ktoś weźmie plantację).
    const maxFreeRural = Math.max(
      ...state.players.map(p => p.island.getFreeRuralSlotCount()),
    );
    for (const player of state.players) {
      const lodge = player.island.getBuildings().find(b => b.id === 'huntingLodge' && b.occupiedNobles > 0);
      if (lodge && player.island.getFreeRuralSlotCount() === maxFreeRural) {
        player.victoryPointTokens += state.supply.drawVictoryPoints(2);
      }
    }
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getCurrentPlayer().id !== playerId) return [];
    const player = state.getPlayer(playerId)!;
    const actions: Action[] = [];

    if (player.island.hasFreeRuralSlot()) {
      const isSelector = state.getRoleSelector().id === playerId;
      const hasHut = player.island.getActiveBuildings().some(b => b.id === 'hut');
      // Biblioteka: selektor może też wziąć dodatkową plantację (podwojony przywilej plantatora)
      const hasLibrary = isSelector && player.island.getActiveBuildings().some(b => b.doublesRolePrivilege?.());

      // Odkryte plantacje
      for (let i = 0; i < state.supply.revealedPlantations.length; i++) {
        actions.push(new TakePlantationAction(playerId, { kind: 'revealed', index: i }));
        // Szałas: opcja złożenia plantacji jako lasu
        if (hasHut) {
          actions.push(new TakePlantationAction(playerId, { kind: 'revealed', index: i }, true));
        }
      }
      // Kamieniołom — selektor lub posiadacz aktywnej Kuźni
      if (state.supply.quarryStack.length > 0) {
        const hasSmithy = player.island.getActiveBuildings().some(b => b.id === 'smithy');
        if (isSelector || hasSmithy) {
          actions.push(new TakePlantationAction(playerId, { kind: 'quarry' }));
        }
      }
      // Biblioteka: selektor może wziąć plantację z zakrytego stosu (jak Hacienda)
      if (hasLibrary && state.supply.plantationDecks.some(d => d.length > 0)) {
        // Oferta: specjalna akcja "weź z zakrytego stosu" = TakePlantationAction z index=-1 w revealed
        // Uproszczenie: generujemy passAction z zaznaczeniem że to Biblioteka — TODO: osobna akcja
        // Na razie: Biblioteka na plantatora = dodatkowy kamieniołom (jeśli selektor ma i tak przywilej)
        // Skippujemy pełną implementację (wymaga nowej akcji) — uproszczenie
        void hasLibrary;
      }
    }

    // Domek myśliwski z robotnikiem: usuń plantację/las ze swojej wyspy (bez dublona)
    const lodgeWorker = player.island.getBuildings().find(
      b => b.id === 'huntingLodge' && b.occupiedWorkers > 0,
    );
    if (lodgeWorker) {
      const slots = player.island.getPlantationSlots();
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] !== null) {
          actions.push(new SellPlantationAction(playerId, i, false));
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
