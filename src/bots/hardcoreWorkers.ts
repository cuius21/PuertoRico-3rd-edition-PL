import type { Action } from '../../actions/Action';
import { PlaceWorkerAction, type WorkerTarget } from '../../actions/PlaceWorkerAction';
import type { GameState } from '../../state/GameState';
import type { Player } from '../../domain/Player';
import { GoodType, PlantationType, type PlayerId } from '../../core/types';
import { GOOD_PRICES, GOOD_TO_PLANTATION } from '../../core/constants';
import { HARDCORE_GOODS, isProduction, remainingRounds, utilityValue } from './hardcoreEvaluation';

interface Allocation { target: WorkerTarget; count: number }
interface Option { cost: number; value: number; allocations: Allocation[] }
interface Plan { key: string; allocations: Allocation[] }
const cache = new WeakMap<Player, Plan>();
const zero = (): Option => ({ cost: 0, value: 0, allocations: [] });

function allocationPlan(state: GameState, player: Player): Allocation[] {
  const budget = Math.min(player.pendingWorkers + player.pendingNobles, player.island.getFreeWorkerSlotsCount());
  const rounds = remainingRounds(state);
  const groups: Option[][] = [];
  const slots = player.island.getPlantationSlots();
  const buildings = player.island.getBuildings();
  for (const good of HARDCORE_GOODS) {
    const indices = slots.flatMap((p, i) => p && p.type === GOOD_TO_PLANTATION[good] && !p.isForest && p.hasFreeWorkerSlot() ? [i] : []);
    const active = player.island.countActivePlantations(GOOD_TO_PLANTATION[good]);
    const production = buildings.filter(isProduction).filter(b => b.produces === good);
    const firstActive = production.find(b => b.isActive());
    const building = firstActive ?? production.reduce<(typeof production)[number] | undefined>((best, b) => !best || b.workerCapacity > best.workerCapacity ? b : best, undefined);
    const employed = building ? building.occupiedWorkers + building.occupiedNobles : 0;
    const free = building ? building.workerCapacity - employed : 0;
    const options = new Map<number, Option>();
    const potentialTypes = HARDCORE_GOODS.filter(g => g === GoodType.Corn ? slots.some(p => p?.type === PlantationType.Corn) : buildings.some(b => isProduction(b) && b.produces === g)).length;
    const factoryPremium = buildings.some(b => b.id === 'factory') && potentialTypes > 1 ? 0.6 : 0;
    for (let p = 0; p <= indices.length; p++) {
      for (let b = 0; b <= (good === GoodType.Corn ? 0 : free); b++) {
        const cost = p + b;
        if (cost > budget) continue;
        const capacity = good === GoodType.Corn ? active + p : Math.min(active + p, employed + b);
        const base = good === GoodType.Corn ? active : Math.min(active, employed);
        const value = (capacity - base) * (1.55 + GOOD_PRICES[good] * 0.24) * Math.min(2.5, rounds * 0.75) +
          (capacity > 0 && base === 0 ? (0.5 + factoryPremium) * Math.min(2, rounds) : 0) + cost * 0.008;
        const allocations: Allocation[] = indices.slice(0, p).map(slotIndex => ({ target: { kind: 'plantation', slotIndex }, count: 1 }));
        if (b > 0 && building) allocations.push({ target: { kind: 'building', buildingId: building.id }, count: employed + b });
        if (!options.has(cost) || options.get(cost)!.value < value) options.set(cost, { cost, value, allocations });
      }
    }
    groups.push([...options.values()]);
  }
  const quarries = slots.flatMap((p, i) => p?.type === PlantationType.Quarry && p.hasFreeWorkerSlot() ? [i] : []);
  const activeQuarries = player.island.countActiveQuarries();
  groups.push(Array.from({ length: Math.min(budget, quarries.length) + 1 }, (_, count) => ({
    cost: count,
    value: Array.from({ length: count }, (_, i) => Math.max(0.06, 1.25 - (activeQuarries + i) * 0.29) * Math.min(3, rounds * 0.65)).reduce((a, b) => a + b, 0),
    allocations: quarries.slice(0, count).map(slotIndex => ({ target: { kind: 'plantation' as const, slotIndex }, count: 1 })),
  })));
  for (const building of buildings) {
    if (isProduction(building) || !building.hasFreeWorkerSlot()) continue;
    let bonus = building.calculateEndGameBonus?.(state, player) ?? 0;
    if (building.id === 'fortress') bonus = Math.floor((player.island.getTotalEmployedWorkers() + player.pendingWorkers) / 3);
    const benefit = building.isActive() ? 0.01 : bonus + utilityValue(building, state, player, Math.min(3, rounds)) + 0.01;
    groups.push([zero(), { cost: 1, value: benefit,
      allocations: [{ target: { kind: 'building', buildingId: building.id }, count: building.occupiedWorkers + building.occupiedNobles + 1 }] }]);
  }
  let dp: (Option | undefined)[] = Array.from({ length: budget + 1 });
  dp[0] = zero();
  for (const group of groups) {
    const next: (Option | undefined)[] = Array.from({ length: budget + 1 });
    for (let spent = 0; spent <= budget; spent++) {
      const old = dp[spent];
      if (!old) continue;
      for (const option of group) {
        const cost = spent + option.cost;
        if (cost > budget) continue;
        const value = old.value + option.value;
        if (!next[cost] || value > next[cost]!.value) next[cost] = {
          cost, value, allocations: old.allocations.concat(option.allocations),
        };
      }
    }
    dp = next;
  }
  return dp.reduce<Option>((best, current) => current && current.value > best.value ? current : best, zero()).allocations;
}

export function chooseWorkerAction(state: GameState, playerId: PlayerId, actions = state.getValidActions(playerId)): Action {
  const player = state.getPlayer(playerId)!;
  const total = player.pendingWorkers + player.pendingNobles + player.island.getTotalEmployedWorkers() + player.island.countNobles();
  const key = `${state.roundNumber}:${state.roleSelectorIndex}:${total}:${player.island.getBuildings().length}:${player.island.getPlantations().length}`;
  let plan = cache.get(player);
  if (!plan || plan.key !== key) {
    plan = { key, allocations: allocationPlan(state, player) };
    cache.set(player, plan);
  }
  let target = plan.allocations.find(a => {
    const target = a.target;
    const tile = target.kind === 'plantation' ? player.island.getPlantationSlots()[target.slotIndex] : player.island.getBuildings().find(b => b.id === target.buildingId);
    return tile && tile.occupiedWorkers + tile.occupiedNobles < a.count;
  })?.target;
  if (!target) target = (actions.find(a => a.type === 'PLACE_WORKER') as PlaceWorkerAction | undefined)?.target;
  if (target) {
    const nobleUseful = target.kind === 'building' && ['chapel', 'huntingLodge', 'masonsGuild'].includes(target.buildingId);
    const reservedNobles = plan.allocations.filter(a => a.target.kind === 'building' && ['chapel', 'huntingLodge', 'masonsGuild'].includes(a.target.buildingId)).length;
    const asNoble = player.pendingNobles > 0 && (player.pendingWorkers === 0 || nobleUseful || player.pendingNobles > reservedNobles);
    const selected = actions.find(a => a instanceof PlaceWorkerAction && a.asNoble === asNoble &&
      (a.target.kind === 'plantation' && target!.kind === 'plantation' ? a.target.slotIndex === target!.slotIndex :
        a.target.kind === 'building' && target!.kind === 'building' && a.target.buildingId === target!.buildingId));
    if (selected) return selected;
  }
  return actions.find(a => a.type === 'MAYOR_PASS') ?? actions[0]!;
}