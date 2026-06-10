import { PlantationType } from '../core/types';

// Pojedynczy żeton w wiejskiej części wyspy.
// Plantacje 5 typów towarów + kamieniołom (Quarry). Każdy ma 1 slot na robotnika.
export class Plantation {
  readonly workerCapacity = 1;
  occupiedWorkers: number = 0;
  occupiedNobles: number = 0;
  isForest: boolean = false;

  constructor(readonly type: PlantationType) {}

  isActive(): boolean {
    return this.occupiedWorkers > 0 || this.occupiedNobles > 0;
  }

  hasFreeWorkerSlot(): boolean {
    return this.occupiedWorkers + this.occupiedNobles < this.workerCapacity;
  }

  isQuarry(): boolean {
    return this.type === PlantationType.Quarry;
  }
}
