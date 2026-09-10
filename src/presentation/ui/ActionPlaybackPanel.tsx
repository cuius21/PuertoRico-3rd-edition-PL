import type { CSSProperties } from 'react';
import type { ActionPlayback } from '../playback/useActionPlayback';
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '../playback/PlaybackQueue';
import { spriteStyle, idleSpriteStyle } from '../assets/registry';
import { GOOD_NAMES } from '../adapter/buildSceneSnapshot';
import { GameValue, ValueText } from './GameValue';
import { ROLE_META } from '../../components/RoleCardsBar';
import type { RoleType } from '../../../core/types';

export function ActionPlaybackPanel({
  playback,
}: {
  playback: ActionPlayback;
}) {
  const { state, controller } = playback;
  const { beat } = state;
  const held = state.paused || state.inspecting || !state.ready;
  const remaining = beat
    ? Math.max(0, beat.duration - state.elapsed) / PLAYBACK_SPEEDS[state.speed]
    : 0;
  return (
    <section
      className={'pr-observer' + (beat ? ' is-playing' : ' is-idle')}
      aria-label="Obserwacja ruchów"
      style={{ '--observer-color': beat?.color ?? '#eed18b' } as CSSProperties}
    >
      {beat && (
        <div
          className="pr-observer-story"
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            className="pr-observer-art"
            style={spriteStyle(beat.sprite)}
            aria-hidden="true"
          />
          <div className="pr-observer-copy">
            <div className="pr-observer-kicker">
              <b>{beat.actorName}</b>
              <span>{ROLE_META[beat.role as RoleType]?.label ?? 'Akcja'}</span>
              <small>
                {state.index}/{state.total}
              </small>
            </div>
            <h3>
              <ValueText text={beat.title} />
            </h3>
            {beat.detail && (
              <p>
                <ValueText text={beat.detail} />
              </p>
            )}
            {!!beat.changes.length && (
              <div
                className="pr-observer-changes"
                aria-label="Bilans zasobów po ruchu"
              >
                {beat.changes.map((c) => (
                  <span
                    key={c.icon}
                    title={
                      'Bilans: ' +
                      (GOOD_NAMES[c.icon] ??
                        {
                          coin: 'monety',
                          star: 'punkty zwycięstwa',
                          worker: 'robotnicy',
                          noble: 'szlachta',
                        }[c.icon])
                    }
                  >
                    <b>{c.amount > 0 ? '+' : '−'}</b>
                    {c.icon === 'coin' || c.icon === 'star' ? (
                      <GameValue
                        value={Math.abs(c.amount)}
                        kind={c.icon === 'star' ? 'star' : 'coin'}
                      />
                    ) : (
                      <>
                        <i
                          aria-hidden="true"
                          style={
                            c.icon === 'worker' || c.icon === 'noble'
                              ? idleSpriteStyle(c.icon)
                              : spriteStyle(c.icon)
                          }
                        />
                        <b>{Math.abs(c.amount)}</b>
                        <small>
                          {GOOD_NAMES[c.icon] ??
                            (c.icon === 'worker' ? 'robotnicy' : 'szlachta')}
                        </small>
                      </>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {!beat && (
        <div className="pr-observer-idle">
          {state.paused
            ? 'Gra wstrzymana — możesz przejrzeć wyspy.'
            : 'Obserwacja ruchów · kamera i opis każdej akcji'}
        </div>
      )}
      <div className="pr-observer-controls">
        <button onClick={controller.togglePause} aria-pressed={state.paused}>
          {state.paused ? '▶ Wznów' : 'Ⅱ Pauza'}
        </button>
        <button
          onClick={controller.next}
          disabled={!beat}
          aria-label="Pokaż kolejny etap akcji"
        >
          Dalej ›
        </button>
        <label>
          Tempo{' '}
          <select
            value={state.speed}
            onChange={(e) =>
              controller.setSpeed(e.target.value as PlaybackSpeed)
            }
            aria-label="Tempo pokazywania akcji"
          >
            <option value="slow">Analityczne</option>
            <option value="normal">Spokojne</option>
            <option value="fast">Szybkie</option>
          </select>
        </label>
        <button
          onClick={controller.toggleFollow}
          aria-pressed={state.follow}
          title="Automatyczne zbliżenie kamery na wykonywany ruch"
        >
          {state.follow ? '◎ Kamera: wł.' : '◎ Kamera: wył.'}
        </button>
      </div>
      {beat && (
        <div className="pr-observer-progress" aria-hidden="true">
          <span
            key={beat.id + ':' + state.speed + ':' + held}
            style={
              {
                '--progress-from': state.elapsed / beat.duration,
                animationDuration: remaining + 'ms',
                animationPlayState: held ? 'paused' : 'running',
              } as CSSProperties
            }
          />
        </div>
      )}
      {state.inspecting && beat && (
        <small className="pr-observer-held">
          Pokaz poczeka, aż zamkniesz okno szczegółów.
        </small>
      )}
    </section>
  );
}
