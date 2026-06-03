import { Fragment, useState } from 'react';
import type { Building } from '../../domain/buildings/Building';
import type { GameState } from '../../state/GameState';
import { BuildingCategory, GoodType, PlantationType } from '../../core/types';
import { BUILDING_DESCRIPTIONS } from '../game/buildingDescriptions';

interface Props {
  state: GameState;
}

const GOOD_META: Record<GoodType, { label: string; icon: string; color: string; bg: string }> = {
  [GoodType.Corn]:    { label: 'Kukurydza', icon: '🌽', color: '#8B6914', bg: '#FFF9C4' },
  [GoodType.Indigo]:  { label: 'Indygo',   icon: '🔵', color: '#EDE7F6', bg: '#4527A0' },
  [GoodType.Sugar]:   { label: 'Cukier',   icon: '⬜', color: '#555',    bg: '#EEEEEE' },
  [GoodType.Tobacco]: { label: 'Tytoń',    icon: '🍂', color: '#FFF8E1', bg: '#6D4C41' },
  [GoodType.Coffee]:  { label: 'Kawa',     icon: '☕', color: '#FFF9F0', bg: '#2C1810' },
};

const PLANT_META: Record<PlantationType, { label: string; icon: string; bg: string; color: string }> = {
  [PlantationType.Corn]:    { label: 'Kukurydza',   icon: '🌽', bg: '#FFF9C4', color: '#8B6914' },
  [PlantationType.Indigo]:  { label: 'Indygo',      icon: '🔵', bg: '#4527A0', color: '#EDE7F6' },
  [PlantationType.Sugar]:   { label: 'Cukier',      icon: '⬜', bg: '#EEEEEE', color: '#555'    },
  [PlantationType.Tobacco]: { label: 'Tytoń',       icon: '🍂', bg: '#6D4C41', color: '#FFF8E1' },
  [PlantationType.Coffee]:  { label: 'Kawa',        icon: '☕', bg: '#2C1810', color: '#FFF9F0' },
  [PlantationType.Quarry]:  { label: 'Kamieniołom', icon: '🪨', bg: '#78909C', color: '#fff'    },
};

// Left-border accent color for production buildings, keyed by building id
const PROD_ACCENT: Record<string, { barColor: string; icon: string }> = {
  smallIndigoPlant: { barColor: '#7B1FA2', icon: '🔵' },
  largeIndigoPlant: { barColor: '#7B1FA2', icon: '🔵' },
  smallSugarMill:   { barColor: '#9E9E9E', icon: '⬜' },
  largeSugarMill:   { barColor: '#9E9E9E', icon: '⬜' },
  tobaccoStorage:   { barColor: '#795548', icon: '🍂' },
  coffeeRoaster:    { barColor: '#4E342E', icon: '☕' },
};

interface BuildingEntry { building: Building; count: number }

