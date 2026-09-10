import { useEffect, useRef, useState } from 'react';
import { WorldRenderer } from '../renderer/WorldRenderer';
import { WEATHER_NAMES, type WeatherKind } from '../renderer/weather';
import type { EntityRef, SceneSnapshot } from '../adapter/sceneTypes';

interface Props {
  scene: SceneSnapshot;
  onPick: (ref: EntityRef) => void;
  motion: boolean;
  guide: boolean;
  selected: string | null;
  focus: { id: string; sequence: number };
}
export function WorldViewport(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<WorldRenderer | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [weather, setWeather] = useState<WeatherKind>('clear');
  const [status, setStatus] = useState('Ładowanie archipelagu…');
  useEffect(() => {
    let active = true;
    const world = new WorldRenderer(
      (ref) => latest.current.onPick(ref),
      (kind) => {
        if (active) setWeather(kind);
      },
    );
    renderer.current = world;
    void world
      .init(host.current!)
      .then(() => {
        if (!active) return;
        world.setMotion(latest.current.motion);
        world.update(latest.current.scene);
        world.select(latest.current.selected);
        world.guide(latest.current.guide);
        world.focus(latest.current.focus.id, true);
        setStatus('');
      })
      .catch((error) => {
        if (active) {
          console.error('Nie udało się uruchomić mapy', error);
          setStatus(
            'Mapa niedostępna. Nadal możesz grać przy użyciu panelu ruchów i przeglądać wyspy poniżej.',
          );
        }
      });
    return () => {
      active = false;
      renderer.current = null;
      world.destroy();
    };
  }, []);
  useEffect(() => {
    renderer.current?.update(props.scene);
  }, [props.scene]);
  useEffect(() => {
    renderer.current?.setMotion(props.motion);
  }, [props.motion]);
  useEffect(() => {
    renderer.current?.select(props.selected);
  }, [props.selected]);
  useEffect(() => {
    renderer.current?.guide(props.guide);
  }, [props.guide]);
  useEffect(() => {
    renderer.current?.focus(props.focus.id);
  }, [props.focus]);
  return (
    <div className="pr-map" data-weather={weather}>
      <div ref={host} className="pr-canvas" />
      {status && (
        <div className="pr-map-status" role="status">
          {status}
        </div>
      )}
      <div className="pr-map-caption">
        <span>ARCHIPELAG PUERTO RICO</span>
        <small>Przeciągnij, aby odkrywać · przewiń, aby przybliżyć</small>
      </div>
      <div
        className="pr-weather-badge"
        title="Pogoda jest dekoracją i nie wpływa na grę"
      >
        <span aria-hidden="true">
          {{ clear: '☀', cloudy: '☁', rain: '☂', storm: 'ϟ' }[weather]}
        </span>
        {WEATHER_NAMES[weather]}
      </div>
      <div className="pr-zoom">
        <button
          aria-label="Oddal mapę"
          onClick={() => renderer.current?.zoom(0.8)}
        >
          −
        </button>
        <button
          aria-label="Przybliż mapę"
          onClick={() => renderer.current?.zoom(1.25)}
        >
          +
        </button>
      </div>
    </div>
  );
}
