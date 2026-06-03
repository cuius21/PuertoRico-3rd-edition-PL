import { describe, it, expect } from 'vitest';
import { SellGoodAction } from '../../actions/SellGoodAction';
import { PassAction } from '../../actions/PassAction';
import { createGame, selectRole, applyOk, giveGoods } from '../helpers';
import { GoodType, RoleType, PhaseType } from '../../core/types';
import { Office, SmallMarket, LargeMarket } from '../../domain/buildings/catalog/SmallUtilityBuildings';
import { GOOD_PRICES } from '../../core/constants';

describe('TraderPhase — selling', () => {
  it('selling gives doubloons equal to good price', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Coffee, 1);
    selectRole(state, RoleType.Trader);
    const before = state.players[0]!.doubloons;
    applyOk(state, new SellGoodAction('player-0', GoodType.Coffee));
    // Coffee price=4, selector gets +1 = 5
    expect(state.players[0]!.doubloons).toBe(before + 5);
  });

  it('trader (selector) gets +1 doubloon bonus', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Indigo, 1);
    selectRole(state, RoleType.Trader);
    const before = state.players[0]!.doubloons;
    applyOk(state, new SellGoodAction('player-0', GoodType.Indigo));
    // Indigo price=1, selector +1 = 2
    expect(state.players[0]!.doubloons).toBe(before + GOOD_PRICES[GoodType.Indigo] + 1);
  });

  it('non-selector gets base price only', () => {
    const state = createGame(3);
    giveGoods(state.players[1]!, GoodType.Sugar, 1);
    selectRole(state, RoleType.Trader);
    applyOk(state, new PassAction('player-0')); // Alice passes
    const before = state.players[1]!.doubloons;
    applyOk(state, new SellGoodAction('player-1', GoodType.Sugar));
    expect(state.players[1]!.doubloons).toBe(before + GOOD_PRICES[GoodType.Sugar]);
  });

  it('good is added to trading house after sale', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Tobacco, 1);
    selectRole(state, RoleType.Trader);
    applyOk(state, new SellGoodAction('player-0', GoodType.Tobacco));
    expect(state.tradingHouse.containsGood(GoodType.Tobacco)).toBe(true);
  });

  it('good removed from player storage after sale', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Coffee, 2);
    selectRole(state, RoleType.Trader);
    applyOk(state, new SellGoodAction('player-0', GoodType.Coffee));
    expect(state.players[0]!.getStoredGoodCount(GoodType.Coffee)).toBe(1);
  });

  it('cannot sell duplicate good (without Office)', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Coffee, 1);
    giveGoods(state.players[1]!, GoodType.Coffee, 1); // Bob also has coffee
    selectRole(state, RoleType.Trader);
    applyOk(state, new SellGoodAction('player-0', GoodType.Coffee)); // Alice sells coffee
    applyOk(state, new PassAction('player-1')); // Bob cannot sell coffee → pass
    // Verify Bob couldn't sell (pass was needed)
    expect(state.tradingHouse.containsGood(GoodType.Coffee)).toBe(true);
  });

  it('with active Office: can sell duplicate good', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Coffee, 1);
    giveGoods(state.players[1]!, GoodType.Coffee, 1);
    const office = new Office();
    office.occupiedWorkers = 1; // active
    state.players[1]!.island.addBuilding(office);
    selectRole(state, RoleType.Trader);
    applyOk(state, new SellGoodAction('player-0', GoodType.Coffee)); // Alice sells
    applyOk(state, new SellGoodAction('player-1', GoodType.Coffee)); // Bob also sells (has Office)
    expect(state.players[1]!.getStoredGoodCount(GoodType.Coffee)).toBe(0);
  });

  it('cannot sell when trading house is full', () => {
    const state = createGame(3);
    // Fill the trading house (4 slots)
    state.tradingHouse.addGood(GoodType.Corn);
    state.tradingHouse.addGood(GoodType.Indigo);
    state.tradingHouse.addGood(GoodType.Sugar);
    state.tradingHouse.addGood(GoodType.Tobacco);
    giveGoods(state.players[0]!, GoodType.Coffee, 1);
    selectRole(state, RoleType.Trader);
    const result = state.apply(new SellGoodAction('player-0', GoodType.Coffee));
    expect(result.ok).toBe(false);
  });
});

describe('TraderPhase — building bonuses', () => {
  it('SmallMarket adds +1 to sell price', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 1); // corn price=0
    const smallMarket = new SmallMarket();
    smallMarket.occupiedWorkers = 1;
    state.players[0]!.island.addBuilding(smallMarket);
    selectRole(state, RoleType.Trader);
    const before = state.players[0]!.doubloons;
    applyOk(state, new SellGoodAction('player-0', GoodType.Corn));
    // price=0, +1 SmallMarket, +1 selector = 2
    expect(state.players[0]!.doubloons).toBe(before + 2);
  });

  it('LargeMarket adds +2 to sell price', () => {
    const state = createGame(3);
    giveGoods(state.players[0]!, GoodType.Corn, 1);
    const largeMarket = new LargeMarket();
    largeMarket.occupiedWorkers = 1;
    state.players[0]!.island.addBuilding(largeMarket);
    selectRole(state, RoleType.Trader);
    const before = state.players[0]!.doubloons;
    applyOk(state, new SellGoodAction('player-0', GoodType.Corn));
    // price=0, +2 LargeMarket, +1 selector = 3
    expect(state.players[0]!.doubloons).toBe(before + 3);
  });
});

describe('TraderPhase — phase transition', () => {
  it('ends after all 3 players act', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Trader);
    applyOk(state, new PassAction('player-0'));
    applyOk(state, new PassAction('player-1'));
    applyOk(state, new PassAction('player-2'));
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });
});
