import type { PlayerScene } from '../adapter/sceneTypes';
import { parcel, type Point } from './projection';

export function waitingWorkforce(
  player: Pick<
    PlayerScene,
    'pending' | 'pendingNobles' | 'held' | 'heldNobles'
  >,
) {
  return {
    workers: player.pending + player.held,
    nobles: player.pendingNobles + player.heldNobles,
  };
}
export interface IdlePerson extends Point {
  kind: 'worker' | 'noble';
  pose: number;
  lean: number;
  size: number;
}
// One miniature per actual token. Dense groups fit their plaza, without hiding a count behind a cap.
export function idleFormation(
  workers: number,
  nobles: number,
  central: boolean,
): IdlePerson[] {
  const total = workers + nobles;
  const columns = central
    ? Math.min(6, Math.max(1, total))
    : Math.min(12, Math.max(1, total));
  const rows = Math.ceil(total / columns);
  return Array.from({ length: total }, (_, i) => {
    const col = i % columns,
      row = Math.floor(i / columns);
    const q = central
      ? {
          x: -420 + (col - (columns - 1) / 2) * 23 + (row % 2) * 4,
          y: -32 + row * Math.min(18, 105 / Math.max(1, rows - 1)),
        }
      : parcel(
          3.1 + col * Math.min(0.38, 3.6 / Math.max(1, columns - 1)),
          3.9 + row * Math.min(0.2, 0.55 / Math.max(1, rows - 1)),
        );
    return {
      ...q,
      kind: i < workers ? 'worker' : 'noble',
      pose: i % 4,
      lean: i % 4 === 1 ? 0.07 : i % 4 === 2 ? -0.07 : 0,
      size: central ? 48 : total > 36 ? 32 : 42,
    };
  });
}
