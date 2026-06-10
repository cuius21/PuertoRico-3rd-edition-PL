import { useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { GameScreen } from './components/GameScreen';
import { MultiplayerGameScreen } from './components/MultiplayerGameScreen';
import type { PlayerSetup } from './game/GameRunner';
import type { ExpansionConfig } from './components/SetupScreen';
import { getSavedGame, deserializeGame } from './game/GameSerializer';
import type { GameState } from '../state/GameState';

interface GameSession {
  setups: PlayerSetup[];
  expansions: ExpansionConfig;
  savedState?: GameState;
}

// Synchronous detection: server.ts injects <meta name="app-mode" content="multiplayer"> into index.html.
// In Vite dev mode (npm run dev) this meta tag is absent → local mode.
const IS_MULTIPLAYER =
  typeof document !== 'undefined' &&
  document.querySelector('meta[name="app-mode"]')?.getAttribute('content') === 'multiplayer';

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [showMultiplayer, setShowMultiplayer] = useState(IS_MULTIPLAYER);

  // Multiplayer mode — full screen managed by MultiplayerGameScreen
  if (showMultiplayer) {
    return <MultiplayerGameScreen onReturnToMenu={() => setShowMultiplayer(false)} />;
  }

  // Local mode — existing setup + game screen flow
  if (!session) {
    return (
      <SetupScreen
        onStart={(setups, expansions) => setSession({ setups, expansions })}
        onLoad={() => {
          const save = getSavedGame();
          if (!save) return;
          try {
            const { state, setups } = deserializeGame(save);
            setSession({
              setups,
              expansions: {
                festival: !!state.festivalBoard,
                corsair: state.roleCards.some(c => c.type === 'corsair'),
                newBuildings: state.supply.availableBuildings.some(b => b.id === 'aqueduct'),
                nobleBuildings: state.nobleExpansion,
              },
              savedState: state,
            });
          } catch {
            // corrupt save — ignore
          }
        }}
        onMultiplayer={() => setShowMultiplayer(true)}
      />
    );
  }

  const gameScreenProps = session.savedState
    ? { setups: session.setups, expansions: session.expansions, savedState: session.savedState, onReturnToMenu: () => setSession(null) }
    : { setups: session.setups, expansions: session.expansions, onReturnToMenu: () => setSession(null) };

  return <GameScreen {...gameScreenProps} />;
}
