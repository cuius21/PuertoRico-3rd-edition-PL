import { Plantation } from './Plantation';
import { Building } from './buildings/Building';
import { PlantationType, GoodType } from '../core/types';
export declare class Island {
    private readonly plantationSlots;
    private readonly buildingSlots;
    getFreeRuralSlotCount(): number;
    hasFreeRuralSlot(): boolean;
    addPlantation(plantation: Plantation): void;
    getPlantations(): readonly Plantation[];
    countActivePlantations(type: PlantationType): number;
    countActiveQuarries(): number;
    addBuilding(building: Building): void;
    getBuildings(): readonly Building[];
    getActiveBuildings(): readonly Building[];
    hasBuildingOfType(buildingId: string): boolean;
    getOccupiedUrbanSlotCount(): number;
    getFreeUrbanSlotCount(): number;
    isCityFull(): boolean;
    getProductionCapacity(good: GoodType): number;
    getFreeWorkerSlotsCount(): number;
    getTotalEmployedWorkers(): number;
    getPlantationSlots(): readonly (Plantation | null)[];
    getBuildingSlots(): readonly (Building | null)[];
    restorePlantationSlots(slots: readonly (Plantation | null)[]): void;
    restoreBuildingSlots(slots: readonly (Building | null)[]): void;
}
//# sourceMappingURL=Island.d.ts.map