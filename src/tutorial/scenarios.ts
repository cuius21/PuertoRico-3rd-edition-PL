import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { GoodType, PlantationType, RoleType } from '../../core/types';
import { FestivalBoard } from '../../domain/FestivalBoard';
import type { GameState } from '../../state/GameState';
import type { Building } from '../../domain/buildings/Building';

export const HUMAN = 'player-0';
export type ScenarioId =
  | 'welcome'
  | 'plantation'
  | 'workers'
  | 'production'
  | 'industry'
  | 'staffing'
  | 'indigo'
  | 'trade'
  | 'shipping'
  | 'storage'
  | 'round'
  | 'ending'
  | 'trial'
  | 'forest'
  | 'nobles'
  | 'corsair'
  | 'festival';
export function human(state: GameState) {
  return state.players[0]!;
}

export function createScenario(id: ScenarioId): GameState {
  const state = GameFactory.create(
    3,
    ['Ty', 'Inés', 'Mateo'],
    new RoleSelectionPhase(),
    {
      newBuildings: id === 'forest',
      nobleBuildings: id === 'nobles',
      corsair: id === 'corsair',
      festival: id === 'festival',
    },
  );
  // Prepared classroom positions are built before play; every subsequent move uses GameState.apply.
  const allCrops = [
    ...state.players.flatMap((p) => p.island.getPlantations()),
    ...state.supply.revealedPlantations,
    ...state.supply.plantationDecks.flat(),
    ...state.supply.discardedPlantations,
  ];
  allCrops.forEach((p) => {
    p.occupiedWorkers = 0;
    p.occupiedNobles = 0;
    p.isForest = false;
  });
  allCrops.sort((a, b) => a.type.localeCompare(b.type));
  state.players.forEach((p) =>
    p.island.restorePlantationSlots(Array(12).fill(null)),
  );
  state.supply.revealedPlantations = [];
  state.supply.discardedPlantations = [];
  state.supply.plantationDecks = [allCrops];
  function crop(type: PlantationType, occupied = false) {
    const index = allCrops.findIndex((p) => p.type === type);
    if (index < 0) throw new Error('Missing teaching plantation');
    const p = allCrops.splice(index, 1)[0]!;
    p.occupiedWorkers = occupied ? 1 : 0;
    if (occupied) state.supply.workersPool--;
    human(state).island.addPlantation(p);
  }
  function building(buildingId: string, active = false): Building {
    const index = state.supply.availableBuildings.findIndex(
      (b) => b.id === buildingId,
    );
    if (index < 0) throw new Error('Missing teaching building: ' + buildingId);
    const b = state.supply.availableBuildings.splice(index, 1)[0]!;
    b.occupiedWorkers = active ? 1 : 0;
    if (active) state.supply.workersPool--;
    human(state).island.addBuilding(b);
    return b;
  }
  function goods(type: GoodType, count: number) {
    human(state).addStoredGoods(type, count);
    state.supply.goodsPool.set(type, state.supply.goodsPool.get(type)! - count);
  }
  function cargo(index: number, type: GoodType, count: number) {
    state.ships[index]!.loadedGood = type;
    state.ships[index]!.loadedCount = count;
    state.supply.goodsPool.set(type, state.supply.goodsPool.get(type)! - count);
  }
  if (
    [
      'welcome',
      'plantation',
      'industry',
      'staffing',
      'indigo',
      'nobles',
    ].includes(id)
  )
    crop(PlantationType.Indigo);
  if (['workers', 'production', 'staffing', 'indigo', 'trial'].includes(id))
    crop(PlantationType.Corn, id === 'production' || id === 'indigo');
  if (['staffing', 'indigo'].includes(id))
    building('smallIndigoPlant', id === 'indigo');
  if (id === 'indigo') {
    const p = human(state)
      .island.getPlantations()
      .find((p) => p.type === PlantationType.Indigo)!;
    p.occupiedWorkers = 1;
    state.supply.workersPool--;
  }
  if (id === 'staffing') {
    human(state).heldWorkers = 1;
    state.supply.workersPool--;
  }
  if (['trade', 'round'].includes(id)) goods(GoodType.Indigo, 2);
  if (id === 'shipping') goods(GoodType.Corn, 4);
  if (id === 'storage') {
    goods(GoodType.Corn, 1);
    goods(GoodType.Coffee, 3);
    cargo(0, GoodType.Corn, 3);
    cargo(1, GoodType.Indigo, 1);
    cargo(2, GoodType.Sugar, 1);
  }
  if (id === 'forest') building('hut', true);
  if (id === 'nobles') {
    state.supply.noblesPool += state.supply.noblesInMagistrate;
    state.supply.noblesInMagistrate = 1;
    state.supply.noblesPool--;
  }
  if (id === 'corsair') cargo(0, GoodType.Corn, 3);
  if (id === 'festival') {
    crop(PlantationType.Corn);
    crop(PlantationType.Corn);
    state.festivalBoard = new FestivalBoard(
      {
        type: 'uprawa',
        plantationType: PlantationType.Corn,
        completedBy: null,
      },
      { type: 'produkcja', requiredGoods: { indigo: 2 }, completedBy: null },
      {
        type: 'budowa',
        buildingId: 'smallMarket',
        buildingDisplayName: 'Mały targ',
        completedBy: null,
      },
    );
  }
  if (id === 'ending') {
    [
      'smallIndigoPlant',
      'largeIndigoPlant',
      'smallSugarMill',
      'largeSugarMill',
      'tobaccoStorage',
      'coffeeRoaster',
      'smallMarket',
      'smithy',
      'hacienda',
      'hospice',
      'office',
    ].forEach((b) => building(b));
    human(state).doubloons += state.supply.drawDoubloons(4);
  }
  if (['round', 'ending'].includes(id)) {
    state.roundNumber = 4;
    state.governorIndex = 1;
    state.currentPlayerIndex = 0;
    state.roleCards.find((c) => c.type === RoleType.Settler)!.takenBy =
      'player-1';
    state.roleCards.find((c) => c.type === RoleType.Mayor)!.takenBy =
      'player-2';
  }
  // Fixed revealed options and sorted decks keep lesson goals independent of a random deal.
  for (const type of [
    PlantationType.Corn,
    PlantationType.Indigo,
    PlantationType.Sugar,
    PlantationType.Coffee,
  ]) {
    const index = allCrops.findIndex((p) => p.type === type);
    state.supply.revealedPlantations.push(allCrops.splice(index, 1)[0]!);
  }
  state.currentPlayerIndex = 0;
  return state;
}
