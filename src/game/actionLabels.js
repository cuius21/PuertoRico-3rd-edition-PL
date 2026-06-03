import { GoodType, RoleType } from '../../core/types';
const GOOD_LABELS = {
    [GoodType.Corn]: 'Kukurydza',
    [GoodType.Indigo]: 'Indygo',
    [GoodType.Sugar]: 'Cukier',
    [GoodType.Tobacco]: 'Tytoń',
    [GoodType.Coffee]: 'Kawa',
};
const ROLE_LABELS = {
    [RoleType.Settler]: 'Plantator',
    [RoleType.Mayor]: 'Burmistrz',
    [RoleType.Builder]: 'Budowniczy',
    [RoleType.Craftsman]: 'Zarządca',
    [RoleType.Trader]: 'Kupiec',
    [RoleType.Captain]: 'Kapitan',
    [RoleType.Prospector]: 'Poszukiwacz',
};
export function goodLabel(good) {
    return GOOD_LABELS[good];
}
export function roleLabel(role) {
    return ROLE_LABELS[role];
}
// Generuje etykietę przycisku akcji dla gracza (krótko, czytelnie).
export function describeAction(action, state) {
    const a = action;
    switch (a['type']) {
        case 'SELECT_ROLE':
            return `Wybierz: ${roleLabel(a['role'])}`;
        case 'TAKE_PLANTATION': {
            const choice = a['choice'];
            if (choice.kind === 'quarry')
                return 'Weź kamieniołom';
            const revealed = state.supply.revealedPlantations;
            const plantation = choice.index !== undefined ? revealed[choice.index] : undefined;
            return plantation ? `Weź: ${plantationLabel(plantation.type)}` : 'Weź plantację';
        }
        case 'BUILD': {
            const buildingId = a['buildingId'];
            const allBuildings = state.supply.availableBuildings;
            const building = allBuildings.find(b => b.id === buildingId);
            return building ? `Zbuduj: ${building.displayName}` : `Zbuduj: ${buildingId}`;
        }
        case 'PLACE_WORKER': {
            const target = a['target'];
            const playerId = a['playerId'];
            const player = state.getPlayer(playerId);
            if (target.kind === 'plantation') {
                const slots = player?.island.getPlantationSlots();
                const slot = target.slotIndex !== undefined ? (slots?.[target.slotIndex] ?? null) : null;
                const typeLabel = slot ? plantationLabel(slot.type) : `[${target.slotIndex}]`;
                return `Postaw: ${typeLabel}`;
            }
            if (target.buildingId) {
                const b = player?.island.getBuildings().find(b => b.id === target.buildingId);
                return `Postaw: ${b?.displayName ?? target.buildingId}`;
            }
            return 'Umieść robotnika';
        }
        case 'SELL_GOOD':
            return `Sprzedaj: ${goodLabel(a['good'])}`;
        case 'CRAFTSMAN_BONUS':
            return `Bonus: ${goodLabel(a['good'])}`;
        case 'LOAD_SHIP': {
            const target = a['target'];
            const good = goodLabel(a['good']);
            if (target.kind === 'wharf')
                return `Załaduj ${good} → Nabrzeże`;
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
function plantationLabel(type) {
    const map = {
        corn: 'Kukurydza',
        indigo: 'Indygo',
        sugar: 'Trzcina cukrowa',
        tobacco: 'Tytoń',
        coffee: 'Kawa',
        quarry: 'Kamieniołom',
    };
    return map[type] ?? type;
}
//# sourceMappingURL=actionLabels.js.map