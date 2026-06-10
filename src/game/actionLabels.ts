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
  [RoleType.Corsair]: 'Korsarz',
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
    case 'SELECT_ROLE': {
      const role = a['role'] as RoleType;
      const cardIndex = a['cardIndex'] as number | null;
      const card = cardIndex !== null
        ? state.roleCards[cardIndex]
        : state.roleCards.find(c => c.type === role && c.isAvailable());
      const bonus = card && card.doubloonsOnCard > 0 ? ` (+${card.doubloonsOnCard}D)` : '';
      return `Wybierz: ${roleLabel(role)}${bonus}`;
    }

    case 'TAKE_PLANTATION': {
      const choice = a['choice'] as { kind: string; index?: number };
      const asForest = a['asForest'] as boolean | undefined;
      if (choice.kind === 'quarry') return 'Weź kamieniołom';
      const revealed = state.supply.revealedPlantations;
      const plantation = choice.index !== undefined ? revealed[choice.index] : undefined;
      const baseLabel = plantation ? plantationLabel(plantation.type as string) : 'Plantacja';
      return asForest ? `Weź: ${baseLabel} → Las` : `Weź: ${baseLabel}`;
    }

    case 'BUILD': {
      const buildingId = a['buildingId'] as string;
      const allBuildings = state.supply.availableBuildings;
      const building = allBuildings.find(b => b.id === buildingId);
      return building ? `Zbuduj: ${building.displayName}` : `Zbuduj: ${buildingId}`;
    }

    case 'PLACE_WORKER': {
      const target = a['target'] as { kind: string; slotIndex?: number; buildingId?: string };
      const asNoble = a['asNoble'] as boolean | undefined;
      const who = asNoble ? 'szlachcic' : 'robotnik';
      const playerId = a['playerId'] as string;
      const player = state.getPlayer(playerId);
      if (target.kind === 'plantation') {
        const slots = player?.island.getPlantationSlots();
        const slot = target.slotIndex !== undefined ? (slots?.[target.slotIndex] ?? null) : null;
        const typeLabel = slot ? plantationLabel(slot.type as string) : `[${target.slotIndex}]`;
        return `Postaw ${who}: ${typeLabel}`;
      }
      if (target.buildingId) {
        const b = player?.island.getBuildings().find(b => b.id === target.buildingId);
        return `Postaw ${who}: ${b?.displayName ?? target.buildingId}`;
      }
      return `Umieść ${who}`;
    }

    case 'BUY_PLANTATION_FROM_DECK': {
      const asForest = a['asForest'] as boolean | undefined;
      return asForest ? 'Kancelaria: kup plantację jako las (1 dbl)' : 'Kancelaria: kup plantację (1 dbl)';
    }

    case 'SELL_PLANTATION':
      return (a['earnsDublon'] as boolean)
        ? `Kancelaria: sprzedaj plantację (+1 dbl)`
        : `Domek myśliwski: usuń plantację`;

    case 'TREASURY': {
      const goods = a['goods'] as string[];
      return `Skarbiec: dostarcz ${goods.length} towar${goods.length > 1 ? 'y' : ''} (+${goods.length} PZ)`;
    }

    case 'SELL_GOOD': {
      const useFactoria = a['useFactoria'] as boolean | undefined;
      return useFactoria
        ? `Sprzedaj (Faktoria): ${goodLabel(a['good'] as GoodType)}`
        : `Sprzedaj: ${goodLabel(a['good'] as GoodType)}`;
    }

    case 'CRAFTSMAN_BONUS':
      return `Bonus: ${goodLabel(a['good'] as GoodType)}`;

    case 'LOAD_SHIP': {
      const target = a['target'] as { kind: string; shipIndex?: number };
      const good = goodLabel(a['good'] as GoodType);
      if (target.kind === 'wharf') return `Załaduj ${good} → Nabrzeże`;
      if (target.kind === 'marina') return `Załaduj ${good} → Przystań`;
      return `Załaduj ${good} → Statek ${(target.shipIndex ?? 0) + 1}`;
    }

    case 'SELECT_STORAGE': {
      const keepTypes = a['keepTypes'] as GoodType[];
      if (keepTypes.length === 0) return 'Magazyn: odrzuć wszystko';
      const labels = keepTypes.map(g => goodLabel(g));
      return `Magazyn: zachowaj ${labels.join(' + ')}`;
    }

    case 'TAKE_DOUBLOON':
      return 'Weź dublon (Poszukiwacz)';

    case 'CORSAIR_PIRACY':
      return `🏴‍☠️ Piractwo: Statek ${(a['shipIndex'] as number) + 1}`;

    case 'CORSAIR_PLUNDER':
      return '🏴‍☠️ Grabież: Targowisko';

    case 'CORSAIR_RAID':
      return '🏴‍☠️ Najazd: Magistrat';

    case 'CORSAIR_CAPTURE':
      return `🏴‍☠️ Pojmanie: ${roleLabel(a['captureRole'] as RoleType)}`;

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
