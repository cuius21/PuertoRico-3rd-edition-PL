import { describe, expect, it, vi } from 'vitest';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { RoleType, PlantationType, PhaseType } from '../../core/types';
import { Plantation } from '../../domain/Plantation';
import { Hut } from '../../domain/buildings/catalog/NewBuildings1';
import { PlaceWorkerAction } from '../../actions/PlaceWorkerAction';
import { MayorPassAction } from '../../actions/MayorPassAction';
import { TakePlantationAction } from '../../actions/TakePlantationAction';
import { selectRole, activateBuilding, applyOk } from '../helpers';
import { buildSceneSnapshot } from '../../src/presentation/adapter/buildSceneSnapshot';
import {
  waitingWorkforce,
  idleFormation,
} from '../../src/presentation/iso/workforce';
import {
  plantationTiles,
  plantationGuide,
} from '../../src/presentation/interaction/plantationChoices';
import {
  actionKey,
  resolveCurrentAction,
} from '../../src/presentation/interaction/actionBridge';
import {
  PLAYER_OUTLINE,
  CENTRAL_OUTLINE,
} from '../../src/presentation/iso/layout';
import { serializeGameState } from '../../src/game/GameSerializer';
const create = () =>
  GameFactory.create(3, ['A', 'B', 'C'], new RoleSelectionPhase(), {
    nobleBuildings: true,
    newBuildings: true,
  });
function inside(
  p: { x: number; y: number },
  polygon: readonly { x: number; y: number }[],
) {
  const signs = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  });
  return signs.every((n) => n >= -0.001) || signs.every((n) => n <= 0.001);
}
describe('worker visibility and direct plantation choice', () => {
  it('moves exact worker and noble counts from magistrate to waiting islands, buildings and reserve', () => {
    const s = create(),
      owner = s.getCurrentPlayer();
    owner.heldWorkers = 2;
    owner.heldNobles = 1;
    const before = buildSceneSnapshot(s, []);
    expect(waitingWorkforce(before.players[0]!)).toEqual({
      workers: 2,
      nobles: 1,
    });
    selectRole(s, RoleType.Mayor);
    let scene = buildSceneSnapshot(s, s.getValidActions(owner.id));
    expect(scene.magistrate).toBe(0);
    expect(scene.magistrateNobles).toBe(0);
    const p = scene.players[0]!,
      waiting = waitingWorkforce(p);
    expect(waiting.workers).toBe(owner.pendingWorkers);
    expect(waiting.nobles).toBe(owner.pendingNobles);
    expect(p.held + p.heldNobles).toBe(0);
    const place = s
      .getValidActions(owner.id)
      .find(
        (a) => a.type === 'PLACE_WORKER' && !(a as PlaceWorkerAction).asNoble,
      )!;
    applyOk(s, place);
    scene = buildSceneSnapshot(s, []);
    expect(waitingWorkforce(scene.players[0]!).workers).toBe(
      waiting.workers - 1,
    );
    expect(scene.players[0]!.objects.reduce((n, o) => n + o.workers, 0)).toBe(
      1,
    );
    const remain = waitingWorkforce(scene.players[0]!);
    applyOk(s, new MayorPassAction(owner.id));
    scene = buildSceneSnapshot(s, []);
    expect(waitingWorkforce(scene.players[0]!)).toEqual(remain);
    expect(scene.players[0]!.pending + scene.players[0]!.pendingNobles).toBe(0);
    expect(scene.players[0]!.held + scene.players[0]!.heldNobles).toBe(
      remain.workers + remain.nobles,
    );
    while (s.getCurrentPhase().type === PhaseType.Mayor)
      applyOk(s, new MayorPassAction(s.getCurrentPlayer().id));
    scene = buildSceneSnapshot(s, []);
    expect(scene.magistrate).toBe(s.supply.workersInMagistrate);
    expect(scene.magistrate).toBeGreaterThan(0);
    expect(waitingWorkforce(scene.players[0]!)).toEqual(remain);
  });
  it('keeps every unassigned token on land, including crowded late-game islands, without game randomness', () => {
    const rng = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw Error('UI consumed RNG');
    });
    try {
      for (const central of [true, false])
        for (const [workers, nobles] of [
          [0, 0],
          [3, 1],
          [9, 4],
          [95, 20],
        ]) {
          const people = idleFormation(workers!, nobles!, central),
            land = central ? CENTRAL_OUTLINE : PLAYER_OUTLINE;
          expect(people).toHaveLength(workers! + nobles!);
          expect(people.filter((p) => p.kind === 'noble')).toHaveLength(
            nobles!,
          );
          for (const p of people) {
            expect(inside(p, land)).toBe(true);
            expect(inside({ x: p.x, y: p.y - p.size }, land)).toBe(true);
          }
        }
      expect(rng).not.toHaveBeenCalled();
    } finally {
      rng.mockRestore();
    }
  });
  it('clicks an exact revealed resource once, removes that tile, and rejects the old action after the turn', () => {
    const s = create();
    selectRole(s, RoleType.Settler);
    s.supply.revealedPlantations = [
      new Plantation(PlantationType.Corn),
      new Plantation(PlantationType.Corn),
      new Plantation(PlantationType.Coffee),
    ];
    const pid = s.getCurrentPlayer().id,
      actions = s.getValidActions(pid),
      snapshot = serializeGameState(s);
    const tiles = plantationTiles(s, actions),
      tile = tiles.find((t) => t.key === 'crop:1')!;
    expect(serializeGameState(s)).toEqual(snapshot);
    expect((tile.action as TakePlantationAction).choice).toEqual({
      kind: 'revealed',
      index: 1,
    });
    expect(plantationGuide('settler', actions, true)).toBe(true);
    for (const [phase, canAct] of [
      ['settler', false],
      ['mayor', true],
    ] as const)
      expect(plantationGuide(phase, actions, canAct)).toBe(false);
    const key = actionKey(tile.action!);
    applyOk(s, resolveCurrentAction(key, actions)!);
    expect(s.supply.revealedPlantations.map((p) => p.type)).toEqual([
      PlantationType.Corn,
      PlantationType.Coffee,
    ]);
    expect(
      resolveCurrentAction(key, s.getValidActions(s.getCurrentPlayer().id)),
    ).toBeUndefined();
    expect(plantationTiles(s, []).every((t) => !t.action)).toBe(true);
    expect(plantationGuide('settler', [], true)).toBe(false);
    expect(
      plantationTiles(s, s.getValidActions(s.getCurrentPlayer().id)).find(
        (t) => t.key === 'quarry',
      )?.action,
    ).toBeUndefined();
  });
  it('preserves the Hut forest variant as a separate one-click tile for the same resource', () => {
    const s = create(),
      p = s.getCurrentPlayer();
    activateBuilding(p, new Hut());
    selectRole(s, RoleType.Settler);
    const tiles = plantationTiles(s, s.getValidActions(p.id));
    const forest = tiles.find((t) => t.key === 'forest:0')!;
    expect(forest.action?.asForest).toBe(true);
    expect(tiles.find((t) => t.key === 'crop:0')?.action?.asForest).toBe(false);
    const occupied = p.island.getPlantationSlots().filter(Boolean).length;
    applyOk(s, forest.action!);
    expect(p.island.getPlantationSlots().filter(Boolean)).toHaveLength(
      occupied + 1,
    );
    expect(p.island.getPlantationSlots().some((p) => p?.isForest)).toBe(true);
  });
});
