import type { ActionBeat } from './actionBeats';

export const PLAYBACK_SPEEDS = { slow: 0.65, normal: 1, fast: 2 } as const;
export type PlaybackSpeed = keyof typeof PLAYBACK_SPEEDS;
export interface PlaybackState {
  ready: boolean;
  beat: ActionBeat | null;
  paused: boolean;
  inspecting: boolean;
  follow: boolean;
  speed: PlaybackSpeed;
  elapsed: number;
  index: number;
  total: number;
}
/** Presentation time only. Advancing never invokes a game action. */
export class PlaybackQueue {
  private queue: ActionBeat[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();
  private elapsed = 0;
  private state: PlaybackState = {
    ready: true,
    beat: null,
    paused: false,
    inspecting: false,
    follow: true,
    speed: 'normal',
    elapsed: 0,
    index: 0,
    total: 0,
  };
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<PlaybackState>) {
    this.state = { ...this.state, ...patch, elapsed: this.elapsed };
    this.listeners.forEach((fn) => fn());
  }
  enqueue(beats: Omit<ActionBeat, 'id'>[]) {
    if (!beats.length) return;
    this.queue.push(...beats.map((beat) => ({ ...beat, id: this.nextId++ })));
    if (!this.state.beat) {
      this.elapsed = 0;
      this.publish({
        beat: this.queue[0]!,
        index: 1,
        total: this.queue.length,
      });
    } else this.publish({ total: this.state.total + beats.length });
  }
  tick(milliseconds: number, visible = true) {
    if (
      !visible ||
      !this.state.ready ||
      this.state.paused ||
      this.state.inspecting ||
      !this.state.beat ||
      !Number.isFinite(milliseconds) ||
      milliseconds <= 0
    )
      return;
    this.elapsed += milliseconds * PLAYBACK_SPEEDS[this.state.speed];
    // A long suspended frame must not silently skip the next action.
    if (this.elapsed >= this.state.beat.duration) this.next();
  }
  next = () => {
    if (!this.state.beat) return;
    this.queue.shift();
    this.elapsed = 0;
    this.publish({
      beat: this.queue[0] ?? null,
      index: this.queue.length ? this.state.index + 1 : 0,
      total: this.queue.length ? this.state.total : 0,
    });
  };
  setReady = (ready: boolean) => {
    if (ready !== this.state.ready) this.publish({ ready });
  };
  togglePause = () => this.publish({ paused: !this.state.paused });
  setInspecting = (inspecting: boolean) => {
    if (inspecting !== this.state.inspecting) this.publish({ inspecting });
  };
  toggleFollow = () => this.publish({ follow: !this.state.follow });
  setSpeed = (speed: PlaybackSpeed) => {
    if (Object.hasOwn(PLAYBACK_SPEEDS, speed)) this.publish({ speed });
  };
  frame() {
    return {
      ...this.state,
      elapsed: this.elapsed,
      progress: this.state.beat
        ? Math.min(1, this.elapsed / this.state.beat.duration)
        : 0,
    };
  }
  get blocked() {
    return !!this.state.beat || this.state.paused || this.state.inspecting;
  }
}
