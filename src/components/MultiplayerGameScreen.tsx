import { useState } from 'react';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { MultiplayerSetupScreen } from './MultiplayerSetupScreen';
import { ServerGameRunner } from '../multiplayer/ServerGameRunner';
import { RoleCardsBar } from './RoleCardsBar';
import { SupplyPanel } from './SupplyPanel';
import { PlayerPanel } from './PlayerPanel';
import { ActionPanel } from './ActionPanel';
import { GameOverScreen } from './GameOverScreen';
import type { Action } from '../../actions/Action';
import type { GameRunner } from '../game/GameRunner';
import { describeAction } from '../game/actionLabels';

interface Props {
  onReturnToMenu: () => void;
}

export function MultiplayerGameScreen({ onReturnToMenu }: Props) {
  const { gameState, playerNames, log, error, connected, createGame, sendAction, resetGame, clearError } =
    useMultiplayerGame();

  // No game running yet — show setup form
  if (!gameState || !playerNames) {
    return (
      <MultiplayerSetupScreen
        onCreate={createGame}
        onReturnToMenu={onReturnToMenu}
        error={error}
        connected={connected}
        onClearError={clearError}
      />
    );
  }

  const [showLog, setShowLog] = useState(false);
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());

  function togglePlayer(playerId: string) {
    setExpandedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  const runner = new ServerGameRunner(gameState, log, playerNames, sendAction);
  // ServerGameRunner is structurally compatible with GameRunner (no private members on GameRunner).
  const runnerAsGameRunner = runner as unknown as GameRunner;

  function handleAction(action: Action) {
    const label = describeAction(action, gameState!);
    void label; // label used for optimistic log in sendAction
    runner.applyAction(action, label);
  }

  if (gameState.gameOver) {
    return (
      <GameOverScreen
        state={gameState}
        runner={runnerAsGameRunner}
        onReturnToMenu={() => { resetGame(); }}
      />
    );
  }

  const currentPlayer = gameState.getCurrentPlayer();

  return (
    <div className="game-screen">
      <header className="game-header">
        <h1 className="game-title">Puerto Rico</h1>
        <div className="game-meta">
          <span className="round-info">Runda {gameState.roundNumber + 1}</span>
          <span className="phase-info">{phaseLabel(gameState.getCurrentPhase().type)}</span>
          <span className="governor-info">👑 {gameState.getGovernor().name}</span>
          <span className="current-player-info">👤 {currentPlayer.name} — tura</span>
          <span className="multiplayer-badge" title={connected ? 'Połączono z serwerem' : 'Rozłączono!'}>
            {connected ? '🌐 LAN' : '⚠️ Brak połączenia'}
          </span>
        </div>
        <div className="header-actions">
          {error && (
            <span className="multiplayer-inline-error" onClick={clearError} title="Kliknij aby zamknąć">
              ⚠️ {error}
            </span>
          )}
          <button className="log-btn" onClick={() => setShowLog(true)} title="Historia wszystkich akcji">
            📋 Logi {runner.log.length > 0 && <span className="log-btn__count">{runner.log.length}</span>}
          </button>
          <button className="menu-btn" onClick={onReturnToMenu}>Menu</button>
        </div>
      </header>

      <RoleCardsBar state={gameState} />

      <div className="game-main">
        <div className="players-area">
          {gameState.players.map((player, idx) => {
            const isActive = gameState.currentPlayerIndex === idx;
            const isMobile = window.innerWidth <= 768;
            const collapsed = isMobile && !isActive && !expandedPlayers.has(player.id);
            return (
              <PlayerPanel
                key={player.id}
                player={player}
                setup={runner.getSetup(idx)}
                isActive={isActive}
                isGovernor={gameState.governorIndex === idx}
                isSelector={gameState.roleSelectorIndex === idx}
                collapsed={collapsed}
                {...(isMobile ? { onToggle: () => togglePlayer(player.id) } : {})}
              />
            );
          })}
        </div>

        <div className="game-right-column">
          <SupplyPanel state={gameState} />
        </div>
      </div>

      <ActionPanel
        runner={runnerAsGameRunner}
        state={gameState}
        onAction={handleAction}
        isWaitingForBot={false}
      />

      {showLog && (
        <div className="log-modal-overlay" onClick={() => setShowLog(false)}>
          <div className="log-modal" onClick={e => e.stopPropagation()}>
            <div className="log-modal__header">
              <span className="log-modal__title">Historia akcji</span>
              <button className="log-modal__close" onClick={() => setShowLog(false)}>✕</button>
            </div>
            <div className="log-modal__entries">
              {runner.log.length === 0 && <span className="log-empty">Brak akcji</span>}
              {[...runner.log].reverse().map((entry, i) => (
                <div key={i} className={`log-entry ${entry.isBot ? 'log-entry--bot' : 'log-entry--human'}`}>
                  <span className="log-player">{entry.playerName}:</span>
                  <span className="log-action">{entry.actionText}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
    corsair: 'Korsarz',
    roundEnd: 'Koniec rundy',
    gameOver: 'Koniec gry',
  };
  return map[type] ?? type;
}
