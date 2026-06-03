import type { Island } from '../../domain/Island';
import type { Building } from '../../domain/buildings/Building';
import { PlantationType } from '../../core/types';

interface Props {
  island: Island;
}

const PLANT_META: Record<PlantationType, { label: string; icon: string; bg: string; color: string }> = {
  [PlantationType.Corn]:    { label: 'Kukurydza',   icon: '🌽', bg: '#FFF9C4', color: '#8B6914' },
  [PlantationType.Indigo]:  { label: 'Indygo',      icon: '🔵', bg: '#4527A0', color: '#EDE7F6' },
  [PlantationType.Sugar]:   { label: 'Cukier',      icon: '🤍', bg: '#EEEEEE', color: '#555'    },
  [PlantationType.Tobacco]: { label: 'Tytoń',       icon: '🍂', bg: '#6D4C41', color: '#FFF8E1' },
  [PlantationType.Coffee]:  { label: 'Kawa',        icon: '☕', bg: '#2C1810', color: '#FFF9F0' },
  [PlantationType.Quarry]:  { label: 'Kamieniołom', icon: '🪨', bg: '#78909C', color: '#FFF'    },
};

const BUILDING_META: Record<string, { icon: string }> = {
  smallIndigoPlant: { icon: '🔵' },
  largeIndigoPlant: { icon: '🔷' },
  smallSugarMill:   { icon: '🤍' },
  largeSugarMill:   { icon: '⬛' },
  tobaccoStorage:   { icon: '🍂' },
  coffeeRoaster:    { icon: '☕' },
  smallMarket:      { icon: '🛒' },
  smithy:           { icon: '⚒️' },
  hacienda:         { icon: '🌿' },
  hospice:          { icon: '🏥' },
  smallWarehouse:   { icon: '📦' },
  office:           { icon: '📋' },
  largeMarket:      { icon: '🏪' },
  largeWarehouse:   { icon: '🏬' },
  factory:          { icon: '⚙️' },
  university:       { icon: '🎓' },
  harbour:          { icon: '⚓' },
  wharf:            { icon: '🚢' },
  fortress:         { icon: '🏰' },
  guildHall:        { icon: '⚜️' },
  customsHouse:     { icon: '🔖' },
  cityHall:         { icon: '🏛️' },
  residence:        { icon: '🏡' },
};

export function IslandView({ island }: Props) {
  const plantationSlots = island.getPlantationSlots();
  const buildingSlots = island.getBuildingSlots();

  const seenBuildings = new Set<Building>();

  return (
    <div className="island-view">
      {/* Plantations */}
      <div className="island-section">
        <div className="island-section-label">Plantacje</div>
        <div className="plantation-grid">
          {plantationSlots.map((slot, i) => {
            if (!slot) {
              return <div key={i} className="plantation-slot plantation-slot--empty" />;
            }
            const meta = PLANT_META[slot.type];
            return (
              <div
                key={i}
                className={`plantation-slot ${slot.isActive() ? 'plantation-slot--active' : ''}`}
                style={{ background: meta.bg, color: meta.color }}
                title={`${meta.label}${slot.isActive() ? ' (aktywna)' : ''}`}
              >
                <span className="slot-icon">{meta.icon}</span>
                <span className={`slot-worker ${slot.occupiedWorkers > 0 ? 'slot-worker--filled' : 'slot-worker--empty'}`}>👷</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Buildings — all 12 slots always visible */}
      <div className="island-section">
        <div className="island-section-label">Budynki</div>
        <div className="building-grid">
          {buildingSlots.map((building, i) => {
            // Second slot of a large building — already rendered, skip
            if (building && seenBuildings.has(building)) return null;
            if (building) seenBuildings.add(building);

            if (!building) {
              return <div key={i} className="building-tile building-tile--empty" />;
            }

            const icon = BUILDING_META[building.id]?.icon ?? '🏗️';
            const isLarge = building.tileSize === 2;
            return (
              <div
                key={i}
                className={[
                  'building-tile',
                  building.isActive() ? 'building-tile--active' : '',
                  isLarge ? 'building-tile--large' : '',
                ].join(' ')}
                style={isLarge ? { gridColumn: 'span 2' } : {}}
                title={`${building.displayName} (${building.occupiedWorkers}/${building.workerCapacity} robotników)`}
              >
                <div className="building-tile__header">
                  <span className="building-tile__icon">{icon}</span>
                  <span className="building-tile__name">{building.displayName}</span>
                </div>
                <div className="building-tile__workers">
                  {Array.from({ length: building.workerCapacity }, (_, j) => (
                    <span
                      key={j}
                      className={`building-worker-icon ${j < building.occupiedWorkers ? 'building-worker-icon--filled' : 'building-worker-icon--empty'}`}
                    >👷</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
