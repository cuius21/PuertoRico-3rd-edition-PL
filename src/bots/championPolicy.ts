import type { Action } from '../../actions/Action';
import type { SelectRoleAction } from '../../actions/SelectRoleAction';
import type { GameState } from '../../state/GameState';
import type { Player } from '../../domain/Player';
import { RoleType, type PlayerId } from '../../core/types';
import { HARDCORE_GOODS } from './hardcoreEvaluation';
import { chooseHeuristicAction, scoreHardcoreAction } from './hardcorePolicy';
import { chooseChampionWorkerAction } from './championWorkers';
import { championCargoUnits } from './championEvaluation';
import { estimateChampionShipping } from './championShipping';

export interface ChampionHeuristicOptions {
  workers?: boolean;
  shipping?: boolean;
}

function previousCaptainBenefit(state: GameState, player: Player, selector: boolean): number {
  const own = player.island.getActiveBuildings().some(b => b.hasOwnShip?.());
  let value = 0;
  for (const good of HARDCORE_GOODS) {
    const stock = player.getStoredGoodCount(good);
    const existing = state.ships.find(s => s.loadedGood === good);
    const room = existing?.remainingCapacity() ?? Math.max(0, ...state.ships.filter(s => s.loadedGood === null).map(s => s.remainingCapacity()));
    value += Math.min(stock, own ? stock : room) * 0.85;
  }
  return value + (selector && value > 0 ? 1 : 0);
}

function captainAdjustment(state: GameState, player: Player, selector: boolean): number {
  const plan = estimateChampionShipping(state, player);
  if (!plan.supported) return 0;
  // Each estimate is individually feasible; rival plans remain estimates, not a
  // simultaneous allocation of public ships. Preserve the existing relative weighting.
  const value = championCargoUnits(state, player, plan) * 0.85 +
    (selector && plan.publicLoads + plan.wharfLoads > 0 ? 1 : 0);
  return value - previousCaptainBenefit(state, player, selector);
}

export function scoreChampionAction(action: Action, state: GameState, playerId: PlayerId, options: Pick<ChampionHeuristicOptions, 'shipping'> = {}): number {
  const base = scoreHardcoreAction(action, state, playerId);
  if (options.shipping === false || action.type !== 'SELECT_ROLE' || (action as SelectRoleAction).role !== RoleType.Captain) return base;
  const player = state.getPlayer(playerId)!;
  const opponents = state.players.filter(p => p.id !== playerId);
  const rivalAdjustment = opponents.reduce((sum, p) => sum + captainAdjustment(state, p, false), 0) / Math.max(1, opponents.length);
  return base + captainAdjustment(state, player, true) - 0.65 * rivalAdjustment;
}

export function chooseChampionHeuristicAction(state: GameState, playerId: PlayerId, actions = state.getValidActions(playerId), options: ChampionHeuristicOptions = {}): Action {
  if (actions.length === 0) throw new Error('ChampionBot: no valid actions');
  if (actions.length === 1) return actions[0]!;
  if (actions.some(a => a.type === 'PLACE_WORKER')) {
    return options.workers === false ? chooseHeuristicAction(state, playerId, actions) : chooseChampionWorkerAction(state, playerId, actions);
  }
  let best = actions[0]!;
  let bestScore = -Infinity;
  for (const action of actions) {
    const score = scoreChampionAction(action, state, playerId, options);
    if (score > bestScore) { bestScore = score; best = action; }
  }
  return best;
}