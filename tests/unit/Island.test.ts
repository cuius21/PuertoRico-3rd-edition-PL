import { describe, it, expect } from 'vitest';
import { Island } from '../../domain/Island';
import { Plantation } from '../../domain/Plantation';
import { PlantationType, GoodType } from '../../core/types';
import { SmallIndigoPlant, SmallSugarMill } from '../../domain/buildings/catalog/ProductionBuildings';
import { SmallMarket } from '../../domain/buildings/catalog/SmallUtilityBuildings';
import { Fortress } from '../../domain/buildings/catalog/LargeBuildings';

function addActivePlantation(island: Island, type: PlantationType): Plantation {
  const p = new Plantation(type);
  p.occupiedWorkers = 1;
  island.addPlantation(p);
  return p;
}

describe('Island.getProductionCapacity', () => {
  it('corn: counts only active corn plantations (no building needed)', () => {
    const island = new Island();
    addActivePlantation(island, PlantationType.Corn);
    addActivePlantation(island, PlantationType.Corn);
    expect(island.getProductionCapacity(GoodType.Corn)).toBe(2);
  });

  it('corn: inactive plantation (no worker) does not count', () => {
    const island = new Island();
    island.addPlantation(new Plantation(PlantationType.Corn)); // no worker
    expect(island.getProductionCapacity(GoodType.Corn)).toBe(0);
  });

  it('indigo: returns 0 without a production building', () => {
    const island = new Island();
    addActivePlantation(island, PlantationType.Indigo);
    expect(island.getProductionCapacity(GoodType.Indigo)).toBe(0);
  });

  it('indigo: returns 0 when production building has no worker', () => {
    const island = new Island();
    addActivePlantation(island, PlantationType.Indigo);
    const building = new SmallIndigoPlant();
    island.addBuilding(building); // no worker in building
    expect(island.getProductionCapacity(GoodType.Indigo)).toBe(0);
  });

  it('indigo: returns min(active plantations, building workers)', () => {
    const island = new Island();
    addActivePlantation(island, PlantationType.Indigo);
    addActivePlantation(island, PlantationType.Indigo);
    const building = new SmallIndigoPlant();
    building.occupiedWorkers = 1; // building has 1 worker (capacity 1)
    island.addBuilding(building);
    expect(island.getProductionCapacity(GoodType.Indigo)).toBe(1);
  });

  it('indigo: capped by active plantations even if building has more workers', () => {
    const island = new Island();
    addActivePlantation(island, PlantationType.Indigo); // only 1 active
    const building = new SmallIndigoPlant();
    building.occupiedWorkers = 1;
    island.addBuilding(building);
    expect(island.getProductionCapacity(GoodType.Indigo)).toBe(1);
  });
});

describe('Island.countActiveQuarries', () => {
  it('counts quarries with a worker', () => {
    const island = new Island();
    addActivePlantation(island, PlantationType.Quarry);
    addActivePlantation(island, PlantationType.Quarry);
    island.addPlantation(new Plantation(PlantationType.Quarry)); // no worker
    expect(island.countActiveQuarries()).toBe(2);
  });

  it('returns 0 when no quarries', () => {
    const island = new Island();
    expect(island.countActiveQuarries()).toBe(0);
  });
});

describe('Island.getFreeUrbanSlotCount', () => {
  it('starts at 12 (all free)', () => {
    expect(new Island().getFreeUrbanSlotCount()).toBe(12);
  });

  it('small building (tileSize=1) occupies 1 slot', () => {
    const island = new Island();
    island.addBuilding(new SmallMarket());
    expect(island.getFreeUrbanSlotCount()).toBe(11);
  });

  it('large building (tileSize=2) occupies 2 slots', () => {
    const island = new Island();
    island.addBuilding(new Fortress()); // tileSize=2
    expect(island.getFreeUrbanSlotCount()).toBe(10);
  });
});

describe('Island.isCityFull', () => {
  it('not full with empty slots', () => {
    expect(new Island().isCityFull()).toBe(false);
  });

  it('full when all 12 slots occupied', () => {
    const island = new Island();
    // Fill 12 slots: 12 × SmallMarket (tileSize=1)
    for (let i = 0; i < 12; i++) {
      island.addBuilding(new SmallMarket());
    }
    expect(island.isCityFull()).toBe(true);
  });
});

describe('Island.getTotalEmployedWorkers', () => {
  it('counts workers on plantations and buildings', () => {
    const island = new Island();
    addActivePlantation(island, PlantationType.Corn);
    const b = new SmallIndigoPlant();
    b.occupiedWorkers = 1;
    island.addBuilding(b);
    expect(island.getTotalEmployedWorkers()).toBe(2);
  });
});
