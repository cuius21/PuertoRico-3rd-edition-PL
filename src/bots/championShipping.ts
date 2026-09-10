import type { GameState } from '../../state/GameState';
import type { Player } from '../../domain/Player';
import { GoodType, PhaseType } from '../../core/types';
import { GOOD_PRICES } from '../../core/constants';

const GOODS = [GoodType.Corn, GoodType.Indigo, GoodType.Sugar, GoodType.Tobacco, GoodType.Coffee] as const;
const PRICE_ORDER = [4, 3, 2, 1, 0] as const;

export interface ChampionGoodShipping {
  public: number;
  wharf: number;
  marina: number;
  retained: number;
  discarded: number;
}
export interface ChampionPublicAssignment {
  shipIndex: number;
  good: GoodType;
  amount: number;
}
export interface ChampionShippingEstimate {
  shipped: number;
  retained: number;
  discarded: number;
  publicShipped: number;
  wharfShipped: number;
  marinaShipped: number;
  loads: number;
  publicLoads: number;
  wharfLoads: number;
  marinaLoads: number;
  shippingVp: number;
  captainBonus: number;
  estimatedVp: number;
  byGood: Record<GoodType, ChampionGoodShipping>;
  publicAssignments: ChampionPublicAssignment[];
  wharfGood: GoodType | null;
  plansEvaluated: number;
  supported: boolean;
  limitations: string[];
}

/**
 * Optimistic plan for this player's current cargo at the current public ships,
 * before any opponent reactions, new production or trading. It is not a forecast
 * of an entire multiplayer Captain phase. Maximizes shipping VP, then retained
 * quantity, then retained trade value; all returned quantities use the same plan.
 *
 * At most 60 maximal public allocations and five Wharf choices (300 plans) for
 * the game's three public ships and five goods. Loading a public ship before
 * the Wharf weakly dominates omitting that load for this isolated-player goal.
 * Outside Captain, per-phase flags reset and the future selector is unknown.
 */
