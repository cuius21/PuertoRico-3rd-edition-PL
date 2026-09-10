// Demonstracja rozgrywki Puerto Rico — 3 graczy, kilka rund aż do końca gry.
// Uruchom: npx tsx examples/demo.ts

import { GameFactory } from '../state/GameFactory';
import { RoleSelectionPhase } from '../state/phases/RoleSelectionPhase';
import { ScoreCalculator } from '../state/ScoreCalculator';
import { SelectRoleAction } from '../actions/SelectRoleAction';
import { TakePlantationAction } from '../actions/TakePlantationAction';
import { PassAction } from '../actions/PassAction';
import { PlaceWorkerAction } from '../actions/PlaceWorkerAction';
import { MayorPassAction } from '../actions/MayorPassAction';
import { BuildAction } from '../actions/BuildAction';
import type { Action } from '../actions/Action';
import { RoleType, PhaseType } from '../core/types';
import type { GameState } from '../state/GameState';

const state: GameState = GameFactory.create(
  3,
  ['Alice', 'Bob', 'Carol'],
  new RoleSelectionPhase(),
);

function apply(action: Action): void {
  const result = state.apply(action);
  if (!result.ok) throw new Error(`BŁĄD AKCJI: ${result.error}`);
}

function tryApply(action: Action): boolean {
  const result = state.apply(action);
  return result.ok;
}

function printState(): void {
  console.log(`\n--- Runda ${state.roundNumber} | Faza: ${state.getCurrentPhase().type} ---`);
  for (const p of state.players) {
    const goods: string[] = [];
    for (const [g, c] of p.storedGoods) {
      if (c > 0) goods.push(`${g}:${c}`);
    }
    const gov = state.players[state.governorIndex]!.id === p.id ? '(G)' : '   ';
    const workers = p.island.getTotalEmployedWorkers();
    console.log(
      `  ${gov} ${p.name}: ${p.doubloons}ψ PZ=${p.victoryPointTokens}` +
      ` workers=${workers}` +
      (goods.length ? ` [${goods.join(',')}]` : ''),
    );
  }
  console.log(`     Bank PZ: ${state.supply.victoryPointPool} | Magistrat: ${state.supply.workersInMagistrate}`);
}

// --- Pomocnik: umieść wszystkich oczekujących robotników ---
function placeAllPendingWorkers(): void {
  const playerIds = state.players.map(p => p.id);
  const startIdx = state.roleSelectorIndex;
  const ordered = [
    ...playerIds.slice(startIdx),
    ...playerIds.slice(0, startIdx),
  ];

  for (const pid of ordered) {
    const player = state.players.find(p => p.id === pid)!;
    const slots = player.island.getPlantationSlots();
    for (let i = 0; i < slots.length && player.pendingWorkers > 0; i++) {
      const s = slots[i];
      if (s && s.hasFreeWorkerSlot()) {
        tryApply(new PlaceWorkerAction(pid, { kind: 'plantation', slotIndex: i }));
      }
    }
    for (const b of player.island.getBuildings()) {
      if (b.hasFreeWorkerSlot() && player.pendingWorkers > 0) {
        tryApply(new PlaceWorkerAction(pid, { kind: 'building', buildingId: b.id }));
      }
    }
    if (player.pendingWorkers > 0) {
      tryApply(new MayorPassAction(pid));
    }
  }
}

// --- Pomocnik: pierwsza dostępna akcja (lub PassAction) ---
function autoAct(pid: string): boolean {
  const actions = state.getValidActions(pid);
  if (actions.length === 0) return false;
  const action = actions[0]!;
  apply(action);
  return true;
}

// --- Pomocnik: przesuń automatycznie przez fazę ---
function autoPlayPhase(): void {
  const phase = state.getCurrentPhase().type;
  if (phase === PhaseType.RoleSelection) return;

  if (phase === PhaseType.Mayor) {
    placeAllPendingWorkers();
    return;
  }

  // Dla wszystkich innych faz: każdy gracz gra auto (passAction jako domyślne)
  for (let round = 0; round < state.players.length + 1; round++) {
    if (state.getCurrentPhase().type !== phase) break;
    const pid = state.getCurrentPlayer().id;
    if (!autoAct(pid)) break;
  }
}

