import { useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { GameScreen } from './components/GameScreen';
import type { PlayerSetup } from './game/GameRunner';
import { getSavedGame, deserializeGame } from './game/GameSerializer';
import type { GameState } from '../state/GameState';

interface GameSession {
  setups: PlayerSetup[];
  savedState?: GameState;
}

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);

  if (!session) {
    return (
      <SetupScreen
        onStart={(setups) => setSession({ setups })}
        onLoad={() => {
          const save = getSavedGame();
          if (!save) return;
          try {
            const { state, setups } = deserializeGame(save);
            setSession({ setups, savedState: state });
          } catch {
            // corrupt save — ignore
          }
        }}
      />
    );
  }

  const gameScreenProps = session.savedState
    ? { setups: session.setups, savedState: session.savedState, onReturnToMenu: () => setSession(null) }
    : { setups: session.setups, onReturnToMenu: () => setSession(null) };

  return <GameScreen {...gameScreenProps} />;
}
