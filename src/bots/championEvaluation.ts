import type { GameState } from '../../state/GameState';
import type { Player } from '../../domain/Player';
import { PhaseType } from '../../core/types';
import { HARDCORE_GOODS, hardcorePlayerValue, remainingRounds, terminalUtilities } from './hardcoreEvaluation';
import { estimateChampionShipping } from './championShipping';

type CargoPlan = ReturnType<typeof estimateChampionShipping>;

export function championCargoUnits(state: GameState, player: Player, plan: CargoPlan): number {
  const alreadyLoaded = state.getCurrentPhase().type === PhaseType.Captain ? player.marinaGoodsLoaded : 0;
  const marinaPoints = Math.floor((alreadyLoaded + plan.marinaShipped) / 2) - Math.floor(alreadyLoaded / 2);
  return plan.publicShipped + plan.wharfShipped + marinaPoints;
}

function previousStockValue(state: GameState, player: Player, rounds: number): number {
  const safe = player.island.getBuildings().some(b => b.isActive() && (b.hasOwnShip?.() || b.goodTypesToKeepAfterCaptain?.()));
  return HARDCORE_GOODS.reduce((value, good) => {
    const stock = player.getStoredGoodCount(good);
    const ship = state.ships.find(s => s.loadedGood === good);
    const room = ship?.remainingCapacity() ?? Math.max(0, ...state.ships.filter(s => s.loadedGood === null).map(s => s.remainingCapacity()));
    return value + Math.min(stock, safe ? stock : room) * Math.min(0.85, rounds * 0.65) +
      Math.max(0, stock - room) * (safe ? 0 : 0.12);
  }, 0);
}

export function championPlayerValue(state: GameState, player: Player, rounds = remainingRounds(state)): number {
  const base = hardcorePlayerValue(state, player, rounds);
  const plan = estimateChampionShipping(state, player);
  if (!plan.supported) return base;
  // Feasible cargo for this player is an optimistic plan, not a forecast of opponents'
  // responses. Discount its value; retain the original trade-price and utility terms.
  // In particular, do not add plan.shippingVp: it already includes the Harbour bonus.
  const stockValue = championCargoUnits(state, player, plan) * Math.min(0.85, rounds * 0.65) +
    plan.retained * Math.min(0.55, rounds * 0.35) + plan.discarded * 0.12;
  return base - previousStockValue(state, player, rounds) + stockValue;
}

export function evaluateChampionState(state: GameState): number[] {
  if (state.gameOver) return terminalUtilities(state);
  const rounds = remainingRounds(state);
  const values = state.players.map(p => championPlayerValue(state, p, rounds));
  const best = Math.max(...values);
  const weights = values.map(value => Math.exp((value - best) / (4 + rounds * 0.8)));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(value => value / sum);
}