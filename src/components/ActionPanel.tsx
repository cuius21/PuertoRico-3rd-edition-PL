import type { GameState } from '../../state/GameState';
import type { GameRunner } from '../game/GameRunner';
import type { Action } from '../../actions/Action';
import { describeAction } from '../game/actionLabels';
import { ShipsTradingBar } from './ShipsTradingBar';
import { FestivalBoardPanel } from './FestivalBoardPanel';

interface Props {
  runner: GameRunner;
  state: GameState;
  onAction: (action: Action) => void;
  isWaitingForBot: boolean;
}

export function ActionPanel({ runner, state, onAction, isWaitingForBot }: Props) {
  const validActions = runner.getValidActionsForCurrentPlayer();
  const currentPlayer = state.getCurrentPlayer();

  return (
    <div className={`action-panel${state.festivalBoard ? ' action-panel--festival' : ''}`}>
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

      {state.festivalBoard && (
        <FestivalBoardPanel board={state.festivalBoard} players={state.players} />
      )}

      <ShipsTradingBar state={state} />
    </div>
  );
}
