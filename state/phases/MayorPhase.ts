import type { GameState } from '../GameState';
import type { Action } from '../../actions/Action';
import { PhaseType, type PlayerId } from '../../core/types';
import type { GamePhase } from '../GamePhase';
import { PlaceWorkerAction } from '../../actions/PlaceWorkerAction';
import { MayorPassAction } from '../../actions/MayorPassAction';
import { RoleSelectionPhase } from './RoleSelectionPhase';
import { RoundEndPhase } from './RoundEndPhase';

function nextPhaseAfterRole(state: GameState): GamePhase {
  const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
  return takenCount >= state.players.length ? new RoundEndPhase() : new RoleSelectionPhase();
}

// Faza burmistrza: dystrybucja robotników z Magistratu + rozmieszczanie przez graczy.
// Selektor dostaje +1 robotnika przywileju z puli globalnej.
// Po fazie: Magistrat uzupełniony o (łączna liczba zatrudnionych robotników + 1).
export class MayorPhase implements GamePhase {
  readonly type = PhaseType.Mayor;

  onEnter(state: GameState): void {
    // Zdejmij wszystkich robotników z wysp graczy — każdy rozmieszcza od nowa
    for (const player of state.players) {
      for (const plantation of player.island.getPlantations()) {
        player.pendingWorkers += plantation.occupiedWorkers;
        plantation.occupiedWorkers = 0;
      }
      for (const building of player.island.getBuildings()) {
        player.pendingWorkers += building.occupiedWorkers;
        building.occupiedWorkers = 0;
      }
      // Dodaj robotników przetrzymanych z poprzedniej rundy
      player.pendingWorkers += player.heldWorkers;
      player.heldWorkers = 0;
    }

    const playerCount = state.players.length;
    const workerCount = state.supply.workersInMagistrate;
    state.supply.workersInMagistrate = 0;

    // Rozdaj robotniki z Magistratu kolejno od selektora
    for (let i = 0; i < workerCount; i++) {
      const idx = (state.roleSelectorIndex + i) % playerCount;
      state.players[idx]!.pendingWorkers++;
    }

    // Przywilej burmistrza: +1 robotnik z puli globalnej
    if (state.supply.workersPool > 0) {
      state.supply.workersPool--;
      state.players[state.roleSelectorIndex]!.pendingWorkers++;
    }

    state.currentPlayerIndex = state.roleSelectorIndex;
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getCurrentPlayer().id !== playerId) return [];
    const player = state.getPlayer(playerId)!;
    if (player.pendingWorkers === 0) return [];

    const actions: Action[] = [];

    // Wolne sloty plantacji
    const slots = player.island.getPlantationSlots();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot && slot.hasFreeWorkerSlot()) {
        actions.push(new PlaceWorkerAction(playerId, { kind: 'plantation', slotIndex: i }));
      }
    }

    // Wolne sloty budynków
    for (const building of player.island.getBuildings()) {
      if (building.hasFreeWorkerSlot()) {
        actions.push(new PlaceWorkerAction(playerId, { kind: 'building', buildingId: building.id }));
      }
    }

    // Zawsze możliwe pasowanie (nieumieszczone robotniki wracają do puli)
    actions.push(new MayorPassAction(playerId));
    return actions;
  }

  checkTransition(state: GameState): GamePhase | null {
    // Pomiń graczy bez oczekujących robotników
    for (let i = 0; i < state.players.length; i++) {
      if (state.players.every(p => p.pendingWorkers === 0)) {
        this.refillMagistrate(state);
        return nextPhaseAfterRole(state);
      }
      const current = state.getCurrentPlayer();
      if (current.pendingWorkers > 0) return null;
      state.advanceCurrentPlayer();
    }
    // Wszystkich sprawdzono — koniec fazy
    this.refillMagistrate(state);
    return nextPhaseAfterRole(state);
  }

  private refillMagistrate(state: GameState): void {
    let totalOwned = 0;
    for (const player of state.players) {
      totalOwned += player.island.getTotalEmployedWorkers();
      totalOwned += player.heldWorkers; // robotnicy przetrzymani między rundami
    }
    const needed = totalOwned + 1;
    const taken = Math.min(needed, state.supply.workersPool);
    state.supply.workersPool -= taken;
    state.supply.workersInMagistrate = taken;
  }
}
