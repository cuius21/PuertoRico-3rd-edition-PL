import type { Action } from '../../../../actions/Action';
import type { GameState } from '../../../../state/GameState';
import { RoleType, PlantationType, type PlayerId } from '../../../../core/types';
import { NEURAL_GOODS, NEURAL_BUILDINGS, encodeNeuralPlayerState, supportsNeuralState } from './features';
import { scoreHardcoreAction } from '../../hardcorePolicy';

export const NEURAL_ACTION_VOCABULARY = [
  ...[RoleType.Settler, RoleType.Mayor, RoleType.Builder, RoleType.Craftsman, RoleType.Trader, RoleType.Captain].map(role => 'role:' + role),
  ...NEURAL_BUILDINGS.map(id => 'build:' + id),
  ...Object.values(PlantationType).map(type => 'plant:' + type),
  ...NEURAL_GOODS.map(good => 'sell:' + good),
  ...NEURAL_GOODS.map(good => 'bonus:' + good),
  ...['0', '1', '2', 'wharf'].flatMap(ship => NEURAL_GOODS.map(good => 'ship:' + ship + ':' + good)),
  ...Array.from({ length: 32 }, (_, mask) => 'storage:' + mask),
  'pass', 'coin', 'role:prospector:0', 'role:prospector:1',
] as const;
const IDS = new Map<string, number>(NEURAL_ACTION_VOCABULARY.map((key, index) => [key, index]));

export function neuralActionId(state: GameState, action: Action): number | undefined {
  const a = action as unknown as Record<string, any>;
  let key: string;
  switch (action.type) {
    case 'SELECT_ROLE': {
      if (a['role'] === RoleType.Prospector) {
        const cards = state.roleCards.map((card, index) => ({card, index})).filter(x => x.card.type === RoleType.Prospector);
        const ordinal = a['cardIndex'] == null ? cards.findIndex(x => x.card.isAvailable()) : cards.findIndex(x => x.index === a['cardIndex']);
        if (ordinal < 0 || ordinal > 1) return undefined;
        key = 'role:prospector:' + ordinal;
      } else key = 'role:' + a['role'];
      break;
    }
    case 'BUILD': key = 'build:' + a['buildingId']; break;
    case 'TAKE_PLANTATION':
      if (a['asForest']) return undefined;
      key = 'plant:' + (a['choice'].kind === 'quarry' ? PlantationType.Quarry : state.supply.revealedPlantations[a['choice'].index]?.type);
      break;
    case 'SELL_GOOD':
      if (a['useFactoria']) return undefined;
      key = 'sell:' + a['good']; break;
    case 'CRAFTSMAN_BONUS': key = 'bonus:' + a['good']; break;
    case 'LOAD_SHIP': key = 'ship:' + (a['target'].kind === 'ship' ? a['target'].shipIndex : a['target'].kind) + ':' + a['good']; break;
    case 'SELECT_STORAGE': {
      let mask = 0;
      for (const good of a['keepTypes'] as string[]) {
        const index = (NEURAL_GOODS as readonly string[]).indexOf(good);
        if (index < 0) return undefined;
        mask |= 1 << index;
      }
      key = 'storage:' + mask;
      break;
    }
    case 'PASS': key = 'pass'; break;
    case 'TAKE_DOUBLOON': key = 'coin'; break;
    default: return undefined;
  }
  return IDS.get(key);
}

export function heuristicPolicyProbabilities(state: GameState, playerId: PlayerId, actions: readonly Action[]): number[] {
  const scores = actions.map(action => scoreHardcoreAction(action, state, playerId));
  const best = Math.max(...scores);
  const weights = scores.map(score => Math.exp(Math.max(-12, (score - best) / 1.8)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(value => value / total);
}

export interface PolicyInput {
  input: number[];
  actionIds: number[];
  baseline: number[];
}
export interface PolicyExample extends PolicyInput {
  target: number[];
  phase: string;
  mover: number;
  teacherIterations: number;
  teacherValues: number[];
}

export function encodePolicyInput(state: GameState, playerId: PlayerId, actions: readonly Action[]): PolicyInput | null {
  if (!supportsNeuralState(state)) return null;
  const ids = actions.map(action => neuralActionId(state, action));
  if (ids.some(id => id === undefined)) return null;
  return { input: encodeNeuralPlayerState(state, playerId), actionIds: ids as number[],
    baseline: heuristicPolicyProbabilities(state, playerId, actions) };
}
