import { useEffect, useState } from 'react';
import { CoachPanel } from '../tutorial/CoachPanel';
import { ActionPlaybackPanel } from '../presentation/ui/ActionPlaybackPanel';
import { useActionPlayback } from '../presentation/playback/useActionPlayback';
import { useGameRunner } from '../hooks/useGameRunner';
import type { PlayerSetup } from '../game/GameRunner';
import type { ExpansionConfig } from './SetupScreen';
import type { GameState } from '../../state/GameState';
import { serializeGame } from '../game/GameSerializer';
import { GameOverScreen } from './GameOverScreen';
import { WorldGame } from '../presentation/ui/WorldGame';
interface Props {
  coached?: boolean;
  setups: PlayerSetup[];
  expansions: ExpansionConfig;
  savedState?: GameState;
  onReturnToMenu: () => void;
}
export function GameScreen({
  coached = false,
  setups,
  expansions,
  savedState,
  onReturnToMenu,
}: Props) {
  const [coach, setCoach] = useState(() => {
    try {
      return coached || localStorage.getItem('puerto-coach-enabled') === 'on';
    } catch {
      return coached;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('puerto-coach-enabled', coach ? 'on' : 'off');
    } catch {}
  }, [coach]);
  const playback = useActionPlayback();
  const {
    runner,
    state,
    applyHumanAction,
    isWaitingForBot,
    roundNotice,
    actionFeed,
    botError,
    retryBot,
  } = useGameRunner(setups, savedState, expansions, playback);
  const [saveFlash, setSaveFlash] = useState(false);
  function save() {
    serializeGame(state, runner.playerSetups);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1800);
  }
  if (state.gameOver && !playback.state.beat)
    return (
      <GameOverScreen
        state={state}
        runner={runner}
        onReturnToMenu={onReturnToMenu}
      />
    );
  return (
    <WorldGame
      playback={playback}
      extraTools={
        <button
          aria-pressed={coach}
          onClick={() => {
            setCoach((v) => {
              const next = !v;
              try {
                localStorage.setItem(
                  'puerto-coach-enabled',
                  next ? 'on' : 'off',
                );
              } catch {}
              return next;
            });
          }}
        >
          {coach ? 'Opiekun: wł.' : 'Opiekun: wył.'}
        </button>
      }
      sidebarContent={
        coach && !playback.state.beat && runner.isCurrentPlayerHuman() ? (
          <div className="pr-coach-stack">
            <CoachPanel state={state} />
            <ActionPlaybackPanel playback={playback} />
          </div>
        ) : undefined
      }
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
