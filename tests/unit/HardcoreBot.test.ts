import { describe, it, expect } from 'vitest';
import { HardcoreBot } from '../../src/bots/HardcoreBot';
import { chooseHeuristicAction, scoreHardcoreAction } from '../../src/bots/hardcorePolicy';
import { evaluateHardcoreState, remainingRounds } from '../../src/bots/hardcoreEvaluation';
import { cloneGameState } from '../../src/bots/simulation';
import { serializeGameState } from '../../src/game/GameSerializer';
import { LargeIndigoPlant } from '../../domain/buildings/catalog/ProductionBuildings';
import { CustomsHouse } from '../../domain/buildings/catalog/LargeBuildings';
import { SelectRoleAction } from '../../actions/SelectRoleAction';
import { GoodType, PhaseType, RoleType } from '../../core/types';
import { createGame, selectRole, applyOk } from '../helpers';

function rng(seed = 71): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function fixedBot(iterations = 24): HardcoreBot {
  return new HardcoreBot({ timeBudgetMs: Infinity, maxIterations: iterations, random: rng(), rolloutRounds: 1 });
}

describe('Hardcore whole-island staffing', () => {
  it('allocates a plantation/factory pair instead of stranding both workers in the factory', () => {
    const state = createGame();
    const p = state.players[0]!;
    p.island.addBuilding(new LargeIndigoPlant());
    selectRole(state, RoleType.Mayor);
    expect(p.pendingWorkers).toBe(2);
    const bot = fixedBot();
    while (state.getCurrentPlayer().id === p.id && p.pendingWorkers > 0) applyOk(state, bot.chooseAction(state, p.id));
    expect(p.island.getProductionCapacity(GoodType.Indigo)).toBe(1);
    expect(p.island.getBuildings()[0]!.occupiedWorkers).toBe(1);
  });

  it('activates a large building whose certain endgame points beat production', () => {
    const state = createGame();
    const p = state.players[0]!;
    p.victoryPointTokens = 40;
    p.island.addBuilding(new CustomsHouse());
    p.island.addBuilding(new LargeIndigoPlant());
    state.supply.victoryPointPool = 3;
    selectRole(state, RoleType.Mayor);
    p.pendingWorkers = 1;
    const action = chooseHeuristicAction(state, p.id);
    applyOk(state, action);
    expect(p.island.getBuildings().find(b => b.id === 'customsHouse')!.isActive()).toBe(true);
  });
});

