import type { Action } from '../../actions/Action';
import { PlaceWorkerAction, type WorkerTarget } from '../../actions/PlaceWorkerAction';
import type { GameState } from '../../state/GameState';
import type { Player } from '../../domain/Player';
import type { Building } from '../../domain/buildings/Building';
import { GoodType, PlantationType, type PlayerId } from '../../core/types';
import { GOOD_PRICES, GOOD_TO_PLANTATION } from '../../core/constants';
import { HARDCORE_GOODS, isProduction, remainingRounds, utilityValue } from './hardcoreEvaluation';

interface Placement { target: WorkerTarget; count: number }
interface Choice { cost: number; score: number; placements: Placement[] }
interface Link { score: number; choice: Choice; previous?: Link }
interface Profile { production: number[]; quarries: number; active: Set<string>; employed: number }
interface Plan { key: string; placements: Placement[] }
const cache = new WeakMap<Player, Plan>();
const emptyChoice = (): Choice => ({ cost: 0, score: 0, placements: [] });

function profile(player: Player, placements: Placement[]): Profile {
  const plantations = player.island.getPlantationSlots().map(p => p ? p.occupiedWorkers + p.occupiedNobles : 0);
  const buildings = player.island.getBuildings();
  const staff = new Map(buildings.map(b => [b.id, b.occupiedWorkers + b.occupiedNobles]));
  for (const { target, count } of placements) {
    if (target.kind === 'plantation') plantations[target.slotIndex] = count;
    else staff.set(target.buildingId, count);
  }
  const counts = HARDCORE_GOODS.map(g => player.island.getPlantationSlots().reduce((sum, p, i) =>
    sum + (p?.type === GOOD_TO_PLANTATION[g] && plantations[i]! > 0 ? 1 : 0), 0));
  const production = HARDCORE_GOODS.map((g, i) => {
    if (g === GoodType.Corn) return counts[i]!;
    // Match the engine's first active production building, including small/large pairs.
    const b = buildings.find(b => isProduction(b) && b.produces === g && staff.get(b.id)! > 0);
    return b ? Math.min(counts[i]!, staff.get(b.id)!) : 0;
  });
  return {
    production,
    quarries: player.island.getPlantationSlots().reduce((sum, p, i) => sum + (p?.type === PlantationType.Quarry && plantations[i]! > 0 ? 1 : 0), 0),
    active: new Set(buildings.filter(b => staff.get(b.id)! > 0).map(b => b.id)),
    employed: plantations.reduce((a, b) => a + b, 0) + [...staff.values()].reduce((a, b) => a + b, 0),
  };
}

function productionValue(production: number[], rounds: number): number {
  return production.reduce((sum, count, i) => sum + count * (1.55 + GOOD_PRICES[HARDCORE_GOODS[i]!] * 0.24) * Math.min(2.5, rounds * 0.75) +
    (count > 0 ? 0.5 * Math.min(2, rounds) : 0), 0);
}
function quarryValue(count: number, rounds: number): number {
  let value = 0;
  for (let i = 0; i < count; i++) value += Math.max(0.06, 1.25 - i * 0.29) * Math.min(3, rounds * 0.65);
  return value;
}
function operatingValue(building: Building, state: GameState, player: Player, plan: Profile, rounds: number): number {
  const total = plan.production.reduce((a, b) => a + b, 0);
  const distinct = plan.production.filter(n => n > 0).length;
  const stock = HARDCORE_GOODS.map(g => player.getStoredGoodCount(g));
  const storedTypes = stock.filter(n => n > 0).length;
  const stockTotal = stock.reduce((a, b) => a + b, 0);
  switch (building.id) {
    case 'factory': return (building.factoryBonusDoubloons?.(distinct) ?? Math.max(0, distinct - 1)) * 0.65 * rounds;
    case 'harbour': return Math.min(2.8, distinct * 0.85) * rounds + storedTypes * 0.35;
    case 'wharf': return Math.max(...plan.production) * 0.55 * rounds + Math.max(...stock) * 0.20;
    case 'smallMarket': return distinct > 0 ? 0.50 * rounds : storedTypes > 0 ? 0.50 : 0;
    case 'largeMarket': return distinct > 0 ? 0.90 * rounds : storedTypes > 0 ? 0.90 : 0;
    case 'smallWarehouse': return Math.min(1.1, total * 0.15) * rounds + Math.min(2, stockTotal) * 0.1;
    case 'largeWarehouse': return Math.min(1.8, total * 0.22) * rounds + Math.min(4, stockTotal) * 0.1;
    case 'office': return distinct > 0 ? (plan.production[4]! > 0 ? 0.65 : 0.30) * rounds : storedTypes > 0 ? 0.3 : 0;
    case 'smithy': return Math.max(0, plan.quarries - 1) * 0.25 * rounds;
    case 'lighthouse': return distinct * 0.4 * rounds + storedTypes * 0.15;
    case 'marina': return total * 0.22 * rounds + stockTotal * 0.1;
    default: return utilityValue(building, state, player, rounds);
  }
}
function largeBonus(building: Building, state: GameState, player: Player, assigned: number): number {
  if (building.id === 'fortress') {
    return Math.floor((player.island.getTotalEmployedWorkers() + Math.min(player.pendingWorkers, assigned)) / 3);
  }
  return building.calculateEndGameBonus?.(state, player) ?? 0;
}
function planValue(state: GameState, player: Player, placements: Placement[], rounds: number): number {
  const plan = profile(player, placements);
  const assigned = plan.employed - player.island.getTotalEmployedWorkers() - player.island.countNobles();
  let value = productionValue(plan.production, rounds) + quarryValue(plan.quarries, rounds) + assigned * 0.008;
  for (const b of player.island.getBuildings()) {
    if (!plan.active.has(b.id) || isProduction(b)) continue;
    value += largeBonus(b, state, player, assigned) + operatingValue(b, state, player, plan, Math.min(3, rounds));
  }
  return value;
}

