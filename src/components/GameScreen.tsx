import { useState } from 'react';
import { useGameRunner } from '../hooks/useGameRunner';
import type { PlayerSetup } from '../game/GameRunner';
import type { ExpansionConfig } from './SetupScreen';
import type { GameState } from '../../state/GameState';
import { serializeGame } from '../game/GameSerializer';
import { GameOverScreen } from './GameOverScreen';
import { WorldGame } from '../presentation/ui/WorldGame';
interface Props {
  setups: PlayerSetup[];
  expansions: ExpansionConfig;
  savedState?: GameState;
  onReturnToMenu: () => void;
}
export function GameScreen({
  setups,
  expansions,
  savedState,
  onReturnToMenu,
}: Props) {
  const {
    runner,
    state,
    applyHumanAction,
    isWaitingForBot,
    roundNotice,
    actionFeed,
    botError,
    retryBot,
  } = useGameRunner(setups, savedState, expansions);
  const [saveFlash, setSaveFlash] = useState(false);
  function save() {
    serializeGame(state, runner.playerSetups);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1800);
  }
  if (state.gameOver)
    return (
      <GameOverScreen
        state={state}
        runner={runner}
        onReturnToMenu={onReturnToMenu}
      />
    );
  return (
    <WorldGame
      state={state}
      runner={runner}
      onAction={applyHumanAction}
      waiting={isWaitingForBot}
      onMenu={onReturnToMenu}
      onSave={save}
      saveFlash={saveFlash}
      notice={roundNotice}
      feed={actionFeed}
      error={
        botError ? (
          <>
            {botError} <button onClick={retryBot}>Spróbuj ponownie</button>
          </>
        ) : null
      }
    />
  );
}
