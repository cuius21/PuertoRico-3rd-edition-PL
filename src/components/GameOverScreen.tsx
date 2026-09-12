import { MatchSyncStatus } from '../statistics/MatchSyncStatus';
import type { GameState } from '../../state/GameState';
import type { GameRunner } from '../game/GameRunner';
import { ScoreCalculator } from '../../state/ScoreCalculator';

interface Props {
  state: GameState;
  runner: GameRunner;
  onReturnToMenu: () => void;
}

export function GameOverScreen({ state, runner, onReturnToMenu }: Props) {
  const scores = ScoreCalculator.calculate(state);
  const sorted = scores;
  const winners = sorted.filter(row => row.rank === 1);

  return (
    <div className="gameover-screen">
      <div className="gameover-card">
        <h1 className="gameover-title">Koniec gry!</h1>
        {winners.length > 0 && (
          <p className="gameover-winner">🏆 {winners.length > 1 ? 'Wspólne zwycięstwo:' : 'Zwycięzca:'} <strong>{winners.map(w => w.playerName).join(', ')}</strong></p>
        )}

        <table className="score-table">
          <thead>
            <tr>
              <th>Miejsce</th>
              <th>Gracz</th>
              <th>PZ żetony</th>
              <th>PZ budynki</th>
              <th>Bonus</th>
              <th>Szlachta ★</th>
              <th>Razem</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.playerId} className={row.rank === 1 ? 'score-row--winner' : ''}>
                <td>#{row.rank}</td>
                <td>{row.playerName}</td>
                <td>{row.vpTokens}</td>
                <td>{row.buildingVP}</td>
                <td>{row.largeBuildingBonus}</td>
                <td>{row.nobleVP}</td>
                <td><strong>{row.total}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>

        {state.gameOverReason && (
          <p className="gameover-reason">⚑ {state.gameOverReason}</p>
        )}
        <p className="gameover-rounds">Rozegrano {state.roundNumber} rund · {state.actionLog.length} akcji</p>

        <MatchSyncStatus state={state} />

        <button className="start-btn" onClick={onReturnToMenu}>
          Nowa gra
        </button>
      </div>
    </div>
  );
}
