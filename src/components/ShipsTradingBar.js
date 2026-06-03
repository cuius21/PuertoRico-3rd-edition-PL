import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GoodType } from '../../core/types';
import { GOOD_PRICES } from '../../core/constants';
const GOOD_META = {
    [GoodType.Corn]: { label: 'Kukurydza', icon: '🌽', color: '#8B6914', bg: '#FFF9C4' },
    [GoodType.Indigo]: { label: 'Indygo', icon: '🔵', color: '#EDE7F6', bg: '#4527A0' },
    [GoodType.Sugar]: { label: 'Cukier', icon: '⬜', color: '#555', bg: '#EEEEEE' },
    [GoodType.Tobacco]: { label: 'Tytoń', icon: '🍂', color: '#FFF8E1', bg: '#6D4C41' },
    [GoodType.Coffee]: { label: 'Kawa', icon: '☕', color: '#FFF9F0', bg: '#2C1810' },
};
export function ShipsTradingBar({ state }) {
    const { ships, tradingHouse } = state;
    return (_jsxs("div", { className: "ships-trading-bar", children: [_jsx("div", { className: "stb-section-label", children: "\uD83D\uDEA2 Statki" }), _jsx("div", { className: "stb-ships", children: ships.map((ship, i) => (_jsxs("div", { className: "stb-ship", children: [_jsxs("span", { className: "stb-ship__label", children: ["\u00D7", ship.capacity] }), _jsx("div", { className: "stb-ship__slots", children: Array.from({ length: ship.capacity }, (_, j) => {
                                const filled = j < ship.loadedCount;
                                const meta = filled && ship.loadedGood ? GOOD_META[ship.loadedGood] : null;
                                return (_jsx("div", { className: `stb-slot ${filled ? 'stb-slot--filled' : 'stb-slot--empty'}`, style: meta ? { background: meta.bg, color: meta.color } : {}, title: meta ? meta.label : 'pusty', children: meta ? meta.icon : '' }, j));
                            }) })] }, i))) }), _jsx("div", { className: "stb-section-label stb-section-label--trading", children: "\uD83C\uDFEA Targowisko" }), _jsx("div", { className: "stb-trading__slots", children: tradingHouse.getSlots().map((good, i) => {
                    const meta = good ? GOOD_META[good] : null;
                    return (_jsx("div", { className: "stb-trading-slot", style: meta ? { background: meta.bg, color: meta.color } : {}, title: meta ? meta.label : 'pusty slot', children: meta ? meta.icon : '–' }, i));
                }) }), _jsx("div", { className: "stb-prices", children: Object.values(GoodType).map(good => {
                    const meta = GOOD_META[good];
                    const price = GOOD_PRICES[good];
                    return price > 0 ? (_jsxs("span", { className: "stb-price", style: { background: meta.bg, color: meta.color }, title: `${meta.label}: ${price} dublon`, children: [meta.icon, price, "\uD83E\uDE99"] }, good)) : null;
                }) })] }));
}
//# sourceMappingURL=ShipsTradingBar.js.map