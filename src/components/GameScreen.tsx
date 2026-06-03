import { useState } from 'react';
import { useGameRunner } from '../hooks/useGameRunner';
import type { PlayerSetup } from '../game/GameRunner';
import type { GameState } from '../../state/GameState';
import { serializeGame } from '../game/GameSerializer';
import { RoleCardsBar } from './RoleCardsBar';
import { SupplyPanel } from './SupplyPanel';
import { PlayerPanel } from './PlayerPanel';
import { ActionPanel } from './ActionPanel';
import { GameOverScreen } from './GameOverScreen';
import { RoundLogPanel } from './RoundLogPanel';

interface Props {
  setups: PlayerSetup[];
  savedState?: GameState;
  onReturnToMenu: () => void;
}

export function GameScreen({ setups, savedState, onReturnToMenu }: Props) {
  const { runner, state, applyHumanAction, isWaitingForBot, roundNotice, actionFeed, roundLog } =
    useGameRunner(setups, savedState);

  const [saveFlash, setSaveFlash] = useState(false);

  function handleSave() {
    serializeGame(state, runner.playerSetups);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1800);
  }

  if (state.gameOver) {
    return <GameOverScreen state={state} runner={runner} onReturnToMenu={onReturnToMenu} />;
  }

  const currentPlayer = state.getCurrentPlayer();
  const currentSetup = runner.getCurrentSetup();

  return (
    <div className="game-screen">
      {/* Round change notification */}
      {roundNotice && (
        <div className="round-notice">
          <span className="round-notice__text">{roundNotice}</span>
        </div>
      )}

      {/* Header */}
      <header className="game-header">
        <h1 className="game-title">Puerto Rico</h1>
        <div className="game-meta">
          <span className="round-info">Runda {state.roundNumber + 1}</span>
          <span className="phase-info">{phaseLabel(state.getCurrentPhase().type)}</span>
          <span className="governor-info">
            👑 {state.getGovernor().name}
          </span>
          <span className={`current-player-info ${isWaitingForBot ? 'bot-turn' : ''}`}>
            {isWaitingForBot ? '🤖 ' : '👤 '}{currentPlayer.name}
            {isWaitingForBot ? ' myśli…' : ' — Twoja tura'}
          </span>
        </div>
        <div className="header-actions">
          {saveFlash && <span className="save-flash">Zapisano!</span>}
          <button className="save-btn" onClick={handleSave} title="Zapisz stan gry">
            💾 Zapisz
          </button>
          <button className="menu-btn" onClick={onReturnToMenu}>Menu</button>
        </div>
      </header>

      {/* Role cards row */}
      <RoleCardsBar state={state} />

      {/* Main content */}
      <div className="game-main">
        {actionFeed && (
          <div
            className="action-feed-overlay"
            key={actionFeed.playerName + actionFeed.actionText}
            style={{ animationDuration: `${actionFeed.isBot ? 1100 : 750}ms` }}
          >
            <div className="action-feed__player">
              {actionFeed.isBot ? '🤖' : '👤'} {actionFeed.playerName}
            </div>
            <div className="action-feed__action">{actionFeed.actionText}</div>
          </div>
        )}

        {/* Players area */}
        <div className="players-area">
          {state.players.map((player, idx) => (
            <PlayerPanel
              key={player.id}
              player={player}
              setup={runner.getSetup(idx)}
              isActive={state.currentPlayerIndex === idx}
              isGovernor={state.governorIndex === idx}
              isSelector={state.roleSelectorIndex === idx}
            />
          ))}
        </div>

        {/* Right column: round log + supply */}
        <div className="game-right-column">
          <RoundLogPanel log={roundLog} roundNumber={state.roundNumber} />
          <SupplyPanel state={state} />
        </div>
      </div>

      {/* Action panel */}
      <ActionPanel
        runner={runner}
        state={state}
        currentSetup={currentSetup}
        onAction={applyHumanAction}
        isWaitingForBot={isWaitingForBot}
      />
    </div>
  );
}

function phaseLabel(type: string): string {
  const map: Record<string, string> = {
    roleSelection: 'Wybór postaci',
    settler: 'Plantator',
    mayor: 'Burmistrz',
    builder: 'Budowniczy',
    craftsman: 'Zarządca',
    trader: 'Kupiec',
    captain: 'Kapitan',
    prospector: 'Poszukiwacz',
    roundEnd: 'Koniec rundy',
    gameOver: 'Koniec gry',
  };
  return map[type] ?? type;
}