export function estimateChampionShipping(state: GameState, player: Player): ChampionShippingEstimate {
  const stock = GOODS.map(good => player.getStoredGoodCount(good));
  const totalStock = stock.reduce((sum, count) => sum + count, 0);
  const currentCaptain = state.getCurrentPhase().type === PhaseType.Captain;
  const progress = currentCaptain ? state.getCurrentPhase().getProgress?.(state) : undefined;
  const storageOnly = currentCaptain && (state.captainStoragePending || progress?.storagePhaseStarted === true || progress?.storageDone === true);
  const canLoad = !state.gameOver && !storageOnly;
  const buildings = player.island.getActiveBuildings();
  const limitations = ['Optimistic own-cargo allocation; opponent reactions, production and trading are excluded.'];
  let supported = true;
  if (buildings.some(b => b.id === 'treasury') && player.getTotalNobles() > 0 &&
      (!currentCaptain || !player.hasUsedTreasuryThisPhase)) {
    supported = false;
    limitations.push('Optional Treasury conversions are not optimized; use the caller fallback for this expansion.');
  }
  if (!currentCaptain && buildings.some(b => b.bonusVpAtCaptainStart)) {
    supported = false;
    limitations.push('Future Captain-start VP bonuses are excluded; use the caller fallback for this expansion.');
  }
  if (buildings.some(b => b.bonusVpOnShipping && b.id !== 'harbour')) {
    supported = false;
    limitations.push('Unknown shipping VP hook; only the standard Harbour bonus is included.');
  }
  if (!currentCaptain) limitations.push('Future Captain selector privilege is excluded.');
  const harbourPerLoad = buildings.filter(b => b.id === 'harbour').length;
  const wharfAvailable = canLoad && buildings.some(b => b.hasOwnShip?.()) && (!currentCaptain || !player.hasUsedWharfThisPhase);
  const marinaAvailable = canLoad && buildings.some(b => b.hasPrivateMarinaShip?.());
  const marinaCarry = currentCaptain ? player.marinaGoodsLoaded % 2 : 0;
  const captainEligible = currentCaptain && !player.hasUsedCaptainBonusThisPhase && state.getRoleSelector().id === player.id;
  const warehouseCapacity = buildings.reduce((sum, b) => sum + (b.goodTypesToKeepAfterCaptain?.() ?? 0), 0);
  const extraStorage = buildings.reduce((most, b) => Math.max(most, b.extraGoodsStorage?.() ?? 0), 0);
  const publicAmounts = [0, 0, 0, 0, 0];
  const remaining = stock.slice();
  const kept = [0, 0, 0, 0, 0];
  const assignments: ChampionPublicAssignment[] = [];
  const occupied = [0, 0, 0, 0, 0];
  for (const ship of state.ships) {
    const index = GOODS.indexOf(ship.loadedGood as GoodType);
    if (index >= 0) occupied[index]!++;
  }
  if (occupied.some(count => count > 1)) {
    supported = false;
    limitations.push('Duplicate public ship goods are blocked exactly as LoadShipAction validates them.');
  }
  const emptyShips: { index: number; room: number }[] = [];
  if (state.ships.length > 3) {
    supported = false;
    limitations.push('More than three public ships are outside this solver scope; use the caller fallback.');
  }
  if (canLoad) {
    for (let shipIndex = 0; shipIndex < Math.min(3, state.ships.length); shipIndex++) {
      const ship = state.ships[shipIndex]!;
      const room = Math.max(0, ship.remainingCapacity());
      if (!room) continue;
      if (ship.loadedGood === null) {
        emptyShips.push({ index: shipIndex, room });
        continue;
      }
      const index = GOODS.indexOf(ship.loadedGood);
      if (index < 0 || occupied[index] !== 1) continue;
      const amount = Math.min(remaining[index]!, room);
      if (amount > 0) {
        publicAmounts[index]! += amount;
        remaining[index]! -= amount;
        assignments.push({ shipIndex, good: GOODS[index]!, amount });
      }
    }
  }
  const candidates = GOODS.map((_, i) => i).filter(i => stock[i]! > 0 && occupied[i] === 0);
  const used = [false, false, false, false, false];
  let best: ChampionShippingEstimate | undefined;
  let bestRetainedValue = -Infinity;
  let plansEvaluated = 0;

  function retain(): { count: number; value: number } {
    kept.fill(0);
    if (state.gameOver) {
      for (let i = 0; i < 5; i++) kept[i] = remaining[i]!;
    } else if (!marinaAvailable) {
      const types = remaining.reduce((sum, count) => sum + Number(count > 0), 0);
      if (warehouseCapacity > 0) {
        if (types <= warehouseCapacity) {
          for (let i = 0; i < 5; i++) kept[i] = remaining[i]!;
        } else {
          // The engine's interactive storage generator currently offers at most
          // two whole types, even with both warehouses; SelectStorageAction then
          // discards other types without applying Depot's extra-goods hook.
          const choices = Math.min(2, warehouseCapacity);
          for (let selected = 0; selected < choices; selected++) {
            let index = -1;
            for (const i of PRICE_ORDER) {
              if (remaining[i]! > 0 && kept[i] === 0 &&
                  (index === -1 || remaining[i]! > remaining[index]!)) index = i;
            }
            if (index >= 0) kept[index] = remaining[index]!;
          }
        }
      } else {
        const first = PRICE_ORDER.find(i => remaining[i]! > 0);
        if (first !== undefined) kept[first] = 1;
        let extra = extraStorage;
        for (const i of PRICE_ORDER) {
          const count = Math.min(extra, remaining[i]! - kept[i]!);
          kept[i]! += count;
          extra -= count;
        }
      }
    }
    let count = 0;
    let value = 0;
    for (let i = 0; i < 5; i++) {
      count += kept[i]!;
      value += kept[i]! * GOOD_PRICES[GOODS[i]!];
    }
    return { count, value };
  }

  function consider(wharfIndex: number): void {
    plansEvaluated++;
    const wharfShipped = wharfIndex >= 0 ? remaining[wharfIndex]! : 0;
    if (wharfIndex >= 0) remaining[wharfIndex] = 0;
    const marinaShipped = marinaAvailable ? remaining.reduce((sum, count) => sum + count, 0) : 0;
    const marinaLoads = marinaAvailable ? remaining.reduce((sum, count) => sum + Number(count > 0), 0) : 0;
    const retained = retain();
    const publicShipped = publicAmounts.reduce((sum, count) => sum + count, 0);
    const wharfLoads = Number(wharfShipped > 0);
    const normalLoads = assignments.length + wharfLoads;
    const shippingVp = publicShipped + wharfShipped + harbourPerLoad * normalLoads +
      (marinaAvailable ? Math.floor((marinaCarry + marinaShipped) / 2) : 0);
    const captainBonus = captainEligible && normalLoads > 0 ? 1 : 0;
    const shipped = publicShipped + wharfShipped + marinaShipped;
    if (!best || shippingVp > best.shippingVp ||
        (shippingVp === best.shippingVp && (retained.count > best.retained ||
          (retained.count === best.retained && retained.value > bestRetainedValue)))) {
      const byGood = {} as Record<GoodType, ChampionGoodShipping>;
      for (let i = 0; i < 5; i++) {
        const wharf = i === wharfIndex ? wharfShipped : 0;
        const marina = marinaAvailable ? remaining[i]! : 0;
        byGood[GOODS[i]!] = {
          public: publicAmounts[i]!, wharf, marina, retained: kept[i]!,
          discarded: stock[i]! - publicAmounts[i]! - wharf - marina - kept[i]!,
        };
      }
      best = {
        shipped, retained: retained.count, discarded: totalStock - shipped - retained.count,
        publicShipped, wharfShipped, marinaShipped,
        loads: normalLoads + marinaLoads, publicLoads: assignments.length, wharfLoads, marinaLoads,
        shippingVp, captainBonus,
        estimatedVp: Math.min(state.supply.victoryPointPool, shippingVp + captainBonus),
        byGood, publicAssignments: assignments.map(assignment => ({ ...assignment })),
        wharfGood: wharfIndex >= 0 ? GOODS[wharfIndex]! : null,
        plansEvaluated: 0, supported, limitations,
      };
      bestRetainedValue = retained.value;
    }
    if (wharfIndex >= 0) remaining[wharfIndex] = wharfShipped;
  }

  function evaluatePublicAllocation(): void {
    if (wharfAvailable) {
      let found = false;
      for (let i = 0; i < 5; i++) {
        if (remaining[i]! > 0) { found = true; consider(i); }
      }
      if (found) return;
    }
    consider(-1);
  }

  function assignPublic(shipCursor: number, candidatesLeft: number): void {
    if (shipCursor >= emptyShips.length || candidatesLeft === 0) {
      evaluatePublicAllocation();
      return;
    }
    const ship = emptyShips[shipCursor]!;
    if (candidatesLeft < emptyShips.length - shipCursor) assignPublic(shipCursor + 1, candidatesLeft);
    for (const index of candidates) {
      if (used[index]) continue;
      used[index] = true;
      const amount = Math.min(remaining[index]!, ship.room);
      publicAmounts[index] = amount;
      remaining[index]! -= amount;
      assignments.push({ shipIndex: ship.index, good: GOODS[index]!, amount });
      assignPublic(shipCursor + 1, candidatesLeft - 1);
      assignments.pop();
      remaining[index]! += amount;
      publicAmounts[index] = 0;
      used[index] = false;
    }
  }

  assignPublic(0, candidates.length);
  best!.plansEvaluated = plansEvaluated;
  return best!;
}
