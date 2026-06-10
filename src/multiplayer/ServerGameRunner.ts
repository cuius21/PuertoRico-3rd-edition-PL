import type { GameState } from '../../state/GameState';
import type { Action } from '../../actions/Action';
import type { PlayerId } from '../../core/types';
import type { PlayerSetup, GameEvent } from '../game/GameRunner';

// Adapter satisfying the structural shape of GameRunner, backed by server state.
// TypeScript uses structural typing so instances are assignable wherever GameRunner is expected.
export class ServerGameRunner {
  readonly playerSetups: readonly PlayerSetup[];

  constructor(
    readonly state: GameState,
    readonly log: GameEvent[],
    playerNames: string[],
    private readonly _sendAction: (action: Action) => void,
  ) {
    this.playerSetups = playerNames.map(name => ({ type: 'human' as const, name }));
  }

  getSetup(index: number): PlayerSetup {
    return this.playerSetups[index]!;
  }

  getCurrentSetup(): PlayerSetup {
    return this.getSetup(this.state.currentPlayerIndex);
  }

  isCurrentPlayerHuman(): boolean {
    return true;
  }

  isGameOver(): boolean {
    return this.state.gameOver;
  }

  getBotAction(): Action | null {
    return null;
  }

  applyAction(action: Action, _label: string): boolean {
    this._sendAction(action);
    return true;
  }

  currentPlayerId(): PlayerId {
    return this.state.getCurrentPlayer().id;
  }

  getValidActionsForCurrentPlayer(): Action[] {
    return this.state.getValidActions(this.currentPlayerId());
  }
}
