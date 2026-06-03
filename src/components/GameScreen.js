import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useGameRunner } from '../hooks/useGameRunner';
import { serializeGame } from '../game/GameSerializer';
import { RoleCardsBar } from './RoleCardsBar';
import { SupplyPanel } from './SupplyPanel';
import { PlayerPanel } from './PlayerPanel';
import { ActionPanel } from './ActionPanel';
import { GameOverScreen } from './GameOverScreen';
import { RoundLogPanel } from './RoundLogPanel';
export function GameScreen({ setups, savedState, onReturnToMenu }) {
    const { runner, state, applyHumanAction, isWaitingForBot, roundNotice, actionFeed, roundLog } = useGameRunner(setups, savedState);
    const [saveFlash, setSaveFlash] = useState(false);
    function handleSave() {
        serializeGame(state, runner.playerSetups);
        setSaveFlash(true);
        setTimeout(() => setSaveFlash(false), 1800);
    }
    if (state.gameOver) {
        return _jsx(GameOverScreen, { state: state, runner: runner, onReturnToMenu: onReturnToMenu });
    }
    const currentPlayer = state.getCurrentPlayer();
    const currentSetup = runner.getCurrentSetup();
    return (_jsxs("div", { className: "game-screen", children: [roundNotice && (_jsx("div", { className: "round-notice", children: _jsx("span", { className: "round-notice__text", children: roundNotice }) })), _jsxs("header", { className: "game-header", children: [_jsx("h1", { className: "game-title", children: "Puerto Rico" }), _jsxs("div", { className: "game-meta", children: [_jsxs("span", { className: "round-info", children: ["Runda ", state.roundNumber + 1] }), _jsx("span", { className: "phase-info", children: phaseLabel(state.getCurrentPhase().type) }), _jsxs("span", { className: "governor-info", children: ["\uD83D\uDC51 ", state.getGovernor().name] }), _jsxs("span", { className: `current-player-info ${isWaitingForBot ? 'bot-turn' : ''}`, children: [isWaitingForBot ? '🤖 ' : '👤 ', currentPlayer.name, isWaitingForBot ? ' myśli…' : ' — Twoja tura'] })] }), _jsxs("div", { className: "header-actions", children: [saveFlash && _jsx("span", { className: "save-flash", children: "Zapisano!" }), _jsx("button", { className: "save-btn", onClick: handleSave, title: "Zapisz stan gry", children: "\uD83D\uDCBE Zapisz" }), _jsx("button", { className: "menu-btn", onClick: onReturnToMenu, children: "Menu" })] })] }), _jsx(RoleCardsBar, { state: state }), _jsxs("div", { className: "game-main", children: [actionFeed && (_jsxs("div", { className: "action-feed-overlay", style: { animationDuration: `${actionFeed.isBot ? 1100 : 750}ms` }, children: [_jsxs("div", { className: "action-feed__player", children: [actionFeed.isBot ? '🤖' : '👤', " ", actionFeed.playerName] }), _jsx("div", { className: "action-feed__action", children: actionFeed.actionText })] }, actionFeed.playerName + actionFeed.actionText)), _jsx("div", { className: "players-area", children: state.players.map((player, idx) => (_jsx(PlayerPanel, { player: player, setup: runner.getSetup(idx), isActive: state.currentPlayerIndex === idx, isGovernor: state.governorIndex === idx, isSelector: state.roleSelectorIndex === idx }, player.id))) }), _jsxs("div", { className: "game-right-column", children: [_jsx(RoundLogPanel, { log: roundLog, roundNumber: state.roundNumber }), _jsx(SupplyPanel, { state: state })] })] }), _jsx(ActionPanel, { runner: runner, state: state, currentSetup: currentSetup, onAction: applyHumanAction, isWaitingForBot: isWaitingForBot })] }));
}
function phaseLabel(type) {
    const map = {
        roleSelection: 'Wybór postaci',
        settler: 'Plantator',
        mayor: 'Burmistrz',
        builder: 'Budowniczy',
        craftsman: 'Zarządca',
        trader: 'Kupiec',
        captain: 'Kapitan',
        prospector: 'Poszukiwacz',
        roundEnd: 'Koniec rundy',
        gameOver: 'Koniec gry',
    };
    return map[type] ?? type;
}
//# sourceMappingURL=GameScreen.js.map