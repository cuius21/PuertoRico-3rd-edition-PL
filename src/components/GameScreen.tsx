import { useState } from 'react';
import { useGameRunner } from '../hooks/useGameRunner';
import type { PlayerSetup } from '../game/GameRunner';
import type { ExpansionConfig } from './SetupScreen';
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
  expansions: ExpansionConfig;
  savedState?: GameState;
  onReturnToMenu: () => void;
}

export function GameScreen({ setups, expansions, savedState, onReturnToMenu }: Props) {
  const { runner, state, applyHumanAction, isWaitingForBot, roundNotice, actionFeed, roundLog } =
    useGameRunner(setups, savedState, expansions);

  const [saveFlash, setSaveFlash] = useState(false);
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

  function handleSave() {
    serializeGame(state, runner.playerSetups);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1800);
  }

  if (state.gameOver) {
    return <GameOverScreen state={state} runner={runner} onReturnToMenu={onReturnToMenu} />;
  }

  const currentPlayer = state.getCurrentPlayer();
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
          <button className="log-btn" onClick={() => setShowLog(true)} title="Historia wszystkich akcji">
            📋 Logi {runner.log.length > 0 && <span className="log-btn__count">{runner.log.length}</span>}
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
          {state.players.map((player, idx) => {
            const isActive = state.currentPlayerIndex === idx;
            // On mobile (narrow), non-active panels collapse unless manually expanded.
            // On desktop the collapse toggle is still shown but panels default to expanded.
            const isMobile = window.innerWidth <= 768;
            const collapsed = isMobile && !isActive && !expandedPlayers.has(player.id);
            return (
              <PlayerPanel
                key={player.id}
                player={player}
                setup={runner.getSetup(idx)}
                isActive={isActive}
                isGovernor={state.governorIndex === idx}
                isSelector={state.roleSelectorIndex === idx}
                collapsed={collapsed}
                {...(isMobile ? { onToggle: () => togglePlayer(player.id) } : {})}
              />
            );
          })}
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
        onAction={applyHumanAction}
        isWaitingForBot={isWaitingForBot}
      />

      {/* Action log modal */}
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
    roundEnd: 'Koniec rundy',
    gameOver: 'Koniec gry',
  };
  return map[type] ?? type;
}
