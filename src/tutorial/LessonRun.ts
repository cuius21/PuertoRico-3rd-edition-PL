import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import { GoodType } from '../../core/types';
import { GameRunner, type PlayerSetup } from '../game/GameRunner';
import {
  serializeGameState,
  deserializeGameState,
} from '../game/GameSerializer';
import { describeAction } from '../game/actionLabels';
import { actionKey } from '../presentation/interaction/actionBridge';
import { LESSONS, shape, targetFor, type Facts, type Lesson } from './lessons';
import { createScenario, HUMAN, human, type ScenarioId } from './scenarios';

export interface LessonSave {
  id: ScenarioId;
  step: number;
  state: ReturnType<typeof serializeGameState>;
  facts: Facts;
  visited: boolean;
  log: GameRunner['log'];
}
export function teachingAction(state: GameState): Action {
  const actions = state.getValidActions(state.getCurrentPlayer().id);
  if (!actions.length) throw new Error('Brak legalnego ruchu w ćwiczeniu.');
  const phase = state.getCurrentPhase().type;
  if (phase === 'roleSelection') {
    const p = human(state);
    const active = p.island.getPlantations().some((c) => c.isActive());
    const preferred =
      p.getTotalStoredGoods() > 0 ? 'captain' : active ? 'craftsman' : 'mayor';
    for (const role of [
      preferred,
      'settler',
      'mayor',
      'craftsman',
      'captain',
      'trader',
      'builder',
      'prospector',
    ]) {
      const a = actions.find((a) => shape(a).role === role);
      if (a) return a;
    }
  }
  if (phase === 'mayor')
    return actions.find((a) => a.type === 'PLACE_WORKER') ?? actions[0]!;
  if (phase === 'settler')
    return (
      actions.find(
        (a) =>
          a.type === 'TAKE_PLANTATION' && shape(a).choice?.kind === 'revealed',
      ) ?? actions[0]!
    );
  if (phase === 'captain')
    return actions.find((a) => a.type === 'LOAD_SHIP') ?? actions[0]!;
  if (phase === 'trader')
    return actions.find((a) => a.type === 'SELL_GOOD') ?? actions[0]!;
  return (
    actions.find((a) => a.type === 'PASS' || a.type === 'MAYOR_PASS') ??
    actions[0]!
  );
}
const teachingBot = {
  name: 'Przeciwnik szkoleniowy',
  chooseAction: teachingAction,
};
export const TEACHING_SETUPS: PlayerSetup[] = [
  { type: 'human', name: 'Ty' },
  { type: 'bot', name: 'Inés', bot: teachingBot },
  { type: 'bot', name: 'Mateo', bot: teachingBot },
];
export class LessonRun {
  readonly lesson: Lesson;
  readonly runner: GameRunner;
  index = 0;
  facts: Facts = { produced: false, shipped: 0 };
  visited = false;
  private advanceAfterPlayback = false;
  constructor(id: ScenarioId, saved?: LessonSave) {
    this.lesson = LESSONS.find((l) => l.id === id)!;
    if (!this.lesson) throw new Error('Nieznany rozdział.');
    if (
      saved &&
      (!Number.isInteger(saved.step) ||
        saved.step < 0 ||
        saved.step >= this.lesson.steps.length ||
        saved.id !== id)
    )
      throw new Error('Nieprawidłowy krok.');
    const state = saved
      ? deserializeGameState(saved.state)
      : createScenario(id);
    if (state.players.length !== 3 || state.players[0]?.id !== HUMAN)
      throw new Error('Nieprawidłowa plansza ćwiczenia.');
    this.runner = new GameRunner(TEACHING_SETUPS, state);
    if (saved) {
      this.index = saved.step;
      this.facts = {
        produced: !!saved.facts?.produced,
        shipped: Math.max(0, Number(saved.facts?.shipped) || 0),
      };
      this.visited = !!saved.visited;
      this.runner.log.push(...(Array.isArray(saved.log) ? saved.log : []));
    }
  }
  get state() {
    return this.runner.state;
  }
  get step() {
    return this.lesson.steps[this.index]!;
  }
  get isHuman() {
    return this.state.getCurrentPlayer().id === HUMAN;
  }
  get canObserve() {
    return (
      this.step.kind === 'watch' ||
      (this.lesson.id === 'trial' && this.step.kind === 'action')
    );
  }
  get watched() {
    return (
      this.state.gameOver ||
      this.state.getCurrentPhase().type === 'roleSelection'
    );
  }
  allowed(): Action[] {
    if (
      !this.isHuman ||
      this.step.kind !== 'action' ||
      this.advanceAfterPlayback
    )
      return [];
    return this.runner
      .getValidActionsForCurrentPlayer()
      .filter((a) => this.step.accept?.(a, this.state));
  }
  inspect(key: string) {
    if (
      this.step.kind === 'inspect' &&
      key === targetFor(this.step, this.state)
    ) {
      this.visited = true;
      return true;
    }
    return false;
  }
  next() {
    if (
      this.step.kind !== 'read' &&
      !(this.step.kind === 'inspect' && this.visited)
    )
      return false;
    return this.advance();
  }
  answer(index: number) {
    const answer =
      this.step.kind === 'quiz' ? this.step.answers?.[index] : null;
    if (answer?.correct) this.advance();
    return answer;
  }
  private advance() {
    if (this.index >= this.lesson.steps.length - 1) return false;
    this.index++;
    this.visited = false;
    return true;
  }
  commit(action: Action) {
    const valid = this.runner
      .getValidActionsForCurrentPlayer()
      .find((a) => actionKey(a) === actionKey(action));
    if (!valid) return false;
    const humanMove = this.isHuman;
    if (
      humanMove &&
      !this.allowed().some((a) => actionKey(a) === actionKey(valid))
    )
      return false;
    if (!humanMove && !this.canObserve) return false;
    const before = human(this.state).getTotalStoredGoods();
    const label = describeAction(valid, this.state);
    if (!this.runner.applyAction(valid, label)) return false;
    const after = human(this.state).getTotalStoredGoods();
    if (shape(valid).role === 'craftsman' && after > before)
      this.facts.produced = true;
    if (humanMove && valid.type === 'LOAD_SHIP') this.facts.shipped++;
    if (
      this.step.kind === 'action' &&
      (this.lesson.id === 'trial'
        ? this.step.done?.(this.state, this.facts)
        : humanMove &&
          (!this.step.done || this.step.done(this.state, this.facts)))
    )
      this.advanceAfterPlayback = true;
    return true;
  }
  settle() {
    let changed = false;
    if (this.advanceAfterPlayback) {
      this.advanceAfterPlayback = false;
      changed = this.advance();
    }
    if (this.step.kind === 'watch' && this.watched) {
      changed = this.advance() || changed;
    }
    return changed;
  }
  save(): LessonSave {
    if (this.advanceAfterPlayback)
      throw new Error('Najpierw zakończ pokaz ruchu.');
    return {
      id: this.lesson.id,
      step: this.index,
      state: serializeGameState(this.state),
      facts: { ...this.facts },
      visited: this.visited,
      log: [...this.runner.log],
    };
  }
}
export const TUTORIAL_SAVE_KEY = 'puerto_rico_tutorial_v1';
export interface TutorialProgress {
  version: 1;
  completed: ScenarioId[];
  session: LessonSave | null;
}
export function readTutorialProgress(): TutorialProgress {
  try {
    const raw = JSON.parse(localStorage.getItem(TUTORIAL_SAVE_KEY) ?? 'null');
    if (raw?.version === 1 && Array.isArray(raw.completed))
      return {
        version: 1,
        completed: raw.completed.filter((id: unknown) =>
          LESSONS.some((l) => l.id === id),
        ),
        session: raw.session ?? null,
      };
  } catch {}
  return { version: 1, completed: [], session: null };
}
export function saveTutorialProgress(progress: TutorialProgress) {
  try {
    localStorage.setItem(TUTORIAL_SAVE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
