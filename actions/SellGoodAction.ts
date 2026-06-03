import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { GOOD_PRICES } from '../core/constants';
import { GoodType, PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
import type { Building } from '../domain/buildings/Building';

// Faza kupca: sprzedaż jednego znacznika towaru na Targowisku.
// - Standardowo nie można sprzedać towaru, który już jest na Targowisku.
// - Wyjątek: gracz ma aktywne Biuro handlowe (hook allowsSellingDuplicate).
// - Cena = bazowa cena z karty Targowiska + modyfikatory budynków (Mały targ, Duży targ)
//   + 1 dublon przywileju selektora.
// - Kupiec (selektor) NIE dostaje +1 dublonu, jeśli nic w tej fazie nie sprzedał -
//   tu nie ma to znaczenia, bo akcja sama sprzedaje, więc kupiec dostaje bonus.
export class SellGoodAction implements Action {
  readonly type = 'SELL_GOOD';

  constructor(
    readonly playerId: PlayerId,
    readonly good: GoodType,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Trader) {
      return Err('Sprzedawać można tylko w fazie kupca');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej w fazie kupca');
    }

    const player = state.getPlayer(this.playerId)!;

    if (player.getStoredGoodCount(this.good) === 0) {
      return Err(`Nie posiadasz znaczników ${this.good} w San Juan`);
    }

    if (state.tradingHouse.isFull()) {
      return Err('Targowisko jest pełne');
    }

    if (state.tradingHouse.containsGood(this.good)) {
      // Sprawdź czy gracz ma budynek pozwalający sprzedawać duplikat (Biuro handlowe).
      const canDuplicate = player.island
        .getActiveBuildings()
        .some((b: Building) => b.allowsSellingDuplicate?.(state, player, this.good) === true);

      if (!canDuplicate) {
        return Err(`Towar ${this.good} już jest na Targowisku`);
      }
    }

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;

    // Przesuwamy znacznik z San Juan gracza na Targowisko.
    player.removeStoredGoods(this.good, 1);
    state.tradingHouse.addGood(this.good);

    // Obliczamy wypłatę: cena bazowa + modyfikatory + przywilej selektora.
    let price = GOOD_PRICES[this.good];

    for (const building of player.island.getActiveBuildings()) {
      if (building.modifySellPrice) {
        price = building.modifySellPrice(state, player, this.good, price);
      }
    }

    const isSelector = state.getRoleSelector().id === this.playerId;
    if (isSelector) price += 1;

    // Bank może mieć mniej dublonów niż wynosi cena - drawDoubloons() zwróci tylko tyle ile jest.
    const paid = state.supply.drawDoubloons(price);
    player.doubloons += paid;

    state.advanceCurrentPlayer();
  }
}
