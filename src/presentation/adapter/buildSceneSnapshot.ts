import type { GameState } from '../../../state/GameState';
import type { Action } from '../../../actions/Action';
import type { SceneSnapshot, SceneObject } from './sceneTypes';
import { urbanLayout } from '../iso/projection';
import { targetsForAction } from '../interaction/actionBridge';
const COLORS = ['#f6c66a', '#7ce0b8', '#a8b9ff', '#f39ba6', '#e4b2f4'];
const BASE = new Set([
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
  'smallWarehouse',
  'office',
  'largeMarket',
  'largeWarehouse',
  'factory',
  'university',
  'harbour',
  'wharf',
  'fortress',
  'guildHall',
  'customsHouse',
  'cityHall',
  'residence',
]);
export const GOOD_NAMES: Record<string, string> = {
  corn: 'Kukurydza',
  indigo: 'Indygo',
  sugar: 'Cukier',
  tobacco: 'Tytoń',
  coffee: 'Kawa',
  quarry: 'Kamieniołom',
  forest: 'Las',
};
export function buildSceneSnapshot(
  state: GameState,
  actions: readonly Action[],
): SceneSnapshot {
  return {
    round: state.roundNumber + 1,
    phase: state.getCurrentPhase().type,
    currentId: state.getCurrentPlayer().id,
    players: state.players.map((p, i) => {
      const objects: SceneObject[] = [];
      p.island.getPlantationSlots().forEach((s, index) => {
        if (s) {
          const key = `${p.id}:plantation:${index}`;
          objects.push({
            key,
            sprite: s.isForest ? 'forest' : s.type,
            name: s.isForest ? 'Las' : GOOD_NAMES[s.type]!,
            u: index % 4,
            v: Math.floor(index / 4),
            size: 1,
            workers: s.occupiedWorkers,
            nobles: s.occupiedNobles,
            capacity: s.workerCapacity,
            target: { key, area: 'island', playerId: p.id, slotIndex: index },
          });
        }
      });
      const buildings = p.island.getBuildings();
      for (const pos of urbanLayout(
        buildings.map((b) => ({ id: b.id, size: b.tileSize })),
      )) {
        const b = buildings.find((b) => b.id === pos.id)!;
        const key = `${p.id}:building:${b.id}`;
        objects.push({
          key,
          sprite: b.id,
          name: b.displayName,
          u: pos.u,
          v: pos.v,
          size: pos.size,
          workers: b.occupiedWorkers,
          nobles: b.occupiedNobles,
          capacity: b.workerCapacity,
          target: { key, area: 'island', playerId: p.id, buildingId: b.id },
        });
      }
      return {
        id: p.id,
        name: p.name,
        color: COLORS[i]!,
        current: i === state.currentPlayerIndex,
        governor: i === state.governorIndex,
        coins: p.doubloons,
        vp: p.victoryPointTokens,
        pending: p.pendingWorkers,
        pendingNobles: p.pendingNobles,
        held: p.heldWorkers,
        heldNobles: p.heldNobles,
        goods: Object.fromEntries(p.storedGoods),
        objects,
        ruralUsed: 12 - p.island.getFreeRuralSlotCount(),
        urbanUsed: p.island.getOccupiedUrbanSlotCount(),
      };
    }),
    ships: state.ships.map((s) => ({
      capacity: s.capacity,
      good: s.loadedGood,
      count: s.loadedCount,
    })),
    trade: [...state.tradingHouse.getSlots()],
    bank: state.supply.doubloonsInBank,
    vpPool: state.supply.victoryPointPool,
    workersPool: state.supply.workersPool,
    magistrate: state.supply.workersInMagistrate,
    noblesPool: state.supply.noblesPool,
    magistrateNobles: state.supply.noblesInMagistrate,
    festival: !!state.festivalBoard,
    nobles: state.nobleExpansion,
    corsair: state.roleCards.some((r) => r.type === 'corsair'),
    newBuildings: [
      ...state.supply.availableBuildings,
      ...state.players.flatMap((p) => [...p.island.getBuildings()]),
    ].some((b) => !BASE.has(b.id)),
    legalTargets: [...new Set(actions.flatMap(targetsForAction))],
  };
}
