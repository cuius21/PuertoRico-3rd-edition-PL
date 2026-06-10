import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, RoleType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { GameOverPhase } from './GameOverPhase';
import { RoleSelectionPhase } from './RoleSelectionPhase';

// Koniec rundy: nakładanie dublonów na nieużywane karty, reset kart, przesunięcie gubernatora.
// Potem sprawdzenie warunków końca gry.
export class RoundEndPhase implements GamePhase {
  readonly type = PhaseType.RoundEnd;

  onEnter(state: GameState): void {
    // Pojmanie (Rozszerzenie III): jeśli pojmana karta nie została wykupiona,
    // korsarz otrzymuje przywilej tej postaci (uproszczenie — pełna faza grupowa
    // wymagałaby gruntownej refaktoryzacji architektury faz).
    if (state.capturedRoleCard && state.corsairTokenHolderId) {
      const corsair = state.getPlayer(state.corsairTokenHolderId);
      if (corsair) this.applyCapturedPrivilege(state, corsair, state.capturedRoleCard);
      state.capturedRoleCard = null;
    }

    // Doubloon na każdą kartę, której nikt nie wybrał w tej rundzie
    for (const card of state.roleCards) {
      if (card.isAvailable()) {
        card.doubloonsOnCard += state.supply.drawDoubloons(1);
      }
    }

    // Reset kart (takenBy = null)
    for (const card of state.roleCards) {
      card.reset();
    }

    // Wyczyść targowisko jeśli pełne
    if (state.tradingHouse.isFull()) {
      const cleared = state.tradingHouse.clear();
      for (const good of cleared) {
        state.supply.returnGoods(good, 1);
      }
    }

    // Przesuń gubernatora
    state.governorIndex = (state.governorIndex + 1) % state.players.length;
    state.roundNumber++;
  }

  onExit(_state: GameState): void {}

  getValidActions(_state: GameState, _playerId: PlayerId): Action[] { return []; }

  private applyCapturedPrivilege(state: GameState, corsair: import('../../domain/Player').Player, role: RoleType): void {
    switch (role) {
      case RoleType.Prospector:
      case RoleType.Trader:
      case RoleType.Builder:
        corsair.doubloons += state.supply.drawDoubloons(1);
        break;
      case RoleType.Captain:
        corsair.victoryPointTokens += state.supply.drawVictoryPoints(1);
        break;
      case RoleType.Mayor:
        if (state.supply.workersPool > 0) {
          state.supply.workersPool--;
          corsair.pendingWorkers++;
        }
        break;
      case RoleType.Settler: {
        const deck = state.supply.plantationDecks.find(d => d.length > 0);
        if (deck && corsair.island.hasFreeRuralSlot()) {
          corsair.island.addPlantation(deck.pop()!);
          if (deck.length === 0) {
            state.supply.plantationDecks.splice(state.supply.plantationDecks.indexOf(deck), 1);
          }
        }
        break;
      }
      case RoleType.Craftsman:
      case RoleType.Corsair:
        break;
    }
  }

  checkTransition(state: GameState): GamePhase | null {
    // Warunki końca gry (sprawdzane po zakończeniu rundy)
    const vpDepleted = state.supply.victoryPointPool === 0;
    // Rozszerzenie II: wyczerpanie robotników NIE kończy gry gdy aktywny moduł Szlachcic.
    const colonistsDepleted = !state.nobleExpansion &&
      state.supply.workersPool === 0 && state.supply.workersInMagistrate === 0;
    const cityFull = state.players.some(p => p.island.isCityFull());

    if (vpDepleted || colonistsDepleted || cityFull) {
      state.gameOver = true;
      const reasons: string[] = [];
      if (vpDepleted)        reasons.push('Wyczerpała się pula żetonów PZ');
      if (colonistsDepleted) reasons.push('Wyczerpała się pula robotników');
      if (cityFull) {
        const fullPlayer = state.players.find(p => p.island.isCityFull());
        reasons.push(`Miasto gracza ${fullPlayer?.name ?? ''} jest pełne (12 pól miejskich)`);
      }
      state.gameOverReason = reasons.join(' · ');
      return new GameOverPhase();
    }

    return new RoleSelectionPhase();
  }
}
