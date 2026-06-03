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
  const sorted = [...scores].sort((a, b) => b.total - a.total);
  const winner = sorted[0];

  return (
    <div className="gameover-screen">
      <div className="gameover-card">
        <h1 className="gameover-title">Koniec gry!</h1>
        {winner && (
          <p className="gameover-winner">🏆 Zwycięzca: <strong>{winner.playerName}</strong></p>
        )}

        <table className="score-table">
          <thead>
            <tr>
              <th>Miejsce</th>
              <th>Gracz</th>
              <th>PZ żetony</th>
              <th>PZ budynki</th>
              <th>Bonus</th>
              <th>Razem</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.playerId} className={i === 0 ? 'score-row--winner' : ''}>
                <td>#{i + 1}</td>
                <td>{row.playerName}</td>
                <td>{row.vpTokens}</td>
                <td>{row.buildingVP}</td>
                <td>{row.largeBuildingBonus}</td>
                <td><strong>{row.total}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>

        {state.gameOverReason && (
          <p className="gameover-reason">⚑ {state.gameOverReason}</p>
        )}
        <p className="gameover-rounds">Rozegrano {state.roundNumber} rund · {state.actionLog.length} akcji</p>

        <button className="start-btn" onClick={onReturnToMenu}>
          Nowa gra
        </button>
      </div>
    </div>
  );
}
