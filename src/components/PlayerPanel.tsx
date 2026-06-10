import type { ReactNode } from 'react';
import type { Player } from '../../domain/Player';
import type { PlayerSetup } from '../game/GameRunner';
import { GoodType } from '../../core/types';
import { IslandView } from './IslandView';

interface Props {
  player: Player;
  setup: PlayerSetup;
  isActive: boolean;
  isGovernor: boolean;
  isSelector: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

const GOOD_META: Record<GoodType, { label: string; icon: ReactNode; bg: string; color: string }> = {
  [GoodType.Corn]:    { label: 'Kukurydza', icon: '🌽', bg: '#FFF9C4', color: '#8B6914' },
  [GoodType.Indigo]:  { label: 'Indygo',   icon: '🔵', bg: '#4527A0', color: '#EDE7F6' },
  [GoodType.Sugar]:   { label: 'Cukier',   icon: <span className="icon-sugar" />, bg: '#EEEEEE', color: '#555' },
  [GoodType.Tobacco]: { label: 'Tytoń',    icon: '🍂', bg: '#6D4C41', color: '#FFF8E1' },
  [GoodType.Coffee]:  { label: 'Kawa',     icon: '☕', bg: '#2C1810', color: '#FFF9F0' },
};

export function PlayerPanel({ player, setup, isActive, isGovernor, isSelector, collapsed = false, onToggle }: Props) {
  const isBot = setup.type === 'bot';

  return (
    <div className={[
      'player-panel',
      isActive ? 'player-panel--active' : '',
      isGovernor ? 'player-panel--governor' : '',
      isSelector ? 'player-panel--selector' : '',
      collapsed ? 'player-panel--collapsed' : '',
    ].join(' ')}>
      <div className="player-panel__header" onClick={onToggle} style={onToggle ? { cursor: 'pointer' } : {}}>
        <div className="player-name-row">
          {isGovernor && <span className="governor-crown" title="Gubernator">👑</span>}
          <span className="player-name">{player.name}</span>
          {isBot ? <span className="player-type-badge">🤖</span> : <span className="player-type-badge">👤</span>}
          {isSelector && <span className="selector-badge" title="Wybiera postać">★</span>}
          {onToggle && <span className="player-collapse-btn">{collapsed ? '▶' : '▼'}</span>}
        </div>
        {isGovernor && !collapsed && <div className="governor-label">Gubernator</div>}
      </div>

      <div className="player-stats">
        <span className="stat" title="Dublony"><span className="icon-coin">D</span> <strong>{player.doubloons}</strong></span>
        <span className="stat" title="Punkty zwycięstwa">⭐ <strong>{player.victoryPointTokens}</strong></span>
        {player.pendingWorkers > 0 && (
          <span className="stat stat--pending" title="Robotnicy do rozmieszczenia w tej fazie">
            👷 +{player.pendingWorkers}
          </span>
        )}
        {player.pendingNobles > 0 && (
          <span className="stat stat--pending-noble" title="Szlachcice do rozmieszczenia w tej fazie">
            <span className="token-noble" /> +{player.pendingNobles}
          </span>
        )}
        {player.heldWorkers > 0 && (
          <span className="stat stat--held" title="Robotnicy przetrzymani — dostępni w następnej fazie Burmistrza">
            👷 ×{player.heldWorkers}
          </span>
        )}
        {player.heldNobles > 0 && (
          <span className="stat stat--held-noble" title="Szlachcice przetrzymani — dostępni w następnej fazie Burmistrza">
            <span className="token-noble" /> ×{player.heldNobles}
          </span>
        )}
      </div>

      {/* Stored goods */}
      <div className="stored-goods">
        {(Object.values(GoodType) as GoodType[]).map(good => {
          const count = player.getStoredGoodCount(good);
          if (count === 0) return null;
          const meta = GOOD_META[good];
          return (
            <span
              key={good}
              className="good-badge"
              style={{ background: meta.bg, color: meta.color }}
              title={meta.label}
            >
              {meta.icon} {count}
            </span>
          );
        })}
        {player.getTotalStoredGoods() === 0 && (
          <span className="no-goods">brak towarów</span>
        )}
      </div>

      {/* Island — hidden when collapsed */}
      {!collapsed && <IslandView island={player.island} />}
    </div>
  );
}
