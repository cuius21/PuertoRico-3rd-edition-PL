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

// Faza burmistrza: dystrybucja robotników i szlachciców z Magistratu + rozmieszczanie przez graczy.
// Selektor dostaje +1 robotnika przywileju z puli globalnej (Biblioteka: +2).
// Willa: gdy gracz odbiera pierwszego robotnika/szlachcica, bierze też 1 szlachcica z puli ogólnej.
// Po fazie: Magistrat = suma pustych slotów budynkowych wszystkich graczy + 1 szlachcic (jeśli exp. Noble aktywne).
export class MayorPhase implements GamePhase {
  readonly type = PhaseType.Mayor;

  onEnter(state: GameState): void {
    const playerCount = state.players.length;

    // Zapamiętaj graczy z aktywną Willą zanim zdejmiemy robotników z budynków.
    const playersWithActiveVilla = new Set(
      state.players
        .filter(p => p.island.getBuildings().some(b => b.id === 'villa' && b.isActive()))
        .map(p => p.id),
    );

    // Zdejmij wszystkich robotników i szlachciców z wysp — gracz rozmieszcza od nowa.
    for (const player of state.players) {
      for (const plantation of player.island.getPlantations()) {
        player.pendingWorkers += plantation.occupiedWorkers;
        player.pendingNobles  += plantation.occupiedNobles;
        plantation.occupiedWorkers = 0;
        plantation.occupiedNobles  = 0;
      }
      for (const building of player.island.getBuildings()) {
        player.pendingWorkers += building.occupiedWorkers;
        player.pendingNobles  += building.occupiedNobles;
        building.occupiedWorkers = 0;
        building.occupiedNobles  = 0;
      }
      player.pendingWorkers += player.heldWorkers;
      player.pendingNobles  += player.heldNobles;
      player.heldWorkers = 0;
      player.heldNobles  = 0;
    }

    // Rozdaj robotniki z Magistratu kolejno od selektora
    const workerCount = state.supply.workersInMagistrate;
    state.supply.workersInMagistrate = 0;
    for (let i = 0; i < workerCount; i++) {
      const idx = (state.roleSelectorIndex + i) % playerCount;
      state.players[idx]!.pendingWorkers++;
    }

    // Rozdaj szlachciców z Magistratu kolejno od selektora
    const nobleCount = state.supply.noblesInMagistrate;
    state.supply.noblesInMagistrate = 0;
    for (let i = 0; i < nobleCount; i++) {
      const idx = (state.roleSelectorIndex + i) % playerCount;
      state.players[idx]!.pendingNobles++;
    }

    // Przywilej burmistrza: +1 robotnik z puli globalnej (Biblioteka: +2)
    const mayorSelector = state.players[state.roleSelectorIndex]!;
    const hasLibrary = mayorSelector.island.getActiveBuildings().some(b => b.doublesRolePrivilege?.());
    const mayorBonus = hasLibrary ? 2 : 1;
    const taken = Math.min(mayorBonus, state.supply.workersPool);
    state.supply.workersPool -= taken;
    mayorSelector.pendingWorkers += taken;

    // Willa: gracze, którzy mieli aktywną Willę PRZED zdjęciem robotników i otrzymali
    // przynajmniej jednego robotnika/szlachcica w tej fazie, biorą 1 szlachcica z puli.
    for (const player of state.players) {
      if (playersWithActiveVilla.has(player.id) &&
          (player.pendingWorkers + player.pendingNobles) > 0 &&
          state.supply.noblesPool > 0) {
        state.supply.noblesPool--;
        player.pendingNobles++;
      }
    }

    state.currentPlayerIndex = state.roleSelectorIndex;
  }

  onExit(_state: GameState): void {}

  getValidActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.getCurrentPlayer().id !== playerId) return [];
    const player = state.getPlayer(playerId)!;
    if (player.pendingWorkers === 0 && player.pendingNobles === 0) return [];

    const actions: Action[] = [];

    // Wolne sloty plantacji
    const slots = player.island.getPlantationSlots();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot && slot.hasFreeWorkerSlot()) {
        if (player.pendingWorkers > 0) {
          actions.push(new PlaceWorkerAction(playerId, { kind: 'plantation', slotIndex: i }, false));
        }
        if (player.pendingNobles > 0) {
          actions.push(new PlaceWorkerAction(playerId, { kind: 'plantation', slotIndex: i }, true));
        }
      }
    }

    // Wolne sloty budynków
    for (const building of player.island.getBuildings()) {
      if (building.hasFreeWorkerSlot()) {
        if (player.pendingWorkers > 0) {
          actions.push(new PlaceWorkerAction(playerId, { kind: 'building', buildingId: building.id }, false));
        }
        if (player.pendingNobles > 0) {
          actions.push(new PlaceWorkerAction(playerId, { kind: 'building', buildingId: building.id }, true));
        }
      }
    }

    actions.push(new MayorPassAction(playerId));
    return actions;
  }

  checkTransition(state: GameState): GamePhase | null {
    for (let i = 0; i < state.players.length; i++) {
      if (state.players.every(p => p.pendingWorkers === 0 && p.pendingNobles === 0)) {
        this.refillMagistrate(state);
        return nextPhaseAfterRole(state);
      }
      const current = state.getCurrentPlayer();
      if (current.pendingWorkers > 0 || current.pendingNobles > 0) return null;
      state.advanceCurrentPlayer();
    }
    this.refillMagistrate(state);
    return nextPhaseAfterRole(state);
  }

  private refillMagistrate(state: GameState): void {
    // Robotnicy: suma pustych slotów na budynkach (bez plantacji), minimum = liczba graczy.
    let emptyBuildingSlots = 0;
    for (const player of state.players) {
      for (const building of player.island.getBuildings()) {
        emptyBuildingSlots += building.workerCapacity - building.occupiedWorkers - building.occupiedNobles;
      }
    }
    const neededWorkers = Math.max(emptyBuildingSlots, state.players.length);
    const takenWorkers = Math.min(neededWorkers, state.supply.workersPool);
    state.supply.workersPool -= takenWorkers;
    state.supply.workersInMagistrate = takenWorkers;

    // Szlachcic: 1 do Magistratu (jeśli rozszerzenie Noble jest aktywne — wykrywamy po noblesPool > 0 lub nobleExpansion flag)
    // Uproszczenie: jeśli pula szlachciców istnieje w supply (noblesPool >= 0 i byliśmy kiedyś inicjowani z Noble)
    // Bezpieczna heurystyka: dodaj 1 szlachcica jeśli pula jest > 0
    if (state.supply.noblesPool > 0) {
      state.supply.noblesPool--;
      state.supply.noblesInMagistrate = 1;
    }
  }
}
