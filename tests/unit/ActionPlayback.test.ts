import { describe, expect, it, vi } from 'vitest';
import {
  createGame,
  applyOk,
  selectRole,
  activatePlantation,
  activateBuilding,
  giveGoods,
} from '../helpers';
import { RoleType, GoodType, PlantationType } from '../../core/types';
import type { Action } from '../../actions/Action';
import { SelectRoleAction } from '../../actions/SelectRoleAction';
import { BuildAction } from '../../actions/BuildAction';
import { LoadShipAction } from '../../actions/LoadShipAction';
import { PlaceWorkerAction } from '../../actions/PlaceWorkerAction';
import { SmallIndigoPlant } from '../../domain/buildings/catalog/ProductionBuildings';
import { buildSceneSnapshot } from '../../src/presentation/adapter/buildSceneSnapshot';
import {
  captureAction,
  buildActionBeats,
} from '../../src/presentation/playback/actionBeats';
import { PlaybackQueue } from '../../src/presentation/playback/PlaybackQueue';
import { describeAction } from '../../src/game/actionLabels';
import {
  serializeGameState,
  deserializeGameState,
} from '../../src/game/GameSerializer';
import { GreedyBot } from '../../src/bots/GreedyBot';
import { createScenario, human } from '../../src/tutorial/scenarios';