function productionGroups(player: Player, budget: number, rounds: number): Choice[][] {
  const slots = player.island.getPlantationSlots();
  const buildings = player.island.getBuildings();
  const groups: Choice[][] = [];
  for (const good of HARDCORE_GOODS) {
    const freePlants = slots.flatMap((p, i) => p?.type === GOOD_TO_PLANTATION[good] && !p.isForest && p.hasFreeWorkerSlot() ? [i] : []);
    const activePlants = player.island.countActivePlantations(GOOD_TO_PLANTATION[good]);
    const producers = buildings.filter(isProduction).filter(b => b.produces === good);
    const selected = producers.find(b => b.isActive()) ?? producers.reduce<(typeof producers)[number] | undefined>((best, b) => !best || b.workerCapacity > best.workerCapacity ? b : best, undefined);
    const occupied = selected ? selected.occupiedWorkers + selected.occupiedNobles : 0;
    const capacity = selected ? selected.workerCapacity - occupied : 0;
    const options = new Map<number, Choice>();
    for (let p = 0; p <= freePlants.length; p++) {
      for (let b = 0; b <= (good === GoodType.Corn ? 0 : capacity); b++) {
        const cost = p + b;
        if (cost > budget) continue;
        const production = good === GoodType.Corn ? activePlants + p : Math.min(activePlants + p, occupied + b);
        const previous = good === GoodType.Corn ? activePlants : Math.min(activePlants, occupied);
        const score = (production - previous) * (1.55 + GOOD_PRICES[good] * 0.24) * Math.min(2.5, rounds * 0.75) +
          (production > 0 && previous === 0 ? 0.5 * Math.min(2, rounds) : 0) + cost * 0.008;
        const placements: Placement[] = freePlants.slice(0, p).map(slotIndex => ({ target: { kind: 'plantation', slotIndex }, count: 1 }));
        if (b > 0 && selected) placements.push({ target: { kind: 'building', buildingId: selected.id }, count: occupied + b });
        if (!options.has(cost) || options.get(cost)!.score < score) options.set(cost, { cost, score, placements });
      }
    }
    groups.push([...options.values()]);
  }
  const freeQuarries = slots.flatMap((p, i) => p?.type === PlantationType.Quarry && p.hasFreeWorkerSlot() ? [i] : []);
  const activeQuarries = player.island.countActiveQuarries();
  groups.push(Array.from({ length: Math.min(budget, freeQuarries.length) + 1 }, (_, count) => ({
    cost: count, score: quarryValue(activeQuarries + count, rounds) - quarryValue(activeQuarries, rounds) + count * 0.008,
    placements: freeQuarries.slice(0, count).map(slotIndex => ({ target: { kind: 'plantation' as const, slotIndex }, count: 1 })),
  })));
  return groups;
}
function solve(groups: Choice[][], budget: number): Placement[] {
  let dp: (Link | undefined)[] = new Array(budget + 1);
  dp[0] = { score: 0, choice: emptyChoice() };
  for (const group of groups) {
    const next: (Link | undefined)[] = new Array(budget + 1);
    for (let used = 0; used <= budget; used++) {
      const previous = dp[used];
      if (!previous) continue;
      for (const choice of group) {
        const cost = used + choice.cost;
        if (cost > budget) continue;
        const score = previous.score + choice.score;
        if (!next[cost] || next[cost]!.score < score) next[cost] = { score, choice, previous };
      }
    }
    dp = next;
  }
  let best: Link | undefined;
  for (const candidate of dp) if (candidate && (!best || candidate.score > best.score)) best = candidate;
  const placements: Placement[] = [];
  while (best) { placements.push(...best.choice.placements); best = best.previous; }
  return placements.reverse();
}
function allocationPlan(state: GameState, player: Player): Placement[] {
  const budget = Math.min(player.pendingWorkers + player.pendingNobles, player.island.getFreeWorkerSlotsCount());
  const rounds = remainingRounds(state);
  const base = productionGroups(player, budget, rounds);
  const utilities = player.island.getBuildings().filter(b => !isProduction(b) && !b.isActive() && b.hasFreeWorkerSlot());
  const references = [profile(player, []), profile(player, solve(base, budget))];
  let best: Placement[] = [];
  let bestValue = -Infinity;
  const signature = (p: Profile) => `${p.production.join(',')}:${p.quarries}`;
  const seen = new Set(references.map(signature));
  const processed = new Set<string>();
  // Few coordinated knapsack passes expose complete production chains first, then price
  // utilities against those attainable chains. Final ranking always uses the resulting plan.
  for (let pass = 0; pass < 5 && pass < references.length; pass++) {
    const reference = references[pass]!;
    const referenceKey = signature(reference);
    if (processed.has(referenceKey)) continue;
    processed.add(referenceKey);
    const groups = base.concat(utilities.map(b => [emptyChoice(), {
      cost: 1,
      score: largeBonus(b, state, player, budget) + operatingValue(b, state, player, reference, Math.min(3, rounds)) + 0.008,
      placements: [{ target: { kind: 'building' as const, buildingId: b.id }, count: 1 }],
    }]));
    const placements = solve(groups, budget);
    const value = planValue(state, player, placements, rounds);
    if (value > bestValue) { bestValue = value; best = placements; }
    const next = profile(player, placements);
    const key = signature(next);
    if (!seen.has(key)) { references.push(next); seen.add(key); }
  }
  return best;
}

