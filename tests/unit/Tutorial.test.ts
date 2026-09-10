import { describe, it, expect, vi } from 'vitest';
import { LESSONS, targetFor } from '../../src/tutorial/lessons';
import {
  LessonRun,
  teachingAction,
  readTutorialProgress,
  saveTutorialProgress,
  TUTORIAL_SAVE_KEY,
} from '../../src/tutorial/LessonRun';
import { human, HUMAN } from '../../src/tutorial/scenarios';
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