function observe(s: ReturnType<typeof createGame>, a: Action, isBot = true) {
  const capture = captureAction(a, s, {
    playerName: s.getCurrentPlayer().name,
    actionText: describeAction(a, s),
    isBot,
  });
  applyOk(s, a);
  return buildActionBeats(capture, buildSceneSnapshot(s, []));
}
describe('action observation grounded in actual game changes', () => {
  it('shows the built object on its owner island and the actual price paid', () => {
    const s = createGame();
    s.players[0]!.doubloons = 10;
    selectRole(s, RoleType.Builder);
    const a = s
      .getValidActions(s.getCurrentPlayer().id)
      .find((a) => a.type === 'BUILD')!;
    const coins = s.players[0]!.doubloons;
    const beats = observe(s, a);
    expect(beats[0]!.kind).toBe('build');
    expect(beats[0]!.focus).toBe(s.players[0]!.id);
    expect(beats[0]!.highlights).toContain(
      s.players[0]!.id + ':building:' + (a as BuildAction).buildingId,
    );
    expect(beats[0]!.changes.find((c) => c.icon === 'coin')?.amount ?? 0).toBe(
      s.players[0]!.doubloons - coins,
    );
  });
  it('visits every island during production, including zero output, without revealing the later islands early', () => {
    const s = createGame();
    activatePlantation(s.players[0]!, PlantationType.Corn);
    activatePlantation(s.players[1]!, PlantationType.Indigo);
    activateBuilding(s.players[1]!, new SmallIndigoPlant());
    const before = buildSceneSnapshot(s, []);
    const beats = observe(
      s,
      new SelectRoleAction(s.getCurrentPlayer().id, RoleType.Craftsman),
    );
    expect(beats[0]!.kind).toBe('role');
    const production = beats.filter((b) => b.kind === 'production');
    expect(production.map((b) => b.actorId)).toEqual(
      s.players.map((p) => p.id),
    );
    expect(production[0]!.changes).toContainEqual({ icon: 'corn', amount: 1 });
    expect(production[1]!.changes).toContainEqual({
      icon: 'indigo',
      amount: 1,
    });
    expect(production[2]!.detail).toContain('Brak wyprodukowanych');
    expect(production[0]!.scene.players[1]!.goods).toEqual(
      before.players[1]!.goods,
    );
    expect(production[1]!.scene.players[1]!.goods.indigo).toBe(1);
  });
  it('distinguishes newly received workers from workers collected from existing plantations', () => {
    const s = createGame();
    activatePlantation(s.players[0]!, PlantationType.Corn);
    const beats = observe(
      s,
      new SelectRoleAction(s.getCurrentPlayer().id, RoleType.Mayor),
    );
    const workers = beats.filter((b) => b.kind === 'workers');
    expect(workers).toHaveLength(3);
    const first = workers[0]!;
    expect(first.count).toBe(s.players[0]!.pendingWorkers - 1);
    expect(first.scene.players[0]!.pending).toBe(s.players[0]!.pendingWorkers);
    expect(first.scene.magistrate).toBe(s.supply.workersInMagistrate);
    expect(beats[0]!.focus).toBe('magistrate');
  });
  it('highlights the exact worker destination and snapshots remain detached', () => {
    const s = createGame();
    selectRole(s, RoleType.Mayor);
    const a = s
      .getValidActions(s.getCurrentPlayer().id)
      .find((a) => a.type === 'PLACE_WORKER') as PlaceWorkerAction;
    const beats = observe(s, a),
      saved = serializeGameState(s);
    expect(beats[0]!.kind).toBe('worker');
    expect(beats[0]!.count).toBe(1);
    expect(beats[0]!.to).toContain(':plantation:');
    beats[0]!.scene.players[0]!.objects[0]!.workers = 99;
    expect(serializeGameState(s)).toEqual(saved);
  });
  it('shows outgoing cargo then its exact ship even when the engine already unloaded it', () => {
    const s = createGame();
    giveGoods(s.players[0]!, GoodType.Corn, 4);
    selectRole(s, RoleType.Captain);
    const beats = observe(
      s,
      new LoadShipAction(
        s.getCurrentPlayer().id,
        { kind: 'ship', shipIndex: 0 },
        GoodType.Corn,
      ),
    );
    expect(s.ships[0]!.loadedCount).toBe(0);
    expect(beats.filter((b) => b.kind === 'shipping')).toHaveLength(2);
    expect(beats[0]!.count).toBe(4);
    expect(beats[1]!.focus).toBe('ship:0');
    expect(beats[1]!.count).toBe(4);
    expect(beats[1]!.scene.ships[0]!.count).toBe(4);
    expect(beats[2]!.kind).toBe('departure');
    expect(beats[2]!.scene.ships[0]!.count).toBe(0);
    expect(beats[1]!.scene.lastShipLoad?.shipIndex).toBe(0);
    expect(beats[0]!.changes).toContainEqual({ icon: 'star', amount: 5 });
  });
  it('does not infer loaded quantity from goods discarded automatically after the load', () => {
    const s = createGame();
    giveGoods(s.players[0]!, GoodType.Corn, 9);
    selectRole(s, RoleType.Captain);
    const beats = observe(
      s,
      new LoadShipAction(
        s.getCurrentPlayer().id,
        { kind: 'ship', shipIndex: 0 },
        GoodType.Corn,
      ),
    );
    expect(beats[0]!.count).toBe(4);
    expect(beats[1]!.detail).toContain('4 ×');
  });
  it('observes a complete deterministic bot game without changing a decision, state or RNG consumption', () => {
    const start = createGame();
    function run(watch: boolean) {
      const s = deserializeGameState(serializeGameState(start)),
        bot = new GreedyBot();
      let seed = 715173,
        calls = 0;
      const random = vi.spyOn(Math, 'random').mockImplementation(() => {
        calls++;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      });
      try {
        let moves = 0;
        while (!s.gameOver && moves++ < 2500) {
          const action = bot.chooseAction(s, s.getCurrentPlayer().id)!;
          if (watch) {
            const queue = new PlaybackQueue();
            queue.enqueue(observe(s, action));
            expect(queue.getSnapshot().beat).not.toBeNull();
            while (queue.blocked) queue.next();
          } else applyOk(s, action);
        }
        expect(s.gameOver).toBe(true);
        return { state: serializeGameState(s), calls };
      } finally {
        random.mockRestore();
      }
    }
    expect(run(true)).toEqual(run(false));
  });
});
describe('presentation pacing', () => {
  function setup() {
    const s = createGame(),
      queue = new PlaybackQueue();
    queue.enqueue(
      observe(s, new SelectRoleAction(s.getCurrentPlayer().id, RoleType.Mayor)),
    );
    return queue;
  }
  it.each([
    [RoleType.Settler, 'TAKE_PLANTATION'],
    [RoleType.Mayor, 'PLACE_WORKER'],
    [RoleType.Craftsman, 'CRAFTSMAN_BONUS'],
  ] as const)('makes a human %s choice immediately actionable', (role, nextType) => {
    const s = createGame();
    activatePlantation(s.players[0]!, PlantationType.Corn);
    const q = new PlaybackQueue();
    q.enqueue(observe(s, new SelectRoleAction(s.getCurrentPlayer().id, role), false));
    expect(q.getSnapshot().beat).toBeNull();
    expect(q.blocked).toBe(false);
    expect(s.getCurrentPhase().type).toBe(role);
    expect(s.getValidActions(s.getCurrentPlayer().id).some((a) => a.type === nextType)).toBe(true);
  });
  it('allows consecutive human worker placements and automatically hands over after the last one', () => {
    const s = createScenario('staffing'), q = new PlaybackQueue();
    const actorId = human(s).id;
    q.enqueue(observe(s, new SelectRoleAction(actorId, RoleType.Mayor), false));
    expect(human(s).pendingWorkers).toBe(3);
    for (const remaining of [2, 1, 0]) {
      const action = s.getValidActions(actorId).find((a) => a.type === 'PLACE_WORKER')!;
      q.enqueue(observe(s, action, false));
      expect(q.blocked).toBe(false);
      expect(human(s).pendingWorkers).toBe(remaining);
      expect(buildSceneSnapshot(s, []).players[0]!.pending).toBe(remaining);
      if (remaining) expect(s.getCurrentPlayer().id).toBe(actorId);
    }
    expect(s.getCurrentPlayer().id).not.toBe(actorId);
    expect(human(s).island.getPlantations().every((p) => p.isActive())).toBe(true);
    expect(human(s).island.getBuildings()[0]!.isActive()).toBe(true);
    const botAction = s.getValidActions(s.getCurrentPlayer().id)[0]!;
    q.enqueue(observe(s, botAction));
    expect(q.blocked).toBe(true);
    expect(q.getSnapshot().beat!.actorId).not.toBe(actorId);
  });
  it('passes with unused human workers immediately and keeps them in reserve', () => {
    const s = createScenario('workers'), q = new PlaybackQueue();
    const actorId = human(s).id;
    q.enqueue(observe(s, new SelectRoleAction(actorId, RoleType.Mayor), false));
    const worker = s.getValidActions(actorId).find((a) => a.type === 'PLACE_WORKER')!;
    q.enqueue(observe(s, worker, false));
    expect(human(s).pendingWorkers).toBe(1);
    expect(s.getValidActions(actorId).some((a) => a.type === 'PLACE_WORKER')).toBe(false);
    const pass = s.getValidActions(actorId).find((a) => a.type === 'MAYOR_PASS')!;
    q.enqueue(observe(s, pass, false));
    expect(q.blocked).toBe(false);
    expect(human(s).heldWorkers).toBe(1);
    expect(human(s).pendingWorkers).toBe(0);
    expect(s.getCurrentPlayer().id).not.toBe(actorId);
  });
  it('still presents other human actions and never clears an explicit pause', () => {
    const s = createGame(), q = new PlaybackQueue();
    s.players[0]!.doubloons = 10;
    q.togglePause();
    q.enqueue(observe(s, new SelectRoleAction(s.getCurrentPlayer().id, RoleType.Builder), false));
    expect(q.getSnapshot().beat).toBeNull();
    expect(q.blocked).toBe(true);
    q.togglePause();
    const build = s.getValidActions(s.getCurrentPlayer().id).find((a) => a.type === 'BUILD')!;
    q.enqueue(observe(s, build, false));
    expect(q.getSnapshot().beat!.kind).toBe('build');
    expect(q.blocked).toBe(true);
  });
  it('does not consume the first action while map assets are loading', () => {
    const q = setup();
    q.setReady(false);
    q.tick(30000);
    expect(q.frame().index).toBe(1);
    expect(q.frame().elapsed).toBe(0);
    q.setReady(true);
    q.tick(500);
    expect(q.frame().elapsed).toBe(500);
  });
  it('holds the next game action until every beat was shown', () => {
    const q = setup();
    expect(q.blocked).toBe(true);
    const count = q.getSnapshot().total;
    for (let n = 0; n < count - 1; n++) {
      q.next();
      expect(q.blocked).toBe(true);
    }
    q.next();
    expect(q.blocked).toBe(false);
    expect(q.getSnapshot().beat).toBeNull();
  });
  it('pause and inspecting freeze elapsed time; manual Next preserves pause', () => {
    const q = setup();
    q.tick(400);
    q.togglePause();
    q.tick(20000);
    expect(q.frame().elapsed).toBe(400);
    q.next();
    expect(q.frame().paused).toBe(true);
    q.togglePause();
    q.setInspecting(true);
    q.tick(20000);
    expect(q.frame().elapsed).toBe(0);
    q.setInspecting(false);
    q.tick(100);
    expect(q.frame().elapsed).toBe(100);
  });
  it('pauses in background and does not discard unseen beats after a delayed tick', () => {
    const q = setup(),
      id = q.frame().beat!.id;
    q.tick(60000, false);
    expect(q.frame().beat!.id).toBe(id);
    q.tick(60000);
    expect(q.frame().index).toBe(2);
    expect(q.frame().elapsed).toBe(0);
  });
  it('speed changes preserve progress and only affect presentation time', () => {
    const q = setup();
    q.tick(500);
    q.setSpeed('fast');
    expect(q.frame().elapsed).toBe(500);
    q.tick(300);
    expect(q.frame().elapsed).toBe(1100);
    q.setSpeed('slow');
    q.tick(1000);
    expect(q.frame().elapsed).toBe(1750);
  });
  it('never reuses beat ids, including consecutive identical worker actions', () => {
    const q = setup(),
      seen: number[] = [];
    while (q.frame().beat) {
      seen.push(q.frame().beat!.id);
      q.next();
    }
    const s = createGame();
    q.enqueue(
      observe(s, new SelectRoleAction(s.getCurrentPlayer().id, RoleType.Mayor)),
    );
    while (q.frame().beat) {
      seen.push(q.frame().beat!.id);
      q.next();
    }
    expect(new Set(seen).size).toBe(seen.length);
  });
});
