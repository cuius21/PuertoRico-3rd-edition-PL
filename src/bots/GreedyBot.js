import { GoodType, PlantationType, RoleType, BuildingCategory } from '../../core/types';
import { GOOD_PRICES, GOOD_TO_PLANTATION } from '../../core/constants';
// Reverse map: PlantationType → GoodType (corn excluded — no production building)
const PLANTATION_TO_GOOD = new Map(Object.entries(GOOD_TO_PLANTATION).map(([g, p]) => [p, g]));
function isProd(b) {
    return b.category === BuildingCategory.Production;
}
// Greedy bot that scores each legal action with hand-crafted heuristics and picks
// the best one. No lookahead — purely based on immediate game-state value.
export class GreedyBot {
    name = 'GreedyBot';
    chooseAction(state, playerId) {
        const actions = state.getValidActions(playerId);
        if (actions.length === 0)
            throw new Error('GreedyBot: no valid actions');
        let best = actions[0];
        let bestScore = -Infinity;
        for (const action of actions) {
            const s = this.score(action, state, playerId);
            if (s > bestScore) {
                bestScore = s;
                best = action;
            }
        }
        return best;
    }
    score(action, state, playerId) {
        const a = action;
        const player = state.getPlayer(playerId);
        const isSel = state.roleSelectorIndex === state.currentPlayerIndex;
        switch (a['type']) {
            case 'SELECT_ROLE': return this.scoreRole(a['role'], state, player, isSel);
            case 'TAKE_PLANTATION': return this.scorePlantation(a, state, player);
            case 'BUILD': return this.scoreBuilding(a['buildingId'], state, player, isSel);
            case 'PLACE_WORKER': return this.scorePlaceWorker(a, player);
            case 'SELL_GOOD': return GOOD_PRICES[a['good']] * 5 + (isSel ? 5 : 0);
            case 'CRAFTSMAN_BONUS': return GOOD_PRICES[a['good']] * 5;
            case 'LOAD_SHIP': return this.scoreLoad(a, player, isSel);
            case 'TAKE_DOUBLOON': return 5;
            case 'MAYOR_PASS':
            case 'PASS': return 1;
            default: return 0;
        }
    }
    // ── ROLE SELECTION ────────────────────────────────────────────────
    scoreRole(role, state, player, isSel) {
        switch (role) {
            case RoleType.Craftsman: {
                let produce = 0;
                for (const good of Object.values(GoodType)) {
                    produce += player.island.getProductionCapacity(good) * (GOOD_PRICES[good] + 1);
                }
                return produce > 0 ? 50 + Math.min(produce * 4, 40) : 8;
            }
            case RoleType.Trader: {
                if (state.tradingHouse.isFull())
                    return 5;
                let best = 0;
                for (const [good, cnt] of player.storedGoods.entries()) {
                    if (cnt > 0 && !state.tradingHouse.containsGood(good)) {
                        best = Math.max(best, GOOD_PRICES[good] + (isSel ? 1 : 0));
                    }
                }
                return best > 0 ? 48 + best * 5 : 6;
            }
            case RoleType.Captain: {
                let total = 0;
                for (const cnt of player.storedGoods.values())
                    total += cnt;
                return total > 0 ? 40 + total * 4 : 8;
            }
            case RoleType.Builder: {
                const disc = player.island.countActiveQuarries() + (isSel ? 1 : 0);
                const best = this.bestAffordable(state, player, disc);
                return best ? 32 + best.victoryPoints * 5 : 10;
            }
            case RoleType.Mayor: {
                const free = player.island.getFreeWorkerSlotsCount();
                return free > 0 ? 28 + free * 5 : 10;
            }
            case RoleType.Settler: {
                return 20 + this.plantNeed(player) * 4;
            }
            case RoleType.Prospector:
                return 7;
        }
    }
    // ── PLANTATION ────────────────────────────────────────────────────
    scorePlantation(a, state, player) {
        const choice = a['choice'];
        if (choice.kind === 'quarry') {
            const q = player.island.countActiveQuarries();
            return q < 3 ? 22 + (3 - q) * 6 : 8;
        }
        if (choice.index === undefined)
            return 0;
        const pl = state.supply.revealedPlantations[choice.index];
        if (!pl)
            return 0;
        return this.valuePlantation(pl.type, player);
    }
    valuePlantation(type, player) {
        if (type === PlantationType.Quarry)
            return 20;
        if (type === PlantationType.Corn)
            return 14;
        const good = PLANTATION_TO_GOOD.get(type);
        if (!good)
            return 8;
        const hasProd = player.island.getBuildings().some(b => isProd(b) && b.produces === good);
        return (hasProd ? 30 : 8) + GOOD_PRICES[good] * 3;
    }
    // ── BUILDING ──────────────────────────────────────────────────────
    scoreBuilding(id, state, player, isSel) {
        const b = state.supply.availableBuildings.find(x => x.id === id);
        if (!b)
            return 0;
        let score = b.victoryPoints * 7;
        if (isProd(b)) {
            const pType = GOOD_TO_PLANTATION[b.produces];
            const active = player.island.getPlantations().filter(p => p.type === pType && p.isActive()).length;
            const exist = player.island.getPlantations().filter(p => p.type === pType).length;
            score += active * GOOD_PRICES[b.produces] * 5;
            if (exist > 0)
                score += 8;
        }
        const disc = Math.min(player.island.countActiveQuarries() + (isSel ? 1 : 0), b.priceGroup);
        const afterCost = player.doubloons - (b.cost - disc);
        if (afterCost < 2)
            score -= 10;
        return score;
    }
    bestAffordable(state, player, disc) {
        return state.supply.availableBuildings
            .filter(b => (b.cost - Math.min(disc, b.priceGroup)) <= player.doubloons)
            .sort((a, b) => b.victoryPoints - a.victoryPoints)[0] ?? null;
    }
    // ── WORKER PLACEMENT ─────────────────────────────────────────────
    scorePlaceWorker(a, player) {
        const t = a['target'];
        if (t.kind === 'building' && t.buildingId) {
            const b = player.island.getBuildings().find(x => x.id === t.buildingId);
            if (!b)
                return 0;
            if (isProd(b))
                return 100 + GOOD_PRICES[b.produces] * 7;
            return 45;
        }
        if (t.kind === 'plantation' && t.slotIndex !== undefined) {
            const slot = player.island.getPlantationSlots()[t.slotIndex];
            if (!slot)
                return 0;
            if (slot.type === PlantationType.Quarry) {
                return player.island.countActiveQuarries() < 3 ? 68 : 18;
            }
            if (slot.type === PlantationType.Corn)
                return 52;
            const good = PLANTATION_TO_GOOD.get(slot.type);
            if (!good)
                return 18;
            const hasProd = player.island.getBuildings().some(b => isProd(b) && b.produces === good);
            return hasProd ? 88 + GOOD_PRICES[good] * 6 : 22 + GOOD_PRICES[good] * 2;
        }
        return 10;
    }
    // ── CAPTAIN ──────────────────────────────────────────────────────
    scoreLoad(a, player, isSel) {
        const cnt = player.storedGoods.get(a['good']) ?? 0;
        return 15 + cnt * 6 + (isSel ? 6 : 0);
    }
    // ── HELPERS ──────────────────────────────────────────────────────
    plantNeed(player) {
        const prodCount = player.island.getBuildings().filter(isProd).length;
        const matchedCount = player.island.getPlantations().filter(p => {
            const g = PLANTATION_TO_GOOD.get(p.type);
            return g !== undefined && player.island.getBuildings().some(b => isProd(b) && b.produces === g);
        }).length;
        return Math.max(0, prodCount - matchedCount);
    }
}
//# sourceMappingURL=GreedyBot.js.map