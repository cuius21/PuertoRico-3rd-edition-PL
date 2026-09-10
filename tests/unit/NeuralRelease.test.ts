import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { createBot, botDifficulty, BOT_DIFFICULTIES, isBotDifficulty } from '../../src/bots/createBot';
import { getReleasedNeuralModel } from '../../src/bots/neural/releaseModel';
import { NeuralBot } from '../../src/bots/NeuralBot';
import { HardcoreBot } from '../../src/bots/HardcoreBot';
import { serializeGame, getSavedGame, deserializeGame, serializeGameState, deserializeGameState } from '../../src/game/GameSerializer';
import type { PlayerSetup } from '../../src/game/GameRunner';
import type { BotWorkerRequest, BotWorkerResponse } from '../../src/bots/bot.worker';
import { SetupScreen } from '../../src/components/SetupScreen';

const base = { festival: false, corsair: false, newBuildings: false, nobleBuildings: false };
function game(players: 3 | 4 | 5 = 3, expansions = base) {
  return GameFactory.create(players, ['A', 'B', 'C', 'D', 'E'].slice(0, players), new RoleSelectionPhase(), expansions);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('released neural difficulty', () => {
  it('loads the exact candidate weights once and publishes only minimal metadata', () => {
    const first = getReleasedNeuralModel(), second = getReleasedNeuralModel();
    expect(first).toBe(second);
    const json = first.toJSON();
    expect(createHash('sha256').update(JSON.stringify(json.parameters)).digest('hex'))
      .toBe('290f01f3ad7e3e8d6baf027064ae581653ce7b72341e1106784d27e621049b82');
    expect(json.metadata).toEqual({ modelId: 'league-active-456', training: 'offline', supportedPlayers: 3, supportsExpansions: false });
    expect(json.optimizer).toBeUndefined();
    expect(JSON.stringify(json)).not.toMatch(/[A-Z]:\\|AppData|trainingGameSeeds|validationGameSeeds|datasetProvenance|resumedFrom/);
  });

  it('maps every released level both ways and retains Hardcore as its original bot', () => {
    expect(BOT_DIFFICULTIES).toEqual(['easy', 'hard', 'ai', 'hardcore', 'neural']);
    expect(BOT_DIFFICULTIES.map(level => botDifficulty(createBot(level)))).toEqual(BOT_DIFFICULTIES);
    expect(createBot('hardcore')).toBeInstanceOf(HardcoreBot);
    expect(createBot('neural')).toBeInstanceOf(NeuralBot);
    for (const value of [undefined, null, 7, '', 'NeuralBot', 'neural-v2']) expect(isBotDifficulty(value)).toBe(false);
    for (const level of BOT_DIFFICULTIES) expect(isBotDifficulty(level)).toBe(true);
  });

  it('uses the cached learned policy for a legal base-three decision without changing the live state', () => {
    const state = game(), before = serializeGameState(state);
    const descriptors = state.players.map(player => Object.getOwnPropertyDescriptors(player.island));
    const network = getReleasedNeuralModel(), original = network.policyForLegalActions.bind(network);
    let cachedReads = 0;
    vi.spyOn(network, 'policyForLegalActions').mockImplementation((position, playerId, actions) => {
      if (Object.prototype.hasOwnProperty.call(position.players[0]!.island, 'getBuildings')) cachedReads++;
      return original(position, playerId, actions);
    });
    const bot = createBot('neural') as NeuralBot;
    const action = bot.chooseAction(state, state.getCurrentPlayer().id);
    expect(action.validate(state).ok).toBe(true);
    expect(cachedReads).toBeGreaterThan(0);
    expect(bot.lastSearchStats.evaluatorErrors).toBe(0);
    expect(serializeGameState(state)).toEqual(before);
    state.players.forEach((player, index) => expect(Object.getOwnPropertyDescriptors(player.island)).toEqual(descriptors[index]));
  });

  it.each([
    { players: 4 as const, expansions: base }, { players: 5 as const, expansions: base },
    ...['festival', 'corsair', 'newBuildings', 'nobleBuildings'].map(key => ({ players: 3 as const, expansions: { ...base, [key]: true } })),
  ])('uses Hardcore without inference for unsupported configuration %j', ({ players, expansions }) => {
    const state = game(players, expansions), network = getReleasedNeuralModel();
    const inference = vi.spyOn(network, 'policyForLegalActions');
    const fallback = vi.spyOn(HardcoreBot.prototype, 'chooseAction').mockImplementation((position, playerId) => position.getValidActions(playerId)[0]!);
    const bot = createBot('neural'), action = bot.chooseAction(state, state.getCurrentPlayer().id);
    expect(fallback).toHaveBeenCalledOnce();
    expect(inference).not.toHaveBeenCalled();
    expect(action.validate(state).ok).toBe(true);
    expect(botDifficulty(bot)).toBe('neural');
  });

  it('round-trips every difficulty through the existing save serializer, including Neural fallback games', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => values.set(key, value), getItem: (key: string) => values.get(key) ?? null });
    const state = game(5), setups: PlayerSetup[] = BOT_DIFFICULTIES.map((difficulty, index) => ({
      name: state.players[index]!.name, type: 'bot', bot: createBot(difficulty),
    }));
    serializeGame(state, setups);
    const saved = getSavedGame()!;
    expect(saved.setups.map(setup => setup.difficulty)).toEqual(BOT_DIFFICULTIES);
    const restored = deserializeGame(JSON.parse(JSON.stringify(saved)));
    expect(restored.setups.map(setup => setup.type === 'bot' ? botDifficulty(setup.bot) : 'human')).toEqual(BOT_DIFFICULTIES);
    expect(serializeGameState(restored.state)).toEqual(serializeGameState(state));
    expect(serializeGameState(deserializeGameState(serializeGameState(state)))).toEqual(serializeGameState(state));
  });

  it('dispatches Neural through the actual worker handler and rejects an unknown difficulty', async () => {
    const state = game(), reply = vi.fn<(message: BotWorkerResponse) => void>();
    vi.stubGlobal('postMessage', reply); vi.stubGlobal('onmessage', null);
    const choose = vi.spyOn(NeuralBot.prototype, 'chooseAction').mockImplementation((position, playerId) => position.getValidActions(playerId)[1]!);
    await import('../../src/bots/bot.worker');
    const handler = (globalThis as unknown as { onmessage: (event: MessageEvent<BotWorkerRequest>) => void }).onmessage;
    const request: BotWorkerRequest = { id: 12, state: serializeGameState(state), difficulty: 'neural', playerId: state.getCurrentPlayer().id };
    handler({ data: request } as MessageEvent<BotWorkerRequest>);
    expect(choose).toHaveBeenCalledOnce();
    const action = state.getValidActions(request.playerId)[1]!;
    expect(reply).toHaveBeenLastCalledWith({ id: 12, actionIndex: 1, actionKey: JSON.stringify(action) });
    handler({ data: { ...request, id: 13, difficulty: 'invalid' } } as unknown as MessageEvent<BotWorkerRequest>);
    expect(choose).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenLastCalledWith({ id: 13, error: 'Unknown bot difficulty' });
  });

  it('shows all five levels with honest neural and Hardcore help text', () => {
    const html = renderToStaticMarkup(createElement(SetupScreen, { onStart: () => {}, onLoad: () => {}, onMultiplayer: () => {} }));
    for (const label of ['Losowy', 'Zachłanny', 'AI', 'Hardcore', 'Neural']) expect(html).toContain(label);
    expect(html.match(/aria-label="Jak działa bot 🧬 Neural\?"/g)).toHaveLength(2);
    expect(html).toContain('Działa lokalnie i nie doucza się podczas rozgrywki');
    expect(html).toContain('Przy 4–5 graczach lub dowolnym rozszerzeniu');
    expect(html).toContain('Nie korzysta z sieci neuronowej. Ocena strategiczna');
    expect(html).not.toContain('Eksperymentalna sieć została');
    expect(html).not.toContain('najsilniejszy poziom w dotychczasowych testach');
  });
});