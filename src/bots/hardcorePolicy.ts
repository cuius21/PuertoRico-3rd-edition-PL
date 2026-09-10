import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import type { Player } from '../../domain/Player';
import type { Building } from '../../domain/buildings/Building';
import { GoodType, PlantationType, RoleType, type PlayerId } from '../../core/types';
import { GOOD_PRICES, GOOD_TO_PLANTATION } from '../../core/constants';
import { chooseWorkerAction } from './hardcoreWorkers';
import { HARDCORE_GOODS, isProduction, potentialProduction, remainingRounds, utilityValue } from './hardcoreEvaluation';

export function hardcoreActionKey(action: Action): string {
  return JSON.stringify(action);
}
function salePrice(state: GameState, p: Player, good: GoodType): number {
  let price = GOOD_PRICES[good];
  for (const b of p.island.getActiveBuildings()) price = b.modifySellPrice?.(state, p, good, price) ?? price;
  return price;
}
function buildingValue(state: GameState, p: Player, b: Building, selector: boolean): number {
  const rounds = remainingRounds(state);
  const cost = Math.max(0, b.cost - Math.min(p.island.countActiveQuarries(), b.priceGroup) - (selector ? 1 : 0) - Math.floor(p.island.countForests() / 2));
  let value = b.victoryPoints + (b.calculateEndGameBonus?.(state, p) ?? 0) * Math.min(0.85, rounds * 0.35);
  value += utilityValue(b, state, p, rounds) * 0.62;
  if (isProduction(b)) {
    const plantations = p.island.getPlantations().filter(t => t.type === GOOD_TO_PLANTATION[b.produces] && !t.isForest).length;
    const delta = Math.max(0, Math.min(plantations, b.workerCapacity) - potentialProduction(p, b.produces));
    value += delta * (1.1 + GOOD_PRICES[b.produces] * 0.2) * Math.min(5, rounds * 0.72);
    if (plantations === 0) value += Math.min(0.6, rounds * 0.1);
  }
  value -= cost * Math.min(0.8, rounds * 0.24);
  value -= b.tileSize * Math.min(0.6, rounds * 0.08);
  if (p.doubloons - cost < 2 && rounds > 3 && !isProduction(b)) value -= 0.6;
  if (state.festivalBoard?.budowa.buildingId === b.id && !state.festivalBoard.budowa.completedBy) value += 3;
  return value;
}
function roleBenefit(role: RoleType, state: GameState, p: Player, selector: boolean): number {
  const rounds = remainingRounds(state);
  const stock = p.getTotalStoredGoods();
  switch (role) {
    case RoleType.Craftsman: {
      let value = 0;
      for (const g of HARDCORE_GOODS) {
        const production = Math.min(p.island.getProductionCapacity(g), state.supply.getGoodsAvailable(g));
        value += production * (0.8 + GOOD_PRICES[g] * 0.10) / (1 + p.getStoredGoodCount(g) * 0.3);
      }
      return value + (selector && value > 0 ? 0.9 : 0);
    }
    case RoleType.Captain: {
      const own = p.island.getActiveBuildings().some(b => b.hasOwnShip?.());
      let value = 0;
      for (const g of HARDCORE_GOODS) {
        const goodStock = p.getStoredGoodCount(g);
        const existing = state.ships.find(s => s.loadedGood === g);
        const room = existing?.remainingCapacity() ?? Math.max(0, ...state.ships.filter(s => s.loadedGood === null).map(s => s.remainingCapacity()));
        value += Math.min(goodStock, own ? goodStock : room) * 0.85;
      }
      return value + (selector && value > 0 ? 1 : 0);
    }
    case RoleType.Trader: {
      if (state.tradingHouse.isFull()) return 0;
      let value = 0;
      for (const g of HARDCORE_GOODS) if (p.getStoredGoodCount(g) > 0 &&
        (!state.tradingHouse.containsGood(g) || p.island.getActiveBuildings().some(b => b.allowsSellingDuplicate?.(state, p, g)))) {
        value = Math.max(value, (salePrice(state, p, g) + (selector ? 1 : 0)) * Math.min(1.1, rounds * 0.3));
      }
      return value;
    }
    case RoleType.Builder: {
      let value = 0;
      for (const b of state.supply.availableBuildings) {
        if (p.island.hasBuildingOfType(b.id) || p.island.getFreeUrbanSlotCount() < b.tileSize) continue;
        const cost = Math.max(0, b.cost - Math.min(p.island.countActiveQuarries(), b.priceGroup) - (selector ? 1 : 0) - Math.floor(p.island.countForests() / 2));
        if (cost <= p.doubloons) value = Math.max(value, buildingValue(state, p, b, selector));
      }
      return value;
    }
    case RoleType.Mayor: {
      const available = Math.ceil(state.supply.workersInMagistrate / state.players.length) + (selector ? 1 : 0) + p.heldWorkers + p.heldNobles;
      const free = p.island.getFreeWorkerSlotsCount();
      const inactiveBonus = p.island.getBuildings().filter(b => !b.isActive()).reduce((sum, b) => sum + (b.calculateEndGameBonus?.(state, p) ?? 0), 0);
      const productionGap = HARDCORE_GOODS.reduce((sum, g) => sum + Math.max(0, potentialProduction(p, g) - p.island.getProductionCapacity(g)), 0);
      return Math.min(available, free) * Math.min(1.2, rounds * 0.3) + Math.min(available, productionGap) * 1.4 + inactiveBonus * Math.min(1, available);
    }
    case RoleType.Settler: {
      if (!p.island.hasFreeRuralSlot()) return 0;
      let value = selector && p.island.countActiveQuarries() < 2 ? Math.min(1.5, rounds * 0.3) : 0;
      for (const t of state.supply.revealedPlantations) value = Math.max(value, plantationValue(t.type, p, rounds));
      return value;
    }
    case RoleType.Prospector: return selector ? Math.min(1, rounds * 0.3) : 0;
    case RoleType.Corsair: return selector ? 2 : 0;
    default: return stock * 0;
  }
}
function plantationValue(type: PlantationType, p: Player, rounds: number): number {
  if (type === PlantationType.Quarry) return Math.max(0.15, 1.4 - p.island.getPlantations().filter(t => t.type === PlantationType.Quarry).length * 0.4) * Math.min(3, rounds * 0.6);
  const good = type as unknown as GoodType;
  const existing = p.island.getPlantations().filter(t => t.type === type && !t.isForest).length;
  if (good === GoodType.Corn) return Math.max(0.35, 1.4 - existing * 0.23) * Math.min(2.4, rounds * 0.5);
  const capacity = Math.max(0, ...p.island.getBuildings().filter(isProduction).filter(b => b.produces === good).map(b => b.workerCapacity));
  const ready = capacity > existing;
  return (ready ? 1.4 + GOOD_PRICES[good] * 0.2 : (existing === 0 ? 0.65 + GOOD_PRICES[good] * 0.11 : 0.15)) * Math.min(2.8, rounds * 0.5);
}
export function scoreHardcoreAction(action: Action, state: GameState, playerId: PlayerId): number {
  const a = action as unknown as Record<string, any>;
  const p = state.getPlayer(playerId)!;
  const rounds = remainingRounds(state);
  const selector = state.getRoleSelector().id === playerId;
  switch (action.type) {
    case 'SELECT_ROLE': {
      const role = a['role'] as RoleType;
      const mine = roleBenefit(role, state, p, true);
      const opponents = state.players.filter(other => other.id !== playerId).map(other => roleBenefit(role, state, other, false));
      const relative = mine - (opponents.reduce((s, v) => s + v, 0) / Math.max(1, opponents.length)) * 0.65;
      const card = typeof a['cardIndex'] === 'number' ? state.roleCards[a['cardIndex']] : state.roleCards.find(c => c.type === role && c.isAvailable());
      return relative + (card?.doubloonsOnCard ?? 0) * Math.min(0.85, rounds * 0.25);
    }
    case 'BUILD': {
      const b = state.supply.availableBuildings.find(b => b.id === a['buildingId']);
      return b ? buildingValue(state, p, b, selector) : -10;
    }
    case 'TAKE_PLANTATION': {
      const choice = a['choice'] as { kind: string; index?: number };
      if (choice.kind === 'quarry') return plantationValue(PlantationType.Quarry, p, rounds);
      const t = choice.index === undefined ? undefined : state.supply.revealedPlantations[choice.index];
      return t ? plantationValue(t.type, p, rounds) : 0;
    }
    case 'SELL_GOOD': return salePrice(state, p, a['good']) * Math.min(1.1, rounds * 0.3);
    case 'CRAFTSMAN_BONUS': return 1 + GOOD_PRICES[a['good'] as GoodType] * 0.3 - p.getStoredGoodCount(a['good']) * 0.12;
    case 'LOAD_SHIP': {
      const good = a['good'] as GoodType;
      const target = a['target'] as { kind: string; shipIndex?: number };
      const stock = p.getStoredGoodCount(good);
      if (target.kind === 'marina') return stock * 0.45;
      if (target.kind === 'wharf') {
        const publicRoom = Math.max(0, ...state.ships.filter(s => s.canAccept(good)).map(s => s.remainingCapacity()));
        return stock - Math.min(publicRoom, stock) * 0.16;
      }
      const ship = state.ships[target.shipIndex!];
      if (!ship) return 0;
      const load = Math.min(stock, ship.remainingCapacity());
      const rival = Math.max(0, ...state.players.filter(other => other.id !== playerId).map(other => other.getStoredGoodCount(good)));
      return load - Math.min(rival, ship.remainingCapacity() - load) * 0.16;
    }
    case 'SELECT_STORAGE': return (a['keepTypes'] as GoodType[]).reduce((s, g) => s + p.getStoredGoodCount(g) + GOOD_PRICES[g] * 0.25, 0);
    case 'TAKE_DOUBLOON': return 1;
    case 'PASS': return 0;
    default: return 0;
  }
}
export function chooseHeuristicAction(state: GameState, playerId: PlayerId, actions = state.getValidActions(playerId)): Action {
  if (actions.length === 0) throw new Error('HardcoreBot: no valid actions');
  if (actions.length === 1) return actions[0]!;
  if (actions.some(a => a.type === 'PLACE_WORKER')) return chooseWorkerAction(state, playerId, actions);
  let best = actions[0]!;
  let score = -Infinity;
  for (const action of actions) {
    const value = scoreHardcoreAction(action, state, playerId);
    if (value > score) { score = value; best = action; }
  }
  return best;
}