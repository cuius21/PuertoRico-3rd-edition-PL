import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { describeAction } from '../game/actionLabels';
import { ShipsTradingBar } from './ShipsTradingBar';
export function ActionPanel({ runner, state, currentSetup, onAction, isWaitingForBot }) {
    const validActions = runner.getValidActionsForCurrentPlayer();
    const currentPlayer = state.getCurrentPlayer();
    return (_jsxs("div", { className: "action-panel", children: [_jsxs("div", { className: "action-panel__left", children: [_jsx("div", { className: "action-panel__who", children: isWaitingForBot ? (_jsxs("span", { className: "bot-thinking", children: ["\uD83E\uDD16 ", currentPlayer.name, " my\u015Bli\u2026"] })) : (_jsxs("span", { className: "human-turn", children: ["\uD83D\uDC64 ", currentPlayer.name, " \u2014 wybierz akcj\u0119:"] })) }), !isWaitingForBot && (_jsxs("div", { className: "action-buttons", children: [validActions.map((action, i) => {
                                const label = describeAction(action, state);
                                return (_jsx("button", { className: "action-btn", onClick: () => onAction(action), title: label, children: label }, i));
                            }), validActions.length === 0 && !state.gameOver && (_jsx("span", { className: "no-actions", children: "Brak dost\u0119pnych akcji\u2026" }))] }))] }), _jsx(ShipsTradingBar, { state: state }), _jsxs("div", { className: "action-panel__log", children: [_jsx("div", { className: "log-title", children: "Log akcji" }), _jsxs("div", { className: "log-entries", children: [runner.log.slice(0, 12).map((entry, i) => (_jsxs("div", { className: `log-entry ${entry.isBot ? 'log-entry--bot' : 'log-entry--human'}`, children: [_jsxs("span", { className: "log-player", children: [entry.playerName, ":"] }), _jsx("span", { className: "log-action", children: entry.actionText })] }, i))), runner.log.length === 0 && _jsx("span", { className: "log-empty", children: "Brak akcji" })] })] })] }));
}
//# sourceMappingURL=ActionPanel.js.map