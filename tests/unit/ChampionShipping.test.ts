import { describe, expect, it } from 'vitest';
import { estimateChampionShipping } from '../../src/bots/championShipping';
import { GoodType, PhaseType } from '../../core/types';
import { Ship } from '../../domain/Ship';
import { Harbour, Wharf, SmallWarehouse, LargeWarehouse } from '../../domain/buildings/catalog/SmallUtilityBuildings';
import { Depot, Marina, TransferStation } from '../../domain/buildings/catalog/NewBuildings1';
import { Treasury } from '../../domain/buildings/catalog/NewBuildings2';
import { CaptainPhase } from '../../state/phases/CaptainPhase';
import { LoadShipAction } from '../../actions/LoadShipAction';
import { createGame, activateBuilding } from '../helpers';

function fixture(goods: Partial<Record<GoodType, number>>, ships: [number, GoodType | null, number][] = [
  [4, GoodType.Sugar, 4], [5, GoodType.Tobacco, 5], [6, GoodType.Coffee, 6],
]) {
  const state = createGame(3);
  const player = state.players[0]!;
  for (const good of Object.values(GoodType)) player.storedGoods.set(good, goods[good] ?? 0);
  state.ships.splice(0, state.ships.length, ...ships.map(([capacity, good, loaded]) => {
    const ship = new Ship(capacity);
    ship.loadedGood = good;
    ship.loadedCount = loaded;
    return ship;
  }));
  return { state, player };
}

describe('Champion public cargo allocation', () => {
  it('cannot allocate the same four-slot empty ship to two different goods', () => {
    const { state, player } = fixture({ corn: 5, indigo: 5 }, [[4, null, 0], [5, GoodType.Sugar, 5], [6, GoodType.Coffee, 6]]);
    const result = estimateChampionShipping(state, player);
    expect(result.publicShipped).toBe(4);
    expect(result.publicLoads).toBe(1);
    expect(result.shipped).toBe(4);
    expect(result.retained).toBe(1);
    expect(result.discarded).toBe(5);
    expect(result.publicAssignments).toHaveLength(1);
  });

  it('adds only the remaining room on an occupied ship and reserves empty ships for other goods', () => {
    const { state, player } = fixture({ corn: 6, indigo: 5 }, [[4, GoodType.Corn, 3], [5, null, 0], [6, GoodType.Coffee, 6]]);
    const result = estimateChampionShipping(state, player);
    expect(result.publicShipped).toBe(6);
    expect(result.byGood.corn.public).toBe(1);
    expect(result.byGood.indigo.public).toBe(5);
    expect(result.publicAssignments.map(a => a.shipIndex).sort()).toEqual([0, 1]);
  });

  it('cannot send a good already on a full ship onto another empty public ship', () => {
    const { state, player } = fixture({ corn: 5 }, [[4, GoodType.Corn, 4], [5, null, 0], [6, null, 0]]);
    const result = estimateChampionShipping(state, player);
    expect(result.publicShipped).toBe(0);
    expect(result.retained).toBe(1);
    expect(result.discarded).toBe(4);
  });

  it('matches validation when the same good appears on two public ships', () => {
    const { state, player } = fixture({ corn: 5, indigo: 3 }, [[4, GoodType.Corn, 1], [5, GoodType.Corn, 2], [6, null, 0]]);
    const result = estimateChampionShipping(state, player);
    expect(result.byGood.corn.public).toBe(0);
    expect(result.byGood.indigo.public).toBe(3);
    expect(result.supported).toBe(false);
    expect(result.limitations.some(message => message.includes('Duplicate'))).toBe(true);
  });

  it('chooses which empty ship to fill when there are fewer goods than ships', () => {
    const { state, player } = fixture({ corn: 8 }, [[4, null, 0], [5, null, 0], [6, null, 0]]);
    const result = estimateChampionShipping(state, player);
    expect(result.publicShipped).toBe(6);
    expect(result.publicAssignments).toEqual([{ shipIndex: 2, good: GoodType.Corn, amount: 6 }]);
  });

  it('counts at most 300 complete plans in the largest supported allocation', () => {
    const { state, player } = fixture({ corn: 8, indigo: 8, sugar: 8, tobacco: 8, coffee: 8 }, [[4, null, 0], [5, null, 0], [6, null, 0]]);
    activateBuilding(player, new Wharf());
    const result = estimateChampionShipping(state, player);
    expect(result.plansEvaluated).toBe(300);
    expect(result.publicShipped).toBe(15);
    expect(result.wharfShipped).toBe(8);
    expect(result.shipped + result.retained + result.discarded).toBe(40);
  });
});

