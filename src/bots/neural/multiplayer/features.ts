// Experimental schema; legacy production features remain unchanged.
import type { GameState } from '../../../../state/GameState';
import type { Player } from '../../../../domain/Player';
import { GoodType, PlantationType, RoleType, PhaseType, type PlayerId } from '../../../../core/types';
import { GOOD_TO_PLANTATION } from '../../../../core/constants';

export const NEURAL_FEATURE_SCHEMA = 'puerto-rico-base3to5-public-v2';
export const NEURAL_GOODS = [GoodType.Corn, GoodType.Indigo, GoodType.Sugar, GoodType.Tobacco, GoodType.Coffee] as const;
export const NEURAL_BUILDINGS = [
  'smallIndigoPlant', 'largeIndigoPlant', 'smallSugarMill', 'largeSugarMill', 'tobaccoStorage', 'coffeeRoaster',
  'smallMarket', 'smithy', 'hacienda', 'hospice', 'smallWarehouse', 'office', 'largeMarket', 'largeWarehouse',
  'factory', 'university', 'harbour', 'wharf', 'fortress', 'guildHall', 'customsHouse', 'cityHall', 'residence',
] as const;
const ROLES = [RoleType.Settler, RoleType.Mayor, RoleType.Builder, RoleType.Craftsman, RoleType.Trader, RoleType.Captain];
const PHASES = [PhaseType.RoleSelection, PhaseType.Settler, PhaseType.Mayor, PhaseType.Builder, PhaseType.Craftsman,
  PhaseType.Trader, PhaseType.Captain, PhaseType.Prospector, PhaseType.Corsair, PhaseType.RoundEnd, PhaseType.GameOver];
const PLAYER_NAMES = [
  'doubloons/20', 'vpTokens/40', 'buildingVP/20', 'activeEndBonus/20', 'employedWorkers/15',
  'pendingWorkers/10', 'heldWorkers/10', 'freeRural/12', 'freeUrban/12', 'activeQuarries/4',
  'quarries/4', 'governor', 'roleSelector', 'currentPlayer',
  ...NEURAL_GOODS.flatMap(g => [g + ':stock/8', g + ':production/5', g + ':plantations/5', g + ':activePlantations/5']),
  ...NEURAL_BUILDINGS.flatMap(id => [id + ':owned', id + ':staffing']),
];
const GLOBAL_NAMES = [
  'round/20', 'vpPool/100', 'workerPool/100', 'magistrate/10', 'bank/150', 'quarrySupply/8', 'phaseActions/3',
  ...PHASES.map(phase => 'phase:' + phase),
  ...ROLES.flatMap(role => [role + ':available', role + ':doubloons/6', role + ':owner0', role + ':owner1', role + ':owner2', role + ':owner3', role + ':owner4']),
  ...[0, 1].flatMap(copy => ['prospector' + copy + ':present', 'prospector' + copy + ':available', 'prospector' + copy + ':doubloons/6', ...[0,1,2,3,4].map(seat => 'prospector' + copy + ':owner' + seat)]),
  ...[0,1,2,3,4].map(seat => 'seat' + seat + ':present'),
  ...[3,4,5].map(n => 'players:' + n),
  ...[0,1,2].map(ship => 'ship' + ship + ':capacity/8'),
  ...[0, 1, 2].flatMap(ship => ['ship' + ship + ':load', ...NEURAL_GOODS.map(g => 'ship' + ship + ':' + g)]),
  ...NEURAL_GOODS.flatMap(g => [g + ':supply/12', g + ':tradingHouse/4', g + ':revealed/4']),
  ...NEURAL_BUILDINGS.map(id => id + ':supply/4'),
];
export const NEURAL_FEATURE_NAMES = [
  ...[0, 1, 2, 3, 4].flatMap(seat => PLAYER_NAMES.map(name => 'seat' + seat + ':' + name)),
  ...GLOBAL_NAMES,
] as const;
export const NEURAL_INPUT_SIZE = NEURAL_FEATURE_NAMES.length;
const BUILDING_SET: ReadonlySet<string> = new Set(NEURAL_BUILDINGS);

function scaled(value: number, scale: number): number {
  return Math.min(4, Math.max(0, value / scale));
}

export function supportsNeuralState(state: GameState): boolean {
  return state.players.length >= 3 && state.players.length <= 5 && !state.nobleExpansion && state.festivalBoard === null &&
    !state.roleCards.some(card => card.type === RoleType.Corsair) &&
    state.supply.availableBuildings.every(building => BUILDING_SET.has(building.id)) &&
    state.players.every(player => player.island.getBuildings().every(building => BUILDING_SET.has(building.id)));
}

