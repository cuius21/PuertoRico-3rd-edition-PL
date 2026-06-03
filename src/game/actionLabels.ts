import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import { GoodType, RoleType } from '../../core/types';

const GOOD_LABELS: Record<GoodType, string> = {
  [GoodType.Corn]: 'Kukurydza',
  [GoodType.Indigo]: 'Indygo',
  [GoodType.Sugar]: 'Cukier',
  [GoodType.Tobacco]: 'Tytoń',
  [GoodType.Coffee]: 'Kawa',
};

const ROLE_LABELS: Record<RoleType, string> = {
  [RoleType.Settler]: 'Plantator',
  [RoleType.Mayor]: 'Burmistrz',
  [RoleType.Builder]: 'Budowniczy',
  [RoleType.Craftsman]: 'Zarządca',
  [RoleType.Trader]: 'Kupiec',
  [RoleType.Captain]: 'Kapitan',
  [RoleType.Prospector]: 'Poszukiwacz',
};

export function goodLabel(good: GoodType): string {
  return GOOD_LABELS[good];
}

export function roleLabel(role: RoleType): string {
  return ROLE_LABELS[role];
}

// Generuje etykietę przycisku akcji dla gracza (krótko, czytelnie).
export function describeAction(action: Action, state: GameState): string {
  const a = action as unknown as Record<string, unknown>;

  switch (a['type']) {
    case 'SELECT_ROLE':
      return `Wybierz: ${roleLabel(a['role'] as RoleType)}`;

    case 'TAKE_PLANTATION': {
      const choice = a['choice'] as { kind: string; index?: number };
      if (choice.kind === 'quarry') return 'Weź kamieniołom';
      const revealed = state.supply.revealedPlantations;
      const plantation = choice.index !== undefined ? revealed[choice.index] : undefined;
      return plantation ? `Weź: ${plantationLabel(plantation.type as string)}` : 'Weź plantację';
    }

    case 'BUILD': {
      const buildingId = a['buildingId'] as string;
      const allBuildings = state.supply.availableBuildings;
      const building = allBuildings.find(b => b.id === buildingId);
      return building ? `Zbuduj: ${building.displayName}` : `Zbuduj: ${buildingId}`;
    }

    case 'PLACE_WORKER': {
      const target = a['target'] as { kind: string; slotIndex?: number; buildingId?: string };
      const playerId = a['playerId'] as string;
      const player = state.getPlayer(playerId);
      if (target.kind === 'plantation') {
        const slots = player?.island.getPlantationSlots();
        const slot = target.slotIndex !== undefined ? (slots?.[target.slotIndex] ?? null) : null;
        const typeLabel = slot ? plantationLabel(slot.type as string) : `[${target.slotIndex}]`;
        return `Postaw: ${typeLabel}`;
      }
      if (target.buildingId) {
        const b = player?.island.getBuildings().find(b => b.id === target.buildingId);
        return `Postaw: ${b?.displayName ?? target.buildingId}`;
      }
      return 'Umieść robotnika';
    }

    case 'SELL_GOOD':
      return `Sprzedaj: ${goodLabel(a['good'] as GoodType)}`;

    case 'CRAFTSMAN_BONUS':
      return `Bonus: ${goodLabel(a['good'] as GoodType)}`;

    case 'LOAD_SHIP': {
      const target = a['target'] as { kind: string; shipIndex?: number };
      const good = goodLabel(a['good'] as GoodType);
      if (target.kind === 'wharf') return `Załaduj ${good} → Nabrzeże`;
      return `Załaduj ${good} → Statek ${(target.shipIndex ?? 0) + 1}`;
    }

    case 'TAKE_DOUBLOON':
      return 'Weź dublon (Poszukiwacz)';

    case 'PASS':
      return 'Pasuj';

    case 'MAYOR_PASS':
      return 'Pasuj';

    default:
      return String(a['type'] ?? 'Akcja');
  }
}

function plantationLabel(type: string): string {
  const map: Record<string, string> = {
    corn: 'Kukurydza',
    indigo: 'Indygo',
    sugar: 'Trzcina cukrowa',
    tobacco: 'Tytoń',
    coffee: 'Kawa',
    quarry: 'Kamieniołom',
  };
  return map[type] ?? type;
}