export function chooseChampionWorkerAction(state: GameState, playerId: PlayerId, actions: Action[]): Action {
  const player = state.getPlayer(playerId)!;
  const workers = player.pendingWorkers + player.island.getTotalEmployedWorkers();
  const nobles = player.pendingNobles + player.island.countNobles();
  const key = `${state.roundNumber}:${state.roleSelectorIndex}:${workers}:${nobles}:${player.island.getBuildings().length}:${player.island.getPlantations().length}`;
  let plan = cache.get(player);
  if (!plan || plan.key !== key) {
    plan = { key, placements: allocationPlan(state, player) };
    cache.set(player, plan);
  }
  const unfinished = plan.placements.filter(({ target, count }) => {
    const tile = target.kind === 'plantation' ? player.island.getPlantationSlots()[target.slotIndex] : player.island.getBuildings().find(b => b.id === target.buildingId);
    return tile && tile.occupiedWorkers + tile.occupiedNobles < count;
  });
  const target = unfinished[0]?.target;
  if (target) {
    const prefersNoble = (target: WorkerTarget) => target.kind === 'building' && ['chapel', 'huntingLodge', 'masonsGuild'].includes(target.buildingId);
    const reservedNobles = unfinished.filter(p => prefersNoble(p.target)).length;
    const hasFortress = player.island.hasBuildingOfType('fortress');
    const asNoble = player.pendingNobles > 0 && (player.pendingWorkers === 0 || prefersNoble(target) || (!hasFortress && player.pendingNobles > reservedNobles));
    const selected = actions.find(a => a instanceof PlaceWorkerAction && a.asNoble === asNoble &&
      (a.target.kind === 'plantation' && target.kind === 'plantation' ? a.target.slotIndex === target.slotIndex :
        a.target.kind === 'building' && target.kind === 'building' && a.target.buildingId === target.buildingId));
    if (selected) return selected;
  }
  // Extra staff may activate an earlier small factory and reduce a larger factory's
  // production in this engine. Keep them rather than filling arbitrary legal slots.
  return actions.find(a => a.type === 'MAYOR_PASS') ?? actions[0]!;
}