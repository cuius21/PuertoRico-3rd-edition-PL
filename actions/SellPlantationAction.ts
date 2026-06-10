import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Kancelaria ze szlachcicem (faza kupca) LUB Domek myśliwski z robotnikiem (faza plantatora):
// odrzuć plantację lub las ze swojej wyspy → zysk 1 dublon (Kancelaria) lub brak zysku (Domek myśliwski).
// Jeśli odrzucona plantacja była aktywna, jej robotnik/szlachcic wraca do pendingWorkers/pendingNobles.
export class SellPlantationAction implements Action {
  readonly type = 'SELL_PLANTATION';

  constructor(
    readonly playerId: PlayerId,
    readonly slotIndex: number,
    readonly earnsDublon: boolean = false, // true = Kancelaria, false = Domek myśliwski
  ) {}

  validate(state: GameState): Result<void, string> {
    const phase = state.getCurrentPhase().type;
    if (phase !== PhaseType.Trader && phase !== PhaseType.Settler) {
      return Err('Można odrzucić plantację tylko w fazie kupca lub plantatora');
    }
    const player = state.getPlayer(this.playerId)!;
    const slots = player.island.getPlantationSlots();
    const slot = slots[this.slotIndex];
    if (!slot) return Err('Nie ma plantacji na tym polu');
    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const slots = player.island.getPlantationSlots();
    const plantation = slots[this.slotIndex]!;

    // Zwróć robotnika/szlachcica jeśli plantacja była aktywna
    if (plantation.occupiedWorkers > 0) {
      player.pendingWorkers += plantation.occupiedWorkers;
      state.supply.workersPool += 0; // worker stays with player (goes to pending)
    }
    if (plantation.occupiedNobles > 0) {
      player.pendingNobles += plantation.occupiedNobles;
    }

    // Usuń plantację z wyspy (wróć do puli odrzuconych)
    const removedPlantation = plantation;
    // Reset
    removedPlantation.occupiedWorkers = 0;
    removedPlantation.occupiedNobles = 0;
    removedPlantation.isForest = false;
    state.supply.discardedPlantations.push(removedPlantation);

    // Usuń slot (zastąp null)
    // Island nie ma metody removePlantation — manipulujemy przez restorePlantationSlots
    const newSlots = [...slots].map((s, i) => (i === this.slotIndex ? null : s));
    player.island.restorePlantationSlots(newSlots);

    if (this.earnsDublon) {
      player.doubloons += state.supply.drawDoubloons(1);
    }
  }
}
