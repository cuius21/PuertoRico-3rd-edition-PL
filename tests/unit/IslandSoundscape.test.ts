import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IslandSoundscape,
  churchMoment,
  type SoundState,
} from '../../src/presentation/audio/soundscape';

class Gain {
  gain = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn((value: number) => {
      this.gain.value = value;
    }),
    setValueAtTime: vi.fn((value: number) => {
      this.gain.value = value;
    }),
  };
  connect(node: unknown) {
    return node;
  }
  disconnect = vi.fn();
}
class Source extends Gain {
  buffer: unknown;
  start = vi.fn();
  stop = vi.fn();
}
let failPlay = false;
const contexts: Context[] = [],
  media: Media[] = [];
class Media {
  dataset: Record<string, string> = {};
  preload = '';
  loop = false;
  paused = true;
  constructor(public src: string) {
    media.push(this);
  }
  play = vi.fn(async () => {
    if (failPlay)
      throw Object.assign(new Error('Gesture required'), {
        name: 'NotAllowedError',
      });
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  removeAttribute = vi.fn();
  load = vi.fn();
  remove = vi.fn();
}
class Context {
  currentTime = 0;
  state = 'running';
  destination = {};
  gains: Gain[] = [];
  sources: Source[] = [];
  constructor() {
    contexts.push(this);
  }
  createGain() {
    const n = new Gain();
    this.gains.push(n);
    return n;
  }
  createMediaElementSource() {
    return new Gain();
  }
  createBufferSource() {
    const n = new Source();
    this.sources.push(n);
    return n;
  }
  decodeAudioData = vi.fn(async () => ({ duration: 42.064 }));
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
}
const host = { appendChild: vi.fn() } as unknown as HTMLElement;
const urls = {
  traffic: 'traffic.mp3',
  birds: 'birds.mp3',
  meadow: 'meadow.mp3',
  church: 'church.mp3',
};
let sound: IslandSoundscape | null = null;
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => {
  vi.useFakeTimers();
  contexts.length = 0;
  media.length = 0;
  failPlay = false;
  vi.stubGlobal('Audio', Media);
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
    })),
  );
});
afterEach(() => {
  sound?.dispose();
  sound = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('island soundscape', () => {
  it('keeps bells rare and out of the opening, without consuming game RNG', () => {
    const rng = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw Error('Game RNG');
    });
    try {
      expect(churchMoment(89.99)).toBeNull();
      expect(churchMoment(90)).toEqual({ episode: 0, offset: 0 });
      expect(churchMoment(132.064)).toBeNull();
      expect(churchMoment(359.99)).toBeNull();
      expect(churchMoment(360)).toEqual({ episode: 1, offset: 0 });
      expect(churchMoment(369)).toEqual({ episode: 1, offset: 9 });
      const audible = Array.from({ length: 3600 }, (_, i) =>
        churchMoment(i),
      ).filter(Boolean).length;
      expect(audible / 3600).toBeLessThan(0.17);
      expect(rng).not.toHaveBeenCalled();
    } finally {
      rng.mockRestore();
    }
  });
  it('streams traffic and birds with a quieter meadow loop, plays each bell episode once, and preserves time across hidden tabs', async () => {
    const states: SoundState[] = [];
    sound = new IslandSoundscape(host, urls, (s) => states.push(s));
    sound.setEnabled(true);
    await flush();
    expect(media.map((m) => m.src)).toEqual([
      'traffic.mp3',
      'birds.mp3',
      'meadow.mp3',
    ]);
    expect(media.every((m) => m.loop && !m.paused)).toBe(true);
    const ctx = contexts[0]!;
    expect(ctx.gains[0]!.gain.value).toBe(0.22);
    expect(ctx.gains.slice(1, 4).map((g) => g.gain.value)).toEqual([
      0.65, 0.9, 0.32,
    ]);
    expect(ctx.sources).toHaveLength(0);
    ctx.currentTime = 90;
    await vi.advanceTimersByTimeAsync(250);
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.start).toHaveBeenCalledWith(0, 0);
    expect(ctx.gains.slice(1, 4).map((g) => g.gain.value)).toEqual([
      0.48, 0.68, 0.24,
    ]);
    ctx.currentTime = 95;
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.sources).toHaveLength(1);
    sound.setVisible(false);
    await flush();
    expect(media.every((m) => m.paused)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    ctx.currentTime = 2000;
    sound.setVisible(true);
    await flush();
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.sources[1]!.start).toHaveBeenCalledWith(0, 5);
    ctx.currentTime = 2040;
    await vi.advanceTimersByTimeAsync(250);
    expect(ctx.sources[1]!.stop).toHaveBeenCalled();
    expect(ctx.gains.slice(1, 4).map((g) => g.gain.value)).toEqual([
      0.65, 0.9, 0.32,
    ]);
    expect(states.at(-1)).toEqual({ status: 'playing', church: false });
    sound.setVolume(0);
    expect(ctx.gains[0]!.gain.value).toBe(0);
    sound.setEnabled(false);
    await flush();
    expect(media.every((m) => m.paused)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('recovers from autoplay rejection on an explicit gesture and releases everything on exit', async () => {
    const states: SoundState[] = [];
    failPlay = true;
    sound = new IslandSoundscape(host, urls, (s) => states.push(s));
    sound.setEnabled(true);
    await flush();
    expect(states.at(-1)?.status).toBe('blocked');
    expect(media.every((m) => m.paused)).toBe(true);
    failPlay = false;
    sound.unlock();
    await flush();
    expect(states.at(-1)?.status).toBe('playing');
    sound.dispose();
    expect(contexts[0]!.close).toHaveBeenCalledOnce();
    expect(
      media.every((m) => m.remove.mock.calls.length === 1 && m.paused),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const count = states.length;
    sound.unlock();
    await flush();
    expect(states).toHaveLength(count);
  });
  it('does not load or play while disabled/hidden and ignores a late start after mute', async () => {
    sound = new IslandSoundscape(host, urls, () => {});
    sound.setVisible(false);
    sound.setEnabled(true);
    await flush();
    expect(contexts).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    sound.setVisible(true);
    sound.setEnabled(false);
    await flush();
    expect(media.every((m) => m.paused)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the main ambience working when optional church audio cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Error('Offline');
      }),
    );
    const states: SoundState[] = [];
    sound = new IslandSoundscape(host, urls, (s) => states.push(s));
    sound.setEnabled(true);
    await flush();
    contexts[0]!.currentTime = 95;
    await vi.advanceTimersByTimeAsync(250);
    expect(states.at(-1)).toEqual({ status: 'playing', church: false });
    expect(media.every((m) => !m.paused)).toBe(true);
  });
});
