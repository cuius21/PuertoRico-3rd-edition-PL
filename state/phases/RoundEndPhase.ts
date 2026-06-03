import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { GameOverPhase } from './GameOverPhase';
import { RoleSelectionPhase } from './RoleSelectionPhase';

// Koniec rundy: nakładanie dublonów na nieużywane karty, reset kart, przesunięcie gubernatora.
// Potem sprawdzenie warunków końca gry.
export class RoundEndPhase implements GamePhase {
  readonly type = PhaseType.RoundEnd;

  onEnter(state: GameState): void {
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

  checkTransition(state: GameState): GamePhase | null {
    // Warunki końca gry (sprawdzane po zakończeniu rundy)
    const vpDepleted = state.supply.victoryPointPool === 0;
    const colonistsDepleted = state.supply.workersPool === 0 && state.supply.workersInMagistrate === 0;
    const cityFull = state.players.some(p => p.island.isCityFull());

    if (vpDepleted || colonistsDepleted || cityFull) {
      state.gameOver = true;
      const reasons: string[] = [];
      if (vpDepleted)       reasons.push('Wyczerpała się pula żetonów PZ');
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
