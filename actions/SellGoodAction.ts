import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { GOOD_PRICES } from '../core/constants';
import { GoodType, PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
import type { Building } from '../domain/buildings/Building';

// Faza kupca: sprzedaż jednego znacznika towaru na Targowisku lub przez Faktorię.
// - Standardowo nie można sprzedać towaru, który już jest na Targowisku.
// - Wyjątek: gracz ma aktywne Biuro handlowe (hook allowsSellingDuplicate).
// - Faktoria: można sprzedawać nawet gdy targowisko jest pełne lub towar jest duplikatem;
//   sprzedany towar trafia do puli (nie na targowisko), bez bonusu Małego/Dużego targu.
// - Cena = bazowa cena z karty Targowiska + modyfikatory budynków (Mały targ, Duży targ)
//   + 1 dublon przywileju selektora.
export class SellGoodAction implements Action {
  readonly type = 'SELL_GOOD';

  constructor(
    readonly playerId: PlayerId,
    readonly good: GoodType,
    readonly useFactoria: boolean = false,
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

    if (this.useFactoria) {
      if (player.hasUsedFactoriaThisPhase) {
        return Err('Faktoria była już użyta w tej fazie');
      }
      const hasFaktoria = player.island
        .getActiveBuildings()
        .some((b: Building) => b.allowsSellingWhenFull?.() === true);
      if (!hasFaktoria) return Err('Nie posiadasz aktywnej Faktorii');
      return OkVoid;
    }

    if (state.tradingHouse.isFull()) {
      // Sprawdź Faktoria (allowsSellingWhenFull) — pozwala sprzedać gdy pełne
      const canUseFaktoria = !player.hasUsedFactoriaThisPhase &&
        player.island.getActiveBuildings().some((b: Building) => b.allowsSellingWhenFull?.() === true);
      if (!canUseFaktoria) {
        return Err('Targowisko jest pełne');
      }
      // Jeśli możemy użyć Faktorii — przechwycone wyżej; tutaj robimy normalną sprzedaż
      // gdy TH jest pełne tylko Faktoria mogłaby pomóc, więc to jest nieważne
      return Err('Targowisko jest pełne');
    }

    if (state.tradingHouse.containsGood(this.good)) {
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

    player.removeStoredGoods(this.good, 1);

    const isSelector = state.getRoleSelector().id === this.playerId;

    if (this.useFactoria) {
      // Faktoria: towar idzie do puli, nie na targowisko; brak bonusów targu
      state.supply.returnGoods(this.good, 1);
      player.hasUsedFactoriaThisPhase = true;
      let price = GOOD_PRICES[this.good];
      if (isSelector) price += 1;
      // Biblioteka podwaja przywilej kupca (+2 zamiast +1)
      if (isSelector && player.island.getActiveBuildings().some(b => b.doublesRolePrivilege?.())) {
        price += 1;
      }
      const paid = state.supply.drawDoubloons(price);
      player.doubloons += paid;
      state.advanceCurrentPlayer();
      return;
    }

    state.tradingHouse.addGood(this.good);

    let price = GOOD_PRICES[this.good];

    for (const building of player.island.getActiveBuildings()) {
      if (building.modifySellPrice) {
        price = building.modifySellPrice(state, player, this.good, price);
      }
    }

    if (isSelector) {
      price += 1;
      // Biblioteka podwaja przywilej kupca (+2 zamiast +1)
      if (player.island.getActiveBuildings().some(b => b.doublesRolePrivilege?.())) {
        price += 1;
      }
    }

    const paid = state.supply.drawDoubloons(price);
    player.doubloons += paid;

    state.advanceCurrentPlayer();
  }
}
