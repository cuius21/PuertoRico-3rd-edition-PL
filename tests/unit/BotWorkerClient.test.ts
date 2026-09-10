import { describe, it, expect, vi } from 'vitest';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';

const workers = vi.hoisted(() => [] as any[]);
vi.mock('../../src/bots/bot.worker?worker&inline', () => ({
  default: class {
    onmessage: any;
    onerror: any;
    onmessageerror: any;
    request: any;
    terminated = false;
    constructor() { workers.push(this); }
    postMessage(request: any) { this.request = request; }
    terminate() { this.terminated = true; }
  },
}));
import { BotWorkerClient } from '../../src/bots/BotWorkerClient';

function game() {
  return GameFactory.create(3, ['A', 'B', 'C'], new RoleSelectionPhase(), {
    festival: false, corsair: false, newBuildings: false, nobleBuildings: false,
  });
}

describe('background bot decisions', () => {
  it('returns the original legal action and keeps the idle worker until disposal', async () => {
    const state = game();
    const client = new BotWorkerClient();
    const promise = client.chooseAction(state, 'hardcore');
    const worker = workers.at(-1);
    const action = state.getValidActions(state.getCurrentPlayer().id)[2]!;
    worker.onmessage({ data: { id: worker.request.id, actionIndex: 2, actionKey: JSON.stringify(action) } });
    const returned = await promise;
    expect(returned).toEqual(action);
    expect(returned.validate(state).ok).toBe(true);
    expect(worker.terminated).toBe(false);
    expect(worker.onmessage).toBeNull();
    client.cancel();
    expect(worker.terminated).toBe(false);
    expect(state.actionLog).toHaveLength(0);
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('rejects an answer after the game has moved on', async () => {
    const state = game();
    const client = new BotWorkerClient();
    const promise = client.chooseAction(state, 'hardcore');
    const worker = workers.at(-1);
    const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
    state.apply(action);
    worker.onmessage({ data: { id: worker.request.id, actionIndex: 0, actionKey: JSON.stringify(action) } });
    await expect(promise).rejects.toThrow('game changed');
    expect(state.actionLog).toHaveLength(1);
  });

  it('cancels pending work when leaving the game', async () => {
    const client = new BotWorkerClient();
    const promise = client.chooseAction(game(), 'hardcore');
    const worker = workers.at(-1);
    client.cancel();
    await expect(promise).rejects.toThrow('cancelled');
    expect(worker.terminated).toBe(true);
  });

  it('reuses a completed worker across turns and ignores a late response from the previous turn', async () => {
    const state = game(), client = new BotWorkerClient();
    const count = workers.length;
    const first = client.chooseAction(state, 'hardcore');
    const worker = workers.at(-1), firstId = worker.request.id, oldHandler = worker.onmessage;
    const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
    const firstResponse = { data: { id: firstId, actionIndex: 0, actionKey: JSON.stringify(action) } };
    worker.onmessage(firstResponse);
    expect(state.apply(await first).ok).toBe(true);
    client.cancel();
    const second = client.chooseAction(state, 'ai');
    expect(workers).toHaveLength(count + 1);
    expect(worker.request.difficulty).toBe('ai');
    expect(worker.request.id).not.toBe(firstId);
    oldHandler(firstResponse);
    worker.onmessage(firstResponse);
    const next = state.getValidActions(state.getCurrentPlayer().id)[0]!;
    worker.onmessage({ data: { id: worker.request.id, actionIndex: 0, actionKey: JSON.stringify(next) } });
    expect(await second).toEqual(next);
    client.dispose();
  });

  it('replaces an active worker and prevents late callbacks from cancelling the replacement', async () => {
    const state = game(), client = new BotWorkerClient();
    const first = client.chooseAction(state, 'hardcore');
    const cancelled = expect(first).rejects.toThrow('cancelled');
    const old = workers.at(-1), lateError = old.onerror;
    const second = client.chooseAction(state, 'hardcore');
    const current = workers.at(-1);
    await cancelled;
    expect(current).not.toBe(old);
    expect(old.terminated).toBe(true);
    lateError({ message: 'late error' });
    expect(current.terminated).toBe(false);
    const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
    current.onmessage({ data: { id: current.request.id, actionIndex: 0, actionKey: JSON.stringify(action) } });
    expect(await second).toEqual(action);
    client.dispose();
  });

  it('recovers with a new worker after a synchronous message failure', async () => {
    const state = game(), client = new BotWorkerClient();
    const first = client.chooseAction(state, 'hardcore');
    const worker = workers.at(-1);
    const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
    worker.onmessage({ data: { id: worker.request.id, actionIndex: 0, actionKey: JSON.stringify(action) } });
    await first;
    worker.postMessage = () => { throw new Error('message failed'); };
    await expect(client.chooseAction(state, 'hardcore')).rejects.toThrow('message failed');
    expect(worker.terminated).toBe(true);
    const next = client.chooseAction(state, 'hardcore');
    const cancelled = expect(next).rejects.toThrow('cancelled');
    expect(workers.at(-1)).not.toBe(worker);
    client.dispose();
    await cancelled;
  });
});


it('preserves Neural difficulty and reuses its idle worker for the following turn', async () => {
  const state = game(), client = new BotWorkerClient(), count = workers.length;
  const first = client.chooseAction(state, 'neural');
  const worker = workers.at(-1);
  expect(worker.request.difficulty).toBe('neural');
  const action = state.getValidActions(state.getCurrentPlayer().id)[0]!;
  worker.onmessage({ data: { id: worker.request.id, actionIndex: 0, actionKey: JSON.stringify(action) } });
  expect(state.apply(await first).ok).toBe(true);
  client.cancel();
  expect(worker.terminated).toBe(false);
  const second = client.chooseAction(state, 'neural');
  expect(workers).toHaveLength(count + 1);
  expect(worker.request.difficulty).toBe('neural');
  const next = state.getValidActions(state.getCurrentPlayer().id)[0]!;
  worker.onmessage({ data: { id: worker.request.id, actionIndex: 0, actionKey: JSON.stringify(next) } });
  expect((await second).validate(state).ok).toBe(true);
  client.dispose();
  expect(worker.terminated).toBe(true);
});
