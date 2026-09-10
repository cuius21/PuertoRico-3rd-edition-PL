import { useEffect, useRef, useState, useId } from 'react';
import traffic from '../../assets/audio/traffic.mp3';
import birds from '../../assets/audio/birds.mp3';
import church from '../../assets/audio/church.mp3';
import { IslandSoundscape, type SoundState } from '../audio/soundscape';

const KEY = 'puerto-ui-audio';
function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as {
      enabled?: unknown;
      volume?: unknown;
    } | null;
    return {
      enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : true,
      volume:
        typeof saved?.volume === 'number' && Number.isFinite(saved.volume)
          ? Math.max(0, Math.min(100, saved.volume))
          : 22,
    };
  } catch {
    return { enabled: true, volume: 22 };
  }
}
export function AmbientAudio() {
  const [settings, setSettings] = useState(readSettings);
  const [sound, setSound] = useState<SoundState>({
    status: 'off',
    church: false,
  });
  const host = useRef<HTMLSpanElement>(null);
  const controller = useRef<IslandSoundscape | null>(null);
  const volumeId = useId();
  useEffect(() => {
    const audio = new IslandSoundscape(
      host.current!,
      { traffic, birds, church },
      setSound,
    );
    controller.current = audio;
    const visibility = () => audio.setVisible(!document.hidden);
    const gesture = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.pr-audio'))
        return;
      audio.unlock();
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerdown', gesture, true);
    document.addEventListener('keydown', gesture, true);
    visibility();
    return () => {
      controller.current = null;
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      audio.dispose();
    };
  }, []);
  useEffect(() => {
    controller.current?.setVolume(settings.volume);
    controller.current?.setEnabled(settings.enabled);
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const needsGesture =
    settings.enabled &&
    (sound.status === 'blocked' || sound.status === 'error');
  const label = needsGesture
    ? 'Włącz dźwięk'
    : settings.enabled
      ? 'Dźwięk: wł.'
      : 'Dźwięk: wył.';
  return (
    <div className="pr-audio" data-audio-state={sound.status}>
      <span ref={host} hidden aria-hidden="true" />
      <button
        aria-pressed={settings.enabled}
        title={
          needsGesture
            ? 'Kliknij, aby uruchomić dźwięk'
            : 'Włącz lub wycisz odgłosy wyspy'
        }
        onClick={() => {
          if (needsGesture) controller.current?.unlock();
          else {
            const enabled = !settings.enabled;
            controller.current?.setEnabled(enabled);
            setSettings((s) => ({ ...s, enabled }));
          }
        }}
      >
        <span aria-hidden="true">
          {settings.enabled && settings.volume > 0 ? '🔊' : '🔇'}
        </span>{' '}
        {label}
      </button>
      <details className="pr-audio-settings">
        <summary aria-label="Ustawienia głośności tła" title="Głośność tła">
          ⌄
        </summary>
        <div className="pr-audio-panel">
          <label htmlFor={volumeId}>
            Głośność otoczenia <output>{settings.volume}%</output>
          </label>
          <input
            id={volumeId}
            aria-label="Głośność otoczenia"
            type="range"
            min="0"
            max="100"
            step="1"
            value={settings.volume}
            onChange={(e) => {
              const volume = Number(e.target.value);
              controller.current?.setVolume(volume);
              controller.current?.unlock();
              setSettings((s) => ({ ...s, volume }));
            }}
          />
          <small aria-live="polite">
            {sound.church
              ? 'W oddali słychać dzwony.'
              : 'Szum wyspy i śpiew ptaków. Czasem dzwony.'}
          </small>
        </div>
      </details>
    </div>
  );
}
