import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, RoleType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Pojmanie: korsarz "porywa" jedną z dostępnych kart postaci.
// Karta pozostaje widoczna dla innych graczy - mogą ją "wykupić" za 3 dublony.
// Jeśli nie zostanie wykupiona do końca rundy, korsarz gra ją sam w RoundEndPhase.
export class CorsairCaptureAction implements Action {
  readonly type = 'CORSAIR_CAPTURE';

  constructor(
    readonly playerId: PlayerId,
    readonly captureRole: RoleType,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Corsair) {
      return Err('Pojmanie możliwe tylko w fazie Korsarza');
    }
    if (state.getRoleSelector().id !== this.playerId) {
      return Err('Tylko selektor może wykonać akcję korsarza');
    }
    if (this.captureRole === RoleType.Corsair) {
      return Err('Nie można pojmać karty Korsarza');
    }
    const card = state.roleCards.find(c => c.type === this.captureRole);
    if (!card) return Err(`Karta ${this.captureRole} nie istnieje w tej rozgrywce`);
    if (!card.isAvailable()) return Err(`Karta ${this.captureRole} jest już zajęta`);
    return OkVoid;
  }

  execute(state: GameState): void {
    state.capturedRoleCard = this.captureRole;
  }
}
