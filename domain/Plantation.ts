import { PlantationType } from '../core/types';

// Pojedynczy żeton w wiejskiej części wyspy.
// Plantacje 5 typów towarów + kamieniołom (Quarry). Każdy ma 1 slot na robotnika.
export class Plantation {
  readonly workerCapacity = 1;
  occupiedWorkers: number = 0;

  constructor(readonly type: PlantationType) {}

  isActive(): boolean {
    return this.occupiedWorkers > 0;
  }

  hasFreeWorkerSlot(): boolean {
    return this.occupiedWorkers < this.workerCapacity;
  }

  isQuarry(): boolean {
    return this.type === PlantationType.Quarry;
  }
}
