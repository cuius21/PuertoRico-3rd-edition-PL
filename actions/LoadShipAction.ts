import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { GoodType, PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

export type ShipTarget =
  | { kind: 'ship'; shipIndex: number }
  | { kind: 'wharf' }
  | { kind: 'marina' };

// Faza kapitana: gracz ładuje maksymalną możliwą ilość towaru na wybrany statek.
// Na jeden statek może trafić tylko jeden rodzaj towaru.
// Ten sam towar nie może być jednocześnie na dwóch różnych statkach.
// Nabrzeże (Wharf) daje własny "statek" bez limitu pojemności, użyteczny raz na fazę.
// Przystań (Marina) — prywatny statek na dowolne towary; VP=1 za każde 2 załadowane (liczone na koniec fazy).
export class LoadShipAction implements Action {
  readonly type = 'LOAD_SHIP';

  constructor(
    readonly playerId: PlayerId,
    readonly target: ShipTarget,
    readonly good: GoodType,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Captain) {
      return Err('Ładowanie możliwe tylko w fazie kapitana');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej w fazie kapitana');
    }

    const player = state.getPlayer(this.playerId)!;
    if (player.getStoredGoodCount(this.good) === 0) {
      return Err(`Nie posiadasz towaru ${this.good}`);
    }

    if (this.target.kind === 'ship') {
      const { shipIndex } = this.target;
      const ship = state.ships[shipIndex];
      if (!ship) return Err('Nieprawidłowy indeks statku');
      if (!ship.canAccept(this.good)) {
        return Err(`Statek nie może przyjąć towaru ${this.good}`);
      }
      const alreadyOnOtherShip = state.ships.some(
        (s, idx) => idx !== shipIndex && s.loadedGood === this.good,
      );
      if (alreadyOnOtherShip) {
        return Err(`Towar ${this.good} jest już załadowany na innym statku`);
      }
    } else if (this.target.kind === 'wharf') {
      const hasWharf = player.island.getActiveBuildings().some(b => b.hasOwnShip?.());
      if (!hasWharf) return Err('Nie posiadasz aktywnego Nabrzeża');
      if (player.hasUsedWharfThisPhase) return Err('Nabrzeże było już użyte w tej fazie');
    } else {
      // marina
      const hasMarina = player.island.getActiveBuildings().some(b => b.hasPrivateMarinaShip?.());
      if (!hasMarina) return Err('Nie posiadasz aktywnej Przystani');
    }

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    let amountLoaded = 0;

    if (this.target.kind === 'ship') {
      const ship = state.ships[this.target.shipIndex]!;
      const canLoad = Math.min(player.getStoredGoodCount(this.good), ship.remainingCapacity());
      player.removeStoredGoods(this.good, canLoad);
      ship.loadedGood = this.good;
      ship.loadedCount += canLoad;
      amountLoaded = canLoad;
    } else if (this.target.kind === 'wharf') {
      amountLoaded = player.getStoredGoodCount(this.good);
      player.removeStoredGoods(this.good, amountLoaded);
      player.hasUsedWharfThisPhase = true;
    } else {
      // marina: ładuje wszystkie towary tego rodzaju, VP=1 za każde 2 na koniec fazy
      amountLoaded = player.getStoredGoodCount(this.good);
      player.removeStoredGoods(this.good, amountLoaded);
      // Towary wracają od razu do puli (tak jak po rozładunku statku)
      state.supply.returnGoods(this.good, amountLoaded);
      player.marinaGoodsLoaded += amountLoaded;
      // Latarnia morska: +1 dublon za każdy załadunek (marina też jest załadunkiem)
      for (const building of player.island.getActiveBuildings()) {
        if (building.bonusDblPerLoad) {
          player.doubloons += state.supply.drawDoubloons(building.bonusDblPerLoad());
        }
      }
      state.advanceCurrentPlayer();
      return;
    }

    // PZ za załadunek: bazowo 1 PZ na jednostkę + bonus z Portu
    let vp = amountLoaded;
    for (const building of player.island.getActiveBuildings()) {
      if (building.bonusVpOnShipping) {
        vp += building.bonusVpOnShipping(state, player, amountLoaded);
      }
    }
    // Kapitan (selektor) dostaje +1 PZ przy pierwszym załadunku
    if (!player.hasUsedCaptainBonusThisPhase && state.getRoleSelector().id === this.playerId) {
      vp += 1;
      player.hasUsedCaptainBonusThisPhase = true;
    }

    const awarded = state.supply.drawVictoryPoints(vp);
    player.victoryPointTokens += awarded;

    // Latarnia morska: +1 dublon za każdy załadunek
    for (const building of player.island.getActiveBuildings()) {
      if (building.bonusDblPerLoad) {
        player.doubloons += state.supply.drawDoubloons(building.bonusDblPerLoad());
      }
    }

    state.advanceCurrentPlayer();
  }
}
