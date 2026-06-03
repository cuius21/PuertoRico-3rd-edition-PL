import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GoodType } from '../../core/types';
import { IslandView } from './IslandView';
const GOOD_META = {
    [GoodType.Corn]: { label: 'Kukurydza', icon: '🌽', bg: '#FFF9C4', color: '#8B6914' },
    [GoodType.Indigo]: { label: 'Indygo', icon: '🔵', bg: '#4527A0', color: '#EDE7F6' },
    [GoodType.Sugar]: { label: 'Cukier', icon: '⬜', bg: '#EEEEEE', color: '#555' },
    [GoodType.Tobacco]: { label: 'Tytoń', icon: '🍂', bg: '#6D4C41', color: '#FFF8E1' },
    [GoodType.Coffee]: { label: 'Kawa', icon: '☕', bg: '#2C1810', color: '#FFF9F0' },
};
export function PlayerPanel({ player, setup, isActive, isGovernor, isSelector }) {
    const isBot = setup.type === 'bot';
    return (_jsxs("div", { className: [
            'player-panel',
            isActive ? 'player-panel--active' : '',
            isGovernor ? 'player-panel--governor' : '',
            isSelector ? 'player-panel--selector' : '',
        ].join(' '), children: [_jsxs("div", { className: "player-panel__header", children: [_jsxs("div", { className: "player-name-row", children: [isGovernor && _jsx("span", { className: "governor-crown", title: "Gubernator", children: "\uD83D\uDC51" }), _jsx("span", { className: "player-name", children: player.name }), isBot ? _jsx("span", { className: "player-type-badge", children: "\uD83E\uDD16" }) : _jsx("span", { className: "player-type-badge", children: "\uD83D\uDC64" }), isSelector && _jsx("span", { className: "selector-badge", title: "Wybiera posta\u0107", children: "\u2605" })] }), isGovernor && _jsx("div", { className: "governor-label", children: "Gubernator" })] }), _jsxs("div", { className: "player-stats", children: [_jsxs("span", { className: "stat", title: "Dublony", children: ["\uD83E\uDE99 ", _jsx("strong", { children: player.doubloons })] }), _jsxs("span", { className: "stat", title: "Punkty zwyci\u0119stwa", children: ["\u2B50 ", _jsx("strong", { children: player.victoryPointTokens })] }), player.pendingWorkers > 0 && (_jsxs("span", { className: "stat stat--pending", title: "Robotnicy do rozmieszczenia w tej fazie", children: ["\uD83D\uDC77 +", player.pendingWorkers] })), player.heldWorkers > 0 && (_jsxs("span", { className: "stat stat--held", title: "Robotnicy przetrzymani \u2014 dost\u0119pni w nast\u0119pnej fazie Burmistrza", children: ["\uD83D\uDC77 \u00D7", player.heldWorkers] }))] }), _jsxs("div", { className: "stored-goods", children: [Object.values(GoodType).map(good => {
                        const count = player.getStoredGoodCount(good);
                        if (count === 0)
                            return null;
                        const meta = GOOD_META[good];
                        return (_jsxs("span", { className: "good-badge", style: { background: meta.bg, color: meta.color }, title: meta.label, children: [meta.icon, " ", count] }, good));
                    }), player.getTotalStoredGoods() === 0 && (_jsx("span", { className: "no-goods", children: "brak towar\u00F3w" }))] }), _jsx(IslandView, { island: player.island })] }));
}
//# sourceMappingURL=PlayerPanel.js.map