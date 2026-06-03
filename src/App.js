import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { GameScreen } from './components/GameScreen';
import { getSavedGame, deserializeGame } from './game/GameSerializer';
export function App() {
    const [session, setSession] = useState(null);
    if (!session) {
        return (_jsx(SetupScreen, { onStart: (setups) => setSession({ setups }), onLoad: () => {
                const save = getSavedGame();
                if (!save)
                    return;
                try {
                    const { state, setups } = deserializeGame(save);
                    setSession({ setups, savedState: state });
                }
                catch {
                    // corrupt save — ignore
                }
            } }));
    }
    const gameScreenProps = session.savedState
        ? { setups: session.setups, savedState: session.savedState, onReturnToMenu: () => setSession(null) }
        : { setups: session.setups, onReturnToMenu: () => setSession(null) };
    return _jsx(GameScreen, { ...gameScreenProps });
}
//# sourceMappingURL=App.js.map