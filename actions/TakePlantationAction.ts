import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';
import type { Building } from '../domain/buildings/Building';
import { refillRevealedPlantations } from '../state/GameFactory';

// Typ wyboru - albo konkretna plantacja z odkrytej puli, albo kamieniołom.
export type PlantationChoice =
  | { kind: 'revealed'; index: number }
  | { kind: 'quarry' };

// Faza plantatora: każdy gracz po kolei może wziąć jedną plantację (lub kamieniołom).
// Reguły dotyczące kamieniołomu:
// - selektor (plantator) może wziąć kamieniołom dzięki swojemu przywilejowi,
// - inni gracze mogą wziąć kamieniołom TYLKO jeśli mają aktywną Kuźnię.
//
// (Aktywna Kuźnia w MVP będzie sprawdzana po id 'smithy'; póki nie ma jej klasy,
// hasBuildingOfType() zwróci false i bez aktywnej Kuźni nie da się wziąć kamieniołomu —
// kod jest forward-compatible.)
export class TakePlantationAction implements Action {
  readonly type = 'TAKE_PLANTATION';

  constructor(
    readonly playerId: PlayerId,
    readonly choice: PlantationChoice,
  ) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Settler) {
      return Err('Plantację można wziąć tylko w fazie plantatora');
    }
    if (state.getCurrentPlayer().id !== this.playerId) {
      return Err('To nie twoja kolej w fazie plantatora');
    }

    const player = state.getPlayer(this.playerId)!;

    if (!player.island.hasFreeRuralSlot()) {
      return Err('Brak wolnego pola wiejskiego na plantację');
    }

    if (this.choice.kind === 'revealed') {
      const idx = this.choice.index;
      if (idx < 0 || idx >= state.supply.revealedPlantations.length) {
        return Err('Nieprawidłowy indeks plantacji w odkrytej puli');
      }
      return OkVoid;
    }

    // Kamieniołom.
    if (state.supply.quarryStack.length === 0) {
      return Err('Stos kamieniołomów jest pusty');
    }

    const isSelector = state.getRoleSelector().id === this.playerId;
    const hasActiveSmithy = player.island.getActiveBuildings().some((b: Building) => b.id === 'smithy');

    if (!isSelector && !hasActiveSmithy) {
      return Err('Kamieniołom może wziąć tylko selektor lub posiadacz aktywnej Kuźni');
    }

    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;

    if (this.choice.kind === 'revealed') {
      const plantation = state.supply.revealedPlantations.splice(this.choice.index, 1)[0]!;
      player.island.addPlantation(plantation);
    } else {
      const quarry = state.supply.quarryStack.pop()!;
      player.island.addPlantation(quarry);
    }

    // Hacienda: draw 1 extra plantation from the face-down deck
    if (player.island.hasFreeRuralSlot() &&
        player.island.getActiveBuildings().some((b: Building) => b.drawsExtraPlantationFromPile?.())) {
      const extra = refillRevealedPlantations(state.supply, 1);
      if (extra.length > 0) player.island.addPlantation(extra[0]!);
    }

    // Hospice: place a worker on the newly added plantation
    if (player.island.getActiveBuildings().some((b: Building) => b.placeColonistOnNewPlantation?.())) {
      const plantations = player.island.getPlantations();
      const newest = plantations[plantations.length - 1];
      if (newest && newest.hasFreeWorkerSlot() && state.supply.workersPool > 0) {
        state.supply.workersPool--;
        newest.occupiedWorkers++;
      }
    }

    state.advanceCurrentPlayer();
  }
}
