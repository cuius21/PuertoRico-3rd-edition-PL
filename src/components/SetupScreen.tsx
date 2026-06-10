import { useState } from 'react';
import { RandomBot } from '../bots/RandomBot';
import { GreedyBot } from '../bots/GreedyBot';
import { MctsBot } from '../bots/MctsBot';
import type { PlayerSetup } from '../game/GameRunner';
import { getSavedGame } from '../game/GameSerializer';

export interface ExpansionConfig {
  festival: boolean;
  corsair: boolean;
  newBuildings: boolean;
  nobleBuildings: boolean;
}

interface Props {
  onStart: (setups: PlayerSetup[], expansions: ExpansionConfig) => void;
  onLoad: () => void;
  onMultiplayer: () => void;
}

type PlayerType = 'human' | 'bot';
type Difficulty = 'easy' | 'hard' | 'ai';

interface PlayerConfig {
  name: string;
  type: PlayerType;
  difficulty: Difficulty;
}

const DEFAULT_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eve'];

function formatSaveDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pl', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function SetupScreen({ onStart, onLoad, onMultiplayer }: Props) {
  const [playerCount, setPlayerCount] = useState(3);
  const [expansions, setExpansions] = useState<ExpansionConfig>({ festival: false, corsair: false, newBuildings: false, nobleBuildings: false });
  const [players, setPlayers] = useState<PlayerConfig[]>(
    DEFAULT_NAMES.slice(0, 3).map((name, i) => ({
      name,
      type: i === 0 ? 'human' : 'bot',
      difficulty: 'hard',
    })),
  );

  const savedGame = getSavedGame();

  function updateCount(n: number) {
    setPlayerCount(n);
    setPlayers(prev => {
      const next = [...prev];
      while (next.length < n) {
        next.push({
          name: DEFAULT_NAMES[next.length] ?? `Gracz ${next.length + 1}`,
          type: 'bot',
          difficulty: 'hard',
        });
      }
      return next.slice(0, n);
    });
  }

  function updatePlayer(i: number, patch: Partial<PlayerConfig>) {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  }

  function handleStart() {
    const setups: PlayerSetup[] = players.map(p =>
      p.type === 'human'
        ? { type: 'human', name: p.name }
        : {
            type: 'bot',
            name: p.name,
            bot: p.difficulty === 'ai' ? new MctsBot() : p.difficulty === 'hard' ? new GreedyBot() : new RandomBot(),
          },
    );
    onStart(setups, expansions);
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1 className="setup-title">Puerto Rico</h1>
        <p className="setup-subtitle">Nowa gra</p>

        <div className="setup-section">
          <label className="setup-label">Liczba graczy</label>
          <div className="player-count-buttons">
            {[3, 4, 5].map(n => (
              <button
                key={n}
                className={`count-btn ${playerCount === n ? 'active' : ''}`}
                onClick={() => updateCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <label className="setup-label">Gracze</label>
          <div className="players-list">
            {players.map((p, i) => (
              <div key={i} className="player-row">
                <span className="player-number">{i + 1}.</span>
                <input
                  className="player-name-input"
                  value={p.name}
                  onChange={e => updatePlayer(i, { name: e.target.value })}
                  maxLength={20}
                />
                <div className="type-toggle">
                  <button
                    className={`type-btn ${p.type === 'human' ? 'active' : ''}`}
                    onClick={() => updatePlayer(i, { type: 'human' })}
                  >
                    👤 Człowiek
                  </button>
                  <button
                    className={`type-btn ${p.type === 'bot' ? 'active' : ''}`}
                    onClick={() => updatePlayer(i, { type: 'bot' })}
                  >
                    🤖 Bot
                  </button>
                </div>
                {p.type === 'bot' && (
                  <div className="diff-toggle">
                    <button
                      className={`diff-btn ${p.difficulty === 'easy' ? 'diff-btn--active-easy' : ''}`}
                      onClick={() => updatePlayer(i, { difficulty: 'easy' })}
                      title="Bot wybiera losowe legalne ruchy"
                    >
                      🎲 Losowy
                    </button>
                    <button
                      className={`diff-btn ${p.difficulty === 'hard' ? 'diff-btn--active-hard' : ''}`}
                      onClick={() => updatePlayer(i, { difficulty: 'hard' })}
                      title="Bot używa heurystyk do oceny każdego ruchu"
                    >
                      🧠 Zachłanny
                    </button>
                    <button
                      className={`diff-btn ${p.difficulty === 'ai' ? 'diff-btn--active-ai' : ''}`}
                      onClick={() => updatePlayer(i, { difficulty: 'ai' })}
                      title="Bot symuluje setki możliwych przyszłości (MCTS) — ~2s na ruch"
                    >
                      🏆 AI
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <label className="setup-label">Rozszerzenia</label>
          <div className="expansion-list">
            <label className="expansion-toggle">
              <input
                type="checkbox"
                checked={expansions.newBuildings}
                onChange={e => setExpansions(prev => ({ ...prev, newBuildings: e.target.checked }))}
              />
              <span className="expansion-toggle__name">I: Nowe Budynki</span>
              <span className="expansion-toggle__desc">14 nowych budynków — Akwedukt, Biblioteka, Klasztor, Statua i inne</span>
            </label>
            <label className="expansion-toggle">
              <input
                type="checkbox"
                checked={expansions.nobleBuildings}
                onChange={e => setExpansions(prev => ({ ...prev, nobleBuildings: e.target.checked }))}
              />
              <span className="expansion-toggle__name">II: Szlachcic</span>
              <span className="expansion-toggle__desc">20 szlachciców — 8 nowych budynków z podwójnymi efektami (+1 PZ za szlachcica)</span>
            </label>
            <label className="expansion-toggle">
              <input
                type="checkbox"
                checked={expansions.corsair}
                onChange={e => setExpansions(prev => ({ ...prev, corsair: e.target.checked }))}
              />
              <span className="expansion-toggle__name">III: Korsarz</span>
              <span className="expansion-toggle__desc">Nowa postać — piractwo, grabież, najazd lub pojmanie roli</span>
            </label>
            <label className="expansion-toggle">
              <input
                type="checkbox"
                checked={expansions.festival}
                onChange={e => setExpansions(prev => ({ ...prev, festival: e.target.checked }))}
              />
              <span className="expansion-toggle__name">IV: Festyn w San Juan</span>
              <span className="expansion-toggle__desc">Losowe zadania — nagrody za plantacje, produkcję i budowę</span>
            </label>
          </div>
        </div>

        <button className="start-btn" onClick={handleStart}>
          Rozpocznij grę
        </button>

        {savedGame && (
          <button className="load-btn" onClick={onLoad}>
            <span className="load-btn__label">Wczytaj zapisaną grę</span>
            <span className="load-btn__date">{formatSaveDate(savedGame.savedAt)}</span>
          </button>
        )}

        <button className="multiplayer-btn" onClick={onMultiplayer}>
          🌐 Gra sieciowa (LAN)
        </button>
      </div>
    </div>
  );
}
