import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId, RoleType } from '../core/types';
import type { GameState } from '../state/GameState';

// Gracz w fazie wyboru postaci bierze jedną z dostępnych kart.
// - Zabiera ewentualne dublony leżące na karcie (do swojego San Juan).
// - Karta zostaje "przy nim" do końca rundy (takenBy ustawione).
// - Selektor i aktualny gracz w GameState są ustawiani na tego gracza
//   (selektor wykonuje akcję postaci jako pierwszy).
//
// Sama zmiana fazy (na SettlerPhase / TraderPhase / itd.) NIE jest tu zaszyta —
// to robota RoleSelectionPhase.checkTransition().
export class SelectRoleAction implements Action {
  readonly type = 'SELECT_ROLE';

  constructor(
    readonly playerId: PlayerId,
    readonly role: RoleType,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.RoleSelection) {
      return Err('Wybór postaci możliwy tylko w fazie wyboru postaci');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej, by wybrać postać');
    }

    const card = state.roleCards.find((c: { type: RoleType }) => c.type === this.role);
    if (!card) return Err(`Karta postaci ${this.role} nie istnieje w tej rozgrywce`);
    if (!card.isAvailable()) return Err(`Karta ${this.role} została już wybrana w tej rundzie`);

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const card = state.roleCards.find((c: { type: RoleType }) => c.type === this.role)!;

    // Gracz inkasuje dublony z karty (z poprzednich rund, jeśli były).
    player.doubloons += card.doubloonsOnCard;
    card.doubloonsOnCard = 0;

    // Karta przypisana do gracza.
    card.takenBy = this.playerId;

    // Selektor i aktualny gracz - selektor zawsze działa pierwszy w swojej fazie.
    const playerIndex = state.getPlayerIndex(this.playerId);
    state.roleSelectorIndex = playerIndex;
    state.currentPlayerIndex = playerIndex;
  }
}
