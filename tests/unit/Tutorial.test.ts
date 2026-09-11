import { describe, it, expect, vi } from 'vitest';
import { LESSONS, targetFor } from '../../src/tutorial/lessons';
import {
  LessonRun,
  teachingAction,
  readTutorialProgress,
  saveTutorialProgress,
  TUTORIAL_SAVE_KEY,
} from '../../src/tutorial/LessonRun';
import { createScenario, human, HUMAN } from '../../src/tutorial/scenarios';
import { serializeGameState } from '../../src/game/GameSerializer';
import { GoodType } from '../../core/types';

function complete(id: (typeof LESSONS)[number]['id'], restore = false) {
  let run = new LessonRun(id),
    moves = 0;
  for (let n = 0; n < 400; n++) {
    const step = run.step;
    if (step.kind === 'finish') return run;
    if (step.kind === 'read') run.next();
    else if (step.kind === 'inspect') {
      run.inspect(targetFor(step, run.state)!);
      run.next();
    } else if (step.kind === 'quiz')
      run.answer(step.answers!.findIndex((a) => a.correct));
    else if (step.kind === 'watch' && run.watched) run.settle();
    else {
      const action = run.isHuman
        ? id === 'trial'
          ? trialMove(run)
          : run.allowed()[0]
        : teachingAction(run.state);
      expect(
        action,
        'No move: ' +
          id +
          ' step ' +
          run.index +
          ' ' +
          step.title +
          ' phase ' +
          run.state.getCurrentPhase().type +
          ' player ' +
          run.state.currentPlayerIndex,
      ).toBeTruthy();
      expect(run.commit(action!)).toBe(true);
      moves++;
      run.settle();
    }
    if (restore) {
      const data = JSON.parse(JSON.stringify(run.save()));
      run = new LessonRun(id, data);
    }
  }
  throw new Error(
    'Lesson did not finish: ' + id + ' moves ' + moves + ' step ' + run.index,
  );
}
function trialMove(run: LessonRun) {
  const list = run.allowed(),
    p = human(run.state);
  const wanted = p.getTotalStoredGoods()
    ? 'captain'
    : p.island.getPlantations().some((c) => c.isActive())
      ? 'craftsman'
      : 'mayor';
  return (
    list.find((a) => (a as any).role === wanted) ??
    list.find(
      (a) =>
        a.type === 'PLACE_WORKER' ||
        a.type === 'CRAFTSMAN_BONUS' ||
        a.type === 'LOAD_SHIP',
    ) ??
    list[0]
  );
}
describe('tutorial through the real rules engine', () => {
  it.each(LESSONS.map((l) => l.id))(
    'completes %s using legal moves and restored checkpoints',
    (id) => {
      expect(complete(id, true).step.kind).toBe('finish');
    },
  );
  it('scores actual shipping, sale, discard, ending and festival rewards', () => {
    expect(human(complete('shipping').state).victoryPointTokens).toBe(5);
    expect(human(complete('trade').state).doubloons).toBe(4);
    expect(
      human(complete('storage').state).getStoredGoodCount(GoodType.Coffee),
    ).toBe(1);
    expect(complete('ending').state.gameOver).toBe(true);
    expect(complete('round').state.roundNumber).toBe(5);
    expect(complete('festival').state.festivalBoard?.uprawa.completedBy).toBe(
      HUMAN,
    );
    expect(human(complete('trial').state).victoryPointTokens).toBeGreaterThan(
      0,
    );
  });
  it('teaches the eight-worker split from the selector and refills only after everyone finishes', () => {
    const s = createScenario('workforce');
    expect(s.getGovernor().name).toBe('Mateo');
    expect(s.supply.workersInMagistrate).toBe(8);
    const pool = s.supply.workersPool;
    const mayor = s.getValidActions(HUMAN).find((a) => (a as any).role === 'mayor')!;
    expect(s.apply(mayor).ok).toBe(true);
    expect(s.players.map((p) => p.pendingWorkers)).toEqual([4, 3, 2]);
    expect(s.supply.workersInMagistrate).toBe(0);
    expect(s.supply.workersPool).toBe(pool - 1);
    for (const index of [0, 1]) {
      const pass = s.getValidActions(s.getCurrentPlayer().id).find((a) => a.type === 'MAYOR_PASS')!;
      expect(s.apply(pass).ok).toBe(true);
      expect(s.supply.workersInMagistrate).toBe(0);
      expect(s.players[index]!.pendingWorkers).toBe(0);
    }
    const lastPass = s.getValidActions(s.getCurrentPlayer().id).find((a) => a.type === 'MAYOR_PASS')!;
    expect(s.apply(lastPass).ok).toBe(true);
    expect(s.supply.workersInMagistrate).toBe(3);
    expect(s.supply.workersPool).toBe(pool - 4);
    expect(s.players.map((p) => p.heldWorkers)).toEqual([4, 3, 2]);
    expect(s.supply.workersPool + s.supply.workersInMagistrate +
      s.players.reduce((n, p) => n + p.heldWorkers, 0)).toBe(55);
    const finished = complete('workforce', true).state;
    expect(finished.players.map((p) => p.heldWorkers)).toEqual([4, 3, 2]);
    expect(finished.supply.workersInMagistrate).toBe(3);
  });
  it('does not accept unrelated legal moves or advance before playback finishes', () => {
    const run = new LessonRun('plantation'),
      before = JSON.stringify(serializeGameState(run.state));
    const wrong = run.runner
      .getValidActionsForCurrentPlayer()
      .find((a) => (a as any).role === 'builder')!;
    expect(run.commit(wrong)).toBe(false);
    expect(JSON.stringify(serializeGameState(run.state))).toBe(before);
    expect(run.commit(run.allowed()[0]!)).toBe(true);
    expect(run.index).toBe(0);
    expect(() => run.save()).toThrow();
    run.settle();
    expect(run.index).toBe(1);
  });
  it('demonstrates both shipping orders and discards blocked goods only at phase end', () => {
    const state = createScenario('blockade');
    const move = (matches: (a: any) => boolean) => {
      const action = state.getValidActions(state.getCurrentPlayer().id).find(matches);
      expect(action).toBeTruthy();
      expect(state.apply(action!).ok).toBe(true);
    };
    move((a) => a.role === 'captain');
    move((a) => a.good === GoodType.Coffee && a.target?.shipIndex === 2);
    expect(human(state).victoryPointTokens).toBe(4);
    expect(state.getCurrentPlayer().id).toBe('player-1');
    move((a) => a.good === GoodType.Sugar && a.target?.shipIndex === 0);
    expect(state.getCurrentPhase().type).toBe('roleSelection');
    expect(state.players.map((p) => p.victoryPointTokens)).toEqual([4, 4, 0]);
    expect(human(state).getStoredGoodCount(GoodType.Corn)).toBe(1);
    expect(state.players[1]!.getTotalStoredGoods()).toBe(0);

    const blocked = createScenario('blockade');
    const apply = (matches: (a: any) => boolean) => {
      const action = blocked.getValidActions(blocked.getCurrentPlayer().id).find(matches);
      expect(action).toBeTruthy();
      expect(blocked.apply(action!).ok).toBe(true);
    };
    apply((a) => a.role === 'captain');
    apply((a) => a.good === GoodType.Corn && a.target?.shipIndex === 0);
    expect(human(blocked).victoryPointTokens).toBe(2);
    expect(blocked.getCurrentPlayer().id).toBe(HUMAN);
    expect(blocked.players[1]!.getStoredGoodCount(GoodType.Sugar)).toBe(4);
    apply((a) => a.good === GoodType.Coffee && a.target?.shipIndex === 2);
    expect(blocked.getCurrentPhase().type).toBe('roleSelection');
    expect(blocked.players.map((p) => p.victoryPointTokens)).toEqual([5, 0, 0]);
    expect(blocked.players[1]!.getStoredGoodCount(GoodType.Sugar)).toBe(1);
    expect(human(blocked).getTotalStoredGoods()).toBe(0);
    const lessonState = complete('blockade').state;
    expect(lessonState.players.map((p) => [p.victoryPointTokens, p.getTotalStoredGoods()]))
      .toEqual(blocked.players.map((p) => [p.victoryPointTokens, p.getTotalStoredGoods()]));
  });
  it('shows the next governor choosing first and coins on unselected roles', () => {
    const state = complete('round').state;
    expect(state.roundNumber).toBe(5);
    expect(state.governorIndex).toBe(2);
    expect(state.getCurrentPlayer().name).toBe('Mateo');
    expect(state.roleCards.every((card) => card.isAvailable())).toBe(true);
    expect(state.roleCards.find((card) => card.type === 'captain')!.doubloonsOnCard).toBe(1);
    expect(state.roleCards.find((card) => card.type === 'trader')!.doubloonsOnCard).toBe(0);
  });
  it('keeps incorrect quiz answers and unvisited inspection steps in place', () => {
    const run = new LessonRun('welcome');
    run.next();
    expect(run.next()).toBe(false);
    run.inspect('market');
    expect(run.next()).toBe(false);
    run.inspect(HUMAN);
    expect(run.next()).toBe(true);
    run.next();
    const index = run.index;
    expect(run.answer(1)?.correct).toBe(false);
    expect(run.index).toBe(index);
  });
  it('stores progress separately and tolerates corrupt or unavailable storage', () => {
    const values = new Map([['puerto_rico_save', 'existing game']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    });
    try {
      expect(
        saveTutorialProgress({
          version: 1,
          completed: ['welcome'],
          session: new LessonRun('plantation').save(),
        }),
      ).toBe(true);
      expect(values.get('puerto_rico_save')).toBe('existing game');
      expect(readTutorialProgress().session?.id).toBe('plantation');
      values.set(TUTORIAL_SAVE_KEY, 'broken');
      expect(readTutorialProgress().completed).toEqual([]);
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw Error();
        },
        setItem: () => {
          throw Error();
        },
      });
      expect(readTutorialProgress().session).toBe(null);
      expect(
        saveTutorialProgress({ version: 1, completed: [], session: null }),
      ).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
