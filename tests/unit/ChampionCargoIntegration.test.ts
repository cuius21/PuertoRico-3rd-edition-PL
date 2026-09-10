import { describe, it, expect } from 'vitest';
import { championCargoUnits, championPlayerValue, evaluateChampionState } from '../../src/bots/championEvaluation';
import { scoreChampionAction, chooseChampionHeuristicAction } from '../../src/bots/championPolicy';
import { estimateChampionShipping } from '../../src/bots/championShipping';
import { hardcorePlayerValue, evaluateHardcoreState } from '../../src/bots/hardcoreEvaluation';
import { scoreHardcoreAction, chooseHeuristicAction } from '../../src/bots/hardcorePolicy';
import { serializeGameState } from '../../src/game/GameSerializer';
import { SelectRoleAction } from '../../actions/SelectRoleAction';
import { SmallWarehouse, Harbour } from '../../domain/buildings/catalog/SmallUtilityBuildings';
import { TransferStation, Marina } from '../../domain/buildings/catalog/NewBuildings1';
import { CaptainPhase } from '../../state/phases/CaptainPhase';
import { GoodType, RoleType } from '../../core/types';
import { createGame } from '../helpers';

function contestedCargo() {
  const state = createGame();
  state.ships[1]!.loadedGood = GoodType.Sugar;
  state.ships[1]!.loadedCount = state.ships[1]!.capacity;
  state.ships[2]!.loadedGood = GoodType.Coffee;
  state.ships[2]!.loadedCount = state.ships[2]!.capacity;
  state.players[0]!.addStoredGoods(GoodType.Corn, 5);
  state.players[0]!.addStoredGoods(GoodType.Indigo, 5);
  return state;
}
function closeShips(state: ReturnType<typeof createGame>): void {
  state.ships[0]!.loadedGood = GoodType.Tobacco;
  state.ships[0]!.loadedCount = state.ships[0]!.capacity;
}

