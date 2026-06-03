import type { ActionFeedItem } from '../hooks/useGameRunner';

interface Props {
  log: ActionFeedItem[];
  roundNumber: number;
}

export function RoundLogPanel({ log, roundNumber }: Props) {
  return (
    <div className="round-log-panel">
      <div className="round-log-title">📋 Runda {roundNumber + 1}</div>
      <div className="round-log-entries">
        {log.length === 0 && (
          <div className="round-log-empty">brak akcji</div>
        )}
        {log.map((entry, i) => (
          <div
            key={i}
            className={`round-log-entry ${entry.isBot ? 'round-log-entry--bot' : 'round-log-entry--human'}`}
          >
            <span className="round-log-icon">{entry.isBot ? '🤖' : '👤'}</span>
            <div className="round-log-content">
              <span className="round-log-player">{entry.playerName}</span>
              <span className="round-log-action">{entry.actionText}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
