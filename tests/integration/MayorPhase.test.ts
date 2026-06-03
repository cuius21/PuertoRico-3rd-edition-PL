import { describe, it, expect } from 'vitest';
import { PlaceWorkerAction } from '../../actions/PlaceWorkerAction';
import { MayorPassAction } from '../../actions/MayorPassAction';
import { createGame, selectRole, applyOk } from '../helpers';
import { RoleType, PhaseType } from '../../core/types';

function enterMayorPhase() {
  const state = createGame(3);
  selectRole(state, RoleType.Mayor);
  expect(state.getCurrentPhase().type).toBe(PhaseType.Mayor);
  return state;
}

describe('MayorPhase — worker distribution', () => {
  it('distributes magistrate workers round-robin starting from selector', () => {
    const state = enterMayorPhase();
    // Governor=Alice (index 0) selects Mayor → selector=Alice
    // 3 workers from magistrate: Alice+1, Bob+1, Carol+1
    // Alice gets +1 privilege from pool
    expect(state.players[0]!.pendingWorkers).toBe(2); // 1 magistrate + 1 privilege
    expect(state.players[1]!.pendingWorkers).toBe(1);
    expect(state.players[2]!.pendingWorkers).toBe(1);
  });

  it('reduces workersInMagistrate to 0 on enter', () => {
    const state = enterMayorPhase();
    expect(state.supply.workersInMagistrate).toBe(0);
  });

  it('privilege worker taken from pool', () => {
    const state = createGame(3);
    const poolBefore = state.supply.workersPool;
    selectRole(state, RoleType.Mayor);
    expect(state.supply.workersPool).toBe(poolBefore - 1); // 1 taken for privilege
  });

  it('selector is the current player on phase start', () => {
    const state = enterMayorPhase();
    expect(state.getCurrentPlayer().id).toBe('player-0'); // Alice is selector
  });
});

describe('MayorPhase — PlaceWorkerAction', () => {
  it('places worker on plantation and decrements pendingWorkers', () => {
    const state = enterMayorPhase();
    // Alice has 2 pending workers; slot 0 is her starting indigo plantation
    applyOk(state, new PlaceWorkerAction('player-0', { kind: 'plantation', slotIndex: 0 }));
    expect(state.players[0]!.pendingWorkers).toBe(1);
    expect(state.players[0]!.island.getPlantationSlots()[0]!.occupiedWorkers).toBe(1);
  });

  it('does not advance current player until pendingWorkers=0', () => {
    const state = enterMayorPhase();
    // Alice has 2 pending — after placing 1, she still has 1, should stay current
    applyOk(state, new PlaceWorkerAction('player-0', { kind: 'plantation', slotIndex: 0 }));
    expect(state.getCurrentPlayer().id).toBe('player-0');
  });

  it('advances current player when pendingWorkers reaches 0', () => {
    const state = enterMayorPhase();
    // Bob has only 1 pending worker — after placing it, Bob should no longer be current
    applyOk(state, new MayorPassAction('player-0')); // Alice passes to get to Bob
    expect(state.getCurrentPlayer().id).toBe('player-1'); // Bob is now current
    applyOk(state, new PlaceWorkerAction('player-1', { kind: 'plantation', slotIndex: 0 }));
    expect(state.getCurrentPlayer().id).toBe('player-2'); // Moved to Carol
  });

  it('fails on invalid plantation index', () => {
    const state = enterMayorPhase();
    const result = state.apply(new PlaceWorkerAction('player-0', { kind: 'plantation', slotIndex: 99 }));
    expect(result.ok).toBe(false);
  });

  it('fails when plantation already has a worker', () => {
    const state = enterMayorPhase();
    applyOk(state, new PlaceWorkerAction('player-0', { kind: 'plantation', slotIndex: 0 }));
    // Slot 0 now occupied — trying again should fail
    const result = state.apply(new PlaceWorkerAction('player-0', { kind: 'plantation', slotIndex: 0 }));
    expect(result.ok).toBe(false);
  });
});

describe('MayorPhase — MayorPassAction', () => {
  it('returns all pending workers to pool', () => {
    const state = enterMayorPhase();
    const poolBefore = state.supply.workersPool;
    applyOk(state, new MayorPassAction('player-0')); // Alice passes 2 pending (no slots for 2nd)
    // Alice placed 0 workers (just passing all), so 2 returned to pool
    // Actually Alice still has her starting plantation free, so she could place 1 first.
    // This test passes ALL — so 2 returned to pool.
    expect(state.supply.workersPool).toBe(poolBefore + 2);
    expect(state.players[0]!.pendingWorkers).toBe(0);
  });

  it('advances to next player', () => {
    const state = enterMayorPhase();
    applyOk(state, new MayorPassAction('player-0'));
    expect(state.getCurrentPlayer().id).toBe('player-1');
  });
});

describe('MayorPhase — magistrate refill and phase end', () => {
  it('refills magistrate to (totalEmployed + 1) after all workers placed', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Mayor);
    // Drive all players to place/pass workers
    // Alice: place 1 on plantation, pass 1
    applyOk(state, new PlaceWorkerAction('player-0', { kind: 'plantation', slotIndex: 0 }));
    applyOk(state, new MayorPassAction('player-0'));
    // Bob: place 1 on plantation
    applyOk(state, new PlaceWorkerAction('player-1', { kind: 'plantation', slotIndex: 0 }));
    // Carol: place 1 on plantation
    applyOk(state, new PlaceWorkerAction('player-2', { kind: 'plantation', slotIndex: 0 }));
    // Phase should have ended and magistrate refilled
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
    // Total employed: Alice=1, Bob=1, Carol=1 = 3 → magistrate = 4
    expect(state.supply.workersInMagistrate).toBe(4);
  });

  it('transitions back to RoleSelection after all workers placed', () => {
    const state = createGame(3);
    selectRole(state, RoleType.Mayor);
    // All pass (fastest way to end phase)
    applyOk(state, new MayorPassAction('player-0'));
    applyOk(state, new MayorPassAction('player-1'));
    applyOk(state, new MayorPassAction('player-2'));
    expect(state.getCurrentPhase().type).toBe(PhaseType.RoleSelection);
  });
});
