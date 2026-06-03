import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { RandomBot } from '../bots/RandomBot';
import { GreedyBot } from '../bots/GreedyBot';
import { getSavedGame } from '../game/GameSerializer';
const DEFAULT_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eve'];
function formatSaveDate(timestamp) {
    return new Date(timestamp).toLocaleString('pl', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
export function SetupScreen({ onStart, onLoad }) {
    const [playerCount, setPlayerCount] = useState(3);
    const [players, setPlayers] = useState(DEFAULT_NAMES.slice(0, 3).map((name, i) => ({
        name,
        type: i === 0 ? 'human' : 'bot',
        difficulty: 'hard',
    })));
    const savedGame = getSavedGame();
    function updateCount(n) {
        setPlayerCount(n);
        setPlayers(prev => {
            const next = [...prev];
            while (next.length < n) {
                next.push({
                    name: DEFAULT_NAMES[next.length] ?? `Gracz ${next.length + 1}`,
                    type: 'bot',
                    difficulty: 'hard',
                });
            }
            return next.slice(0, n);
        });
    }
    function updatePlayer(i, patch) {
        setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
    }
    function handleStart() {
        const setups = players.map(p => p.type === 'human'
            ? { type: 'human', name: p.name }
            : {
                type: 'bot',
                name: p.name,
                bot: p.difficulty === 'hard' ? new GreedyBot() : new RandomBot(),
            });
        onStart(setups);
    }
    return (_jsx("div", { className: "setup-screen", children: _jsxs("div", { className: "setup-card", children: [_jsx("h1", { className: "setup-title", children: "Puerto Rico" }), _jsx("p", { className: "setup-subtitle", children: "Nowa gra" }), _jsxs("div", { className: "setup-section", children: [_jsx("label", { className: "setup-label", children: "Liczba graczy" }), _jsx("div", { className: "player-count-buttons", children: [3, 4, 5].map(n => (_jsx("button", { className: `count-btn ${playerCount === n ? 'active' : ''}`, onClick: () => updateCount(n), children: n }, n))) })] }), _jsxs("div", { className: "setup-section", children: [_jsx("label", { className: "setup-label", children: "Gracze" }), _jsx("div", { className: "players-list", children: players.map((p, i) => (_jsxs("div", { className: "player-row", children: [_jsxs("span", { className: "player-number", children: [i + 1, "."] }), _jsx("input", { className: "player-name-input", value: p.name, onChange: e => updatePlayer(i, { name: e.target.value }), maxLength: 20 }), _jsxs("div", { className: "type-toggle", children: [_jsx("button", { className: `type-btn ${p.type === 'human' ? 'active' : ''}`, onClick: () => updatePlayer(i, { type: 'human' }), children: "\uD83D\uDC64 Cz\u0142owiek" }), _jsx("button", { className: `type-btn ${p.type === 'bot' ? 'active' : ''}`, onClick: () => updatePlayer(i, { type: 'bot' }), children: "\uD83E\uDD16 Bot" })] }), p.type === 'bot' && (_jsxs("div", { className: "diff-toggle", children: [_jsx("button", { className: `diff-btn ${p.difficulty === 'easy' ? 'diff-btn--active-easy' : ''}`, onClick: () => updatePlayer(i, { difficulty: 'easy' }), title: "Bot wybiera losowe legalne ruchy", children: "\uD83C\uDFB2 Losowy" }), _jsx("button", { className: `diff-btn ${p.difficulty === 'hard' ? 'diff-btn--active-hard' : ''}`, onClick: () => updatePlayer(i, { difficulty: 'hard' }), title: "Bot u\u017Cywa heurystyk do oceny ka\u017Cdego ruchu", children: "\uD83E\uDDE0 Inteligentny" })] }))] }, i))) })] }), _jsx("button", { className: "start-btn", onClick: handleStart, children: "Rozpocznij gr\u0119" }), savedGame && (_jsxs("button", { className: "load-btn", onClick: onLoad, children: [_jsx("span", { className: "load-btn__label", children: "Wczytaj zapisan\u0105 gr\u0119" }), _jsx("span", { className: "load-btn__date", children: formatSaveDate(savedGame.savedAt) })] }))] }) }));
}
//# sourceMappingURL=SetupScreen.js.map