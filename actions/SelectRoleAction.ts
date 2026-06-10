import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId, RoleType } from '../core/types';
import type { GameState } from '../state/GameState';

// Gracz w fazie wyboru postaci bierze jedną z dostępnych kart.
// - cardIndex wskazuje konkretną kartę w state.roleCards (ważne gdy są 2 karty tego samego
//   typu, np. dwa Poszukiwacze w grze 5-osobowej z różnymi nagromadzonymi dublonami).
// - null = znajdź pierwszą dostępną kartę danego typu (fallback / kompatybilność wsteczna).
export class SelectRoleAction implements Action {
  readonly type = 'SELECT_ROLE';

  constructor(
    readonly playerId: PlayerId,
    readonly role: RoleType,
    readonly cardIndex: number | null = null,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.RoleSelection) {
      return Err('Wybór postaci możliwy tylko w fazie wyboru postaci');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej, by wybrać postać');
    }
    if (this.role === RoleType.Corsair && state.corsairTokenHolderId === this.playerId) {
      return Err('Posiadasz żeton korsarza — nie możesz ponownie wybrać tej postaci');
    }

    const card = this.resolveCard(state);
    if (!card) return Err(`Karta postaci ${this.role} nie istnieje w tej rozgrywce`);
    if (card.type !== this.role) return Err(`Nieprawidłowy indeks karty`);
    if (!card.isAvailable()) return Err(`Karta ${this.role} została już wybrana w tej rundzie`);

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const card = this.resolveCard(state)!;

    if (state.capturedRoleCard === this.role) {
      const corsair = state.corsairTokenHolderId ? state.getPlayer(state.corsairTokenHolderId) : null;
      if (corsair) corsair.doubloons += state.supply.drawDoubloons(3);
      state.capturedRoleCard = null;
    }

    player.doubloons += card.doubloonsOnCard;
    card.doubloonsOnCard = 0;
    card.takenBy = this.playerId;

    const playerIndex = state.getPlayerIndex(this.playerId);
    state.roleSelectorIndex = playerIndex;
    state.currentPlayerIndex = playerIndex;
  }

  // Zwraca konkretną kartę na podstawie cardIndex albo pierwszą dostępną po typie.
  private resolveCard(state: GameState) {
    if (this.cardIndex !== null) {
      return state.roleCards[this.cardIndex];
    }
    return state.roleCards.find(c => c.type === this.role && c.isAvailable());
  }
}