describe('Champion private ships and shipping points', () => {
  it('uses Wharf for only one good type, not all five goods', () => {
    const { state, player } = fixture({ corn: 2, indigo: 2, sugar: 2, tobacco: 2, coffee: 2 });
    activateBuilding(player, new Wharf());
    const result = estimateChampionShipping(state, player);
    expect(result.wharfShipped).toBe(2);
    expect(result.wharfLoads).toBe(1);
    expect(result.shipped).toBe(2);
    expect(Object.values(result.byGood).filter(good => good.wharf > 0)).toHaveLength(1);
    expect(result.retained).toBe(1);
    expect(result.discarded).toBe(7);
  });

  it('jointly assigns public ships and Wharf instead of double-counting cargo', () => {
    const { state, player } = fixture({ corn: 5, indigo: 5 }, [[4, null, 0], [5, GoodType.Sugar, 5], [6, GoodType.Coffee, 6]]);
    activateBuilding(player, new Wharf());
    const result = estimateChampionShipping(state, player);
    expect(result.publicShipped).toBe(4);
    expect(result.wharfShipped).toBe(5);
    expect(result.shipped).toBe(9);
    expect(result.retained).toBe(1);
    expect(result.discarded).toBe(0);
  });

  it('respects Wharf already used in this Captain phase and resets the flag for a future phase', () => {
    const { state, player } = fixture({ corn: 5 });
    activateBuilding(player, new Wharf());
    player.hasUsedWharfThisPhase = true;
    expect(estimateChampionShipping(state, player).wharfShipped).toBe(5);
    state.setPhase(new CaptainPhase());
    player.hasUsedWharfThisPhase = true;
    expect(estimateChampionShipping(state, player).wharfShipped).toBe(0);
    player.hasUsedWharfThisPhase = false;
    expect(estimateChampionShipping(state, player).wharfShipped).toBe(5);
  });

  it('gives Harbour points only when active and per load, including a public/Wharf split', () => {
    const { state, player } = fixture({ corn: 5 }, [[4, null, 0], [5, GoodType.Sugar, 5], [6, GoodType.Coffee, 6]]);
    activateBuilding(player, new Wharf());
    const harbour = new Harbour();
    player.island.addBuilding(harbour);
    expect(estimateChampionShipping(state, player).shippingVp).toBe(5);
    harbour.occupiedWorkers = 1;
    const result = estimateChampionShipping(state, player);
    expect(result.publicLoads).toBe(1);
    expect(result.wharfLoads).toBe(1);
    expect(result.shippingVp).toBe(7);
  });

  it('does not treat an inactive Wharf as a usable ship', () => {
    const { state, player } = fixture({ corn: 5 });
    player.island.addBuilding(new Wharf());
    expect(estimateChampionShipping(state, player).wharfShipped).toBe(0);
  });

  it('applies the known current Captain bonus only once and caps awarded VP by the pool', () => {
    const { state, player } = fixture({ corn: 4 }, [[4, null, 0], [5, GoodType.Sugar, 5], [6, GoodType.Coffee, 6]]);
    expect(estimateChampionShipping(state, player).captainBonus).toBe(0);
    state.setPhase(new CaptainPhase());
    expect(estimateChampionShipping(state, player).captainBonus).toBe(1);
    player.hasUsedCaptainBonusThisPhase = true;
    expect(estimateChampionShipping(state, player).captainBonus).toBe(0);
    state.supply.victoryPointPool = 2;
    const result = estimateChampionShipping(state, player);
    expect(result.shippingVp).toBe(4);
    expect(result.estimatedVp).toBe(2);
  });

  it('uses Marina for remaining types at one VP per pair without Harbour bonuses', () => {
    const { state, player } = fixture({ corn: 5, indigo: 5 });
    activateBuilding(player, new Marina());
    activateBuilding(player, new Harbour());
    const result = estimateChampionShipping(state, player);
    expect(result.marinaShipped).toBe(10);
    expect(result.marinaLoads).toBe(2);
    expect(result.shippingVp).toBe(5);
    expect(result.retained + result.discarded).toBe(0);
    expect(result.supported).toBe(true);
  });
});

