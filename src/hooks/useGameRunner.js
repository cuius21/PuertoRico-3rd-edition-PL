import { useState, useEffect, useRef, useCallback } from 'react';
import { GameRunner } from '../game/GameRunner';
import { describeAction } from '../game/actionLabels';
const BOT_DELAY_MS = 1300;
const BOT_DELAY_MAYOR_MS = 180;
const ACTION_FEED_MS = 1100;
const HUMAN_FEED_MS = 750;
export function useGameRunner(setups, savedState) {
    const runnerRef = useRef(null);
    if (runnerRef.current === null) {
        runnerRef.current = new GameRunner(setups, savedState);
    }
    const runner = runnerRef.current;
    const [tick, setTick] = useState(0);
    const forceUpdate = useCallback(() => setTick(t => t + 1), []);
    // Round change tracking
    const prevRoundRef = useRef(runner.state.roundNumber);
    const [roundNotice, setRoundNotice] = useState(null);
    // Action feed — shown briefly after every action
    const [actionFeed, setActionFeed] = useState(null);
    const feedTimerRef = useRef(null);
    // Round log — actions taken this round, newest first
    const [roundLog, setRoundLog] = useState([]);
    const showFeed = useCallback((item, durationMs) => {
        if (feedTimerRef.current)
            clearTimeout(feedTimerRef.current);
        setActionFeed(item);
        feedTimerRef.current = setTimeout(() => setActionFeed(null), durationMs);
    }, []);
    // Auto-execute bot turns
    useEffect(() => {
        if (runner.isGameOver() || runner.isCurrentPlayerHuman())
            return;
        const isMayorPhase = runner.state.getCurrentPhase().type === 'mayor';
        const delay = isMayorPhase ? BOT_DELAY_MAYOR_MS : BOT_DELAY_MS;
        const timer = setTimeout(() => {
            const setup = runner.getCurrentSetup();
            const action = runner.getBotAction();
            if (action) {
                const label = describeAction(action, runner.state);
                runner.applyAction(action, label);
                const entry = { playerName: setup.name, actionText: label, isBot: true };
                showFeed(entry, isMayorPhase ? BOT_DELAY_MAYOR_MS : ACTION_FEED_MS);
                setRoundLog(prev => [entry, ...prev]);
                forceUpdate();
            }
        }, delay);
        return () => clearTimeout(timer);
    });
    // Detect round change — clear log and show notice
    useEffect(() => {
        const currentRound = runner.state.roundNumber;
        if (currentRound !== prevRoundRef.current) {
            prevRoundRef.current = currentRound;
            setRoundLog([]);
            const governor = runner.state.getGovernor().name;
            setRoundNotice(`Koniec rundy ${currentRound} · Runda ${currentRound + 1} · Gubernator: ${governor}`);
            const t = setTimeout(() => setRoundNotice(null), 3500);
            return () => clearTimeout(t);
        }
    });
    const applyHumanAction = useCallback((action) => {
        const setup = runner.getCurrentSetup();
        const label = describeAction(action, runner.state);
        const ok = runner.applyAction(action, label);
        if (ok) {
            const entry = { playerName: setup.name, actionText: label, isBot: false };
            showFeed(entry, HUMAN_FEED_MS);
            setRoundLog(prev => [entry, ...prev]);
            forceUpdate();
        }
    }, [runner, forceUpdate, showFeed]);
    return {
        runner,
        state: runner.state,
        tick,
        applyHumanAction,
        roundNotice,
        actionFeed,
        roundLog,
        isWaitingForBot: !runner.isGameOver() && !runner.isCurrentPlayerHuman(),
    };
}
//# sourceMappingURL=useGameRunner.js.map