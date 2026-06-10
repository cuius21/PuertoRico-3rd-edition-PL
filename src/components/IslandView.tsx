import type { ReactNode } from 'react';
import type { Island } from '../../domain/Island';
import type { Building } from '../../domain/buildings/Building';
import { PlantationType } from '../../core/types';

interface Props {
  island: Island;
}

const PLANT_META: Record<PlantationType, { label: string; icon: ReactNode; bg: string; color: string }> = {
  [PlantationType.Corn]:    { label: 'Kukurydza',   icon: '🌽', bg: '#FFF9C4', color: '#8B6914' },
  [PlantationType.Indigo]:  { label: 'Indygo',      icon: '🔵', bg: '#4527A0', color: '#EDE7F6' },
  [PlantationType.Sugar]:   { label: 'Cukier',      icon: <span className="icon-sugar" />, bg: '#EEEEEE', color: '#555' },
  [PlantationType.Tobacco]: { label: 'Tytoń',       icon: '🍂', bg: '#6D4C41', color: '#FFF8E1' },
  [PlantationType.Coffee]:  { label: 'Kawa',        icon: '☕', bg: '#2C1810', color: '#FFF9F0' },
  [PlantationType.Quarry]:  { label: 'Kamieniołom', icon: '🪨', bg: '#78909C', color: '#FFF'    },
};

const BUILDING_META: Record<string, { icon: ReactNode; bg?: string }> = {
  smallIndigoPlant: { icon: '🔵' },
  largeIndigoPlant: { icon: '🔷' },
  smallSugarMill:   { icon: <span className="icon-sugar" />, bg: '#F5F5F5' },
  largeSugarMill:   { icon: <span className="icon-sugar" />, bg: '#F5F5F5' },
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
                {slot.occupiedNobles > 0
                  ? <span className="slot-worker slot-worker--noble"><span className="token-noble" /></span>
                  : <span className={`slot-worker ${slot.occupiedWorkers > 0 ? 'slot-worker--filled' : 'slot-worker--empty'}`}>👷</span>
                }
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

            const meta = BUILDING_META[building.id];
            const icon: ReactNode = meta?.icon ?? '🏗️';
            const isLarge = building.tileSize === 2;
            return (
              <div
                key={i}
                className={[
                  'building-tile',
                  building.isActive() ? 'building-tile--active' : '',
                  isLarge ? 'building-tile--large' : '',
                ].join(' ')}
                style={{
                  ...(isLarge ? { gridColumn: 'span 2' } : {}),
                  ...(meta?.bg ? { background: meta.bg } : {}),
                }}
                title={`${building.displayName} (${building.occupiedWorkers}👷${building.occupiedNobles > 0 ? ` +${building.occupiedNobles}🔴` : ''} / ${building.workerCapacity})`}
              >
                <div className="building-tile__header">
                  <span className="building-tile__icon">{icon}</span>
                  <span className="building-tile__name">{building.displayName}</span>
                </div>
                <div className="building-tile__workers">
                  {Array.from({ length: building.workerCapacity }, (_, j) => {
                    const isWorker = j < building.occupiedWorkers;
                    const isNoble  = !isWorker && j < building.occupiedWorkers + building.occupiedNobles;
                    return isNoble
                      ? <span key={j} className="building-worker-icon building-worker-icon--noble"><span className="token-noble" /></span>
                      : <span key={j} className={`building-worker-icon ${isWorker ? 'building-worker-icon--filled' : 'building-worker-icon--empty'}`}>👷</span>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
