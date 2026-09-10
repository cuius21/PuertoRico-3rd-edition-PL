import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { MultiplayerSetupScreen } from './MultiplayerSetupScreen';
import { ServerGameRunner } from '../multiplayer/ServerGameRunner';
import { GameOverScreen } from './GameOverScreen';
import type { GameRunner } from '../game/GameRunner';
import { describeAction } from '../game/actionLabels';
import { WorldGame } from '../presentation/ui/WorldGame';
export function MultiplayerGameScreen({
  onReturnToMenu,
}: {
  onReturnToMenu: () => void;
}) {
  const {
    gameState,
    playerNames,
    log,
    error,
    connected,
    createGame,
    sendAction,
    resetGame,
    clearError,
  } = useMultiplayerGame();
  if (!gameState || !playerNames)
    return (
      <MultiplayerSetupScreen
        onCreate={createGame}
        onReturnToMenu={onReturnToMenu}
        error={error}
        connected={connected}
        onClearError={clearError}
      />
    );
  const runner = new ServerGameRunner(gameState, log, playerNames, sendAction);
  if (gameState.gameOver)
    return (
      <GameOverScreen
        state={gameState}
        runner={runner as unknown as GameRunner}
        onReturnToMenu={resetGame}
      />
    );
  return (
    <WorldGame
      state={gameState}
      runner={runner}
      onAction={(a) => runner.applyAction(a, describeAction(a, gameState))}
      waiting={!connected}
      onMenu={onReturnToMenu}
      connection={connected ? 'LAN' : 'Brak połączenia'}
      error={error ? <button onClick={clearError}>{error} ×</button> : null}
    />
  );
}