describe('Champion cargo value integration', () => {
  it('replaces exactly the repeated-capacity stock terms and keeps the trading premium', () => {
    const state = contestedCargo();
    const player = state.players[0]!;
    const plan = estimateChampionShipping(state, player);
    expect(plan.supported).toBe(true);
    expect([plan.shipped, plan.retained, plan.discarded]).toEqual([4, 1, 5]);
    // Old: each of two goods reused the same four ship slots. New: only four
    // ship, one remains stored, five may still have a speculative trading use.
    const oldCargo = 2 * (4 * 0.85 + 1 * 0.12);
    const newCargo = 4 * 0.85 + 1 * 0.55 + 5 * 0.12;
    const base = hardcorePlayerValue(state, player);
    expect(championPlayerValue(state, player) - base).toBeCloseTo(newCargo - oldCargo, 12);
    expect(championPlayerValue(state, player) - base).toBeCloseTo(-2.49, 12);
    expect(evaluateChampionState(state)[0]!).toBeLessThan(evaluateHardcoreState(state)[0]!);
  });

  it('applies the same exact replacement with a short remaining horizon', () => {
    const state = contestedCargo();
    const player = state.players[0]!;
    const rounds = 0.5;
    const oldCargo = 2 * (4 * (rounds * 0.65) + 1 * 0.12);
    const newCargo = 4 * (rounds * 0.65) + 1 * (rounds * 0.35) + 5 * 0.12;
    expect(championPlayerValue(state, player, rounds) - hardcorePlayerValue(state, player, rounds)).toBeCloseTo(newCargo - oldCargo, 12);
  });

  it('does not count a small warehouse as protection for all three stocked types', () => {
    const state = contestedCargo();
    closeShips(state);
    const player = state.players[0]!;
    player.addStoredGoods(GoodType.Tobacco, 5);
    const warehouse = new SmallWarehouse();
    warehouse.occupiedWorkers = 1;
    player.island.addBuilding(warehouse);
    const plan = estimateChampionShipping(state, player);
    expect([plan.shipped, plan.retained, plan.discarded]).toEqual([0, 5, 10]);
    expect(championPlayerValue(state, player) - hardcorePlayerValue(state, player)).toBeCloseTo(5 * 0.55 + 10 * 0.12 - 15 * 0.85, 12);
  });

  it('does not add Harbour shipping bonuses a second time', () => {
    const state = contestedCargo();
    const player = state.players[0]!;
    const oldCorrection = championPlayerValue(state, player) - hardcorePlayerValue(state, player);
    const harbour = new Harbour();
    harbour.occupiedWorkers = 1;
    player.island.addBuilding(harbour);
    const plan = estimateChampionShipping(state, player);
    expect(plan.shippingVp).toBeGreaterThan(plan.shipped);
    expect(championPlayerValue(state, player) - hardcorePlayerValue(state, player)).toBeCloseTo(oldCorrection, 12);
  });

  it('uses exact incremental Marina points, including an odd earlier load', () => {
    const state = contestedCargo();
    closeShips(state);
    const player = state.players[0]!;
    player.storedGoods.set(GoodType.Corn, 3);
    player.storedGoods.set(GoodType.Indigo, 0);
    const marina = new Marina();
    marina.occupiedWorkers = 1;
    player.island.addBuilding(marina);
    const future = estimateChampionShipping(state, player);
    expect(future.marinaShipped).toBe(3);
    expect(championCargoUnits(state, player, future)).toBe(1);
    expect(championPlayerValue(state, player) - hardcorePlayerValue(state, player)).toBeCloseTo(0.85 - 3 * 0.12, 12);
    state.restorePhase(new CaptainPhase());
    player.marinaGoodsLoaded = 1;
    const ongoing = estimateChampionShipping(state, player);
    expect(championCargoUnits(state, player, ongoing)).toBe(2);
  });

  it('falls back per unsupported player while retaining other supported corrections', () => {
    const state = contestedCargo();
    const player = state.players[0]!;
    const transfer = new TransferStation();
    transfer.occupiedWorkers = 1;
    player.island.addBuilding(transfer);
    state.players[1]!.addStoredGoods(GoodType.Corn, 5);
    state.players[1]!.addStoredGoods(GoodType.Indigo, 5);
    expect(estimateChampionShipping(state, player).supported).toBe(false);
    expect(championPlayerValue(state, player)).toBe(hardcorePlayerValue(state, player));
    expect(championPlayerValue(state, state.players[1]!)).toBeLessThan(hardcorePlayerValue(state, state.players[1]!));
    expect(evaluateChampionState(state).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('keeps terminal winners exact and never changes the caller state', () => {
    const state = contestedCargo();
    const before = serializeGameState(state);
    evaluateChampionState(state);
    expect(serializeGameState(state)).toEqual(before);
    state.players[0]!.victoryPointTokens = 10;
    state.players[1]!.victoryPointTokens = 11;
    state.gameOver = true;
    expect(evaluateChampionState(state)).toEqual([0, 1, 0]);
  });
});

describe('Champion Captain policy integration', () => {
  it('corrects Captain only, with exactly the existing opponent weight', () => {
    const state = contestedCargo();
    const pid = state.getCurrentPlayer().id;
    const action = new SelectRoleAction(pid, RoleType.Captain);
    const base = scoreHardcoreAction(action, state, pid);
    expect(scoreChampionAction(action, state, pid) - base).toBeCloseTo(-4 * 0.85, 12);
    state.players[1]!.addStoredGoods(GoodType.Corn, 5);
    state.players[1]!.addStoredGoods(GoodType.Indigo, 5);
    const rivalBase = scoreHardcoreAction(action, state, pid);
    expect(scoreChampionAction(action, state, pid) - rivalBase).toBeCloseTo(-4 * 0.85 + 0.65 * 4 * 0.85 / 2, 12);
    for (const legal of state.getValidActions(pid)) {
      if ((legal as SelectRoleAction).role !== RoleType.Captain) expect(scoreChampionAction(legal, state, pid)).toBe(scoreHardcoreAction(legal, state, pid));
    }
  });

  it('does not award a Captain privilege for Marina-only shipping', () => {
    const state = contestedCargo();
    closeShips(state);
    const player = state.players[0]!;
    player.storedGoods.set(GoodType.Corn, 3);
    player.storedGoods.set(GoodType.Indigo, 0);
    const marina = new Marina();
    marina.occupiedWorkers = 1;
    player.island.addBuilding(marina);
    const action = new SelectRoleAction(player.id, RoleType.Captain);
    expect(scoreChampionAction(action, state, player.id) - scoreHardcoreAction(action, state, player.id)).toBeCloseTo(0.85, 12);
  });

  it('preserves exact baseline choices and scores when shipping is disabled', () => {
    const state = contestedCargo();
    const pid = state.getCurrentPlayer().id;
    const actions = state.getValidActions(pid);
    for (const action of actions) expect(scoreChampionAction(action, state, pid, { shipping: false })).toBe(scoreHardcoreAction(action, state, pid));
    expect(chooseChampionHeuristicAction(state, pid, actions, { workers: false, shipping: false })).toEqual(chooseHeuristicAction(state, pid, actions));
  });
});