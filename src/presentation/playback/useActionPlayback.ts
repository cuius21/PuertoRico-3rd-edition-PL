import { useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import type { Action } from '../../../actions/Action';
import type { GameState } from '../../../state/GameState';
import type { GameEvent } from '../../game/GameRunner';
import { buildSceneSnapshot } from '../adapter/buildSceneSnapshot';
import { captureAction, buildActionBeats } from './actionBeats';
import { PlaybackQueue } from './PlaybackQueue';

export function useActionPlayback() {
  const ref = useRef<PlaybackQueue | null>(null);
  if (!ref.current) {
    ref.current = new PlaybackQueue();
    try {
      const speed = localStorage.getItem('puerto-action-speed');
      if (speed === 'slow' || speed === 'normal' || speed === 'fast')
        ref.current.setSpeed(speed);
      if (localStorage.getItem('puerto-action-follow') === 'off')
        ref.current.toggleFollow();
    } catch {}
  }
  const controller = ref.current;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    try {
      localStorage.setItem('puerto-action-speed', state.speed);
      localStorage.setItem('puerto-action-follow', state.follow ? 'on' : 'off');
    } catch {}
  }, [state.speed, state.follow]);
  useEffect(() => {
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      controller.tick(Math.min(200, now - previous), !document.hidden);
      previous = now;
    }, 50);
    const visibility = () => {
      previous = performance.now();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [controller]);
  const observe = useCallback(
    (action: Action, game: GameState, event: GameEvent) => {
      const captured = captureAction(action, game, event);
      return (after: GameState) =>
        controller.enqueue(
          buildActionBeats(captured, buildSceneSnapshot(after, [])),
        );
    },
    [controller],
  );
  return { controller, state, blocked: controller.blocked, observe };
}
export type ActionPlayback = ReturnType<typeof useActionPlayback>;
