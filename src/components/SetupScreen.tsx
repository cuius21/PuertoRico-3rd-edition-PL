import { useState } from 'react';
import { MenuShell } from '../presentation/menu/MenuShell';
import { createBot } from '../bots/createBot';
import type { BotDifficulty } from '../bots/createBot';
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
  onTutorial?: () => void;
}

type PlayerType = 'human' | 'bot';
type Difficulty = BotDifficulty;

interface PlayerConfig {
  name: string;
  type: PlayerType;
  difficulty: Difficulty;
}

const DEFAULT_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eve'];

const DIFFICULTIES: {
  value: Difficulty;
  label: string;
  method: string;
  description: string;
  neural: string;
}[] = [
  {
    value: 'easy',
    label: '🎲 Losowy',
    method: 'Losowanie legalnych ruchów',
    description:
      'Wybiera losowo jeden z dozwolonych ruchów. Nie ocenia jego opłacalności ani nie planuje kolejnych tur. Najłatwiejszy przeciwnik, dobry do poznawania zasad gry.',
    neural: 'Nie korzysta z sieci neuronowej i nie uczy się podczas gry.',
  },
  {
    value: 'hard',
    label: '🧠 Zachłanny',
    method: 'Heurystyki, czyli zaprogramowane reguły oceny',
    description:
      'Ocenia dostępne ruchy według korzyści: produkcji, dochodu, budynków i punktów. Wybiera najwyżej oceniony ruch na podstawie obecnej sytuacji, bez symulowania kolejnych tur.',
    neural:
      'Nie korzysta z sieci neuronowej. Reguły oceny są stałe i nie zmieniają się po rozegranych partiach.',
  },
  {
    value: 'ai',
    label: '🏆 AI',
    method: 'Symulacje Monte Carlo (MCTS)',
    description:
      'Porównuje ruchy, wielokrotnie symulując dalszy przebieg gry. W symulacjach korzysta z reguł bota Zachłannego i ocenia przewagę nad rywalami. Na trudniejsze decyzje przeznacza około 1,5 sekundy.',
    neural:
      'Nie korzysta z sieci neuronowej. Nazwa AI oznacza tutaj podejmowanie decyzji przez symulacje, bez treningu na wcześniejszych partiach.',
  },
  {
    value: 'hardcore',
    label: '🔥 Hardcore',
    method: 'Przeszukiwanie drzewa gry i ocena strategiczna',
    description:
      'Planuje rozwój całej wyspy, rozmieszczenie robotników, współpracę budynków i moment zakończenia gry. Uwzględnia interes każdego rywala, a zakryte plantacje losuje na potrzeby symulacji. Zwykle przeznacza około 0,65 sekundy na trudniejszą decyzję.',
    neural:
      'Nie korzysta z sieci neuronowej. Ocena strategiczna i zasady symulacji są stałe; bot nie uczy się podczas rozgrywki.',
  },
  {
    value: 'neural',
    label: '🧬 Neural',
    method: 'Eksperymentalna sieć neuronowa i MCTS',
    description:
      'Łączy przeszukiwanie dalszej gry z oceną ruchów przez wytrenowaną sieć. Sieć pomaga przy wyborze roli, budynku, sprzedaży i plantacji. Na trudniejszą decyzję przeznacza zwykle około 0,65 sekundy. Testy nie potwierdziły jeszcze przewagi nad Hardcore.',
    neural:
      'Sieć wytrenowano wcześniej na partiach botów. Działa lokalnie i nie doucza się podczas rozgrywki. Obsługuje podstawową grę dla 3 graczy. Przy 4–5 graczach lub dowolnym rozszerzeniu ten poziom automatycznie korzysta z bota Hardcore.',
  },
];

function formatSaveDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pl', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SetupScreen({
  onStart,
  onLoad,
  onMultiplayer,
  onTutorial,
}: Props) {
  const [playerCount, setPlayerCount] = useState(3);
  const [expansions, setExpansions] = useState<ExpansionConfig>({
    festival: false,
    corsair: false,
    newBuildings: false,
    nobleBuildings: false,
  });
  const [players, setPlayers] = useState<PlayerConfig[]>(
    DEFAULT_NAMES.slice(0, 3).map((name, i) => ({
      name,
      type: i === 0 ? 'human' : 'bot',
      difficulty: 'hard',
    })),
  );

  const savedGame = getSavedGame();
  const neuralSelected = players.some(
    (player) => player.type === 'bot' && player.difficulty === 'neural',
  );
  const neuralUsesHardcore =
    neuralSelected &&
    (playerCount !== 3 || Object.values(expansions).some(Boolean));

  function updateCount(n: number) {
    setPlayerCount(n);
    setPlayers((prev) => {
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
    setPlayers((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    );
  }

  function handleStart() {
    const setups: PlayerSetup[] = players.map((p) =>
      p.type === 'human'
        ? { type: 'human', name: p.name }
        : {
            type: 'bot',
            name: p.name,
            bot: createBot(p.difficulty),
          },
    );
    onStart(setups, expansions);
  }

  return (
    <MenuShell className="setup-screen">
      <header className="pr-menu-brand">
        <span className="pr-menu-edition">SAN JUAN · TRZECIA EDYCJA</span>
        <h1 className="setup-title">Puerto Rico</h1>
        <p>Twoja wyspa. Twój pomysł na zwycięstwo.</p>
      </header>
      <div className="setup-card">
        <div className="pr-menu-intro">
          <div className="pr-menu-card-heading">
            <span aria-hidden="true">⚑</span>
            <div>
              <h2>Przygotuj wyprawę</h2>
              <p className="setup-subtitle">
                Wybierz graczy i odkryj swój archipelag.
              </p>
            </div>
          </div>
          {onTutorial && (
            <button className="pr-school-entry" onClick={onTutorial}>
              <strong>⚑ Naucz się grać</strong>
              <span>Samouczek na planszy · lekcje i partia z opiekunem</span>
            </button>
          )}
        </div>
        <div className="setup-section setup-section--count">
          <label className="setup-label">Liczba graczy</label>
          <div className="player-count-buttons">
            {[3, 4, 5].map((n) => (
              <button
                key={n}
                className={`count-btn ${playerCount === n ? 'active' : ''}`}
                aria-pressed={playerCount === n}
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
                  aria-label={'Nazwa gracza ' + (i + 1)}
                  value={p.name}
                  onChange={(e) => updatePlayer(i, { name: e.target.value })}
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
                    {DIFFICULTIES.map((difficulty) => {
                      const helpId = `difficulty-help-${i}-${difficulty.value}`;
                      return (
                        <div className="diff-option" key={difficulty.value}>
                          <button
                            type="button"
                            className={`diff-btn ${p.difficulty === difficulty.value ? `diff-btn--active-${difficulty.value}` : ''}`}
                            onClick={() =>
                              updatePlayer(i, { difficulty: difficulty.value })
                            }
                            aria-pressed={p.difficulty === difficulty.value}
                          >
                            {difficulty.label}
                          </button>
                          <button
                            type="button"
                            className="diff-help-btn"
                            popoverTarget={helpId}
                            aria-label={`Jak działa bot ${difficulty.label}?`}
                            title={`Jak działa bot ${difficulty.label}?`}
                          >
                            ?
                          </button>
                          <div
                            id={helpId}
                            popover="auto"
                            className="diff-help"
                            role="dialog"
                            aria-labelledby={`${helpId}-title`}
                          >
                            <button
                              type="button"
                              className="diff-help-close"
                              popoverTarget={helpId}
                              popoverTargetAction="hide"
                              aria-label="Zamknij opis bota"
                            >
                              ×
                            </button>
                            <h2 id={`${helpId}-title`}>{difficulty.label}</h2>
                            <p className="diff-help-method">
                              {difficulty.method}
                            </p>
                            <p>{difficulty.description}</p>
                            <p className="diff-help-neural">
                              <strong>Sieć neuronowa:</strong>{' '}
                              {difficulty.neural}
                            </p>
                          </div>
                        </div>
                      );
                    })}
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
                onChange={(e) =>
                  setExpansions((prev) => ({
                    ...prev,
                    newBuildings: e.target.checked,
                  }))
                }
              />
              <span className="expansion-toggle__name">I: Nowe Budynki</span>
              <span className="expansion-toggle__desc">
                14 nowych budynków — Akwedukt, Biblioteka, Klasztor, Statua i
                inne
              </span>
            </label>
            <label className="expansion-toggle">
              <input
                type="checkbox"
                checked={expansions.nobleBuildings}
                onChange={(e) =>
                  setExpansions((prev) => ({
                    ...prev,
                    nobleBuildings: e.target.checked,
                  }))
                }
              />
              <span className="expansion-toggle__name">II: Szlachcic</span>
              <span className="expansion-toggle__desc">
                20 szlachciców — 8 nowych budynków z podwójnymi efektami (+1 PZ
                za szlachcica)
              </span>
            </label>
            <label className="expansion-toggle">
              <input
                type="checkbox"
                checked={expansions.corsair}
                onChange={(e) =>
                  setExpansions((prev) => ({
                    ...prev,
                    corsair: e.target.checked,
                  }))
                }
              />
              <span className="expansion-toggle__name">III: Korsarz</span>
              <span className="expansion-toggle__desc">
                Nowa postać — piractwo, grabież, najazd lub pojmanie roli
              </span>
            </label>
            <label className="expansion-toggle">
              <input
                type="checkbox"
                checked={expansions.festival}
                onChange={(e) =>
                  setExpansions((prev) => ({
                    ...prev,
                    festival: e.target.checked,
                  }))
                }
              />
              <span className="expansion-toggle__name">
                IV: Festyn w San Juan
              </span>
              <span className="expansion-toggle__desc">
                Losowe zadania — nagrody za plantacje, produkcję i budowę
              </span>
            </label>
          </div>
        </div>

        {neuralSelected && (
          <p className="neural-scope-note" role="status">
            {neuralUsesHardcore
              ? 'W tym wariancie Neural korzysta z bota Hardcore. Sieć działa w podstawowej grze dla 3 graczy.'
              : 'Neural to poziom eksperymentalny. Jego przewaga nad Hardcore nie została jeszcze potwierdzona.'}
          </p>
        )}

        <div className="pr-menu-submit">
          <button className="start-btn" onClick={handleStart}>
            Rozpocznij grę
          </button>

          {savedGame && (
            <button className="load-btn" onClick={onLoad}>
              <span className="load-btn__label">Wczytaj zapisaną grę</span>
              <span className="load-btn__date">
                {formatSaveDate(savedGame.savedAt)}
              </span>
            </button>
          )}

          {import.meta.env.VITE_LAN_ENABLED !== 'false' && (
            <button className="multiplayer-btn" onClick={onMultiplayer}>
              🌐 Gra sieciowa (LAN)
            </button>
          )}
        </div>
      </div>
    </MenuShell>
  );
}
