import type { SceneSnapshot } from '../adapter/sceneTypes';

export const SAIL_SECONDS = 4.5;
export const SEA_PAUSE = 0.8;
type Ship = SceneSnapshot['ships'][number];
export interface Voyage {
  started: number;
  cleared: number | null;
  good: string;
  capacity: number;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => n * n * (3 - 2 * n);

export function voyageFrame(voyage: Voyage | undefined, seconds: number) {
  if (!voyage)
    return { progress: 0, alpha: 1, cargo: false, stage: 'docked' as const };
  const outgoing = clamp((seconds - voyage.started) / SAIL_SECONDS);
  const returnAt =
    voyage.cleared === null
      ? Infinity
      : Math.max(voyage.started + SAIL_SECONDS + SEA_PAUSE, voyage.cleared);
  const incoming = clamp((seconds - returnAt) / SAIL_SECONDS);
  const returning = seconds >= returnAt;
  const progress = returning ? 1 - ease(incoming) : ease(outgoing);
  return {
    progress,
    alpha: 1 - clamp((progress - 0.72) / 0.28),
    cargo: !returning,
    stage:
      incoming >= 1
        ? ('docked' as const)
        : returning
          ? ('returning' as const)
          : outgoing >= 1
            ? ('away' as const)
            : ('departing' as const),
  };
}

// Render-only history survives redraws. Only engine snapshots authorize an empty return.
export class ShipVoyages {
  private previous: Pick<
    SceneSnapshot,
    'ships' | 'phase' | 'lastShipLoad'
  > | null = null;
  private voyages = new Map<number, Voyage>();

  update(
    scene: Pick<SceneSnapshot, 'ships' | 'phase' | 'lastShipLoad'>,
    seconds: number,
    motion: boolean,
  ) {
    if (!motion) this.voyages.clear();
    scene.ships.forEach((ship, i) => {
      const before = this.previous?.ships[i];
      let voyage = this.voyages.get(i);
      const freshLoad =
        scene.lastShipLoad?.shipIndex === i &&
        scene.lastShipLoad.sequence !== this.previous?.lastShipLoad?.sequence;
      const filled =
        before &&
        before.count < ship.capacity &&
        ship.count === ship.capacity &&
        ship.good;
      const cleared =
        before &&
        this.previous?.phase === 'captain' &&
        scene.phase !== 'captain' &&
        ship.count === 0;
      // The final load can fill and clear a ship within a single engine update.
      const instantDeparture =
        cleared &&
        (before.count > 0 || freshLoad) &&
        (before.good || (freshLoad ? scene.lastShipLoad?.good : null));
      if (motion && before && (filled || (!voyage && instantDeparture))) {
        voyage = {
          started: seconds,
          cleared: ship.count === 0 ? seconds : null,
          good: ship.good || before.good || scene.lastShipLoad!.good,
          capacity: ship.capacity,
        };
        this.voyages.set(i, voyage);
      } else if (voyage && voyage.cleared !== null && ship.count > 0) {
        // New loading always takes visual precedence over an older decorative journey.
        this.voyages.delete(i);
        voyage = undefined;
      }
      if (voyage && ship.count === 0 && voyage.cleared === null)
        voyage.cleared = seconds;
      if (voyage && voyageFrame(voyage, seconds).stage === 'docked')
        this.voyages.delete(i);
    });
    for (const i of this.voyages.keys())
      if (!scene.ships[i]) this.voyages.delete(i);
    this.previous = {
      phase: scene.phase,
      lastShipLoad: scene.lastShipLoad ? { ...scene.lastShipLoad } : null,
      ships: scene.ships.map((s: Ship) => ({ ...s })),
    };
  }
  get(index: number) {
    return this.voyages.get(index);
  }
  clear() {
    this.voyages.clear();
  }
}
