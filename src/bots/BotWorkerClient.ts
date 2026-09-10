import InlineBotWorker from './bot.worker?worker&inline';
import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import { serializeGameState } from '../game/GameSerializer';
import type { BotDifficulty } from './createBot';
import type { BotWorkerRequest, BotWorkerResponse } from './bot.worker';

export class BotWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private rejectPending: ((reason: Error) => void) | null = null;

  chooseAction(state: GameState, difficulty: BotDifficulty): Promise<Action> {
    this.cancel();
    const worker = this.worker ?? new InlineBotWorker();
    this.worker = worker;
    const id = ++this.requestId;
    const playerId = state.getCurrentPlayer().id;
    const actions = state.getValidActions(playerId);
    const logLength = state.actionLog.length;
    return new Promise((resolve, reject) => {
      this.rejectPending = reject;
      const isCurrent = () => this.worker === worker && this.rejectPending === reject;
      const finish = () => {
        this.rejectPending = null;
        this.clearCallbacks(worker);
      };
      const fail = (error: Error) => {
        if (!isCurrent()) return;
        finish();
        worker.terminate();
        this.worker = null;
        reject(error);
      };
      worker.onerror = event => fail(new Error(event.message || 'Bot worker failed'));
      worker.onmessageerror = () => fail(new Error('Unreadable bot response'));
      worker.onmessage = (event: MessageEvent<BotWorkerResponse>) => {
        if (!isCurrent()) return;
        const response = event.data;
        if (response.id !== id) return;
        if ('error' in response) { fail(new Error(response.error)); return; }
        const action = actions[response.actionIndex];
        if (!action || JSON.stringify(action) !== response.actionKey ||
            state.actionLog.length !== logLength || state.getCurrentPlayer().id !== playerId ||
            !action.validate(state).ok) {
          fail(new Error('The game changed while the bot was thinking'));
          return;
        }
        // Keep the module and JIT warm between decisions, including different bot levels.
        finish();
        resolve(action);
      };
      try {
        const request: BotWorkerRequest = { id, state: serializeGameState(state), difficulty, playerId };
        worker.postMessage(request);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  cancel(): void {
    const reject = this.rejectPending;
    if (!reject) return;
    this.rejectPending = null;
    if (this.worker) this.clearCallbacks(this.worker);
    this.worker?.terminate();
    this.worker = null;
    reject(new Error('Bot request cancelled'));
  }

  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }

  private clearCallbacks(worker: Worker): void {
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
  }
}
