import { describe, expect, it, vi } from 'vitest';
import {
  CENTRAL_OUTLINE,
  PLAYER_OUTLINE,
  CENTRAL_PLACES,
  CENTRAL_WALKS,
  PLAYER_WALKS,
} from '../../src/presentation/iso/layout';
import {
  parcel,
  islandCenters,
  type Point,
} from '../../src/presentation/iso/projection';
import { walkAt, swayAt, bobAt } from '../../src/presentation/renderer/ambient';
import { roleChoice } from '../../src/presentation/interaction/roleChoices';
import { actionsForTarget } from '../../src/presentation/interaction/actionBridge';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { SelectRoleAction } from '../../actions/SelectRoleAction';
import { TakePlantationAction } from '../../actions/TakePlantationAction';
import { RoleType } from '../../core/types';

function inside(p: Point, polygon: readonly Point[]) {
  let positive = false,
    negative = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    positive ||= cross > 0.001;
    negative ||= cross < -0.001;
  }
  return !(positive && negative);
}
function area(p: readonly Point[]) {
  return (
    Math.abs(
      p.reduce((n, a, i) => {
        const b = p[(i + 1) % p.length]!;
        return n + a.x * b.y - b.x * a.y;
      }, 0),
    ) / 2
  );
}
describe('expanded world interactions and layout', () => {
  it('keeps entire central buildings on land and separates their clickable footprints', () => {
    const places = Object.values(CENTRAL_PLACES);
    expect(area(CENTRAL_OUTLINE)).toBeGreaterThan(area(PLAYER_OUTLINE) * 1.5);
    for (const p of places)
      for (const x of [p.x - p.size / 2 - 4, p.x + p.size / 2 + 4])
        for (const y of [p.y - p.size * 0.92 - 4, p.y + p.size * 0.08 + 4])
          expect(inside({ x, y }, CENTRAL_OUTLINE), JSON.stringify(p)).toBe(
            true,
          );
    for (let i = 0; i < places.length; i++)
      for (const b of places.slice(i + 1)) {
        const a = places[i]!;
        expect(
          Math.abs(a.x - b.x) > (a.size + b.size) / 2 + 8 ||
            a.y + 53 < b.y - b.size * 0.92 ||
            b.y + 53 < a.y - a.size * 0.92,
        ).toBe(true);
      }
  });
  it('keeps all player object bases and roof space on the enlarged island', () => {
    for (const u of [0, 1, 2, 3, 5, 6, 7, 8])
      for (const v of [0, 1, 2]) {
        const q = parcel(u, v);
        for (const x of [q.x - 46, q.x + 46])
          for (const y of [q.y - 80, q.y + 18])
            expect(
              inside({ x, y }, PLAYER_OUTLINE),
              JSON.stringify({ u, v, x, y }),
            ).toBe(true);
      }
  });
  it.each([3, 4, 5])(
    'separates %i player islands from San Juan and from each other',
    (n) => {
      const centers = islandCenters(n);
      const polygons = [
        CENTRAL_OUTLINE,
        ...centers.map((c) =>
          PLAYER_OUTLINE.map((p) => ({ x: p.x + c.x, y: p.y + c.y })),
        ),
      ];
      // Convex polygons are disjoint if a separating axis exists on either outline.
      for (let i = 0; i < polygons.length; i++)
        for (const b of polygons.slice(i + 1)) {
          const a = polygons[i]!;
          const axes = [a, b].flatMap((poly) =>
            poly.map((p, j) => {
              const q = poly[(j + 1) % poly.length]!;
              return { x: p.y - q.y, y: q.x - p.x };
            }),
          );
          expect(
            axes.some((axis) => {
              const aa = a.map((p) => p.x * axis.x + p.y * axis.y),
                bb = b.map((p) => p.x * axis.x + p.y * axis.y);
              return (
                Math.max(...aa) < Math.min(...bb) ||
                Math.max(...bb) < Math.min(...aa)
              );
            }),
          ).toBe(true);
        }
    },
  );
  it('loops ambient walks on land for hours without consuming game randomness', () => {
    const rng = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Game RNG touched');
    });
    try {
      for (const [routes, land] of [
        [CENTRAL_WALKS, CENTRAL_OUTLINE],
        [PLAYER_WALKS, PLAYER_OUTLINE],
      ] as const)
        for (const route of routes) {
          const period =
            route.reduce((sum, p, i) => {
              const q = route[(i + 1) % route.length]!;
              return sum + Math.hypot(q.x - p.x, q.y - p.y);
            }, 0) / 46;
          for (const time of [0, 2, 100, 3600, 14400]) {
            const p = walkAt(route, time);
            expect(inside(p, land)).toBe(true);
            expect(walkAt(route, time + period).x).toBeCloseTo(p.x);
            expect(walkAt(route, time + period).y).toBeCloseTo(p.y);
          }
          expect(walkAt(route, 0)).not.toEqual(walkAt(route, 2));
        }
      expect(rng).not.toHaveBeenCalled();
    } finally {
      rng.mockRestore();
    }
  });
  it('gives palms and boats visible bounded motion, including across a long game', () => {
    const frames = Array.from({ length: 90 }, (_, i) => ({
      tree: swayAt(i * 0.1, 2),
      boat: bobAt(i * 0.1, 2),
    }));
    expect(
      Math.max(...frames.map((f) => f.boat.y)) -
        Math.min(...frames.map((f) => f.boat.y)),
    ).toBeGreaterThan(11);
    expect(
      Math.max(...frames.map((f) => f.tree)) -
        Math.min(...frames.map((f) => f.tree)),
    ).toBeGreaterThan(0.09);
    expect(Math.abs(swayAt(14400, 8))).toBeLessThan(0.08);
    expect(Math.abs(bobAt(14400, 8).rotation)).toBeLessThan(0.03);
  });
  it('selects each Prospector by its actual card index and rejects unavailable cards', () => {
    const state = GameFactory.create(
      5,
      ['A', 'B', 'C', 'D', 'E'],
      new RoleSelectionPhase(),
    );
    const pid = state.getCurrentPlayer().id;
    const cards = state.roleCards.flatMap((c, i) =>
      c.type === RoleType.Prospector ? [i] : [],
    );
    expect(cards).toHaveLength(2);
    state.roleCards[cards[0]!]!.doubloonsOnCard = 1;
    state.roleCards[cards[1]!]!.doubloonsOnCard = 3;
    const actions = state.getValidActions(pid);
    const first = roleChoice(state, actions, cards[0]!),
      second = roleChoice(state, actions, cards[1]!);
    expect(first?.cardIndex).toBe(cards[0]);
    expect(second?.cardIndex).toBe(cards[1]);
    expect(first).not.toBe(second);
    const legacy = [new SelectRoleAction(pid, RoleType.Prospector)];
    expect(roleChoice(state, legacy, cards[0]!)).toBe(legacy[0]);
    expect(roleChoice(state, legacy, cards[1]!)).toBeUndefined();
    const money = state.getCurrentPlayer().doubloons;
    expect(state.apply(second!).ok).toBe(true);
    expect(state.getPlayer(pid)!.doubloons).toBe(money + 3);
    expect(roleChoice(state, actions, cards[1]!)).toBeUndefined();
  });
  it('keeps duplicate crop tiles and forest choices distinct in the popup', () => {
    const state = GameFactory.create(
      3,
      ['A', 'B', 'C'],
      new RoleSelectionPhase(),
    );
    const pid = state.getCurrentPlayer().id;
    const a = new TakePlantationAction(pid, { kind: 'revealed', index: 0 }),
      b = new TakePlantationAction(pid, { kind: 'revealed', index: 1 }),
      forest = new TakePlantationAction(
        pid,
        { kind: 'revealed', index: 1 },
        true,
      ),
      quarry = new TakePlantationAction(pid, { kind: 'quarry' });
    expect(
      actionsForTarget([a, b, forest, quarry], {
        key: 'plantations:revealed:1',
        area: 'plantations',
      }),
    ).toEqual([b, forest]);
    expect(
      actionsForTarget([a, b, forest, quarry], {
        key: 'plantations:quarry',
        area: 'plantations',
      }),
    ).toEqual([quarry]);
    expect(
      actionsForTarget([a, b, forest, quarry], {
        key: 'plantations',
        area: 'plantations',
      }),
    ).toEqual([a, b, forest, quarry]);
  });
});
