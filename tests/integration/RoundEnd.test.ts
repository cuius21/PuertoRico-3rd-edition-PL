import { describe, it, expect } from 'vitest';
import { PassAction } from '../../actions/PassAction';
import { createGame, selectRole, applyOk } from '../helpers';
import { RoleType, PhaseType, GoodType } from '../../core/types';
import { SmallMarket } from '../../domain/buildings/catalog/SmallUtilityBuildings';

// Complete a full round using Builder + Settler + Trader (all players pass each phase).
function completeRound(state: ReturnType<typeof createGame>): void {
  selectRole(state, RoleType.Builder);
  for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
  selectRole(state, RoleType.Settler);
  for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
  selectRole(state, RoleType.Trader);
  for (let i = 0; i < 3; i++) applyOk(state, new PassAction(state.getCurrentPlayer().id));
}

describe('RoundEndPhase — doubloons on unused cards', () => {
  it('adds 1 doubloon to each unused role card', () => {
    const state = createGame(3);
    completeRound(state); // uses Builder, Settler, Trader
    const unusedTypes = [RoleType.Mayor, RoleType.Craftsman, RoleType.Captain];
    for (const type of unusedTypes) {
      const card = state.roleCards.find(c => c.type === type)!;
      expect(card.doubloonsOnCard).toBe(1);
    }
  });

  it('used role cards get 0 doubloons', () => {
    const state = createGame(3);
    completeRound(state);
    const usedTypes = [RoleType.Builder, RoleType.Settler, RoleType.Trader];
    for (const type of usedTypes) {
      const card = state.roleCards.find(c => c.type === type)!;
      expect(card.doubloonsOnCard).toBe(0);
    }
  });

  it('player collects accumulated doubloons when picking a card', () => {
    const state = createGame(3);
    completeRound(state);
    const mayorCard = state.roleCards.find(c => c.type === RoleType.Mayor)!;
    expect(mayorCard.doubloonsOnCard).toBe(1);

    const bobDoubloonsBefore = state.players[1]!.doubloons;
    selectRole(state, RoleType.Mayor); // Bob (new governor) picks Mayor
    expect(state.players[1]!.doubloons).toBe(bobDoubloonsBefore + 1);
    expect(mayorCard.doubloonsOnCard).toBe(0);
  });
});

describe('RoundEndPhase — governor and round number', () => {
  it('advances governor by 1 after each round', () => {
    const state = createGame(3);
    expect(state.governorIndex).toBe(0);
    completeRound(state);
    expect(state.governorIndex).toBe(1);
  });

  it('governor wraps around after last player', () => {
    const state = createGame(3);
    completeRound(state);
    completeRound(state);
    completeRound(state);
    expect(state.governorIndex).toBe(0); // back to Alice
  });

  it('roundNumber increments each round', () => {
    const state = createGame(3);
    expect(state.roundNumber).toBe(0);
    completeRound(state);
    expect(state.roundNumber).toBe(1);
    completeRound(state);
    expect(state.roundNumber).toBe(2);
  });

  it('all role cards reset (isAvailable=true) after round', () => {
    const state = createGame(3);
    completeRound(state);
    for (const card of state.roleCards) {
      expect(card.isAvailable()).toBe(true);
    }
  });
});

describe('RoundEndPhase — game over conditions', () => {
  it('game over when VP pool is depleted', () => {
    const state = createGame(3);
    state.supply.victoryPointPool = 0;
    completeRound(state);
    expect(state.gameOver).toBe(true);
    expect(state.getCurrentPhase().type).toBe(PhaseType.GameOver);
  });

  it('game over when both workersPool and workersInMagistrate are 0', () => {
    const state = createGame(3);
    state.supply.workersPool = 0;
    state.supply.workersInMagistrate = 0;
    completeRound(state);
    expect(state.gameOver).toBe(true);
  });

  it('NOT game over when workersPool>0 and magistrate=0', () => {
    const state = createGame(3);
    state.supply.workersPool = 5;
    state.supply.workersInMagistrate = 0;
    completeRound(state);
    expect(state.gameOver).toBe(false);
  });

  it('game over when any player city is full', () => {
    const state = createGame(3);
    for (let i = 0; i < 12; i++) {
      state.players[0]!.island.addBuilding(new SmallMarket());
    }
    completeRound(state);
    expect(state.gameOver).toBe(true);
  });

  it('continues game normally when no end conditions met', () => {
    const state = createGame(3);
    completeRound(state);
    expect(state.gameOver).toBe(false);
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });
});

describe('RoundEndPhase — trading house', () => {
  it('clears full trading house at end of round', () => {
    const state = createGame(3);
    state.tradingHouse.addGood(GoodType.Corn);
    state.tradingHouse.addGood(GoodType.Indigo);
    state.tradingHouse.addGood(GoodType.Sugar);
    state.tradingHouse.addGood(GoodType.Tobacco);
    expect(state.tradingHouse.isFull()).toBe(true);
    completeRound(state);
    expect(state.tradingHouse.isFull()).toBe(false);
  });

  it('does NOT clear partial trading house', () => {
    const state = createGame(3);
    state.tradingHouse.addGood(GoodType.Corn);
    expect(state.tradingHouse.occupiedCount()).toBe(1);
    completeRound(state);
    expect(state.tradingHouse.occupiedCount()).toBe(1);
  });
});