function playerFeatures(state: GameState, player: Player, index: number): number[] {
  const buildings = player.island.getBuildings();
  const plantations = player.island.getPlantations();
  const row = [
    scaled(player.doubloons, 20), scaled(player.victoryPointTokens, 40),
    scaled(buildings.reduce((sum, b) => sum + b.victoryPoints, 0), 20),
    scaled(buildings.reduce((sum, b) => sum + (b.isActive() ? b.calculateEndGameBonus?.(state, player) ?? 0 : 0), 0), 20),
    scaled(player.island.getTotalEmployedWorkers(), 15), scaled(player.pendingWorkers, 10),
    scaled(player.heldWorkers, 10), player.island.getFreeRuralSlotCount() / 12,
    player.island.getFreeUrbanSlotCount() / 12, scaled(player.island.countActiveQuarries(), 4),
    scaled(plantations.filter(p => p.type === PlantationType.Quarry).length, 4),
    Number(index === state.governorIndex), Number(index === state.roleSelectorIndex), Number(index === state.currentPlayerIndex),
  ];
  for (const good of NEURAL_GOODS) {
    const type = GOOD_TO_PLANTATION[good];
    row.push(scaled(player.getStoredGoodCount(good), 8), scaled(player.island.getProductionCapacity(good), 5),
      scaled(plantations.filter(p => p.type === type && !p.isForest).length, 5),
      scaled(player.island.countActivePlantations(type), 5));
  }
  for (const id of NEURAL_BUILDINGS) {
    const building = buildings.find(b => b.id === id);
    row.push(Number(Boolean(building)), building ? building.occupiedWorkers / building.workerCapacity : 0);
  }
  return row;
}

function encodeRows(state: GameState, candidates: readonly number[]): number[][] {
  if (!supportsNeuralState(state)) throw new Error('Multiplayer neural features support the base game with 3-5 players only');
  const players = state.players.map((player, index) => playerFeatures(state, player, index));
  return candidates.map(candidate => {
    const count = state.players.length;
    const row = [0,1,2,3,4].flatMap(offset => offset < count ? players[(candidate + offset) % count]! : new Array<number>(PLAYER_NAMES.length).fill(0));
    row.push(scaled(state.roundNumber, 20), scaled(state.supply.victoryPointPool, 100),
      scaled(state.supply.workersPool, 100), scaled(state.supply.workersInMagistrate, 10),
      scaled(state.supply.doubloonsInBank, 150), state.supply.quarryStack.length / 8,
      scaled(state.getCurrentPhase().getProgress?.(state).actionsTaken ?? 0, 3));
    for (const phase of PHASES) row.push(Number(state.getCurrentPhase().type === phase));
    for (const role of ROLES) {
      const card = state.roleCards.find(c => c.type === role);
      row.push(Number(card?.isAvailable() ?? false), scaled(card?.doubloonsOnCard ?? 0, 6));
      for (let offset = 0; offset < 5; offset++) row.push(Number(offset < count && card?.takenBy === state.players[(candidate + offset) % count]!.id));
    }
    const prospectors = state.roleCards.filter(card => card.type === RoleType.Prospector);
    for (let copy = 0; copy < 2; copy++) {
      const card = prospectors[copy];
      row.push(Number(Boolean(card)), Number(card?.isAvailable() ?? false), scaled(card?.doubloonsOnCard ?? 0, 6));
      for (let offset = 0; offset < 5; offset++) row.push(Number(offset < count && card?.takenBy === state.players[(candidate + offset) % count]!.id));
    }
    for (let offset = 0; offset < 5; offset++) row.push(Number(offset < count));
    for (const n of [3,4,5]) row.push(Number(count === n));
    for (const ship of state.ships) row.push(ship.capacity / 8);
    for (const ship of state.ships) {
      row.push(ship.loadedCount / ship.capacity);
      for (const good of NEURAL_GOODS) row.push(Number(ship.loadedGood === good));
    }
    for (const good of NEURAL_GOODS) row.push(scaled(state.supply.getGoodsAvailable(good), 12),
      state.tradingHouse.getSlots().filter(slot => slot === good).length / 4,
      state.supply.revealedPlantations.filter(p => p.type === GOOD_TO_PLANTATION[good]).length / 4);
    for (const id of NEURAL_BUILDINGS) row.push(state.supply.availableBuildings.filter(b => b.id === id).length / 4);
    return row;
  });
}

export function encodeNeuralState(state: GameState): number[][] {
  return encodeRows(state, state.players.map((_, index) => index));
}

export function encodeNeuralPlayerState(state: GameState, playerId: PlayerId): number[] {
  const index = state.getPlayerIndex(playerId);
  if (index < 0) throw new Error('Unknown neural player');
  return encodeRows(state, [index])[0]!;
}
