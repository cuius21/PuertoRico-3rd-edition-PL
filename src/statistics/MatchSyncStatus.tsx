import { useSyncExternalStore } from 'react';
import type { GameState } from '../../state/GameState';
import { recordings } from './store';
import { flushMatches, matchStatus, subscribeStats } from './transport';

export function MatchSyncStatus({ state }: { state: GameState }) {
  const recording = recordings.get(state);
  const status = useSyncExternalStore(subscribeStats, () => recording ? matchStatus(recording.id) : '');
  if (!recording || recording.excluded) return null;
  return <div className="gameover-rounds" role="status">
    <p>{status}</p>
    <small>Partia: {recording.id.slice(0, 8)}</small>{' '}
    {!status.startsWith('Zapisano') && <button onClick={() => { void flushMatches(); }}>Ponów zapis</button>}
  </div>;
}

