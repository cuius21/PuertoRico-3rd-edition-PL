import type { GameState } from '../../state/GameState';
import { serializeGameState, deserializeGameState } from '../game/GameSerializer';

export function cloneGameState(state: GameState): GameState {
  return deserializeGameState(serializeGameState(state));
}

export function determinizeGameState(
  state: GameState,
  random: () => number = Math.random,
): GameState {
  const clone = cloneGameState(state);
  const sizes = clone.supply.plantationDecks.map(deck => deck.length);
  // Canonical order prevents the actual hidden order from affecting a seeded sample.
  const hidden = clone.supply.plantationDecks.flat().sort((a, b) =>
    a.type.localeCompare(b.type) ||
    Number(a.isForest) - Number(b.isForest) ||
    a.occupiedWorkers - b.occupiedWorkers ||
    a.occupiedNobles - b.occupiedNobles,
  );
  for (let i = hidden.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [hidden[i], hidden[j]] = [hidden[j]!, hidden[i]!];
  }
  let offset = 0;
  clone.supply.plantationDecks = sizes.map(size => {
    const deck = hidden.slice(offset, offset + size);
    offset += size;
    return deck;
  });
  return clone;
}