describe('Champion storage follows the actual engine paths', () => {
  it('keeps one token by default and only whole selected types with Small Warehouse', () => {
    const { state, player } = fixture({ corn: 5, indigo: 4, coffee: 3 });
    const ordinary = estimateChampionShipping(state, player);
    expect(ordinary.retained).toBe(1);
    expect(ordinary.byGood.coffee.retained).toBe(1);
    activateBuilding(player, new SmallWarehouse());
    const warehouse = estimateChampionShipping(state, player);
    expect(warehouse.retained).toBe(5);
    expect(warehouse.discarded).toBe(7);
    expect(Object.values(warehouse.byGood).filter(good => good.retained > 0)).toHaveLength(1);
  });

  it('keeps two whole types with Large Warehouse and ignores inactive warehouses', () => {
    const { state, player } = fixture({ corn: 5, indigo: 4, coffee: 3 });
    const warehouse = new LargeWarehouse();
    player.island.addBuilding(warehouse);
    expect(estimateChampionShipping(state, player).retained).toBe(1);
    warehouse.occupiedWorkers = 1;
    expect(estimateChampionShipping(state, player).retained).toBe(9);
  });

  it('matches the existing two-type interactive limit with both warehouses', () => {
    const { state, player } = fixture({ corn: 5, indigo: 4, sugar: 3, tobacco: 2 });
    activateBuilding(player, new SmallWarehouse());
    activateBuilding(player, new LargeWarehouse());
    expect(estimateChampionShipping(state, player).retained).toBe(9);
    player.storedGoods.set(GoodType.Tobacco, 0);
    expect(estimateChampionShipping(state, player).retained).toBe(12);
  });

  it('adds Depot tokens on automatic storage but not the interactive warehouse path', () => {
    const { state, player } = fixture({ corn: 5, indigo: 4, coffee: 3 });
    activateBuilding(player, new Depot());
    expect(estimateChampionShipping(state, player).retained).toBe(4);
    activateBuilding(player, new SmallWarehouse());
    expect(estimateChampionShipping(state, player).retained).toBe(5);
  });

  it('does not invent new loads after the Captain storage step has started', () => {
    const { state, player } = fixture({ corn: 5, indigo: 4 }, [[4, null, 0], [5, null, 0], [6, null, 0]]);
    activateBuilding(player, new Wharf());
    activateBuilding(player, new SmallWarehouse());
    state.setPhase(new CaptainPhase());
    state.captainStoragePending = true;
    const result = estimateChampionShipping(state, player);
    expect(result.shipped).toBe(0);
    expect(result.retained).toBe(5);
    expect(result.discarded).toBe(4);
  });
});

describe('Champion estimate safety and explicit approximation', () => {
  it('leaves the input unchanged and yields a plan that actual actions can replay', () => {
    const { state, player } = fixture({ corn: 8, indigo: 8, sugar: 8, tobacco: 8, coffee: 8 }, [[4, null, 0], [5, null, 0], [6, null, 0]]);
    activateBuilding(player, new Wharf());
    activateBuilding(player, new Harbour());
    state.setPhase(new CaptainPhase());
    const snapshot = () => JSON.stringify({
      goods: [...player.storedGoods], ships: state.ships,
      wharf: player.hasUsedWharfThisPhase, captain: player.hasUsedCaptainBonusThisPhase,
      vp: player.victoryPointTokens, pool: state.supply.victoryPointPool, phase: state.getCurrentPhase().type,
    });
    const before = snapshot();
    const result = estimateChampionShipping(state, player);
    expect(snapshot()).toBe(before);
    const pointsBefore = player.victoryPointTokens;
    for (const assignment of result.publicAssignments) {
      const action = new LoadShipAction(player.id, { kind: 'ship', shipIndex: assignment.shipIndex }, assignment.good);
      expect(action.validate(state).ok).toBe(true);
      expect(state.apply(action).ok).toBe(true);
    }
    if (result.wharfGood) {
      const action = new LoadShipAction(player.id, { kind: 'wharf' }, result.wharfGood);
      expect(action.validate(state).ok).toBe(true);
      expect(state.apply(action).ok).toBe(true);
    }
    expect(player.victoryPointTokens - pointsBefore).toBe(result.estimatedVp);
    expect(player.getTotalStoredGoods()).toBe(result.retained);
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });

  it('marks unmodelled expansion effects for a caller fallback', () => {
    const { state, player } = fixture({ corn: 5 });
    activateBuilding(player, new TransferStation());
    expect(estimateChampionShipping(state, player).supported).toBe(false);
    state.setPhase(new CaptainPhase());
    expect(estimateChampionShipping(state, player).supported).toBe(true);
    activateBuilding(player, new Treasury());
    player.heldNobles = 1;
    expect(estimateChampionShipping(state, player).supported).toBe(false);
  });

  it('does not award hypothetical shipping or discard stocks after game over', () => {
    const { state, player } = fixture({ corn: 5, indigo: 4 }, [[4, null, 0], [5, null, 0], [6, null, 0]]);
    activateBuilding(player, new Wharf());
    state.gameOver = true;
    const result = estimateChampionShipping(state, player);
    expect(result.shipped).toBe(0);
    expect(result.estimatedVp).toBe(0);
    expect(result.retained).toBe(9);
    expect(result.discarded).toBe(0);
  });
});

describe('Champion closed Captain phase', () => {
  it('values only the existing retained cargo after storage is done and never reloads it', () => {
    const { state, player } = fixture({ indigo: 2, coffee: 2 }, [[4, null, 0], [5, null, 0], [6, null, 0]]);
    activateBuilding(player, new Depot());
    activateBuilding(player, new Wharf());
    const phase = new CaptainPhase();
    state.setPhase(phase);
    phase.restoreProgress(state, { storagePhaseStarted: true, storageDone: true });
    const result = estimateChampionShipping(state, player);
    expect(result.shipped).toBe(0);
    expect(result.retained).toBe(player.getTotalStoredGoods());
    expect(result.retained).toBe(4);
    expect(result.discarded).toBe(0);
    expect(result.estimatedVp).toBe(0);
    expect(result.publicAssignments).toEqual([]);
    expect(result.wharfGood).toBeNull();
  });
});