// ====================================================================
console.log('=== Puerto Rico — demo 3 graczy ===');
printState();

// Symulujemy kilka rund automatycznie
let maxRounds = 8;

while (!state.gameOver && state.roundNumber < maxRounds) {
  const phase = state.getCurrentPhase().type;

  if (phase === PhaseType.RoleSelection) {
    const pid = state.getCurrentPlayer().id;
    const available = state.getAvailableRoleCards();
    if (available.length === 0) break;

    // Preferencje zależą od numeru rundy i miejsca w kolejności wyboru.
    // Parzyste rundy: Mayor + Craftsman + Settler (produkcja + plantacje)
    // Nieparzyste rundy: Mayor + Builder + Captain (budynki + załadunek PZ)
    const takenCount = state.roleCards.filter(c => !c.isAvailable()).length;
    const isOddRound = state.roundNumber % 2 === 1;
    const preferencesBySlot: RoleType[][] = isOddRound ? [
      [RoleType.Mayor,     RoleType.Craftsman, RoleType.Settler, RoleType.Builder, RoleType.Trader],
      [RoleType.Builder,   RoleType.Craftsman, RoleType.Settler, RoleType.Trader,  RoleType.Captain],
      [RoleType.Captain,   RoleType.Trader,    RoleType.Builder, RoleType.Settler, RoleType.Craftsman],
    ] : [
      [RoleType.Mayor,     RoleType.Builder,   RoleType.Captain, RoleType.Settler, RoleType.Trader],
      [RoleType.Craftsman, RoleType.Builder,   RoleType.Settler, RoleType.Trader,  RoleType.Captain],
      [RoleType.Settler,   RoleType.Captain,   RoleType.Trader,  RoleType.Builder, RoleType.Craftsman],
    ];
    const prefs = preferencesBySlot[takenCount % 3] ?? preferencesBySlot[0]!;
    const role = prefs.find(r => available.some(c => c.type === r)) ?? available[0]!.type;
    apply(new SelectRoleAction(pid, role));

  } else if (phase === PhaseType.Mayor) {
    placeAllPendingWorkers();

  } else if (phase === PhaseType.Builder) {
    // Każdy gracz próbuje kupić najtańszy możliwy budynek
    const pid = state.getCurrentPlayer().id;
    const player = state.players.find(p => p.id === pid)!;
    let built = false;
    for (const b of state.supply.availableBuildings) {
      if (!player.island.hasBuildingOfType(b.id) &&
          player.island.getFreeUrbanSlotCount() >= b.tileSize &&
          player.doubloons >= b.cost) {
        if (tryApply(new BuildAction(pid, b.id))) {
          built = true;
          break;
        }
      }
    }
    if (!built) apply(new PassAction(pid));

  } else if (phase === PhaseType.Settler) {
    const pid = state.getCurrentPlayer().id;
    const player = state.players.find(p => p.id === pid)!;
    if (state.supply.revealedPlantations.length > 0 && player.island.hasFreeRuralSlot()) {
      tryApply(new TakePlantationAction(pid, { kind: 'revealed', index: 0 }));
    } else {
      apply(new PassAction(pid));
    }

  } else {
    // Wszystkie pozostałe fazy: auto (passAction gdy brak legalnych akcji)
    const pid = state.getCurrentPlayer().id;
    if (!autoAct(pid)) {
      // Faza utknęła - spasuj lub przerwij
      break;
    }
  }
}

printState();

// Końcowe wyniki
ScoreCalculator.printSummary(state);

// Szczegółowe zestawienie
const scores = ScoreCalculator.calculate(state);
console.log('\n=== SZCZEGÓŁY ===');
for (const s of scores) {
  console.log(`${s.playerName}: ${s.total} PZ (żetony=${s.vpTokens} budynki=${s.buildingVP} bonus=${s.largeBuildingBonus})`);
}
console.log(`\nRozegrano ${state.roundNumber} rund(y). Akcji w logu: ${state.actionLog.length}`);
