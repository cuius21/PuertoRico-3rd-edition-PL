import { useState } from 'react';
import type { ExpansionConfig } from './SetupScreen';

interface Props {
  onCreate: (playerNames: string[], expansions: ExpansionConfig) => void;
  onReturnToMenu: () => void;
  error: string | null;
  connected: boolean;
  onClearError: () => void;
}

const DEFAULT_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eve'];

const EXPANSION_OPTIONS: { key: keyof ExpansionConfig; label: string; desc: string }[] = [
  { key: 'newBuildings',   label: 'I: Nowe Budynki', desc: 'Akwedukt, Biblioteka, Klasztor i inne' },
  { key: 'nobleBuildings', label: 'II: Szlachcic',   desc: '20 szlachciców, 8 budynków z podwójnymi efektami' },
  { key: 'corsair',        label: 'III: Korsarz',     desc: 'Piractwo, grabież, pojmanie roli' },
  { key: 'festival',       label: 'IV: Festyn',       desc: 'Losowe zadania za plantacje, produkcję i budowę' },
];

export function MultiplayerSetupScreen({ onCreate, onReturnToMenu, error, connected, onClearError }: Props) {
  const [count, setCount] = useState(3);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES.slice(0, 5));
  const [expansions, setExpansions] = useState<ExpansionConfig>({
    festival: false, corsair: false, newBuildings: false, nobleBuildings: false,
  });

  function updateCount(n: number) {
    setCount(n);
  }

  function handleStart() {
    const trimmed = names.slice(0, count).map(n => n.trim() || `Gracz ${names.indexOf(n) + 1}`);
    onCreate(trimmed, expansions);
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1 className="setup-title">Puerto Rico</h1>
        <p className="setup-subtitle">Gra sieciowa (LAN)</p>

        <div className={`multiplayer-status ${connected ? 'multiplayer-status--ok' : ''}`}>
          {connected ? '🟢 Połączono z serwerem' : '🔴 Łączenie z serwerem…'}
        </div>

        {error && (
          <div className="multiplayer-error" onClick={onClearError} role="button" tabIndex={0}>
            ⚠️ {error} <span className="multiplayer-error__dismiss">✕</span>
          </div>
        )}

        <div className="setup-section">
          <label className="setup-label">Liczba graczy</label>
          <div className="player-count-buttons">
            {[3, 4, 5].map(n => (
              <button key={n} className={`count-btn ${count === n ? 'active' : ''}`} onClick={() => updateCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <label className="setup-label">Imiona graczy</label>
          <div className="players-list">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="player-row">
                <span className="player-number">{i + 1}.</span>
                <input
                  className="player-name-input"
                  value={names[i] ?? ''}
                  onChange={e => setNames(prev => prev.map((n, idx) => idx === i ? e.target.value : n))}
                  maxLength={20}
                  placeholder={DEFAULT_NAMES[i] ?? `Gracz ${i + 1}`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <label className="setup-label">Rozszerzenia</label>
          <div className="expansion-list">
            {EXPANSION_OPTIONS.map(({ key, label, desc }) => (
              <label key={key} className="expansion-toggle">
                <input
                  type="checkbox"
                  checked={expansions[key]}
                  onChange={e => setExpansions(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                <span className="expansion-toggle__name">{label}</span>
                <span className="expansion-toggle__desc">{desc}</span>
              </label>
            ))}
          </div>
        </div>

        <button className="start-btn" onClick={handleStart} disabled={!connected}>
          Utwórz grę
        </button>

        <p className="multiplayer-hint">
          Inni gracze otwierają <strong>http://IP-HOSTA:3001</strong> w przeglądarce
        </p>

        <button className="load-btn" onClick={onReturnToMenu} style={{ marginTop: '0.5rem' }}>
          ← Powrót do gry lokalnej
        </button>
      </div>
    </div>
  );
}
