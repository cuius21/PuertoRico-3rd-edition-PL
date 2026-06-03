import { PlantationType } from '../core/types';
export declare class Plantation {
    readonly type: PlantationType;
    readonly workerCapacity = 1;
    occupiedWorkers: number;
    constructor(type: PlantationType);
    isActive(): boolean;
    hasFreeWorkerSlot(): boolean;
    isQuarry(): boolean;
}
//# sourceMappingURL=Plantation.d.ts.map