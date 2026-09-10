import type { Action } from '../../actions/Action';
import { PlaceWorkerAction, type WorkerTarget } from '../../actions/PlaceWorkerAction';
import { MayorPassAction } from '../../actions/MayorPassAction';
import type { GameState } from '../../state/GameState';
import type { Player } from '../../domain/Player';
import { GoodType, PlantationType, PhaseType, RoleType, type PlayerId } from '../../core/types';
import { GOOD_PRICES, GOOD_TO_PLANTATION } from '../../core/constants';
import { cloneGameState } from './simulation';
import { chooseHeuristicAction, hardcoreActionKey } from './hardcorePolicy';
import { chooseChampionWorkerAction } from './championWorkers';
import { HARDCORE_GOODS, isProduction, remainingRounds, utilityValue } from './hardcoreEvaluation';

const BASE_BUILDINGS = new Set([
  'smallIndigoPlant', 'largeIndigoPlant', 'smallSugarMill', 'largeSugarMill', 'tobaccoStorage', 'coffeeRoaster',
  'smallMarket', 'smithy', 'hacienda', 'hospice', 'smallWarehouse', 'office', 'largeMarket', 'largeWarehouse',
  'factory', 'university', 'harbour', 'wharf', 'fortress', 'guildHall', 'customsHouse', 'cityHall', 'residence',
]);
export interface MayorPlan {
  name: string;
  baseline: boolean;
  actionKeys: string[];
  signature: string;
}
interface Placement { target: WorkerTarget; count: number }
interface Choice { cost: number; score: number; placements: Placement[] }
interface Theme {
  name: string; production: number; price: number; diversity: number; quarry: number;
  utility: number; bonus: number; market: number; shipping: number; employment: number;
  preferred?: GoodType;
}
const themes: Theme[] = [
  { name: 'balanced', production: 1, price: .24, diversity: .7, quarry: 1, utility: 1, bonus: 1, market: 1, shipping: 1, employment: .01 },
  { name: 'shipping', production: 1.8, price: 0, diversity: .4, quarry: .25, utility: .6, bonus: .7, market: .4, shipping: 2.5, employment: .01 },
  { name: 'trade', production: .7, price: .9, diversity: .1, quarry: .3, utility: .7, bonus: .7, market: 3, shipping: .6, employment: .01 },
  { name: 'construction', production: .7, price: .15, diversity: .4, quarry: 3, utility: 1.5, bonus: .8, market: 1, shipping: .4, employment: .01 },
  { name: 'end-bonuses', production: .35, price: .1, diversity: .1, quarry: .2, utility: .4, bonus: 4, market: .3, shipping: .4, employment: .01 },
  { name: 'diversity', production: 1, price: .1, diversity: 3, quarry: .3, utility: 1.4, bonus: .8, market: .8, shipping: 1.8, employment: .01 },
  { name: 'corn', production: 1, price: .1, diversity: .3, quarry: .3, utility: .7, bonus: .8, market: .5, shipping: 2, employment: .01, preferred: GoodType.Corn },
  { name: 'coffee', production: .8, price: .4, diversity: .3, quarry: .5, utility: 1, bonus: 1, market: 2, shipping: 1, employment: .01, preferred: GoodType.Coffee },
  { name: 'tobacco', production: .8, price: .4, diversity: .3, quarry: .5, utility: 1, bonus: 1, market: 2, shipping: 1, employment: .01, preferred: GoodType.Tobacco },
  { name: 'stock-and-hold', production: .5, price: .2, diversity: .3, quarry: .2, utility: 1.6, bonus: 1, market: 2.5, shipping: 2, employment: -.08 },
  { name: 'employment', production: 1, price: .2, diversity: .4, quarry: .6, utility: .8, bonus: 1, market: 1, shipping: 1, employment: .8 },
];