function dedupeAndSort(buildings: Building[]): BuildingEntry[] {
  const map = new Map<string, BuildingEntry>();
  for (const b of buildings) {
    const entry = map.get(b.id);
    if (entry) entry.count++;
    else map.set(b.id, { building: b, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.building.cost - b.building.cost);
}

export function SupplyPanel({ state }: Props) {
  const { supply } = state;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggle = (id: string) => setSelectedId(prev => prev === id ? null : id);

  const production = dedupeAndSort(
    supply.availableBuildings.filter(b => b.category === BuildingCategory.Production),
  );
  const utility = dedupeAndSort(
    supply.availableBuildings.filter(b => b.category !== BuildingCategory.Production),
  );

  const renderBuildingRow = ({ building, count }: BuildingEntry) => {
    const accent = PROD_ACCENT[building.id];
    const isOpen = selectedId === building.id;
    const isLarge = building.tileSize === 2;

    return (
      <Fragment key={building.id}>
        <button
          className={`avail-building ${isOpen ? 'avail-building--open' : ''} ${isLarge ? 'avail-building--large' : ''}`}
          style={accent ? { borderLeftColor: accent.barColor } : {}}
          onClick={() => toggle(building.id)}
        >
          <span className="avail-building__left">
            {accent && <span className="avail-building__prod-icon">{accent.icon}</span>}
            <span className="avail-building__name">{building.displayName}</span>
            {count > 1 && <span className="avail-building__count">×{count}</span>}
          </span>
          <span className="avail-building__right">
            <span className="avail-b-cost">🪙{building.cost}</span>
            <span className="avail-b-vp">⭐{building.victoryPoints}</span>
            <span className="avail-b-discount" title="Max zniżka z kamieniołomów">🪨-{building.priceGroup}</span>
          </span>
        </button>
        {isOpen && (
          <div className="building-inline-desc">
            <div className="building-inline-desc__stats">
              👷 {building.workerCapacity} {building.workerCapacity > 1 ? 'miejsca' : 'miejsce'} · 🪙 max -{building.priceGroup} z kamieniołomów
            </div>
            <p className="building-inline-desc__text">
              {BUILDING_DESCRIPTIONS[building.id] ?? 'Brak opisu.'}
            </p>
          </div>
        )}
      </Fragment>
    );
  };

  return (
    <div className="supply-panel">
      <h3 className="supply-title">Zasoby</h3>

      {/* Global supply numbers */}
      <div className="supply-row">
        <span className="supply-item" title="Dublony w banku">🪙 <strong>{supply.doubloonsInBank}</strong></span>
        <span className="supply-item" title="Żetony PZ">⭐ <strong>{supply.victoryPointPool}</strong></span>
      </div>
      <div className="supply-row supply-row--workers">
        <span
          className="supply-item"
          title="Robotnicy w ogólnej puli (z tej puli korzysta Przytułek, Uniwersytet i przywilej Burmistrza)"
        >
          👷 <strong>{supply.workersPool}</strong>
          <span className="supply-item__label"> pula</span>
        </span>
        <span
          className="supply-item supply-item--magistrate"
          title="Robotnicy w Magistracie — zarezerwowani na następną fazę Burmistrza (Przytułek NIE korzysta z tej puli)"
        >
          🏛️ <strong>{supply.workersInMagistrate}</strong>
          <span className="supply-item__label"> magistrat</span>
        </span>
      </div>

      {/* Revealed plantations */}
      <h4 className="supply-subtitle">Plantacje do wyboru</h4>
      <div className="revealed-plantations">
        {supply.revealedPlantations.map((p, i) => {
          const meta = PLANT_META[p.type];
          return (
            <div key={i} className="revealed-plant" style={{ background: meta.bg, color: meta.color }} title={meta.label}>
              {meta.icon}
            </div>
          );
        })}
        {supply.revealedPlantations.length === 0 && <span className="supply-empty">brak</span>}
        {supply.quarryStack.length > 0 && (
          <div
            className="revealed-plant"
            style={{ background: PLANT_META[PlantationType.Quarry].bg, color: PLANT_META[PlantationType.Quarry].color, fontSize: '0.65rem' }}
            title={`Kamieniołomy: ${supply.quarryStack.length} szt.`}
          >
            🪨×{supply.quarryStack.length}
          </div>
        )}
      </div>

      {/* Production buildings */}
      <h4 className="supply-subtitle supply-subtitle--section">🏭 Produkcja</h4>
      <div className="available-buildings">
        {production.length > 0 ? production.map(renderBuildingRow) : <span className="supply-empty">brak</span>}
      </div>

      {/* Utility buildings */}
      <h4 className="supply-subtitle supply-subtitle--section">⚙️ Użytkowe</h4>
      <div className="available-buildings">
        {utility.length > 0 ? utility.map(renderBuildingRow) : <span className="supply-empty">brak</span>}
      </div>

      {/* Goods in supply */}
      <h4 className="supply-subtitle">Towary w puli</h4>
      <div className="goods-supply">
        {(Object.values(GoodType) as GoodType[]).map(good => {
          const meta = GOOD_META[good];
          const count = supply.goodsPool.get(good) ?? 0;
          return (
            <div key={good} className="good-token" style={{ background: meta.bg, color: meta.color }} title={meta.label}>
              <span className="good-token__icon">{meta.icon}</span>
              <span className="good-token__count">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
