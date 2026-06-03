import type { GameState } from '../../state/GameState';
import { GoodType } from '../../core/types';
import { GOOD_PRICES } from '../../core/constants';

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

export function ShipsTradingBar({ state }: Props) {
  const { ships, tradingHouse } = state;

  return (
    <div className="ships-trading-bar">
      {/* Ships */}
      <div className="stb-section-label">🚢 Statki</div>
      <div className="stb-ships">
        {ships.map((ship, i) => (
          <div key={i} className="stb-ship">
            <span className="stb-ship__label">×{ship.capacity}</span>
            <div className="stb-ship__slots">
              {Array.from({ length: ship.capacity }, (_, j) => {
                const filled = j < ship.loadedCount;
                const meta = filled && ship.loadedGood ? GOOD_META[ship.loadedGood] : null;
                return (
                  <div
                    key={j}
                    className={`stb-slot ${filled ? 'stb-slot--filled' : 'stb-slot--empty'}`}
                    style={meta ? { background: meta.bg, color: meta.color } : {}}
                    title={meta ? meta.label : 'pusty'}
                  >
                    {meta ? meta.icon : ''}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Trading house */}
      <div className="stb-section-label stb-section-label--trading">🏪 Targowisko</div>
      <div className="stb-trading__slots">
        {tradingHouse.getSlots().map((good, i) => {
          const meta = good ? GOOD_META[good] : null;
          return (
            <div
              key={i}
              className="stb-trading-slot"
              style={meta ? { background: meta.bg, color: meta.color } : {}}
              title={meta ? meta.label : 'pusty slot'}
            >
              {meta ? meta.icon : '–'}
            </div>
          );
        })}
      </div>

      {/* Price reference */}
      <div className="stb-prices">
        {(Object.values(GoodType) as GoodType[]).map(good => {
          const meta = GOOD_META[good];
          const price = GOOD_PRICES[good];
          return price > 0 ? (
            <span
              key={good}
              className="stb-price"
              style={{ background: meta.bg, color: meta.color }}
              title={`${meta.label}: ${price} dublon`}
            >
              {meta.icon}{price}🪙
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}
