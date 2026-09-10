import { describe, expect, it, vi } from 'vitest';
import { createGame, giveGoods, selectRole, applyOk } from '../helpers';
import { RoleType, GoodType } from '../../core/types';
import { LoadShipAction } from '../../actions/LoadShipAction';
import { SellGoodAction } from '../../actions/SellGoodAction';
import { buildSceneSnapshot } from '../../src/presentation/adapter/buildSceneSnapshot';
import {
  ShipVoyages,
  voyageFrame,
  SAIL_SECONDS,
  SEA_PAUSE,
} from '../../src/presentation/renderer/shipVoyages';
import { actionsForTarget } from '../../src/presentation/interaction/actionBridge';
import { serializeGameState } from '../../src/game/GameSerializer';

describe('port voyages and separate trading house', () => {
  it('sails when full, waits offshore until engine unloading, and returns empty without changing the game', () => {
    const state = createGame();
    giveGoods(state.players[0]!, GoodType.Corn, 4);
    giveGoods(state.players[1]!, GoodType.Indigo, 2);
    giveGoods(state.players[2]!, GoodType.Sugar, 1);
    selectRole(state, RoleType.Captain);
    const snap = () =>
      buildSceneSnapshot(
        state,
        state.getValidActions(state.getCurrentPlayer().id),
      );
    const voyages = new ShipVoyages();
    voyages.update(snap(), 0, true);
    applyOk(
      state,
      new LoadShipAction(
        state.players[0]!.id,
        { kind: 'ship', shipIndex: 0 },
        GoodType.Corn,
      ),
    );
    const full = snap(),
      before = serializeGameState(state);
    const rng = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw Error('Presentation used RNG');
    });
    try {
      voyages.update(full, 1, true);
      expect(voyageFrame(voyages.get(0), 2).stage).toBe('departing');
      expect(voyageFrame(voyages.get(0), 20)).toMatchObject({
        stage: 'away',
        alpha: 0,
        cargo: true,
      });
      voyages.update({ ...full, legalTargets: [] }, 21, true);
      expect(voyages.get(0)?.started).toBe(1);
      expect(serializeGameState(state)).toEqual(before);
      expect(rng).not.toHaveBeenCalled();
    } finally {
      rng.mockRestore();
    }
    applyOk(
      state,
      new LoadShipAction(
        state.players[1]!.id,
        { kind: 'ship', shipIndex: 1 },
        GoodType.Indigo,
      ),
    );
    voyages.update(snap(), 22, true);
    applyOk(
      state,
      new LoadShipAction(
        state.players[2]!.id,
        { kind: 'ship', shipIndex: 2 },
        GoodType.Sugar,
      ),
    );
    expect(state.ships[0]!.loadedCount).toBe(0);
    voyages.update(snap(), 23, true);
    expect(voyageFrame(voyages.get(0), 24)).toMatchObject({
      stage: 'returning',
      cargo: false,
    });
    expect(voyageFrame(voyages.get(0), 28)).toMatchObject({
      stage: 'docked',
      progress: 0,
      alpha: 1,
    });
    expect(voyages.get(1)).toBeUndefined();
    expect(voyages.get(2)).toBeUndefined();
  });
  it('shows the final load even if filling and unloading happen within one engine action', () => {
    const state = createGame();
    giveGoods(state.players[0]!, GoodType.Corn, 4);
    selectRole(state, RoleType.Captain);
    const voyages = new ShipVoyages();
    voyages.update(buildSceneSnapshot(state, []), 0, true);
    applyOk(
      state,
      new LoadShipAction(
        state.players[0]!.id,
        { kind: 'ship', shipIndex: 0 },
        GoodType.Corn,
      ),
    );
    const after = buildSceneSnapshot(state, []);
    expect(after.ships[0]!.count).toBe(0);
    expect(after.phase).not.toBe('captain');
    voyages.update(after, 1, true);
    expect(voyages.get(0)).toMatchObject({
      good: 'corn',
      capacity: 4,
      cleared: 1,
    });
    expect(voyageFrame(voyages.get(0), 2)).toMatchObject({
      stage: 'departing',
      cargo: true,
    });
    expect(
      voyageFrame(voyages.get(0), 1 + SAIL_SECONDS + SEA_PAUSE + 1),
    ).toMatchObject({ stage: 'returning', cargo: false });
    voyages.update(after, 3, true);
    expect(voyages.get(0)?.started).toBe(1);
  });
  it('does not replay history on initial load, handles reduced motion, and prioritizes new cargo', () => {
    const base = buildSceneSnapshot(createGame(), []);
    const full = {
      ...base,
      phase: 'captain',
      ships: base.ships.map((s, i) =>
        i === 0 ? { ...s, count: s.capacity, good: 'corn' } : s,
      ),
    };
    const voyages = new ShipVoyages();
    voyages.update(full, 0, true);
    expect(voyages.get(0)).toBeUndefined();
    voyages.update(base, 1, false);
    voyages.update(full, 2, false);
    expect(voyages.get(0)).toBeUndefined();
    voyages.update(full, 3, true);
    expect(voyages.get(0)).toBeUndefined();
    voyages.update(base, 4, true);
    expect(voyages.get(0)).toBeDefined();
    const newCargo = {
      ...base,
      phase: 'captain',
      ships: base.ships.map((s, i) =>
        i === 0 ? { ...s, count: 2, good: 'coffee' } : s,
      ),
    };
    voyages.update(newCargo, 5, true);
    expect(voyages.get(0)).toBeUndefined();
    expect(voyageFrame(voyages.get(0), 5).stage).toBe('docked');
  });
  it('keeps the market goods snapshot detached and directs sales to the wooden trading sign', () => {
    const state = createGame();
    giveGoods(state.players[0]!, GoodType.Coffee, 1);
    giveGoods(state.players[1]!, GoodType.Indigo, 1);
    selectRole(state, RoleType.Trader);
    const actions = state.getValidActions(state.getCurrentPlayer().id);
    const sale = actions.find((a) => a instanceof SellGoodAction)!;
    expect(
      actionsForTarget(actions, { key: 'trade', area: 'trade' }),
    ).toContain(sale);
    expect(
      actionsForTarget(actions, { key: 'market', area: 'market' }),
    ).not.toContain(sale);
    const before = buildSceneSnapshot(state, actions);
    applyOk(state, sale);
    const after = buildSceneSnapshot(state, []);
    expect(before.trade.filter(Boolean)).toHaveLength(0);
    expect(after.trade).toContain('coffee');
    after.trade[0] = null;
    expect(state.tradingHouse.containsGood(GoodType.Coffee)).toBe(true);
  });
});
