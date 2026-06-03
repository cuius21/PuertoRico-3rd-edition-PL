import type { GameState } from '../../state/GameState';
import type { GameRunner, PlayerSetup, GameEvent } from '../game/GameRunner';
import type { Action } from '../../actions/Action';
import { describeAction } from '../game/actionLabels';
import { ShipsTradingBar } from './ShipsTradingBar';

interface Props {
  runner: GameRunner;
  state: GameState;
  currentSetup: PlayerSetup;
  onAction: (action: Action) => void;
  isWaitingForBot: boolean;
}

export function ActionPanel({ runner, state, currentSetup, onAction, isWaitingForBot }: Props) {
  const validActions = runner.getValidActionsForCurrentPlayer();
  const currentPlayer = state.getCurrentPlayer();

  return (
    <div className="action-panel">
      <div className="action-panel__left">
        <div className="action-panel__who">
          {isWaitingForBot ? (
            <span className="bot-thinking">🤖 {currentPlayer.name} myśli…</span>
          ) : (
            <span className="human-turn">👤 {currentPlayer.name} — wybierz akcję:</span>
          )}
        </div>

        {!isWaitingForBot && (
          <div className="action-buttons">
            {validActions.map((action, i) => {
              const label = describeAction(action, state);
              return (
                <button
                  key={i}
                  className="action-btn"
                  onClick={() => onAction(action)}
                  title={label}
                >
                  {label}
                </button>
              );
            })}
            {validActions.length === 0 && !state.gameOver && (
              <span className="no-actions">Brak dostępnych akcji…</span>
            )}
          </div>
        )}
      </div>

      <ShipsTradingBar state={state} />

      <div className="action-panel__log">
        <div className="log-title">Log akcji</div>
        <div className="log-entries">
          {runner.log.slice(0, 12).map((entry, i) => (
            <div key={i} className={`log-entry ${entry.isBot ? 'log-entry--bot' : 'log-entry--human'}`}>
              <span className="log-player">{entry.playerName}:</span>
              <span className="log-action">{entry.actionText}</span>
            </div>
          ))}
          {runner.log.length === 0 && <span className="log-empty">Brak akcji</span>}
        </div>
      </div>
    </div>
  );
}
