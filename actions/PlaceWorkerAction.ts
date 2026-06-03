import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

export type WorkerTarget =
  | { kind: 'plantation'; slotIndex: number }
  | { kind: 'building'; buildingId: string };

// Faza burmistrza: gracz umieszcza jednego oczekującego robotnika na plantacji lub budynku.
export class PlaceWorkerAction implements Action {
  readonly type = 'PLACE_WORKER';

  constructor(
    readonly playerId: PlayerId,
    readonly target: WorkerTarget,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Mayor) {
      return Err('Robotników można umieszczać tylko w fazie burmistrza');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej w fazie burmistrza');
    }

    const player = state.getPlayer(this.playerId)!;

    if (player.pendingWorkers === 0) {
      return Err('Nie masz oczekujących robotników do rozmieszczenia');
    }

    if (this.target.kind === 'plantation') {
      const slot = player.island.getPlantationSlots()[this.target.slotIndex];
      if (!slot) return Err('Nieprawidłowy indeks plantacji');
      if (!slot.hasFreeWorkerSlot()) return Err('Plantacja jest już zajęta');
    } else {
      const { buildingId } = this.target;
      const building = player.island.getBuildings().find(b => b.id === buildingId);
      if (!building) return Err(`Nie posiadasz budynku ${buildingId}`);
      if (!building.hasFreeWorkerSlot()) return Err('Budynek nie ma wolnych miejsc');
    }

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    player.pendingWorkers--;

    if (this.target.kind === 'plantation') {
      const slot = player.island.getPlantationSlots()[this.target.slotIndex]!;
      slot.occupiedWorkers++;
    } else {
      const { buildingId } = this.target;
      const building = player.island.getBuildings().find(b => b.id === buildingId)!;
      building.occupiedWorkers++;
    }

    // When all workers placed, advance to next player
    if (player.pendingWorkers === 0) {
      state.advanceCurrentPlayer();
    }
  }
}
