import { useEffect, useRef, useState } from 'react';
import { WorldRenderer } from '../renderer/WorldRenderer';
import type { EntityRef, SceneSnapshot } from '../adapter/sceneTypes';

interface Props {
  scene: SceneSnapshot;
  onPick: (ref: EntityRef) => void;
  motion: boolean;
  selected: string | null;
  focus: { id: string; sequence: number };
}
export function WorldViewport(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<WorldRenderer | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [status, setStatus] = useState('Ładowanie archipelagu…');
  useEffect(() => {
    const world = new WorldRenderer((ref) => latest.current.onPick(ref));
    renderer.current = world;
    let active = true;
    void world
      .init(host.current!)
      .then(() => {
        if (!active) return;
        world.setMotion(latest.current.motion);
        world.update(latest.current.scene);
        world.select(latest.current.selected);
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
    renderer.current?.focus(props.focus.id);
  }, [props.focus]);
  return (
    <div className="pr-map">
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
