export const FIRST_CHURCH_AT = 90;
export const CHURCH_INTERVAL = 270;
export const CHURCH_DURATION = 42.064;

// Presentation clock only: no game state, timers or game RNG are read here.
export function churchMoment(seconds: number, duration = CHURCH_DURATION) {
  const sinceFirst = seconds - FIRST_CHURCH_AT;
  if (sinceFirst < 0) return null;
  const episode = Math.floor(sinceFirst / CHURCH_INTERVAL);
  const offset = sinceFirst - episode * CHURCH_INTERVAL;
  return offset + 1e-6 < Math.min(duration, CHURCH_INTERVAL)
    ? { episode, offset }
    : null;
}
export type AudioStatus =
  'off' | 'starting' | 'playing' | 'blocked' | 'paused' | 'error';
export type SoundState = { status: AudioStatus; church: boolean };
export type SoundUrls = {
  traffic: string;
  birds: string;
  meadow: string;
  church: string;
};
const AMBIENCE = [
  { name: 'traffic', volume: 0.65, withBells: 0.48 },
  { name: 'birds', volume: 0.9, withBells: 0.68 },
  { name: 'meadow', volume: 0.32, withBells: 0.24 },
] as const;

export class IslandSoundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: {
    media: HTMLAudioElement;
    source: MediaElementAudioSourceNode;
    gain: GainNode;
    volume: number;
    withBells: number;
  }[] = [];
  private churchGain: GainNode | null = null;
  private churchBuffer: AudioBuffer | null = null;
  private churchSource: AudioBufferSourceNode | null = null;
  private churchRequested = false;
  private abort = new AbortController();
  private timer: ReturnType<typeof setInterval> | null = null;
  private enabled = false;
  private visible = true;
  private disposed = false;
  private volume = 0.22;
  private elapsed = 0;
  private anchor = 0;
  private episode = -1;
  private generation = 0;
  private state: SoundState = { status: 'off', church: false };

  constructor(
    private host: HTMLElement,
    private urls: SoundUrls,
    private notify: (state: SoundState) => void,
  ) {}

  private report(status: AudioStatus, church = this.state.church) {
    if (
      this.disposed ||
      (this.state.status === status && this.state.church === church)
    )
      return;
    this.state = { status, church };
    this.notify(this.state);
  }
  private gain(node: GainNode, value: number, fade = 0.3) {
    const now = this.context!.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(value, now, fade);
  }
  private initialize() {
    if (this.context) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);
    for (const { name, volume, withBells } of AMBIENCE) {
      const media = new Audio(this.urls[name]);
      media.preload = 'none';
      media.loop = true;
      media.dataset.ambience = name;
      this.host.appendChild(media);
      const source = this.context.createMediaElementSource(media);
      const gain = this.context.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(this.master);
      this.ambience.push({ media, source, gain, volume, withBells });
    }
    this.churchGain = this.context.createGain();
    this.churchGain.gain.value = 0.65;
    this.churchGain.connect(this.master);
  }
  private async loadChurch() {
    if (this.churchRequested) return;
    this.churchRequested = true;
    try {
      const response = await fetch(this.urls.church, {
        signal: this.abort.signal,
      });
      if (!response.ok) throw new Error('Audio HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      if (this.disposed) return;
      const buffer = await this.context!.decodeAudioData(bytes);
      if (!this.disposed) this.churchBuffer = buffer;
    } catch {
      // Optional bells must not interrupt the main ambience or the game.
    }
  }
  setEnabled(enabled: boolean) {
    if (this.disposed || this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled && this.visible) void this.start();
    else this.pause(enabled ? 'paused' : 'off');
  }
  setVolume(percent: number) {
    this.volume =
      Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 22)) / 100;
    if (this.master && this.state.status === 'playing')
      this.gain(this.master, this.volume);
  }
  setVisible(visible: boolean) {
    if (this.disposed || this.visible === visible) return;
    this.visible = visible;
    if (visible && this.enabled) void this.start();
    else this.pause(this.enabled ? 'paused' : 'off');
  }
  // Called directly from a user gesture when the browser needs an audio unlock.
  unlock() {
    if (this.enabled && this.visible && this.state.status !== 'playing')
      void this.start();
  }
  private async start() {
    if (this.disposed || !this.enabled || !this.visible) return;
    const generation = ++this.generation;
    try {
      this.initialize();
      this.report('starting', false);
      const context = this.context!;
      const resumed = context.resume();
      const playing = this.ambience.map((track) => track.media.play());
      if (context.state !== 'running') this.report('blocked', false);
      await Promise.all([resumed, ...playing]);
      if (this.disposed || generation !== this.generation) return;
      if (context.state !== 'running') {
        this.report('blocked', false);
        return;
      }
      this.anchor = context.currentTime;
      this.gain(this.master!, this.volume, 0.6);
      this.report('playing', false);
      void this.loadChurch();
      if (this.timer === null) this.timer = setInterval(() => this.tick(), 250);
      this.tick();
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.pause(
        (error as { name?: string }).name === 'NotAllowedError'
          ? 'blocked'
          : 'error',
      );
    }
  }
  private tick() {
    if (this.state.status !== 'playing' || !this.context) return;
    this.elapsed += Math.max(0, this.context.currentTime - this.anchor);
    this.anchor = this.context.currentTime;
    const moment = churchMoment(this.elapsed, this.churchBuffer?.duration);
    if (moment && this.churchBuffer && moment.episode !== this.episode) {
      this.stopChurch();
      const source = this.context.createBufferSource();
      source.buffer = this.churchBuffer;
      source.connect(this.churchGain!);
      source.start(0, moment.offset);
      this.churchSource = source;
      this.episode = moment.episode;
      for (const track of this.ambience)
        this.gain(track.gain, track.withBells, 0.7);
      this.report('playing', true);
    } else if (!moment && this.churchSource) this.stopChurch();
  }
  private stopChurch() {
    if (this.churchSource) {
      this.churchSource.stop();
      this.churchSource.disconnect();
      this.churchSource = null;
    }
    for (const track of this.ambience) this.gain(track.gain, track.volume, 0.7);
    this.report(this.state.status, false);
  }
  private pause(status: AudioStatus) {
    if (this.state.status === 'playing' && this.context) {
      this.elapsed += Math.max(0, this.context.currentTime - this.anchor);
    }
    ++this.generation;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    // Keep the current bell offset across mute / hidden tab, just like the main tracks.
    this.stopChurch();
    this.episode = -1;
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(0, this.context.currentTime);
    }
    this.ambience.forEach((track) => track.media.pause());
    if (this.context && this.context.state !== 'closed')
      void this.context.suspend().catch(() => {});
    this.report(status, false);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pause('off');
    this.abort.abort();
    for (const track of this.ambience) {
      track.source.disconnect();
      track.gain.disconnect();
      track.media.removeAttribute('src');
      track.media.load();
      track.media.remove();
    }
    this.ambience = [];
    this.master?.disconnect();
    this.churchGain?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
  }
}