describe('Hardcore search correctness', () => {
  it('searches multiple decision levels without mutating the caller state or host RNG', () => {
    const state = createGame();
    const snapshot = serializeGameState(state);
    const hostRandom = Math.random;
    const bot = fixedBot(32);
    const action = bot.chooseAction(state, state.getCurrentPlayer().id);
    expect(action.validate(state).ok).toBe(true);
    expect(bot.lastSearchStats.iterations).toBe(32);
    expect(bot.lastSearchStats.maxTreeDepth).toBeGreaterThan(1);
    expect(serializeGameState(state)).toEqual(snapshot);
    expect(Math.random).toBe(hostRandom);
    expect(bot.lastSearchStats.rootActions.reduce((sum, a) => sum + a.visits, 0)).toBe(32);
  });

  it('is reproducible with fixed iterations and a seeded RNG', () => {
    const state = createGame();
    const a = fixedBot();
    const b = fixedBot();
    expect(a.chooseAction(state, state.getCurrentPlayer().id)).toEqual(b.chooseAction(state, state.getCurrentPlayer().id));
    expect(a.lastSearchStats.rootActions).toEqual(b.lastSearchStats.rootActions);
  });

  it('cannot use the actual concealed plantation ordering', () => {
    const state = createGame();
    const reversed = cloneGameState(state);
    for (const deck of reversed.supply.plantationDecks) deck.reverse();
    const a = fixedBot();
    const b = fixedBot();
    expect(a.chooseAction(state, state.getCurrentPlayer().id)).toEqual(b.chooseAction(reversed, reversed.getCurrentPlayer().id));
    expect(a.lastSearchStats.rootActions).toEqual(b.lastSearchStats.rootActions);
  });

  it('finishes role phases before asking the value network to evaluate', () => {
    const state = createGame();
    const phases: PhaseType[] = [];
    const bot = new HardcoreBot({ timeBudgetMs: Infinity, maxIterations: 10, rolloutRounds: 1, random: rng(),
      evaluator: { evaluate: sim => { phases.push(sim.getCurrentPhase().type); return evaluateHardcoreState(sim); } } });
    bot.chooseAction(state, state.getCurrentPlayer().id);
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every(p => p === PhaseType.RoleSelection || p === PhaseType.GameOver)).toBe(true);
  });

  it('sanitizes invalid numeric configuration without losing the rollout horizon', () => {
    const state = createGame();
    const bot = new HardcoreBot({ timeBudgetMs: Infinity, maxIterations: 1, rolloutRounds: NaN, evaluatorWeight: NaN, random: rng() });
    expect(bot.chooseAction(state, state.getCurrentPlayer().id).validate(state).ok).toBe(true);
    expect(bot.lastSearchStats.iterations).toBe(1);
    expect(new HardcoreBot({ timeBudgetMs: NaN }).timeBudgetMs).toBe(650);
    expect(new HardcoreBot({ maxIterations: NaN }).maxIterations).toBe(1500);
  });

  it('restores host RNG if a supplied random generator throws', () => {
    const state = createGame();
    const hostRandom = Math.random;
    const bot = new HardcoreBot({ timeBudgetMs: Infinity, maxIterations: 1, random: () => { throw new Error('rng failed'); } });
    expect(() => bot.chooseAction(state, state.getCurrentPlayer().id)).toThrow('rng failed');
    expect(Math.random).toBe(hostRandom);
  });

  it('has a legal deterministic fallback when the search budget is zero', () => {
    const state = createGame();
    const bot = new HardcoreBot({ timeBudgetMs: 0 });
    const action = bot.chooseAction(state, state.getCurrentPlayer().id);
    expect(action).toEqual(chooseHeuristicAction(state, state.getCurrentPlayer().id));
    expect(bot.lastSearchStats.iterations).toBe(0);
  });

  it('continues heuristic search when the network fails and restores host RNG', () => {
    const state = createGame();
    const bad = new HardcoreBot({ timeBudgetMs: Infinity, maxIterations: 1, random: rng(), evaluator: { evaluate: () => [NaN] } });
    expect(bad.chooseAction(state, state.getCurrentPlayer().id).validate(state).ok).toBe(true);
    const hostRandom = Math.random;
    const throwing = new HardcoreBot({ timeBudgetMs: Infinity, maxIterations: 1, random: rng(), evaluator: { evaluate: () => { throw new Error('network error'); } } });
    expect(throwing.chooseAction(state, state.getCurrentPlayer().id).validate(state).ok).toBe(true);
    expect(throwing.lastSearchStats.evaluatorErrors).toBe(1);
    expect(Math.random).toBe(hostRandom);
  });
});

describe('Hardcore value and legal-action distinctions', () => {
  it('gives terminal victory to actual points before counting any stored goods', () => {
    const state = createGame();
    state.players[0]!.victoryPointTokens = 10;
    state.players[0]!.addStoredGoods(GoodType.Coffee, 10);
    state.players[1]!.victoryPointTokens = 11;
    state.gameOver = true;
    expect(evaluateHardcoreState(state)).toEqual([0, 1, 0]);
  });

  it('shares win utility for exact ties and honors the real tiebreakers', () => {
    const state = createGame();
    for (const p of state.players) { p.victoryPointTokens = 10; p.doubloons = 2; }
    state.gameOver = true;
    expect(evaluateHardcoreState(state)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    state.players[2]!.doubloons++;
    expect(evaluateHardcoreState(state)).toEqual([0, 0, 1]);
  });

  it('distinguishes prospectors by card index and collected coins', () => {
    const state = createGame(5);
    const indices = state.roleCards.flatMap((c, i) => c.type === RoleType.Prospector ? [i] : []);
    expect(indices.length).toBe(2);
    state.roleCards[indices[0]!]!.doubloonsOnCard = 0;
    state.roleCards[indices[1]!]!.doubloonsOnCard = 5;
    const pid = state.getCurrentPlayer().id;
    const first = new SelectRoleAction(pid, RoleType.Prospector, indices[0]!);
    const second = new SelectRoleAction(pid, RoleType.Prospector, indices[1]!);
    expect(scoreHardcoreAction(second, state, pid)).toBeGreaterThan(scoreHardcoreAction(first, state, pid));
  });

  it('does not assume empty worker supply ends noble-expansion games', () => {
    const state = createGame();
    state.supply.workersPool = 0;
    state.supply.workersInMagistrate = 0;
    const base = remainingRounds(state);
    state.nobleExpansion = true;
    expect(remainingRounds(state)).toBeGreaterThan(base);
  });
});