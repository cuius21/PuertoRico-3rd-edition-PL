import { describe, it, expect } from 'vitest';
import { createGame, selectRole, activatePlantation, activateBuilding } from '../helpers';
import { GoodType, PlantationType, RoleType } from '../../core/types';
import { Island } from '../../domain/Island';
import type { Plantation } from '../../domain/Plantation';
import type { Building } from '../../domain/buildings/Building';
import { SmallMarket } from '../../domain/buildings/catalog/SmallUtilityBuildings';
import { SmallIndigoPlant } from '../../domain/buildings/catalog/ProductionBuildings';
import { withPolicyReadCache } from '../../src/bots/neural/policyReadCache';
import { encodePolicyInput } from '../../src/bots/neural/policyFeatures';
import { NeuralPolicyNetwork } from '../../src/bots/neural/policyNetwork';

const own = (island: Island) => Object.getOwnPropertyDescriptors(island);

describe('experimental synchronous policy read cache', () => {
  it('preserves inherited methods, every own descriptor, and the returned value', () => {
    const state = createGame();
    const before = state.players.map(player => own(player.island));
    const original = state.players[0]!.island.getBuildings;
    expect(withPolicyReadCache(state, current => {
      expect(current).toBe(state);
      expect(current.players[0]!.island.getBuildings).not.toBe(original);
      return 17;
    })).toBe(17);
    state.players.forEach((player, index) => expect(own(player.island)).toEqual(before[index]));
    expect(state.players[0]!.island.getBuildings).toBe(original);
  });

  it('memoizes within one scope and discards values before the next scope', () => {
    const state = createGame(), island = state.players[0]!.island;
    const original = island.getFreeRuralSlotCount;
    let calls = 0;
    const instrumented = function (this: Island) { calls++; return original.call(this); };
    Object.defineProperty(island, 'getFreeRuralSlotCount', {
      value: instrumented, writable: false, enumerable: true, configurable: true,
    });
    const before = own(island);
    const first = withPolicyReadCache(state, () => {
      const count = island.getFreeRuralSlotCount();
      expect(island.getFreeRuralSlotCount()).toBe(count);
      return count;
    });
    expect(calls).toBe(1);
    expect(own(island)).toEqual(before);
    activatePlantation(state.players[0]!, PlantationType.Corn);
    expect(withPolicyReadCache(state, () => island.getFreeRuralSlotCount())).toBe(first - 1);
    expect(calls).toBe(2);
    expect(own(island)).toEqual(before);
  });

  it('restores all players after a callback exception', () => {
    const state = createGame(), before = state.players.map(player => own(player.island));
    const problem = new Error('inference failed');
    expect(() => withPolicyReadCache(state, () => {
      state.players.forEach(player => player.island.getBuildings());
      throw problem;
    })).toThrow(problem);
    state.players.forEach((player, index) => expect(own(player.island)).toEqual(before[index]));
  });

  it('keeps an outer cache alive after a nested callback throws', () => {
    const state = createGame(), island = state.players[0]!.island;
    const original = island.getBuildings;
    let calls = 0;
    Object.defineProperty(island, 'getBuildings', {
      value: function (this: Island) { calls++; return original.call(this); },
      writable: true, enumerable: false, configurable: true,
    });
    const before = own(island);
    withPolicyReadCache(state, () => {
      const wrapper = island.getBuildings;
      island.getBuildings();
      expect(() => withPolicyReadCache(state, () => {
        expect(island.getBuildings).toBe(wrapper);
        island.getBuildings();
        throw new Error('inner');
      })).toThrow('inner');
      expect(island.getBuildings).toBe(wrapper);
      island.getBuildings();
      expect(calls).toBe(1);
    });
    expect(own(island)).toEqual(before);
    withPolicyReadCache(state, () => island.getBuildings());
    expect(calls).toBe(2);
  });

  it('returns independent arrays even when callers sort, splice, or append', () => {
    const state = createGame(), player = state.players[0]!, island = player.island;
    activateBuilding(player, new SmallMarket());
    activateBuilding(player, new SmallIndigoPlant());
    activatePlantation(player, PlantationType.Corn);
    const buildings = island.getBuildings(), active = island.getActiveBuildings(), plants = island.getPlantations();
    withPolicyReadCache(state, () => {
      const a = island.getBuildings() as Building[];
      a.reverse(); a.splice(0, 1); a.push(a[0]!);
      const b = island.getBuildings() as Building[];
      expect(b).toEqual(buildings);
      expect(b).not.toBe(a);
      b.sort((left, right) => right.id.localeCompare(left.id));
      expect(island.getBuildings()).toEqual(buildings);
      const c = island.getActiveBuildings() as Building[];
      c.splice(0, c.length);
      expect(island.getActiveBuildings()).toEqual(active);
      const d = island.getPlantations() as Plantation[];
      d.reverse(); d.pop();
      expect(island.getPlantations()).toEqual(plants);
      expect(island.getBuildings()[0]).toBe(buildings[0]);
      expect(island.getPlantations()[0]).toBe(plants[0]);
    });
    expect(island.getBuildings()).toEqual(buildings);
    expect(island.getPlantations()).toEqual(plants);
  });

  it('keeps separate argument keys and the receiver of borrowed methods', () => {
    const state = createGame(), player = state.players[0]!, island = player.island;
    activatePlantation(player, PlantationType.Corn);
    activatePlantation(player, PlantationType.Indigo);
    activateBuilding(player, new SmallIndigoPlant());
    const other = new Island();
    withPolicyReadCache(state, () => {
      expect(island.getProductionCapacity(GoodType.Corn)).toBe(1);
      expect(island.getProductionCapacity(GoodType.Indigo)).toBe(1);
      expect(island.getProductionCapacity(GoodType.Sugar)).toBe(0);
      expect(island.getProductionCapacity.call(other, GoodType.Corn)).toBe(0);
      expect(island.getProductionCapacity(GoodType.Corn)).toBe(1);
    });
  });

  it('leaves other phases alone and caches during Builder', () => {
    const trader = createGame();
    selectRole(trader, RoleType.Trader);
    const original = trader.players[0]!.island.getBuildings;
    withPolicyReadCache(trader, () => expect(trader.players[0]!.island.getBuildings).toBe(original));
    const builder = createGame();
    selectRole(builder, RoleType.Builder);
    const before = builder.players[0]!.island.getBuildings;
    withPolicyReadCache(builder, () => expect(builder.players[0]!.island.getBuildings).not.toBe(before));
    expect(builder.players[0]!.island.getBuildings).toBe(before);
  });

  it('skips frozen and nonreplaceable methods without changing semantics', () => {
    const state = createGame(), first = state.players[0]!.island, second = state.players[1]!.island;
    Object.freeze(first);
    const original = second.getBuildings;
    Object.defineProperty(second, 'getBuildings', { value: original, configurable: false, writable: false });
    const before = state.players.map(player => own(player.island));
    withPolicyReadCache(state, () => {
      expect(first.getBuildings()).toEqual([]);
      expect(second.getBuildings).toBe(original);
      expect(second.getBuildings()).toEqual([]);
    });
    state.players.forEach((player, index) => expect(own(player.island)).toEqual(before[index]));
  });

  it('preserves nonconfigurable writable data descriptors', () => {
    const state = createGame(), island = state.players[0]!.island;
    const original = island.getBuildings;
    Object.defineProperty(island, 'getBuildings', { value: original, writable: true, configurable: false, enumerable: true });
    const before = own(island);
    withPolicyReadCache(state, () => expect(island.getBuildings).not.toBe(original));
    expect(own(island)).toEqual(before);
  });

  it('restores already entered islands when installing a later island fails', () => {
    const state = createGame(), island = state.players[1]!.island;
    Object.defineProperty(island, 'getPlantations', { get() { throw new Error('broken getter'); }, configurable: true });
    const before = state.players.map(player => own(player.island));
    expect(() => withPolicyReadCache(state, () => 1)).toThrow('broken getter');
    state.players.forEach((player, index) => expect(own(player.island)).toEqual(before[index]));
  });

  it('rejects asynchronous callbacks and restores immediately', () => {
    const state = createGame(), before = state.players.map(player => own(player.island));
    expect(() => withPolicyReadCache(state, () => Promise.resolve(1))).toThrow('synchronous');
    state.players.forEach((player, index) => expect(own(player.island)).toEqual(before[index]));
  });

  it('preserves encoded features, priors and masked neural outputs exactly', () => {
    const state = createGame(), playerId = state.getCurrentPlayer().id;
    const actions = state.getValidActions(playerId);
    activatePlantation(state.players[0]!, PlantationType.Corn);
    activateBuilding(state.players[1]!, new SmallMarket());
    const network = new NeuralPolicyNetwork({ hiddenSize: 8, policyMode: 'residual' });
    const encoded = encodePolicyInput(state, playerId, actions)!;
    const baseline = network.policyForLegalActions(state, playerId, actions);
    withPolicyReadCache(state, () => {
      const actual = encodePolicyInput(state, playerId, actions)!;
      expect(actual.input.every((value, index) => Object.is(value, encoded.input[index]))).toBe(true);
      expect(actual.baseline.every((value, index) => Object.is(value, encoded.baseline[index]))).toBe(true);
      expect(actual.actionIds).toEqual(encoded.actionIds);
      const policy = network.policyForLegalActions(state, playerId, actions);
      expect(policy.every((value, index) => Object.is(value, baseline[index]))).toBe(true);
    });
  });
});