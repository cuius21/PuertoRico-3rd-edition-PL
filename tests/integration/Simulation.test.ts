import { describe, it, expect } from 'vitest';
import type { GameState } from '../../state/GameState';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { PassAction } from '../../actions/PassAction';
import { BuyPlantationFromDeckAction } from '../../actions/BuyPlantationFromDeckAction';
import { SmallWarehouse } from '../../domain/buildings/catalog/SmallUtilityBuildings';
import { Fortress } from '../../domain/buildings/catalog/LargeBuildings';
import { GoodType, RoleType, PhaseType } from '../../core/types';
import { serializeGameState, deserializeGameState } from '../../src/game/GameSerializer';
import { cloneGameState, determinizeGameState } from '../../src/bots/simulation';
import { createGame, selectRole, applyOk, activateBuilding, activatePlantation, giveGoods } from '../helpers';
import { PlantationType } from '../../core/types';

function assertEquivalent(a: GameState, b: GameState): void {
  expect(serializeGameState(b)).toEqual(serializeGameState(a));
  for (const player of a.players) {
    expect(b.getValidActions(player.id).map(action => JSON.stringify(action)))
      .toEqual(a.getValidActions(player.id).map(action => JSON.stringify(action)));
  }
}

function pass(state: GameState): void {
  applyOk(state, new PassAction(state.getCurrentPlayer().id));
}

function storageGame(): GameState {
  const state = createGame();
  [GoodType.Corn, GoodType.Indigo, GoodType.Sugar].forEach((good, index) => {
    state.ships[index]!.loadedGood = good;
    state.ships[index]!.loadedCount = state.ships[index]!.capacity;
  });
  for (const player of state.players.slice(0, 2)) {
    activateBuilding(player, new SmallWarehouse());
    giveGoods(player, GoodType.Tobacco, 2);
    giveGoods(player, GoodType.Coffee, 3);
  }
  giveGoods(state.players[2]!, GoodType.Tobacco, 2);
  selectRole(state, RoleType.Captain);
  expect(state.captainStoragePending).toBe(true);
  return state;
}