export function supportsMayorSearchState(state: GameState): boolean {
  return state.players.length === 3 && !state.nobleExpansion && state.festivalBoard === null &&
    !state.roleCards.some(card => card.type === RoleType.Corsair) &&
    state.supply.availableBuildings.every(b => BASE_BUILDINGS.has(b.id)) &&
    state.players.every(p => p.getTotalNobles() === 0 && p.island.getBuildings().every(b => BASE_BUILDINGS.has(b.id))) &&
    !state.players.some(p => p.island.getPlantations().some(t => t.isForest));
}
function activeTurn(state: GameState, playerId: PlayerId): boolean {
  return !state.gameOver && state.getCurrentPhase().type === PhaseType.Mayor && state.getCurrentPlayer().id === playerId;
}
export function mayorAllocationSignature(player: Player): string {
  return JSON.stringify({
    plantations: player.island.getPlantationSlots().map(p => p ? [p.occupiedWorkers, p.occupiedNobles] : null),
    buildings: player.island.getBuildings().map(b => [b.id, b.occupiedWorkers, b.occupiedNobles]),
    held: player.heldWorkers, heldNobles: player.heldNobles,
  });
}
function tracePlan(state: GameState, playerId: PlayerId, name: string, baseline: boolean,
  select: (sim: GameState, actions: Action[]) => Action): MayorPlan {
  const sim = cloneGameState(state), actionKeys: string[] = [];
  for (let step = 0; activeTurn(sim, playerId) && step < 200; step++) {
    const actions = sim.getValidActions(playerId);
    if (!actions.length) throw new Error('Mayor plan has no legal continuation');
    const action = select(sim, actions);
    if (!sim.apply(action).ok) throw new Error('Illegal action while constructing Mayor plan');
    actionKeys.push(hardcoreActionKey(action));
  }
  if (activeTurn(sim, playerId)) throw new Error('Incomplete Mayor plan');
  return { name, baseline, actionKeys, signature: mayorAllocationSignature(sim.getPlayer(playerId)!) };
}
function placementsPlan(state: GameState, playerId: PlayerId, name: string, placements: Placement[]): MayorPlan {
  return tracePlan(state, playerId, name, false, sim => {
    const player = sim.getPlayer(playerId)!;
    const next = placements.find(({ target, count }) => {
      const tile = target.kind === 'plantation' ? player.island.getPlantationSlots()[target.slotIndex] :
        player.island.getBuildings().find(b => b.id === target.buildingId);
      return tile && tile.occupiedWorkers < count;
    });
    if (next) return new PlaceWorkerAction(playerId, next.target);
    if (name.startsWith('employment')) {
      const buildings = player.island.getBuildings();
      const extra = buildings.find(b => {
        if (!b.hasFreeWorkerSlot()) return false;
        if (!isProduction(b) || b.isActive()) return true;
        const earlier = buildings.find(other => isProduction(other) && other.produces === b.produces && other.isActive());
        return !earlier || buildings.indexOf(earlier) < buildings.indexOf(b);
      });
      if (extra) return new PlaceWorkerAction(playerId, { kind: 'building', buildingId: extra.id });
    }
    return new MayorPassAction(playerId);
  });
}
function placementKey(placements: Placement[]): string {
  return placements.map(p => (p.target.kind === 'plantation' ? 'p' + p.target.slotIndex : 'b' + p.target.buildingId) + ':' + p.count).sort().join('|');
}
function groupsFor(state: GameState, player: Player, theme: Theme, budget: number): Choice[][] {
  const groups: Choice[][] = [], rounds = Math.min(3, remainingRounds(state));
  const buildings = player.island.getBuildings(), slots = player.island.getPlantationSlots();
  const productionScale = Math.min(2.5, rounds * .75);
  for (const good of HARDCORE_GOODS) {
    const freePlants = slots.flatMap((p, i) => p?.type === GOOD_TO_PLANTATION[good] && !p.isForest && p.hasFreeWorkerSlot() ? [i] : []);
    const activePlants = player.island.countActivePlantations(GOOD_TO_PLANTATION[good]);
    const producers = buildings.filter(isProduction).filter(b => b.produces === good);
    const producer = producers.find(b => b.isActive()) ??
      producers.reduce<(typeof producers)[number] | undefined>((best, b) => !best || b.workerCapacity > best.workerCapacity ? b : best, undefined);
    const occupied = producer?.occupiedWorkers ?? 0, capacity = producer ? producer.workerCapacity - occupied : 0;
    const options: Choice[] = [{ cost: 0, score: 0, placements: [] }];
    for (let p = 0; p <= freePlants.length; p++) for (let b = 0; b <= (good === GoodType.Corn ? 0 : capacity); b++) {
      const cost = p + b;
      if (!cost || cost > budget) continue;
      const old = good === GoodType.Corn ? activePlants : Math.min(activePlants, occupied);
      const production = good === GoodType.Corn ? activePlants + p : Math.min(activePlants + p, occupied + b);
      // Bundle candidates prioritize working chains; baseline and employment plans retain extra staffing.
      if (production <= old) continue;
      const preferred = theme.preferred ? (theme.preferred === good ? 3 : .4) : 1;
      const score = (production - old) * (theme.production * 1.55 + theme.price * GOOD_PRICES[good]) * productionScale * preferred +
        (old === 0 ? theme.diversity * Math.min(2, rounds) : 0) + cost * theme.employment;
      const placements: Placement[] = freePlants.slice(0, p).map(slotIndex => ({ target: { kind: 'plantation', slotIndex }, count: 1 }));
      if (b && producer) placements.push({ target: { kind: 'building', buildingId: producer.id }, count: occupied + b });
      options.push({ cost, score, placements });
    }
    groups.push(options);
  }
  const freeQuarries = slots.flatMap((p, i) => p?.type === PlantationType.Quarry && p.hasFreeWorkerSlot() ? [i] : []);
  const activeQuarries = player.island.countActiveQuarries();
  groups.push(Array.from({ length: Math.min(budget, freeQuarries.length) + 1 }, (_, count) => ({
    cost: count,
    score: Array.from({ length: count }, (_, i) => Math.max(.06, 1.25 - (activeQuarries + i) * .29) * Math.min(3, rounds * .65) * theme.quarry + theme.employment).reduce((a, b) => a + b, 0),
    placements: freeQuarries.slice(0, count).map(slotIndex => ({ target: { kind: 'plantation' as const, slotIndex }, count: 1 })),
  })));
  for (const building of buildings) {
    if (isProduction(building) || building.isActive() || !building.hasFreeWorkerSlot()) continue;
    let bonus = building.calculateEndGameBonus?.(state, player) ?? 0;
    if (building.id === 'fortress') bonus = Math.floor((player.island.getTotalEmployedWorkers() + player.pendingWorkers) / 3);
    let utility = utilityValue(building, state, player, rounds) * theme.utility;
    if (['smallMarket', 'largeMarket', 'office'].includes(building.id)) utility = (utility + Math.min(1.5, player.getTotalStoredGoods() * .2)) * theme.market;
    if (['harbour', 'wharf', 'smallWarehouse', 'largeWarehouse'].includes(building.id)) utility = (utility + Math.min(2, player.getTotalStoredGoods() * .2)) * theme.shipping;
    if (building.id === 'factory') utility *= Math.max(.5, theme.diversity);
    groups.push([{ cost: 0, score: 0, placements: [] }, {
      cost: 1, score: bonus * theme.bonus + utility + theme.employment,
      placements: [{ target: { kind: 'building', buildingId: building.id }, count: building.occupiedWorkers + 1 }],
    }]);
  }
  return groups;
}
function bestAllocations(groups: Choice[][], budget: number, shouldStop: () => boolean): Placement[][] {
  let dp: Choice[][] = Array.from({ length: budget + 1 }, () => []);
  dp[0] = [{ cost: 0, score: 0, placements: [] }];
  for (const group of groups) {
    if (shouldStop()) return [];
    const next: Choice[][] = Array.from({ length: budget + 1 }, () => []);
    for (let used = 0; used <= budget; used++) for (const previous of dp[used]!) for (const choice of group) {
      const cost = used + choice.cost;
      if (cost > budget) continue;
      const candidate = { cost, score: previous.score + choice.score, placements: previous.placements.concat(choice.placements) };
      const bucket = next[cost]!;
      if (bucket.length < 3 || candidate.score > bucket[bucket.length - 1]!.score) {
        bucket.push(candidate); bucket.sort((a, b) => b.score - a.score);
        if (bucket.length > 3) bucket.pop();
      }
    }
    dp = next;
  }
  const seen = new Set<string>(), result: Placement[][] = [];
  for (const candidate of dp.flat().sort((a, b) => b.score - a.score)) {
    const key = placementKey(candidate.placements);
    if (!seen.has(key)) { seen.add(key); result.push(candidate.placements); }
    if (result.length === 3) break;
  }
  return result;
}
export function generateMayorPlans(state: GameState, playerId: PlayerId, limit = 10,
  shouldStop: () => boolean = () => false): MayorPlan[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error('Mayor plan limit must be in [1, 12]');
  if (!supportsMayorSearchState(state) || !activeTurn(state, playerId)) throw new Error('Unsupported Mayor planning state');
  const baseline = tracePlan(state, playerId, 'hardcore', true, (sim, actions) => chooseHeuristicAction(sim, playerId, actions));
  const plans = [baseline], seen = new Set([baseline.signature]);
  const add = (plan: MayorPlan) => { if (!seen.has(plan.signature)) { seen.add(plan.signature); plans.push(plan); } };
  if (limit === 1 || shouldStop()) return plans;
  add(tracePlan(state, playerId, 'coordinated', false, (sim, actions) => chooseChampionWorkerAction(sim, playerId, actions)));
  const player = state.getPlayer(playerId)!, budget = Math.min(player.pendingWorkers, player.island.getFreeWorkerSlotsCount());
  const extras: { name: string; placements: Placement[] }[] = [];
  for (const theme of themes) {
    if (plans.length >= limit || shouldStop()) break;
    const candidates = bestAllocations(groupsFor(state, player, theme, budget), budget, shouldStop);
    if (!candidates.length || shouldStop()) break;
    add(placementsPlan(state, playerId, theme.name, candidates[0]!));
    for (let i = 1; i < candidates.length; i++) extras.push({ name: theme.name + '-alternative-' + i, placements: candidates[i]! });
  }
  for (const extra of extras) {
    if (plans.length >= limit || shouldStop()) break;
    add(placementsPlan(state, playerId, extra.name, extra.placements));
  }
  return plans.slice(0, limit);
}
