import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action } from '../../actions/Action';
import { ScoreCalculator } from '../../state/ScoreCalculator';
import { describeAction } from '../game/actionLabels';
import { WorldGame } from '../presentation/ui/WorldGame';
import { ActionPlaybackPanel } from '../presentation/ui/ActionPlaybackPanel';
import { useActionPlayback } from '../presentation/playback/useActionPlayback';
import { GameValue } from '../presentation/ui/GameValue';
import { LESSONS, targetFor } from './lessons';
import {
  LessonRun,
  readTutorialProgress,
  saveTutorialProgress,
  teachingAction,
  type LessonSave,
} from './LessonRun';
import { MenuShell } from '../presentation/menu/MenuShell';
import { HUMAN, type ScenarioId } from './scenarios';
import './tutorial.css';

export function TutorialScreen({
  onExit,
  onPractice,
}: {
  onExit: () => void;
  onPractice: () => void;
}) {
  const [progress, setProgress] = useState(readTutorialProgress);
  const [active, setActive] = useState<{ run: LessonRun; key: number } | null>(
    null,
  );
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) document.getElementById('root')?.scrollTo({ top: 0, left: 0 });
  }, [!!active]);
  const checkpoint = useCallback(
    (session: LessonSave) =>
      setProgress((p) => {
        const next = { ...p, session };
        saveTutorialProgress(next);
        return next;
      }),
    [],
  );
  function start(id: ScenarioId, resume = false) {
    try {
      const run = new LessonRun(
        id,
        resume ? (progress.session ?? undefined) : undefined,
      );
      setActive((p) => ({ run, key: (p?.key ?? 0) + 1 }));
      setError('');
    } catch {
      setError(
        'Nie udało się odtworzyć zapisu. Możesz rozpocząć rozdział od początku.',
      );
    }
  }
  function completed(id: ScenarioId, next: boolean) {
    setProgress((p) => {
      const updated = {
        ...p,
        completed: [...new Set([...p.completed, id])],
        session: null,
      };
      saveTutorialProgress(updated);
      return updated;
    });
    const index = LESSONS.findIndex((l) => l.id === id);
    if (next && LESSONS[index + 1]) start(LESSONS[index + 1]!.id);
    else setActive(null);
  }
  if (active)
    return (
      <LessonGame
        key={active.key + ':' + active.run.lesson.id}
        run={active.run}
        onCheckpoint={checkpoint}
        onExit={() => setActive(null)}
        onRestart={() => start(active.run.lesson.id)}
        onComplete={(next) => completed(active.run.lesson.id, next)}
        onPractice={onPractice}
      />
    );
  const basics = LESSONS.filter((l) => l.group !== 'expansions');
  return (
    <MenuShell as="main" className="pr-school">
      <header className="pr-school-heading">
        <div>
          <span>SZKOŁA GUBERNATORÓW</span>
          <h1>Naucz się grać w Puerto Rico</h1>
          <p>
            Krótki cel, twój ruch i widoczny skutek. Nauka na przygotowanych
            planszach, zgodnie z zasadami gry.
          </p>
        </div>
        <button onClick={onExit}>Wróć do menu</button>
      </header>
      {error && <p role="alert">{error}</p>}
      <section className="pr-school-start">
        <div>
          <h2>Twoja pierwsza wyprawa</h2>
          <p>
            Podstawy i samodzielna próba · około 20–30 minut ·{' '}
            {basics.filter((l) => progress.completed.includes(l.id)).length}/
            {basics.length} rozdziałów ukończonych
          </p>
          <small>
            Postęp zapisuje się osobno od zwykłej partii. Możesz wrócić do
            dowolnego rozdziału.
          </small>
        </div>
        <div>
          {progress.session && (
            <button
              className="pr-school-primary"
              onClick={() => start(progress.session!.id, true)}
            >
              Kontynuuj naukę
            </button>
          )}
          <button
            onClick={() =>
              start(
                basics.find((l) => !progress.completed.includes(l.id))?.id ??
                  'welcome',
              )
            }
          >
            Rozpocznij naukę
          </button>
        </div>
      </section>
      {(['basics', 'practice', 'expansions'] as const).map((group) => (
        <section key={group} className="pr-school-group">
          <h2>
            {
              {
                basics: 'Podstawy gry',
                practice: 'Sprawdź się',
                expansions: 'Dodatki — krótkie lekcje',
              }[group]
            }
          </h2>
          <div className="pr-school-lessons">
            {LESSONS.filter((l) => l.group === group).map((l) => (
              <button key={l.id} onClick={() => start(l.id)}>
                <span className="pr-school-number">
                  {progress.completed.includes(l.id)
                    ? '✓'
                    : LESSONS.indexOf(l) + 1}
                </span>
                <span>
                  <strong>{l.title}</strong>
                  <small>{l.description}</small>
                  <em>
                    Około {l.minutes} min
                    {progress.completed.includes(l.id) ? ' · Ukończono' : ''}
                  </em>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="pr-school-practice">
        <div>
          <h2>Partia z opiekunem</h2>
          <p>
            Zwykła gra z dwoma botami i podpowiedziami przy twoich decyzjach.
            Samodzielnie wybierasz wszystkie ruchy.
          </p>
        </div>
        <button className="pr-school-primary" onClick={onPractice}>
          Zagraj z opiekunem
        </button>
      </section>
    </MenuShell>
  );
}
function LessonGame({
  run,
  onCheckpoint,
  onExit,
  onRestart,
  onComplete,
  onPractice,
}: {
  run: LessonRun;
  onCheckpoint: (s: LessonSave) => void;
  onExit: () => void;
  onRestart: () => void;
  onComplete: (next: boolean) => void;
  onPractice: () => void;
}) {
  const playback = useActionPlayback();
  const [focusRequest, setFocusRequest] = useState(0);
  const [tick, setTick] = useState(0),
    [hint, setHint] = useState(false),
    [feedback, setFeedback] = useState(''),
    [error, setError] = useState('');
  const update = () => setTick((n) => n + 1);
  const busy = !!playback.state.beat;
  const step = run.step,
    stepKey = run.lesson.id + ':' + run.index;
  useEffect(() => {
    setHint(false);
    setFeedback('');
  }, [stepKey]);
  useEffect(() => {
    if (busy || !matchMedia('(max-width: 760px)').matches) return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector('.pr-tutor-panel')
        ?.scrollIntoView({ block: 'start', behavior: 'auto' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [stepKey, busy]);
  function apply(action: Action) {
    if (playback.blocked) return;
    const entry = {
      playerName: run.state.getCurrentPlayer().name,
      actionText: describeAction(action, run.state),
      isBot: !run.isHuman,
    };
    const show = playback.observe(action, run.state, entry);
    if (run.commit(action)) {
      show(run.state);
      setError('');
      update();
    } else {
      setError('Ten ruch nie pasuje do bieżącego zadania. Sprawdź wskazówkę.');
    }
  }
  const actionRef = useRef(apply);
  actionRef.current = apply;
  useEffect(() => {
    if (playback.blocked) return;
    if (run.settle()) {
      update();
      return;
    }
    try {
      onCheckpoint(run.save());
    } catch {}
    if (
      !run.state.gameOver &&
      !run.isHuman &&
      run.canObserve &&
      !(run.step.kind === 'watch' && run.watched)
    ) {
      const timer = setTimeout(() => {
        try {
          actionRef.current(teachingAction(run.state));
        } catch {
          setError(
            'Nie udało się wykonać ruchu szkoleniowego. Powtórz rozdział.',
          );
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [run, tick, playback.blocked, onCheckpoint]);
  function next() {
    if (!busy && run.next()) {
      setFeedback('');
      update();
    }
  }
  function leave() {
    while (playback.controller.getSnapshot().beat) playback.controller.next();
    run.settle();
    onCheckpoint(run.save());
    onExit();
  }
  function inspect(key: string) {
    if (!busy && run.inspect(key)) update();
  }
  const target =
    !busy && (run.lesson.id !== 'trial' || hint)
      ? targetFor(step, run.state)
      : null;
  const focus =
    step.focus ??
    (target?.startsWith(HUMAN)
      ? HUMAN
      : target === 'actions'
        ? HUMAN
        : 'central');
  const ready =
    step.kind === 'read' || (step.kind === 'inspect' && run.visited);
  const panel = busy ? (
    <ActionPlaybackPanel playback={playback} />
  ) : (
    <section className="pr-tutor-panel" aria-label="Zadanie samouczka">
      <div className="pr-tutor-scroll">
        <span className="pr-tutor-eyebrow">
          ROZDZIAŁ {LESSONS.indexOf(run.lesson) + 1} · KROK {run.index + 1}/
          {run.lesson.steps.length}
        </span>
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        {step.kind === 'inspect' && run.visited && (
          <p className="pr-tutor-success">
            ✓ Miejsce obejrzane. Możesz przejść dalej.
          </p>
        )}
        {step.kind === 'watch' && (
          <p className="pr-tutor-note">
            Poczekaj na zakończenie ruchów pozostałych graczy.
          </p>
        )}
        {run.lesson.id === 'trial' && step.kind === 'action' && (
          <p className="pr-tutor-checklist">
            {run.facts.produced ? '✓' : '○'} Produkcja ·{' '}
            {run.facts.shipped ? '✓' : '○'} Twój załadunek
          </p>
        )}
        {run.state.gameOver && step.kind !== 'finish' && (
          <p role="status" className="pr-tutor-note">
            Partia się skończyła przed wykonaniem zadania. Użyj „Powtórz
            rozdział”, aby spróbować ponownie.
          </p>
        )}
        {hint && step.hint && <p className="pr-tutor-hint">{step.hint}</p>}
        {feedback && (
          <p className="pr-tutor-note" role="status">
            {feedback}
          </p>
        )}
        {step.kind === 'quiz' && (
          <div className="pr-tutor-answers">
            {step.answers?.map((a, i) => (
              <button
                key={a.text}
                onClick={() => {
                  const result = run.answer(i);
                  setFeedback(result?.explanation ?? '');
                  update();
                }}
              >
                {a.text}
              </button>
            ))}
          </div>
        )}
        {step.kind === 'finish' && run.state.gameOver && (
          <div className="pr-tutor-score">
            {ScoreCalculator.calculate(run.state).map((s) => (
              <p key={s.playerId}>
                <strong>
                  {s.playerName}: <GameValue value={s.total} kind="star" />
                </strong>
                <small>
                  Żetony {s.vpTokens} · budynki {s.buildingVP} · bonusy{' '}
                  {s.largeBuildingBonus + s.nobleVP}
                </small>
              </p>
            ))}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="pr-tutor-controls">
        {playback.state.paused && (
          <button onClick={playback.controller.togglePause}>Wznów pokaz</button>
        )}
        {ready && (
          <button className="pr-school-primary" onClick={next}>
            Dalej
          </button>
        )}
        {target && target !== 'actions' && step.kind !== 'finish' && (
          <button onClick={() => setFocusRequest((n) => n + 1)}>
            Pokaż miejsce
          </button>
        )}
        {step.hint && step.kind !== 'finish' && (
          <button onClick={() => setHint((h) => !h)}>
            {hint ? 'Ukryj wskazówkę' : 'Podpowiedz'}
          </button>
        )}
        {step.kind === 'finish' && (
          <>
            <button
              className="pr-school-primary"
              onClick={() => onComplete(true)}
            >
              {run.lesson.id === 'festival'
                ? 'Zakończ kurs'
                : 'Następny rozdział'}
            </button>
            <button onClick={() => onComplete(false)}>Lista lekcji</button>
            {run.lesson.id === 'trial' && (
              <button
                onClick={() => {
                  onComplete(false);
                  onPractice();
                }}
              >
                Zagraj z opiekunem
              </button>
            )}
          </>
        )}
        <button onClick={onRestart}>Powtórz rozdział</button>
      </div>
    </section>
  );
  const runnerView = {
    getValidActionsForCurrentPlayer: () => (run.isHuman ? run.allowed() : []),
    isCurrentPlayerHuman: () => run.isHuman,
    getSetup: (i: number) => run.runner.getSetup(i),
    log: run.runner.log,
  };
  return (
    <WorldGame
      state={run.state}
      runner={runnerView}
      onAction={apply}
      waiting={!run.isHuman}
      playback={playback}
      onMenu={leave}
      sidebarContent={panel}
      teaching={{
        stepKey,
        actionable: step.kind === 'action',
        focusRequest,
        targetKey: target,
        focusId: focus,
        text: step.text,
        title: step.title,
        onInspect: inspect,
        onContinue: ready && !busy ? next : undefined,
      }}
      notice={error || null}
    />
  );
}
