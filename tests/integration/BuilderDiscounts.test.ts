import { describe, expect, it } from 'vitest';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { SelectRoleAction } from '../../actions/SelectRoleAction';
import { BuildAction } from '../../actions/BuildAction';
import { MasonsGuild } from '../../domain/buildings/catalog/NewBuildings2';
import { BlackMarket } from '../../domain/buildings/catalog/NewBuildings1';
import { GoodType, RoleType } from '../../core/types';

function createBuilder(staff: 'worker' | 'noble' | 'none', money: number) {
  const state = GameFactory.create(3, ['Builder', 'B', 'C'], new RoleSelectionPhase(), {
    festival: false, corsair: false, newBuildings: false, nobleBuildings: true,
  });
  const player = state.players[0]!;
  const guild = new MasonsGuild();
  if (staff === 'worker') guild.occupiedWorkers = 1;
  if (staff === 'noble') guild.occupiedNobles = 1;
  player.island.addBuilding(guild);
  player.doubloons = money;
  expect(state.apply(new SelectRoleAction(player.id, RoleType.Builder)).ok).toBe(true);
  return { state, player };
}

describe('Masons Guild authoritative building cost', () => {
  it.each([
    ['worker', 'largeMarket', 3],
    ['noble', 'customsHouse', 7],
  ] as const)('applies the %s discount to %s in generation, validation and payment', (staff, buildingId, price) => {
    const { state, player } = createBuilder(staff, price);
    const legal = state.getValidActions(player.id);
    const build = legal.find(action => action instanceof BuildAction && action.buildingId === buildingId);
    expect(build).toBeDefined();
    expect(build!.validate(state).ok).toBe(true);
    expect(state.apply(build!).ok).toBe(true);
    expect(player.doubloons).toBe(0);
    expect(player.island.hasBuildingOfType(buildingId)).toBe(true);
  });

  it.each([
    ['worker', 'customsHouse', 7],
    ['noble', 'largeMarket', 3],
    ['none', 'customsHouse', 7],
  ] as const)('does not grant an inapplicable %s discount to %s', (staff, buildingId, money) => {
    const { state, player } = createBuilder(staff, money);
    const action = new BuildAction(player.id, buildingId);
    expect(action.validate(state).ok).toBe(false);
    expect(state.getValidActions(player.id).some(candidate =>
      candidate instanceof BuildAction && candidate.buildingId === buildingId)).toBe(false);
  });
});

describe('Black Market cash and resource payment', () => {
  function createMarketBuilder(money: number, corn: number) {
    const state = GameFactory.create(3, ['Builder', 'B', 'C'], new RoleSelectionPhase(), {
      festival: false, corsair: false, newBuildings: true, nobleBuildings: false,
    });
    const player = state.players[0]!;
    const market = new BlackMarket();
    market.occupiedWorkers = 1;
    player.island.addBuilding(market);
    player.doubloons = money;
    player.addStoredGoods(GoodType.Corn, state.supply.drawGoods(GoodType.Corn, corn));
    expect(state.apply(new SelectRoleAction(player.id, RoleType.Builder)).ok).toBe(true);
    return { state, player };
  }

  it.each([0, 1, 2])('spends only %i cash and covers the remainder with returned resources', money => {
    const { state, player } = createMarketBuilder(money, 2);
    const bankBefore = state.supply.doubloonsInBank;
    const cornBefore = state.supply.getGoodsAvailable(GoodType.Corn);
    const cashBefore = bankBefore + state.players.reduce((sum, p) => sum + p.doubloons, 0);
    const action = new BuildAction(player.id, 'smallWarehouse');
    expect(action.validate(state).ok).toBe(true);
    expect(state.apply(action).ok).toBe(true);
    expect(player.doubloons).toBe(0);
    expect(state.supply.doubloonsInBank - bankBefore).toBe(money);
    expect(player.getStoredGoodCount(GoodType.Corn)).toBe(money);
    expect(state.supply.getGoodsAvailable(GoodType.Corn) - cornBefore).toBe(2 - money);
    expect(state.supply.doubloonsInBank + state.players.reduce((sum, p) => sum + p.doubloons, 0)).toBe(cashBefore);
  });

  it('rejects insufficient resource payment without changing cash or goods', () => {
    const { state, player } = createMarketBuilder(0, 1);
    const bankBefore = state.supply.doubloonsInBank;
    expect(state.apply(new BuildAction(player.id, 'smallWarehouse')).ok).toBe(false);
    expect(player.doubloons).toBe(0);
    expect(player.getStoredGoodCount(GoodType.Corn)).toBe(1);
    expect(state.supply.doubloonsInBank).toBe(bankBefore);
  });
});
