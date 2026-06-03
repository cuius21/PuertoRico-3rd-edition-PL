import { describe, it, expect } from 'vitest';
import { ScoreCalculator } from '../../state/ScoreCalculator';
import { createGame, activatePlantation, activateBuilding } from '../helpers';
import { GoodType, PlantationType } from '../../core/types';
import { GuildHall, Residence } from '../../domain/buildings/catalog/LargeBuildings';
import { SmallIndigoPlant } from '../../domain/buildings/catalog/ProductionBuildings';

describe('ScoreCalculator.calculate', () => {
  it('all zeros when no goods, no buildings', () => {
    const state = createGame(3);
    const scores = ScoreCalculator.calculate(state);
    for (const s of scores) {
      expect(s.vpTokens).toBe(0);
      expect(s.buildingVP).toBe(0);
      expect(s.largeBuildingBonus).toBe(0);
      expect(s.total).toBe(0);
    }
  });

  it('VP tokens counted correctly', () => {
    const state = createGame(3);
    state.players[0]!.victoryPointTokens = 8;
    state.players[1]!.victoryPointTokens = 5;
    state.players[2]!.victoryPointTokens = 3;
    const scores = ScoreCalculator.calculate(state);
    expect(scores[0]!.vpTokens).toBe(8);
    expect(scores[0]!.total).toBe(8);
  });

  it('building VP counted even when building is inactive', () => {
    const state = createGame(3);
    const building = new SmallIndigoPlant();
    // No worker on building = inactive
    state.players[0]!.island.addBuilding(building);
    const scores = ScoreCalculator.calculate(state);
    const aliceScore = scores.find(s => s.playerName === 'Alice')!;
    expect(aliceScore.buildingVP).toBe(1); // SmallIndigoPlant.victoryPoints = 1
  });

  it('large building bonus counted only if building is active', () => {
    const state = createGame(3);
    const alice = state.players[0]!;

    const guildHallActive = new GuildHall();
    guildHallActive.occupiedWorkers = 1; // active
    alice.island.addBuilding(guildHallActive);

    // GuildHall bonus: +1 per small production building, +2 per large production building
    // With no other buildings, bonus = 0
    const scores = ScoreCalculator.calculate(state);
    const aliceScore = scores.find(s => s.playerName === 'Alice')!;
    expect(aliceScore.buildingVP).toBe(4); // GuildHall.victoryPoints = 4
    expect(aliceScore.largeBuildingBonus).toBe(0); // no production buildings
  });

  it('large building bonus is 0 when building is inactive', () => {
    const state = createGame(3);
    const alice = state.players[0]!;

    const guildHall = new GuildHall();
    // No worker = inactive
    alice.island.addBuilding(guildHall);

    const scores = ScoreCalculator.calculate(state);
    const aliceScore = scores.find(s => s.playerName === 'Alice')!;
    expect(aliceScore.largeBuildingBonus).toBe(0);
  });

  it('Residence bonus: 9+ rural tiles (plantations) = max bonus', () => {
    const state = createGame(3);
    const alice = state.players[0]!;

    const residence = new Residence();
    residence.occupiedWorkers = 1; // active
    alice.island.addBuilding(residence);

    // Add 9 plantations (island starts with 1 indigo from setup, add 8 more)
    for (let i = 0; i < 8; i++) {
      activatePlantation(alice, PlantationType.Corn);
    }
    // Total plantations >= 9 → Residence bonus = 4

    const scores = ScoreCalculator.calculate(state);
    const aliceScore = scores.find(s => s.playerName === 'Alice')!;
    expect(aliceScore.largeBuildingBonus).toBe(4);
  });

  it('sorts by total VP descending', () => {
    const state = createGame(3);
    state.players[0]!.victoryPointTokens = 5;  // Alice: 5
    state.players[1]!.victoryPointTokens = 10; // Bob: 10
    state.players[2]!.victoryPointTokens = 3;  // Carol: 3
    const scores = ScoreCalculator.calculate(state);
    expect(scores[0]!.playerName).toBe('Bob');
    expect(scores[1]!.playerName).toBe('Alice');
    expect(scores[2]!.playerName).toBe('Carol');
  });

  it('tiebreaker 1: more doubloons wins', () => {
    const state = createGame(3);
    state.players[0]!.victoryPointTokens = 10;
    state.players[1]!.victoryPointTokens = 10;
    state.players[0]!.doubloons = 3;
    state.players[1]!.doubloons = 5; // Bob has more doubloons
    const scores = ScoreCalculator.calculate(state);
    expect(scores[0]!.playerName).toBe('Bob');
    expect(scores[1]!.playerName).toBe('Alice');
  });

  it('tiebreaker 2: more goods wins', () => {
    const state = createGame(3);
    state.players[0]!.victoryPointTokens = 10;
    state.players[1]!.victoryPointTokens = 10;
    state.players[0]!.doubloons = 5;
    state.players[1]!.doubloons = 5;
    state.players[0]!.addStoredGoods(GoodType.Corn, 2); // Alice has more goods
    const scores = ScoreCalculator.calculate(state);
    expect(scores[0]!.playerName).toBe('Alice');
  });

  it('tied players get the same rank', () => {
    const state = createGame(3);
    // All equal
    const scores = ScoreCalculator.calculate(state);
    expect(scores[0]!.rank).toBe(1);
    expect(scores[1]!.rank).toBe(1);
    expect(scores[2]!.rank).toBe(1);
  });

  it('rank 2 after a clear first place', () => {
    const state = createGame(3);
    state.players[0]!.victoryPointTokens = 10;
    const scores = ScoreCalculator.calculate(state);
    expect(scores[0]!.rank).toBe(1);
    expect(scores[1]!.rank).toBe(2);
    expect(scores[2]!.rank).toBe(2);
  });
});

describe('ScoreCalculator.getWinners', () => {
  it('returns single winner', () => {
    const state = createGame(3);
    state.players[0]!.victoryPointTokens = 15;
    const winners = ScoreCalculator.getWinners(state);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.playerName).toBe('Alice');
  });

  it('returns multiple winners on full tie', () => {
    const state = createGame(3);
    const winners = ScoreCalculator.getWinners(state);
    expect(winners).toHaveLength(3);
  });
});
