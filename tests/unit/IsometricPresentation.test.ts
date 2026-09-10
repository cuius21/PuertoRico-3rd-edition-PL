import { describe, it, expect, vi } from 'vitest';
import {
  project,
  unproject,
  urbanLayout,
  islandCenters,
} from '../../src/presentation/iso/projection';
import { buildSceneSnapshot } from '../../src/presentation/adapter/buildSceneSnapshot';
import {
  actionKey,
  resolveCurrentAction,
  targetsForAction,
  actionsForTarget,
} from '../../src/presentation/interaction/actionBridge';
import {
  serializeGameState,
  deserializeGameState,
} from '../../src/game/GameSerializer';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { GreedyBot } from '../../src/bots/GreedyBot';
import { createGame, selectRole, activateBuilding } from '../helpers';
import { RoleType, GoodType } from '../../core/types';
import { SmallMarket } from '../../domain/buildings/catalog/SmallUtilityBuildings';
import { Fortress } from '../../domain/buildings/catalog/LargeBuildings';
import { PlaceWorkerAction } from '../../actions/PlaceWorkerAction';
import { LoadShipAction } from '../../actions/LoadShipAction';

describe('isometric presentation boundary', () => {
  it('round trips grid coordinates including negative positions and fractional tile centers', () => {
    for (const u of [-12, -0.5, 0, 3, 12])
      for (const v of [-8, 0, 0.25, 5, 9]) {
        const p = project(u, v),
          grid = unproject(p.x, p.y);
        expect(grid.x).toBeCloseTo(u);
        expect(grid.y).toBeCloseTo(v);
      }
  });
  it('packs large buildings into adjacent city cells without duplication or overlap', () => {
    for (let large = 0; large <= 5; large++) {
      const input = [
        ...Array.from({ length: 12 - large * 2 }, (_, i) => ({
          id: 'small' + i,
          size: 1,
        })),
        ...Array.from({ length: large }, (_, i) => ({
          id: 'large' + i,
          size: 2,
        })),
      ];
      const before = JSON.stringify(input),
        layout = urbanLayout(input),
        cells = new Set<string>();
      for (const b of layout)
        for (let k = 0; k < b.size; k++) {
          expect(b.u + k).toBeLessThan(9);
          expect(b.v).toBeLessThan(3);
          const cell = b.u + k + ':' + b.v;
          expect(cells.has(cell)).toBe(false);
          cells.add(cell);
        }
      expect(cells.size).toBe(12);
      expect(JSON.stringify(input)).toBe(before);
    }
  });
  it.each([3, 4, 5] as const)(
    'copies a %i-player game without mutation, random calls or retained state references',
    (n) => {
      const s = GameFactory.create(
        n,
        ['A', 'B', 'C', 'D', 'E'].slice(0, n),
        new RoleSelectionPhase(),
        {
          festival: true,
          corsair: true,
          newBuildings: true,
          nobleBuildings: true,
        },
      );
      activateBuilding(s.players[0]!, new SmallMarket());
      activateBuilding(s.players[0]!, new Fortress());
      s.players[0]!.addStoredGoods(GoodType.Coffee, 3);
      const actions = s.getValidActions(s.getCurrentPlayer().id),
        before = serializeGameState(s);
      const rng = vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Renderer must not consume game RNG');
      });
      try {
        const scene = buildSceneSnapshot(s, actions);
        expect(scene.players).toHaveLength(n);
        expect(islandCenters(n)).toHaveLength(n);
        expect(scene.ships.map((x) => x.capacity)).toEqual([
          n + 1,
          n + 2,
          n + 3,
        ]);
        expect(
          scene.festival && scene.corsair && scene.nobles && scene.newBuildings,
        ).toBe(true);
        expect(
          scene.players[0]!.objects.filter((o) => o.sprite === 'fortress'),
        ).toHaveLength(1);
        expect(scene.players[0]!.goods.coffee).toBe(3);
        expect(
          buildSceneSnapshot(deserializeGameState(before), actions),
        ).toEqual(scene);
        scene.players[0]!.goods.coffee = 100;
        scene.players[0]!.objects[0]!.workers = 100;
        scene.trade.push('coffee');
        scene.ships[0]!.count = 50;
        expect(serializeGameState(s)).toEqual(before);
        expect(rng).not.toHaveBeenCalled();
      } finally {
        rng.mockRestore();
      }
    },
  );
  it('rejects stale commands and returns a current engine Action, keeping validate/execute methods', () => {
    const s = createGame(),
      original = s.getValidActions(s.getCurrentPlayer().id),
      key = actionKey(original[0]!);
    const current = s.getValidActions(s.getCurrentPlayer().id),
      resolved = resolveCurrentAction(key, current)!;
    expect(current).toContain(resolved);
    expect(typeof resolved.validate).toBe('function');
    expect(s.apply(resolved).ok).toBe(true);
    expect(
      resolveCurrentAction(key, s.getValidActions(s.getCurrentPlayer().id)),
    ).toBeUndefined();
  });
  it('maps map targets to legal worker, market and port commands', () => {
    const s = createGame(),
      pid = s.getCurrentPlayer().id;
    selectRole(s, RoleType.Builder);
    const list = s.getValidActions(pid),
      build = list.find((a) => a.type === 'BUILD')!;
    expect(actionsForTarget(list, { key: 'market', area: 'market' })).toContain(
      build,
    );
    expect(
      targetsForAction(
        new PlaceWorkerAction(pid, { kind: 'plantation', slotIndex: 2 }),
      ),
    ).toEqual([pid + ':plantation:2']);
    expect(
      targetsForAction(
        new LoadShipAction(pid, { kind: 'ship', shipIndex: 1 }, GoodType.Corn),
      ),
    ).toEqual(['port', 'ship:1']);
  });
  it('leaves a complete bot game identical when a snapshot is drawn before every move', () => {
    const original = createGame(),
      withUI = deserializeGameState(serializeGameState(original)),
      bot = new GreedyBot();
    // Use identical deterministic RNG streams for each game, including phase refills.
    function play(s: typeof original, draw: boolean) {
      let seed = 81231;
      const rng = vi.spyOn(Math, 'random').mockImplementation(() => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      });
      let moves = 0;
      try {
        while (!s.gameOver && moves++ < 2500) {
          const pid = s.getCurrentPlayer().id;
          if (draw) buildSceneSnapshot(s, s.getValidActions(pid));
          const a = bot.chooseAction(s, pid);
          if (!a) throw new Error('No bot action');
          expect(s.apply(a).ok).toBe(true);
        }
        expect(s.gameOver).toBe(true);
        return serializeGameState(s);
      } finally {
        rng.mockRestore();
      }
    }
    expect(play(withUI, true)).toEqual(play(original, false));
  });
});
