import type { GameState } from '../../state/GameState';
import type { Player } from '../../domain/Player';
import type { Building } from '../../domain/buildings/Building';
import type { ProductionBuilding } from '../../domain/buildings/ProductionBuilding';
import { GoodType, BuildingCategory } from '../../core/types';
import { GOOD_PRICES, GOOD_TO_PLANTATION } from '../../core/constants';
import { ScoreCalculator } from '../../state/ScoreCalculator';

export const HARDCORE_GOODS = Object.values(GoodType);
export function isProduction(b: Building): b is ProductionBuilding {
  return b.category === BuildingCategory.Production;
}
export function remainingRounds(state: GameState): number {
  if (state.gameOver) return 0;
  const city = Math.min(...state.players.map(p => p.island.getFreeUrbanSlotCount()));
  const production = state.players.reduce((sum, p) => sum + HARDCORE_GOODS.reduce((s, g) => s + p.island.getProductionCapacity(g), 0), 0);
  return Math.max(0.35, Math.min(9, city * 1.4 + 0.4,
    state.nobleExpansion ? Infinity : (state.supply.workersPool + state.supply.workersInMagistrate) / Math.max(3, state.players.length * 1.35) + 0.5,
    state.supply.victoryPointPool / Math.max(4, production * 0.65) + 0.3));
}
export function potentialProduction(player: Player, good: GoodType): number {
  const count = player.island.getPlantations().filter(p => p.type === GOOD_TO_PLANTATION[good] && !p.isForest).length;
  if (good === GoodType.Corn) return count;
  const capacity = Math.max(0, ...player.island.getBuildings().filter(isProduction).filter(b => b.produces === good).map(b => b.workerCapacity));
  return Math.min(count, capacity);
}
export function utilityValue(building: Building, state: GameState, player: Player, rounds = remainingRounds(state)): number {
  const potential = HARDCORE_GOODS.map(g => potentialProduction(player, g));
  const total = potential.reduce((a, b) => a + b, 0);
  const distinct = potential.filter(n => n > 0).length;
  const activeCash = Math.min(1, rounds / 2.5);
  switch (building.id) {
    case 'smallMarket': return (total > 0 ? 0.50 : 0.16) * rounds;
    case 'largeMarket': return (total > 0 ? 0.90 : 0.20) * rounds;
    case 'factory': return Math.max(0, distinct - 1) * 0.65 * rounds;
    case 'harbour': return Math.min(2.8, distinct * 0.85) * rounds;
    case 'wharf': return Math.max(0.25, total * 0.37) * rounds;
    case 'university': return Math.min(rounds, player.island.getFreeUrbanSlotCount()) * 0.65 * activeCash;
    case 'hospice': return Math.min(rounds * 0.8, player.island.getFreeRuralSlotCount()) * 0.50 * activeCash;
    case 'hacienda': return Math.min(rounds, player.island.getFreeRuralSlotCount()) * 0.28 * activeCash;
    case 'smallWarehouse': return Math.min(1.1, total * 0.15) * rounds;
    case 'largeWarehouse': return Math.min(1.8, total * 0.22) * rounds;
    case 'office': return (potential[4]! > 0 ? 0.65 : 0.30) * rounds;
    case 'smithy': return Math.max(0, player.island.countActiveQuarries() - 1) * 0.25 * rounds;
    case 'library': return 0.95 * rounds;
    case 'chapel': return 0.75 * rounds;
    case 'villa': return 0.95 * rounds;
    case 'jewelersWorkshop': return player.getTotalNobles() * 0.45 * rounds;
    case 'lighthouse': return Math.max(0.3, distinct * 0.4) * rounds;
    case 'church': return Math.min(rounds * 0.8, player.island.getFreeUrbanSlotCount()) * 0.85;
    case 'marina': return total * 0.22 * rounds;
    case 'masonsGuild': return 0.65 * rounds;
    default: return building.calculateEndGameBonus ? 0 : 0.22 * rounds;
  }
}
export function hardcorePlayerValue(state: GameState, player: Player, rounds = remainingRounds(state)): number {
  let value = player.victoryPointTokens + (state.nobleExpansion ? player.getTotalNobles() : 0);
  const buildings = player.island.getBuildings();
  const labour = player.island.getTotalEmployedWorkers() + player.island.countNobles() + player.pendingWorkers + player.pendingNobles + player.heldWorkers + player.heldNobles;
  const capacity = Math.max(1, player.island.getPlantations().length + buildings.reduce((sum, b) => sum + b.workerCapacity, 0));
  const staffing = Math.min(0.9, (labour + rounds * 0.8) / capacity);
  for (const b of buildings) {
    value += b.victoryPoints;
    const activation = b.isActive() ? 1 : staffing * Math.min(0.8, rounds * 0.3);
    value += (b.calculateEndGameBonus?.(state, player) ?? 0) * activation;
    value += utilityValue(b, state, player, rounds) * activation;
  }
  let types = 0;
  for (const good of HARDCORE_GOODS) {
    const active = player.island.getProductionCapacity(good);
    const potential = potentialProduction(player, good);
    if (potential > 0) types++;
    const production = active + Math.max(0, potential - active) * staffing * Math.min(0.7, rounds * 0.2);
    const effective = Math.min(production, 4) + Math.max(0, production - 4) * 0.45;
    value += effective * (0.74 + GOOD_PRICES[good] * 0.105) * Math.min(5.5, rounds * 0.65);
    const stock = player.getStoredGoodCount(good);
    const ship = state.ships.find(s => s.loadedGood === good);
    const room = ship?.remainingCapacity() ?? Math.max(0, ...state.ships.filter(s => s.loadedGood === null).map(s => s.remainingCapacity()));
    const safe = buildings.some(b => b.isActive() && (b.hasOwnShip?.() || b.goodTypesToKeepAfterCaptain?.()));
    value += Math.min(stock, safe ? stock : room) * Math.min(0.85, rounds * 0.65);
    value += Math.max(0, stock - room) * (safe ? 0 : 0.12);
    if (stock > 0 && !state.tradingHouse.containsGood(good)) value += GOOD_PRICES[good] * 0.09 * Math.min(1, rounds);
  }
  value += types * Math.min(0.8, rounds * 0.13);
  value += Math.min(player.doubloons, 15) * Math.min(0.62, rounds * 0.17);
  value += Math.max(0, player.doubloons - 15) * Math.min(0.18, rounds * 0.06);
  value += player.island.countActiveQuarries() * Math.min(1.8, rounds * 0.35);
  value += Math.min(20, labour) * Math.min(0.35, rounds * 0.065);
  return value;
}
export function terminalUtilities(state: GameState): number[] {
  const winners = ScoreCalculator.getWinners(state);
  return state.players.map(p => winners.some(w => w.playerId === p.id) ? 1 / winners.length : 0);
}
export function evaluateHardcoreState(state: GameState): number[] {
  if (state.gameOver) return terminalUtilities(state);
  const rounds = remainingRounds(state);
  const values = state.players.map(p => hardcorePlayerValue(state, p, rounds));
  const best = Math.max(...values);
  const weights = values.map(value => Math.exp((value - best) / (4 + rounds * 0.8)));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(value => value / sum);
}