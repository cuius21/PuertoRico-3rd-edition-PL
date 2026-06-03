import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PlantationType } from '../../core/types';
const PLANT_META = {
    [PlantationType.Corn]: { label: 'Kukurydza', icon: '🌽', bg: '#FFF9C4', color: '#8B6914' },
    [PlantationType.Indigo]: { label: 'Indygo', icon: '🔵', bg: '#4527A0', color: '#EDE7F6' },
    [PlantationType.Sugar]: { label: 'Cukier', icon: '🤍', bg: '#EEEEEE', color: '#555' },
    [PlantationType.Tobacco]: { label: 'Tytoń', icon: '🍂', bg: '#6D4C41', color: '#FFF8E1' },
    [PlantationType.Coffee]: { label: 'Kawa', icon: '☕', bg: '#2C1810', color: '#FFF9F0' },
    [PlantationType.Quarry]: { label: 'Kamieniołom', icon: '🪨', bg: '#78909C', color: '#FFF' },
};
const BUILDING_META = {
    smallIndigoPlant: { icon: '🔵' },
    largeIndigoPlant: { icon: '🔷' },
    smallSugarMill: { icon: '🤍' },
    largeSugarMill: { icon: '⬛' },
    tobaccoStorage: { icon: '🍂' },
    coffeeRoaster: { icon: '☕' },
    smallMarket: { icon: '🛒' },
    smithy: { icon: '⚒️' },
    hacienda: { icon: '🌿' },
    hospice: { icon: '🏥' },
    smallWarehouse: { icon: '📦' },
    office: { icon: '📋' },
    largeMarket: { icon: '🏪' },
    largeWarehouse: { icon: '🏬' },
    factory: { icon: '⚙️' },
    university: { icon: '🎓' },
    harbour: { icon: '⚓' },
    wharf: { icon: '🚢' },
    fortress: { icon: '🏰' },
    guildHall: { icon: '⚜️' },
    customsHouse: { icon: '🔖' },
    cityHall: { icon: '🏛️' },
    residence: { icon: '🏡' },
};
export function IslandView({ island }) {
    const plantationSlots = island.getPlantationSlots();
    const buildingSlots = island.getBuildingSlots();
    const seenBuildings = new Set();
    return (_jsxs("div", { className: "island-view", children: [_jsxs("div", { className: "island-section", children: [_jsx("div", { className: "island-section-label", children: "Plantacje" }), _jsx("div", { className: "plantation-grid", children: plantationSlots.map((slot, i) => {
                            if (!slot) {
                                return _jsx("div", { className: "plantation-slot plantation-slot--empty" }, i);
                            }
                            const meta = PLANT_META[slot.type];
                            return (_jsxs("div", { className: `plantation-slot ${slot.isActive() ? 'plantation-slot--active' : ''}`, style: { background: meta.bg, color: meta.color }, title: `${meta.label}${slot.isActive() ? ' (aktywna)' : ''}`, children: [_jsx("span", { className: "slot-icon", children: meta.icon }), _jsx("span", { className: `slot-worker ${slot.occupiedWorkers > 0 ? 'slot-worker--filled' : 'slot-worker--empty'}`, children: "\uD83D\uDC77" })] }, i));
                        }) })] }), _jsxs("div", { className: "island-section", children: [_jsx("div", { className: "island-section-label", children: "Budynki" }), _jsx("div", { className: "building-grid", children: buildingSlots.map((building, i) => {
                            // Second slot of a large building — already rendered, skip
                            if (building && seenBuildings.has(building))
                                return null;
                            if (building)
                                seenBuildings.add(building);
                            if (!building) {
                                return _jsx("div", { className: "building-tile building-tile--empty" }, i);
                            }
                            const icon = BUILDING_META[building.id]?.icon ?? '🏗️';
                            const isLarge = building.tileSize === 2;
                            return (_jsxs("div", { className: [
                                    'building-tile',
                                    building.isActive() ? 'building-tile--active' : '',
                                    isLarge ? 'building-tile--large' : '',
                                ].join(' '), style: isLarge ? { gridColumn: 'span 2' } : {}, title: `${building.displayName} (${building.occupiedWorkers}/${building.workerCapacity} robotników)`, children: [_jsxs("div", { className: "building-tile__header", children: [_jsx("span", { className: "building-tile__icon", children: icon }), _jsx("span", { className: "building-tile__name", children: building.displayName })] }), _jsx("div", { className: "building-tile__workers", children: Array.from({ length: building.workerCapacity }, (_, j) => (_jsx("span", { className: `building-worker-icon ${j < building.occupiedWorkers ? 'building-worker-icon--filled' : 'building-worker-icon--empty'}`, children: "\uD83D\uDC77" }, j))) })] }, i));
                        }) })] })] }));
}
//# sourceMappingURL=IslandView.js.map