import type { Action } from './Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { PhaseType, type PlayerId } from '../core/types';
import type { GameState } from '../state/GameState';

// Najazd: korsarz zabiera robotników z Magistratu, zostawiając dokładnie tylu ile jest graczy.
// Zatrzymuje max 3, auto-rozmieszcza na wyspie; nadmiar wraca do puli.
export class CorsairRaidAction implements Action {
  readonly type = 'CORSAIR_RAID';

  constructor(readonly playerId: PlayerId) {}

  validate(state: GameState): Result<void, string> {
    if (state.getCurrentPhase().type !== PhaseType.Corsair) {
      return Err('Najazd możliwy tylko w fazie Korsarza');
    }
    if (state.getRoleSelector().id !== this.playerId) {
      return Err('Tylko selektor może wykonać akcję korsarza');
    }
    if (state.supply.workersInMagistrate <= state.players.length) {
      return Err('Magistrat nie ma robotników ponad minimalny zapas');
    }
    return OkVoid;
  }

  execute(state: GameState): void {
    const player = state.getPlayer(this.playerId)!;
    const toTake = state.supply.workersInMagistrate - state.players.length;
    const corsairGets = Math.min(toTake, 3);
    const excess = toTake - corsairGets;

    state.supply.workersInMagistrate -= toTake;
    state.supply.returnWorkersToPool(excess);

    // Auto-rozmieszczanie: najpierw plantacje, potem budynki
    let remaining = corsairGets;
    for (const plantation of player.island.getPlantations()) {
      if (remaining <= 0) break;
      const free = plantation.workerCapacity - plantation.occupiedWorkers;
      const place = Math.min(free, remaining);
      plantation.occupiedWorkers += place;
      remaining -= place;
    }
    for (const building of player.island.getBuildings()) {
      if (remaining <= 0) break;
      const free = building.workerCapacity - building.occupiedWorkers;
      const place = Math.min(free, remaining);
      building.occupiedWorkers += place;
      remaining -= place;
    }
    // Robotnicy bez miejsca wracają do puli
    if (remaining > 0) state.supply.returnWorkersToPool(remaining);
  }
}
