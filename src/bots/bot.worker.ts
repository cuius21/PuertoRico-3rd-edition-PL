import { deserializeGameState } from '../game/GameSerializer';
import type { SaveGame } from '../game/GameSerializer';
import { createBot, isBotDifficulty } from './createBot';
import type { BotDifficulty } from './createBot';

export interface BotWorkerRequest {
  id: number;
  state: SaveGame['state'];
  difficulty: BotDifficulty;
  playerId: string;
}

export type BotWorkerResponse =
  | { id: number; actionIndex: number; actionKey: string }
  | { id: number; error: string };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<BotWorkerRequest>) => void) | null;
  postMessage(message: BotWorkerResponse): void;
};

workerScope.onmessage = (event) => {
  const { id, state: snapshot, difficulty, playerId } = event.data;
  try {
    if (!isBotDifficulty(difficulty)) throw new Error('Unknown bot difficulty');
    const state = deserializeGameState(snapshot);
    const actions = state.getValidActions(playerId);
    const action = createBot(difficulty).chooseAction(state, playerId);
    const actionKey = JSON.stringify(action);
    const actionIndex = actions.findIndex(candidate => JSON.stringify(candidate) === actionKey);
    if (actionIndex < 0) throw new Error('Bot returned an unavailable action');
    workerScope.postMessage({ id, actionIndex, actionKey });
  } catch (error) {
    workerScope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
