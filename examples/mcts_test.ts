// Quick smoke test: play a full game with MctsBot vs GreedyBot
import { GameFactory } from '../state/GameFactory';
import { RoleSelectionPhase } from '../state/phases/RoleSelectionPhase';
import { MctsBot } from '../src/bots/MctsBot';
import { GreedyBot } from '../src/bots/GreedyBot';
import { ScoreCalculator } from '../state/ScoreCalculator';

const state = GameFactory.create(3, ['MCTS', 'Greedy1', 'Greedy2'], new RoleSelectionPhase(), {
  festival: false, corsair: false, newBuildings: false, nobleBuildings: false,
});

const bots = [new MctsBot(300), new GreedyBot(), new GreedyBot()];
const playerIds = state.players.map(p => p.id);

let moves = 0;
const t0 = Date.now();

while (!state.gameOver && moves < 500) {
  const pid = state.getCurrentPlayer().id;
  const idx = playerIds.indexOf(pid);
  const bot = bots[idx]!;
  const action = bot.chooseAction(state, pid);
  const result = state.apply(action);
  if (!result.ok) throw new Error(`Invalid action: ${result.error}`);
  moves++;
}

const elapsed = Date.now() - t0;
const scores = ScoreCalculator.calculate(state);
const sorted = [...scores].sort((a, b) => b.total - a.total);

console.log(`\nGame finished in ${moves} moves, ${elapsed}ms`);
console.log('\nFinal scores:');
for (const s of sorted) {
  const marker = s.playerName === 'MCTS' ? ' ← MCTS' : '';
  console.log(`  ${s.playerName}: ${s.total} VP  (tokens=${s.vpTokens} buildings=${s.buildingVP})${marker}`);
}