describe('simulation clone phase progress', () => {
  for (const count of [3, 4, 5] as const) {
    for (const role of [RoleType.Builder, RoleType.Trader, RoleType.Settler]) {
      for (const elapsed of [0, 1, count - 1]) {
        it(role + ' with ' + count + ' players after ' + elapsed + ' actions preserves successor', () => {
          const state = createGame(count);
          selectRole(state, role === RoleType.Builder ? RoleType.Trader : RoleType.Builder);
          for (let i = 0; i < count; i++) pass(state);
          selectRole(state, role);
          expect(state.roleSelectorIndex).toBe(1);
          for (let i = 0; i < elapsed; i++) pass(state);
          const clone = cloneGameState(state);
          expect(clone.actionLog).toHaveLength(0);
          expect(state.actionLog.length).toBeGreaterThan(0);
          assertEquivalent(state, clone);
          for (let i = elapsed; i < count; i++) {
            pass(state);
            pass(clone);
            assertEquivalent(state, clone);
          }
          expect(clone.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
        });
      }
    }
  }

  it('preserves auxiliary actions that do not advance the player pointer', () => {
    const state = createGame();
    selectRole(state, RoleType.Trader);
    applyOk(state, new BuyPlantationFromDeckAction(state.getCurrentPlayer().id));
    expect(state.currentPlayerIndex).toBe(0);
    const clone = cloneGameState(state);
    assertEquivalent(state, clone);
    for (let i = 0; i < 2; i++) {
      pass(state);
      pass(clone);
      assertEquivalent(state, clone);
    }
    expect(clone.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });

  it('continues all pending storage choices and exits Captain exactly once', () => {
    const state = storageGame();
    const clone = cloneGameState(state);
    assertEquivalent(state, clone);
    for (let i = 0; i < 2; i++) {
      const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
      expect(action.type).toBe('SELECT_STORAGE');
      applyOk(state, action);
      applyOk(clone, action);
      assertEquivalent(state, clone);
    }
    expect(clone.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
    expect(clone.players[2]!.getTotalStoredGoods()).toBe(1);
    expect(clone.ships.every(ship => ship.loadedCount === 0)).toBe(true);
  });

  it('restores a clone taken between two warehouse choices', () => {
    const state = storageGame();
    applyOk(state, state.getValidActions(state.getCurrentPlayer().id)[0]!);
    const clone = cloneGameState(state);
    assertEquivalent(state, clone);
    const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
    applyOk(state, action);
    applyOk(clone, action);
    assertEquivalent(state, clone);
    expect(clone.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });

  for (const role of [RoleType.Mayor, RoleType.Craftsman, RoleType.Prospector, RoleType.Corsair]) {
    it('preserves legal actions and successors in ' + role, () => {
      const state = GameFactory.create(4, ['A', 'B', 'C', 'D'], new RoleSelectionPhase(), {
        festival: true, corsair: true, newBuildings: true, nobleBuildings: true,
      });
      activatePlantation(state.players[0]!, PlantationType.Corn);
      selectRole(state, role);
      const clone = cloneGameState(state);
      assertEquivalent(state, clone);
      const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
      applyOk(state, action);
      applyOk(clone, action);
      assertEquivalent(state, clone);
    });
  }

  it('preserves the RoleSelection transition after a nonempty history', () => {
    const state = createGame();
    selectRole(state, RoleType.Builder);
    for (let i = 0; i < 3; i++) pass(state);
    const clone = cloneGameState(state);
    assertEquivalent(state, clone);
    const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
    applyOk(state, action);
    applyOk(clone, action);
    assertEquivalent(state, clone);
  });
});

describe('save compatibility and isolation', () => {
  for (const role of [RoleType.Builder, RoleType.Trader, RoleType.Settler]) {
    it('loads old ' + role + ' saves at the last player', () => {
      const state = createGame();
      selectRole(state, role);
      pass(state);
      pass(state);
      const saved = serializeGameState(state);
      delete saved.phaseProgress;
      const restored = deserializeGameState(saved);
      pass(state);
      pass(restored);
      assertEquivalent(state, restored);
      expect(restored.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
    });
  }

  it('infers storage stage in old saves with captainStoragePending', () => {
    const state = storageGame();
    const saved = serializeGameState(state);
    delete saved.phaseProgress;
    const restored = deserializeGameState(saved);
    for (let i = 0; i < 2; i++) {
      const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
      applyOk(state, action);
      applyOk(restored, action);
    }
    assertEquivalent(state, restored);
  });

  it('creates fully isolated mutable state while preserving large building shared slots', () => {
    const state = GameFactory.create(3, ['A', 'B', 'C'], new RoleSelectionPhase(), {
      festival: true, corsair: true, newBuildings: true, nobleBuildings: true,
    });
    activateBuilding(state.players[0]!, new Fortress());
    state.players[0]!.island.getPlantations()[0]!.occupiedNobles = 1;
    const snapshot = serializeGameState(state);
    const clone = cloneGameState(state);
    assertEquivalent(state, clone);
    const slots = clone.players[0]!.island.getBuildingSlots();
    expect(slots[0]).toBe(slots[1]);
    expect(slots[0]).not.toBe(state.players[0]!.island.getBuildingSlots()[0]);
    clone.players[0]!.doubloons += 10;
    clone.players[0]!.storedGoods.set(GoodType.Corn, 9);
    clone.players[0]!.island.getPlantations()[0]!.occupiedNobles = 0;
    slots[0]!.occupiedWorkers = 0;
    clone.supply.plantationDecks[0]!.pop();
    clone.supply.availableBuildings.pop();
    clone.roleCards[0]!.doubloonsOnCard = 10;
    clone.ships[0]!.loadedCount = 2;
    clone.tradingHouse.addGood(GoodType.Corn);
    clone.festivalBoard!.uprawa.completedBy = 'player-0';
    const required = clone.festivalBoard!.produkcja.requiredGoods as Partial<Record<GoodType, number>>;
    required[GoodType.Coffee] = 99;
    expect(serializeGameState(state)).toEqual(snapshot);
    const restored = deserializeGameState(snapshot);
    (restored.festivalBoard!.produkcja.requiredGoods as Partial<Record<GoodType, number>>)[GoodType.Coffee] = 98;
    expect(serializeGameState(state)).toEqual(snapshot);
  });

  it('retains all saved plantation attributes in every supply area', () => {
    const state = createGame();
    for (const plantation of [state.supply.plantationDecks[0]![0]!, state.supply.revealedPlantations[0]!]) {
      plantation.occupiedNobles = 1;
      plantation.isForest = true;
    }
    state.supply.discardedPlantations.push(state.supply.plantationDecks[0]!.pop()!);
    state.supply.discardedPlantations[0]!.isForest = true;
    assertEquivalent(state, cloneGameState(state));
  });
});

describe('hidden plantation determinization', () => {
  it('preserves visible state, remaining multiset and deck sizes without sharing references', () => {
    const state = createGame();
    const before = serializeGameState(state);
    const sample = determinizeGameState(state, () => 0.25);
    const after = serializeGameState(sample);
    expect(after.supply.decks.map(deck => deck.length)).toEqual(before.supply.decks.map(deck => deck.length));
    expect(after.supply.decks.flat().map(p => p.type).sort()).toEqual(before.supply.decks.flat().map(p => p.type).sort());
    after.supply.decks = before.supply.decks;
    expect(after).toEqual(before);
    sample.supply.plantationDecks[0]!.pop();
    expect(serializeGameState(state)).toEqual(before);
  });

  it('the same sample does not reveal a different actual hidden order', () => {
    const state = createGame();
    const other = cloneGameState(state);
    const hidden = other.supply.plantationDecks.flat().reverse();
    let offset = 0;
    other.supply.plantationDecks = other.supply.plantationDecks.map(deck => {
      const reordered = hidden.slice(offset, offset + deck.length);
      offset += deck.length;
      return reordered;
    });
    expect(serializeGameState(determinizeGameState(state, () => 0.37)))
      .toEqual(serializeGameState(determinizeGameState(other, () => 0.37)));
  });
});
