import { useState } from 'react';
import { RandomBot } from '../bots/RandomBot';
import { GreedyBot } from '../bots/GreedyBot';
import type { PlayerSetup } from '../game/GameRunner';
import { getSavedGame } from '../game/GameSerializer';

interface Props {
  onStart: (setups: PlayerSetup[]) => void;
  onLoad: () => void;
}

type PlayerType = 'human' | 'bot';
type Difficulty = 'easy' | 'hard';

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

export function SetupScreen({ onStart, onLoad }: Props) {
  const [playerCount, setPlayerCount] = useState(3);
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
            bot: p.difficulty === 'hard' ? new GreedyBot() : new RandomBot(),
          },
    );
    onStart(setups);
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
                      🧠 Inteligentny
                    </button>
                  </div>
                )}
              </div>
            ))}
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
      </div>
    </div>
  );
}
