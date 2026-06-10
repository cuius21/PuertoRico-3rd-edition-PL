import { Plantation } from './Plantation';
import { Building } from './buildings/Building';
import { ProductionBuilding } from './buildings/ProductionBuilding';
import { PlantationType, GoodType, BuildingCategory } from '../core/types';
import { ISLAND_RURAL_SLOTS, ISLAND_URBAN_SLOTS, GOOD_TO_PLANTATION } from '../core/constants';

// Wyspa gracza: 12 pól wiejskich (plantacje/kamieniołomy) + 12 pól miejskich (budynki).
//
// Reprezentacja slotów budynków: tablica 12 elementów. Mały budynek zajmuje 1 slot,
// duży budynek zajmuje 2 sloty - w obu trzymamy REFERENCJĘ do tego samego obiektu.
// Dzięki temu getBuildings() z Set-em zwraca każdy unikalny budynek raz.
//
// Uwaga: dokładną mechanikę "duży zajmuje 2 sąsiednie w pionie" obsłużymy
// gdy wdrożymy fazę budowniczego - tu trzymamy strukturę liniową.
export class Island {
  private readonly plantationSlots: (Plantation | null)[] = new Array(ISLAND_RURAL_SLOTS).fill(null);
  private readonly buildingSlots: (Building | null)[] = new Array(ISLAND_URBAN_SLOTS).fill(null);

  // === PLANTACJE ===

  getFreeRuralSlotCount(): number {
    return this.plantationSlots.filter(s => s === null).length;
  }

  hasFreeRuralSlot(): boolean {
    return this.getFreeRuralSlotCount() > 0;
  }

  addPlantation(plantation: Plantation): void {
    const freeIndex = this.plantationSlots.findIndex(s => s === null);
    if (freeIndex === -1) throw new Error('No free rural slot');
    this.plantationSlots[freeIndex] = plantation;
  }

  getPlantations(): readonly Plantation[] {
    return this.plantationSlots.filter((p): p is Plantation => p !== null);
  }

  countActivePlantations(type: PlantationType): number {
    return this.getPlantations().filter(p => p.type === type && p.isActive()).length;
  }

  countActiveQuarries(): number {
    return this.countActivePlantations(PlantationType.Quarry);
  }

  countForests(): number {
    return this.getPlantations().filter(p => p.isForest).length;
  }

  // === BUDYNKI ===

  addBuilding(building: Building): void {
    if (building.tileSize === 1) {
      const freeIndex = this.buildingSlots.findIndex(s => s === null);
      if (freeIndex === -1) throw new Error('No free urban slot');
      this.buildingSlots[freeIndex] = building;
      return;
    }
    // tileSize === 2 - tymczasowo zajmujemy dwa pierwsze wolne sloty.
    // TODO: docelowo logika "sąsiednie w pionie" wg ustalonego layoutu planszy.
    const freeIndices: number[] = [];
    for (let i = 0; i < this.buildingSlots.length && freeIndices.length < 2; i++) {
      if (this.buildingSlots[i] === null) freeIndices.push(i);
    }
    if (freeIndices.length < 2) throw new Error('Not enough free urban slots for large building');
    this.buildingSlots[freeIndices[0]!] = building;
    this.buildingSlots[freeIndices[1]!] = building;
  }

  // Zwraca każdy unikalny budynek raz (duży zajmuje 2 sloty, ale jest jedną instancją).
  getBuildings(): readonly Building[] {
    const seen = new Set<Building>();
    for (const slot of this.buildingSlots) {
      if (slot !== null) seen.add(slot);
    }
    return Array.from(seen);
  }

  getActiveBuildings(): readonly Building[] {
    return this.getBuildings().filter(b => b.isActive());
  }

  hasBuildingOfType(buildingId: string): boolean {
    return this.getBuildings().some(b => b.id === buildingId);
  }

  // Zajęte pola miejskie (uwzględnia, że duży budynek zajmuje 2 sloty).
  getOccupiedUrbanSlotCount(): number {
    return this.buildingSlots.filter(s => s !== null).length;
  }

  getFreeUrbanSlotCount(): number {
    return ISLAND_URBAN_SLOTS - this.getOccupiedUrbanSlotCount();
  }

  isCityFull(): boolean {
    return this.getOccupiedUrbanSlotCount() >= ISLAND_URBAN_SLOTS;
  }

  // === PRODUKCJA ===

  // Standardowa zdolność produkcyjna gracza dla danego towaru:
  // min(aktywne plantacje, robotnicy w budynku produkcyjnym).
  // Kukurydza nie wymaga budynku - liczy się tylko aktywne plantacje.
  getProductionCapacity(good: GoodType): number {
    const activePlantations = this.countActivePlantations(GOOD_TO_PLANTATION[good]);

    if (good === GoodType.Corn) return activePlantations;

    const productionBuilding = this.getActiveBuildings()
      .filter((b): b is ProductionBuilding => b.category === BuildingCategory.Production)
      .find(b => b.produces === good);

    if (!productionBuilding) return 0;
    return Math.min(activePlantations, productionBuilding.occupiedWorkers + productionBuilding.occupiedNobles);
  }

  // === ROBOTNICY ===

  // Liczba wolnych slotów na robotników/szlachciców (plantacje + budynki).
  getFreeWorkerSlotsCount(): number {
    let count = 0;
    for (const p of this.getPlantations()) count += p.workerCapacity - p.occupiedWorkers - p.occupiedNobles;
    for (const b of this.getBuildings()) count += b.workerCapacity - b.occupiedWorkers - b.occupiedNobles;
    return count;
  }

  // Suma zatrudnionych robotników (dla Twierdzy — tylko robotnicy, nie szlachcice).
  getTotalEmployedWorkers(): number {
    let count = 0;
    for (const p of this.getPlantations()) count += p.occupiedWorkers;
    for (const b of this.getBuildings()) count += b.occupiedWorkers;
    return count;
  }

  // Suma szlachciców umieszczonych na wyspie (bez pendingNobles/heldNobles gracza).
  countNobles(): number {
    let count = 0;
    for (const p of this.getPlantations()) count += p.occupiedNobles;
    for (const b of this.getBuildings()) count += b.occupiedNobles;
    return count;
  }

  // === SNAPSHOTY DLA WIDOKU ===

  getPlantationSlots(): readonly (Plantation | null)[] {
    return this.plantationSlots;
  }

  getBuildingSlots(): readonly (Building | null)[] {
    return this.buildingSlots;
  }

  // === DESERIALIZACJA ===

  restorePlantationSlots(slots: readonly (Plantation | null)[]): void {
    for (let i = 0; i < this.plantationSlots.length; i++) {
      this.plantationSlots[i] = slots[i] ?? null;
    }
  }

  restoreBuildingSlots(slots: readonly (Building | null)[]): void {
    for (let i = 0; i < this.buildingSlots.length; i++) {
      this.buildingSlots[i] = slots[i] ?? null;
    }
  }
}
