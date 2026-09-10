// Benchmark: MCTS with GreedyBot rollouts vs random rollouts
import { GameFactory } from '../state/GameFactory';
import { RoleSelectionPhase } from '../state/phases/RoleSelectionPhase';
import { serializeGameState, deserializeGameState } from '../src/game/GameSerializer';
import { MctsBot } from '../src/bots/MctsBot';
import { GreedyBot } from '../src/bots/GreedyBot';

const state = GameFactory.create(3, ['Alice', 'Bot', 'Bot2'], new RoleSelectionPhase(), {
  festival: false, corsair: false, newBuildings: false, nobleBuildings: false,
});

const greedy = new GreedyBot();

// --- GreedyBot rollout speed ---
const serialized = serializeGameState(state);
let greedyCount = 0;
const t1 = Date.now();
const deadline1 = t1 + 900;
while (Date.now() < deadline1) {
  const sim = deserializeGameState(structuredClone(serialized));
  const acts = sim.getValidActions(sim.getCurrentPlayer().id);
  if (acts.length > 0) {
    sim.apply(acts[0]!);
    for (let d = 0; d < 18 && !sim.gameOver; d++) {
      const pid = sim.getCurrentPlayer().id;
      const action = greedy.chooseAction(sim, pid);
      sim.apply(action);
    }
  }
  greedyCount++;
}
console.log(`GreedyBot rollouts in 900ms: ${greedyCount}  (${(900/greedyCount).toFixed(2)} ms each)`);

// --- Random rollout speed (for comparison) ---
let randomCount = 0;
const t2 = Date.now();
const deadline2 = t2 + 900;
while (Date.now() < deadline2) {
  const sim = deserializeGameState(structuredClone(serialized));
  const acts = sim.getValidActions(sim.getCurrentPlayer().id);
  if (acts.length > 0) {
    sim.apply(acts[0]!);
    for (let d = 0; d < 18 && !sim.gameOver; d++) {
      const pid = sim.getCurrentPlayer().id;
      const a = sim.getValidActions(pid);
      if (a.length > 0) sim.apply(a[Math.floor(Math.random() * a.length)]!);
    }
  }
  randomCount++;
}
console.log(`Random rollouts in 900ms:  ${randomCount}  (${(900/randomCount).toFixed(2)} ms each)`);

// --- Full MCTS decision ---
const bot = new MctsBot(900);
const t3 = Date.now();
const chosen = bot.chooseAction(state, state.getCurrentPlayer().id);
const elapsed = Date.now() - t3;
console.log(`\nMCTS decision in ${elapsed}ms → chose: ${(chosen as unknown as Record<string, unknown>)['type']}`);
