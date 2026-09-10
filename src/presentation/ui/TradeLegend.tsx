import { TRADE_PRICES } from '../adapter/tradePrices';
import { spriteStyle } from '../assets/registry';
import { GameValue } from './GameValue';

export function TradeLegend() {
  return (
    <section className="pr-trade-legend" aria-label="Bazowe ceny sprzedaży">
      <h3>
        Ceny sprzedaży <small>za 1 towar · przed premiami</small>
      </h3>
      <div>
        {TRADE_PRICES.map(({ good, name, coins }) => (
          <div key={good} className="pr-trade-price">
            <span
              className="pr-art"
              style={spriteStyle(good)}
              aria-hidden="true"
            />
            <strong>{name}</strong>
            <GameValue value={coins} />
          </div>
        ))}
      </div>
    </section>
  );
}
export function ShippingLegend() {
  return (
    <div className="pr-shipping-legend">
      <strong>
        <span aria-hidden="true">▧</span> 1 towar ={' '}
        <GameValue value={1} kind="star" />
      </strong>
      <span>
        1 miejsce mieści 1 towar. Podstawowa nagroda: 1 punkt zwycięstwa za
        każdy załadowany towar. Premie Kapitana i budynków doliczane są osobno.
      </span>
    </div>
  );
}
