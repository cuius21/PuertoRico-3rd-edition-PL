import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId, GoodType } from '../core/types';
import type { GameState } from '../state/GameState';

// Faza kapitana: Skarbiec — przed pierwszym załadunkiem dostarcz do X różnych towarów (X = szlachcice gracza).
// Każdy dostarczony towar = 1 PZ.
export class TreasuryAction implements Action {
  readonly type = 'TREASURY';

  constructor(
    readonly playerId: PlayerId,
    readonly goods: GoodType[], // lista różnych towarów do dostarczenia (bez duplikatów)
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Captain) {
      return Err('Skarbiec używany tylko w fazie kapitana');
    }
    const player = state.getPlayer(this.playerId)!;

    // Maksymalna liczba towarów = liczba szlachciców gracza
    const maxGoods = player.getTotalNobles();
    if (this.goods.length > maxGoods) {
      return Err(`Możesz dostarczyć maksymalnie ${maxGoods} towarów (tyle masz szlachciców)`);
    }

    // Brak duplikatów
    const unique = new Set(this.goods);
    if (unique.size !== this.goods.length) return Err('Towary muszą być różnego rodzaju');

    // Gracz musi posiadać każdy towar
    for (const good of this.goods) {
      if (player.getStoredGoodCount(good) === 0) {
        return Err(`Nie posiadasz towaru: ${good}`);
      }
    }

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    player.hasUsedTreasuryThisPhase = true;
    for (const good of this.goods) {
      player.removeStoredGoods(good, 1);
      state.supply.returnGoods(good, 1);
    }
    const vp = state.supply.drawVictoryPoints(this.goods.length);
    player.victoryPointTokens += vp;
  }
}
