import type { Bot } from './Bot';
import type { GameState } from '../../state/GameState';
import type { Action } from '../../actions/Action';
import type { Player } from '../../domain/Player';
import { type PlayerId, GoodType } from '../../core/types';
import { GOOD_PRICES } from '../../core/constants';
import { serializeGameState, deserializeGameState } from '../game/GameSerializer';
import { GreedyBot } from './GreedyBot';

// Each simulation covers ~3 full rounds at 3 players — enough to see production pay off.
const ROLLOUT_DEPTH = 36;

// Delegate these phase types to GreedyBot immediately — MCTS adds little value here.
const GREEDY_TYPES = new Set(['PLACE_WORKER', 'MAYOR_PASS', 'SELECT_STORAGE']);

// UCB1 exploration constant: balances exploring uncertain actions vs. exploiting known-good ones.
const C_UCT = 1.0;

// Virtual VP for active utility buildings whose advantage isn't captured by nominal victoryPoints.
// Conservative values — the rollout already captures most of the production/shipping benefit.
const UTILITY_BONUS: Readonly<Record<string, number>> = {
  factory:    2.0,  // 2–5 doubloons per Craftsman → VP (rollout captures most of this)
  harbour:    1.5,  // +1 VP per Captain phase shipping
  university: 1.5,  // free worker on every build
  wharf:      2.5,  // private ship: no competition for ship slots
  library:    1.5,  // doubled privilege bonus each round
};

export class MctsBot implements Bot {
  readonly name = 'MctsBot';
  readonly timeBudgetMs: number;

  private readonly greedy = new GreedyBot();

  constructor(timeBudgetMs = 1500) {
    this.timeBudgetMs = timeBudgetMs;
  }

  chooseAction(state: GameState, playerId: PlayerId): Action {
    const actions = state.getValidActions(playerId);
    if (actions.length === 0) throw new Error('MctsBot: no valid actions');
    if (actions.length === 1) return actions[0]!;

    const firstType = (actions[0] as unknown as Record<string, unknown>)['type'] as string;
    if (GREEDY_TYPES.has(firstType)) return this.greedy.chooseAction(state, playerId);

    const playerIndex = state.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return actions[0]!;

    const serialized = serializeGameState(state);
    const n = actions.length;
    const visits = new Array<number>(n).fill(0);
    const totals = new Array<number>(n).fill(0);
    let totalVisits = 0;

    const deadline = Date.now() + this.timeBudgetMs;

    while (Date.now() < deadline) {
      // UCB1: try each action at least once, then exploit+explore
      let a = -1;
      let bestUCB = -Infinity;
      for (let i = 0; i < n; i++) {
        const v = visits[i]!;
        if (v === 0) { a = i; break; }
        const ucb = totals[i]! / v + C_UCT * Math.sqrt(Math.log(totalVisits) / v);
        if (ucb > bestUCB) { bestUCB = ucb; a = i; }
      }
      if (a === -1) a = 0;

      const simState = deserializeGameState(structuredClone(serialized));
      const result = simState.apply(actions[a]!);
      const value = result.ok ? this.rollout(simState, playerIndex, ROLLOUT_DEPTH) : -50;
      visits[a]!++;
      totals[a]! += value;
      totalVisits++;
    }

    // Pick action with highest mean simulated relative score
    let bestIdx = 0;
    let bestAvg = -Infinity;
    for (let i = 0; i < n; i++) {
      if (visits[i]! === 0) continue;
      const avg = totals[i]! / visits[i]!;
      if (avg > bestAvg) { bestAvg = avg; bestIdx = i; }
    }

    return actions[bestIdx]!;
  }

  private rollout(state: GameState, playerIndex: number, maxDepth: number): number {
    for (let d = 0; d < maxDepth && !state.gameOver; d++) {
      const pid = state.getCurrentPlayer().id;
      const acts = state.getValidActions(pid);
      if (acts.length === 0) break;
      state.apply(this.greedy.chooseAction(state, pid));
    }
    return this.evaluate(state, playerIndex);
  }

  private evaluate(state: GameState, playerIndex: number): number {
    const values = state.players.map(p => this.playerValue(p, state));
    const myVal = values[playerIndex] ?? 0;
    const oppAvg =
      values.reduce((s, v, i) => (i !== playerIndex ? s + v : s), 0) /
      Math.max(1, state.players.length - 1);
    return myVal - oppAvg;
  }

  private playerValue(player: Player, state: GameState): number {
    const remainingRounds = Math.max(1, 11 - state.roundNumber);

    // Shipping: 1 VP per good loaded regardless of type.
    // Trading: ~price × 0.3 doubloons → VP (higher-priced goods trade better).
    // prodMult = expected remaining Captain phases beyond the rollout horizon.
    const prodMult = Math.min(remainingRounds * 0.35, 3.5);
    const productionVal = (Object.values(GoodType) as GoodType[]).reduce((sum, g) => {
      const cap = player.island.getProductionCapacity(g);
      // Base: 1 VP/good from shipping; bonus: small premium for high-price goods (trading).
      return sum + cap * (1.0 + GOOD_PRICES[g] * 0.15) * prodMult;
    }, 0);

    // Stored goods: will be shipped (1 VP each) or traded (price doubloons).
    // Corn can only be shipped (price=0) — still worth 1 VP.
    const goodsVal = (Object.values(GoodType) as GoodType[]).reduce((sum, g) => {
      const cnt = player.storedGoods.get(g) ?? 0;
      return sum + cnt * Math.max(1.0, GOOD_PRICES[g] * 0.35);
    }, 0);

    // Building VP: certain at game end (owned buildings never leave)
    const buildingVP = player.island.getBuildings().reduce((sum, b) => sum + b.victoryPoints, 0);

    // Large building end-game bonuses (Twierdza, Siedziba cechu, Urząd celny, Ratusz, Rezydencja)
    const largeBonus = player.island.getActiveBuildings().reduce((sum, b) => {
      return sum + (b.calculateEndGameBonus?.(state, player) ?? 0);
    }, 0);

    // Active utility buildings: virtual VP for in-game effects not in nominal victoryPoints
    const utilityBonus = player.island.getActiveBuildings().reduce((sum, b) => {
      return sum + (UTILITY_BONUS[b.id] ?? 0);
    }, 0);

    // Doubloons: convertible to buildings — diminishes as fewer turns remain
    const doubloonsVal = player.doubloons * 0.3 * Math.min(1.0, remainingRounds * 0.18);

    // Nobles (expansion II): certain end-game VP
    const nobleVP = state.nobleExpansion ? player.getTotalNobles() : 0;

    return (
      player.victoryPointTokens +
      buildingVP * 0.82 +
      largeBonus * 0.85 +
      productionVal +
      goodsVal +
      doubloonsVal +
      utilityBonus +
      nobleVP
    );
  }
}
