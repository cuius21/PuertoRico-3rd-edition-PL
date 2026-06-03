import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useState } from 'react';
import { BuildingCategory, GoodType, PlantationType } from '../../core/types';
import { BUILDING_DESCRIPTIONS } from '../game/buildingDescriptions';
const GOOD_META = {
    [GoodType.Corn]: { label: 'Kukurydza', icon: '🌽', color: '#8B6914', bg: '#FFF9C4' },
    [GoodType.Indigo]: { label: 'Indygo', icon: '🔵', color: '#EDE7F6', bg: '#4527A0' },
    [GoodType.Sugar]: { label: 'Cukier', icon: '⬜', color: '#555', bg: '#EEEEEE' },
    [GoodType.Tobacco]: { label: 'Tytoń', icon: '🍂', color: '#FFF8E1', bg: '#6D4C41' },
    [GoodType.Coffee]: { label: 'Kawa', icon: '☕', color: '#FFF9F0', bg: '#2C1810' },
};
const PLANT_META = {
    [PlantationType.Corn]: { label: 'Kukurydza', icon: '🌽', bg: '#FFF9C4', color: '#8B6914' },
    [PlantationType.Indigo]: { label: 'Indygo', icon: '🔵', bg: '#4527A0', color: '#EDE7F6' },
    [PlantationType.Sugar]: { label: 'Cukier', icon: '⬜', bg: '#EEEEEE', color: '#555' },
    [PlantationType.Tobacco]: { label: 'Tytoń', icon: '🍂', bg: '#6D4C41', color: '#FFF8E1' },
    [PlantationType.Coffee]: { label: 'Kawa', icon: '☕', bg: '#2C1810', color: '#FFF9F0' },
    [PlantationType.Quarry]: { label: 'Kamieniołom', icon: '🪨', bg: '#78909C', color: '#fff' },
};
// Left-border accent color for production buildings, keyed by building id
const PROD_ACCENT = {
    smallIndigoPlant: { barColor: '#7B1FA2', icon: '🔵' },
    largeIndigoPlant: { barColor: '#7B1FA2', icon: '🔵' },
    smallSugarMill: { barColor: '#9E9E9E', icon: '⬜' },
    largeSugarMill: { barColor: '#9E9E9E', icon: '⬜' },
    tobaccoStorage: { barColor: '#795548', icon: '🍂' },
    coffeeRoaster: { barColor: '#4E342E', icon: '☕' },
};
function dedupeAndSort(buildings) {
    const map = new Map();
    for (const b of buildings) {
        const entry = map.get(b.id);
        if (entry)
            entry.count++;
        else
            map.set(b.id, { building: b, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.building.cost - b.building.cost);
}
export function SupplyPanel({ state }) {
    const { supply } = state;
    const [selectedId, setSelectedId] = useState(null);
    const toggle = (id) => setSelectedId(prev => prev === id ? null : id);
    const production = dedupeAndSort(supply.availableBuildings.filter(b => b.category === BuildingCategory.Production));
    const utility = dedupeAndSort(supply.availableBuildings.filter(b => b.category !== BuildingCategory.Production));
    const renderBuildingRow = ({ building, count }) => {
        const accent = PROD_ACCENT[building.id];
        const isOpen = selectedId === building.id;
        const isLarge = building.tileSize === 2;
        return (_jsxs(Fragment, { children: [_jsxs("button", { className: `avail-building ${isOpen ? 'avail-building--open' : ''} ${isLarge ? 'avail-building--large' : ''}`, style: accent ? { borderLeftColor: accent.barColor } : {}, onClick: () => toggle(building.id), children: [_jsxs("span", { className: "avail-building__left", children: [accent && _jsx("span", { className: "avail-building__prod-icon", children: accent.icon }), _jsx("span", { className: "avail-building__name", children: building.displayName }), count > 1 && _jsxs("span", { className: "avail-building__count", children: ["\u00D7", count] })] }), _jsxs("span", { className: "avail-building__right", children: [_jsxs("span", { className: "avail-b-cost", children: ["\uD83E\uDE99", building.cost] }), _jsxs("span", { className: "avail-b-vp", children: ["\u2B50", building.victoryPoints] }), _jsxs("span", { className: "avail-b-discount", title: "Max zni\u017Cka z kamienio\u0142om\u00F3w", children: ["\uD83E\uDEA8-", building.priceGroup] })] })] }), isOpen && (_jsxs("div", { className: "building-inline-desc", children: [_jsxs("div", { className: "building-inline-desc__stats", children: ["\uD83D\uDC77 ", building.workerCapacity, " ", building.workerCapacity > 1 ? 'miejsca' : 'miejsce', " \u00B7 \uD83E\uDE99 max -", building.priceGroup, " z kamienio\u0142om\u00F3w"] }), _jsx("p", { className: "building-inline-desc__text", children: BUILDING_DESCRIPTIONS[building.id] ?? 'Brak opisu.' })] }))] }, building.id));
    };
    return (_jsxs("div", { className: "supply-panel", children: [_jsx("h3", { className: "supply-title", children: "Zasoby" }), _jsxs("div", { className: "supply-row", children: [_jsxs("span", { className: "supply-item", title: "Dublony w banku", children: ["\uD83E\uDE99 ", _jsx("strong", { children: supply.doubloonsInBank })] }), _jsxs("span", { className: "supply-item", title: "\u017Betony PZ", children: ["\u2B50 ", _jsx("strong", { children: supply.victoryPointPool })] })] }), _jsxs("div", { className: "supply-row supply-row--workers", children: [_jsxs("span", { className: "supply-item", title: "Robotnicy w og\u00F3lnej puli (z tej puli korzysta Przytu\u0142ek, Uniwersytet i przywilej Burmistrza)", children: ["\uD83D\uDC77 ", _jsx("strong", { children: supply.workersPool }), _jsx("span", { className: "supply-item__label", children: " pula" })] }), _jsxs("span", { className: "supply-item supply-item--magistrate", title: "Robotnicy w Magistracie \u2014 zarezerwowani na nast\u0119pn\u0105 faz\u0119 Burmistrza (Przytu\u0142ek NIE korzysta z tej puli)", children: ["\uD83C\uDFDB\uFE0F ", _jsx("strong", { children: supply.workersInMagistrate }), _jsx("span", { className: "supply-item__label", children: " magistrat" })] })] }), _jsx("h4", { className: "supply-subtitle", children: "Plantacje do wyboru" }), _jsxs("div", { className: "revealed-plantations", children: [supply.revealedPlantations.map((p, i) => {
                        const meta = PLANT_META[p.type];
                        return (_jsx("div", { className: "revealed-plant", style: { background: meta.bg, color: meta.color }, title: meta.label, children: meta.icon }, i));
                    }), supply.revealedPlantations.length === 0 && _jsx("span", { className: "supply-empty", children: "brak" }), supply.quarryStack.length > 0 && (_jsxs("div", { className: "revealed-plant", style: { background: PLANT_META[PlantationType.Quarry].bg, color: PLANT_META[PlantationType.Quarry].color, fontSize: '0.65rem' }, title: `Kamieniołomy: ${supply.quarryStack.length} szt.`, children: ["\uD83E\uDEA8\u00D7", supply.quarryStack.length] }))] }), _jsx("h4", { className: "supply-subtitle supply-subtitle--section", children: "\uD83C\uDFED Produkcja" }), _jsx("div", { className: "available-buildings", children: production.length > 0 ? production.map(renderBuildingRow) : _jsx("span", { className: "supply-empty", children: "brak" }) }), _jsx("h4", { className: "supply-subtitle supply-subtitle--section", children: "\u2699\uFE0F U\u017Cytkowe" }), _jsx("div", { className: "available-buildings", children: utility.length > 0 ? utility.map(renderBuildingRow) : _jsx("span", { className: "supply-empty", children: "brak" }) }), _jsx("h4", { className: "supply-subtitle", children: "Towary w puli" }), _jsx("div", { className: "goods-supply", children: Object.values(GoodType).map(good => {
                    const meta = GOOD_META[good];
                    const count = supply.goodsPool.get(good) ?? 0;
                    return (_jsxs("div", { className: "good-token", style: { background: meta.bg, color: meta.color }, title: meta.label, children: [_jsx("span", { className: "good-token__icon", children: meta.icon }), _jsx("span", { className: "good-token__count", children: count })] }, good));
                }) })] }));
}
//# sourceMappingURL=SupplyPanel.js.map