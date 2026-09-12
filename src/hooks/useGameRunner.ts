import { MatchRecorder, STATS_ENABLED } from '../statistics/recorder';
import { enqueueMatch } from '../statistics/transport';
import { serializeGame } from '../game/GameSerializer';
import { useState, useEffect, useRef, useCallback } from 'react';
import { GameRunner, type PlayerSetup } from '../game/GameRunner';
import { describeAction } from '../game/actionLabels';
import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import type { ExpansionConfig } from '../components/SetupScreen';
import { BotWorkerClient } from '../bots/BotWorkerClient';
import { botDifficulty } from '../bots/createBot';

const BOT_DELAY_MS = 350;
const BOT_DELAY_MAYOR_MS = 120; // mayor phase is worker placement — near-instant even for MCTS
const ACTION_FEED_MS = 1100;
const HUMAN_FEED_MS = 750;

export interface ActionFeedItem {
  playerName: string;
  actionText: string;
  isBot: boolean;
}

export interface GamePresentation {
  blocked: boolean;
  observe: (action: Action, state: GameState, event: ActionFeedItem) => (state: GameState) => void;
}

export function useGameRunner(setups: PlayerSetup[], savedState?: GameState, expansions?: ExpansionConfig, presentation?: GamePresentation, practice = false) {
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  const presentationBlocked = presentation?.blocked ?? false;
  const runnerRef = useRef<GameRunner | null>(null);
  if (runnerRef.current === null) {
    runnerRef.current = new GameRunner(setups, savedState, expansions ?? { festival: false, corsair: false, newBuildings: false, nobleBuildings: false });
  }
  const runner = runnerRef.current;
  const recorderRef = useRef<MatchRecorder | null>(null);
  if (STATS_ENABLED && !recorderRef.current) {
    try {
      recorderRef.current = new MatchRecorder(runner.state, setups,
        { ...(expansions ?? { festival: false, corsair: false, newBuildings: false, nobleBuildings: false }) }, !!savedState, practice);
    } catch { /* Statistics must never prevent play. */ }
  }
  useEffect(() => {
    if (savedState && recorderRef.current) serializeGame(runner.state, runner.playerSetups);
  }, [runner, savedState]);
  const recordBefore = (action: Action, label: string) => {
    try { return recorderRef.current?.before(action, label); } catch { return undefined; }
  };
  const recordAfter = (move: ReturnType<typeof recordBefore>) => {
    try {
      const recorder = recorderRef.current;
      if (!recorder) return;
      if (move) recorder.after(move);
      else { recorder.data.historyComplete = false; recorder.data.historyReason = 'recording-error'; }
      const report = recorder.report();
      if (report) enqueueMatch(report);
    } catch {
      const data = recorderRef.current?.data;
      if (data) { data.historyComplete = false; data.historyReason = 'recording-error'; }
    }
  };

  const [tick, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick(t => t + 1), []);
  const workerRef = useRef<BotWorkerClient | null>(null);
  const [botError, setBotError] = useState<string | null>(null);

  // Round change tracking
  const prevRoundRef = useRef(runner.state.roundNumber);
  const [roundNotice, setRoundNotice] = useState<string | null>(null);

  // Action feed — shown briefly after every action
  const [actionFeed, setActionFeed] = useState<ActionFeedItem | null>(null);
  const feedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Round log — actions taken this round, newest first
  const [roundLog, setRoundLog] = useState<ActionFeedItem[]>([]);

  const showFeed = useCallback((item: ActionFeedItem, durationMs: number) => {
    if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
    setActionFeed(item);
    feedTimerRef.current = setTimeout(() => setActionFeed(null), durationMs);
  }, []);

  // Auto-execute bot turns
  useEffect(() => {
    if (runner.isGameOver() || runner.isCurrentPlayerHuman() || presentationBlocked) return;
    let cancelled = false;
    const isMayorPhase = runner.state.getCurrentPhase().type === 'mayor';
    const delay = isMayorPhase ? BOT_DELAY_MAYOR_MS : BOT_DELAY_MS;
    const timer = setTimeout(async () => {
      const setup = runner.getCurrentSetup();
      if (setup.type !== 'bot') return;
      try {
        const difficulty = botDifficulty(setup.bot);
        let action: Action | null;
        if (!isMayorPhase && (difficulty === 'ai' || difficulty === 'hardcore' || difficulty === 'neural') &&
            runner.getValidActionsForCurrentPlayer().length > 1) {
          workerRef.current ??= new BotWorkerClient();
          action = await workerRef.current.chooseAction(runner.state, difficulty);
        } else {
          action = runner.getBotAction();
        }
        if (cancelled) return;
        if (!action) throw new Error('No bot action available');
        const label = describeAction(action, runner.state);
        const entry: ActionFeedItem = { playerName: setup.name, actionText: label, isBot: true };
        const present = presentationRef.current?.observe(action, runner.state, entry);
        const recordedMove = recordBefore(action, label);
        if (!runner.applyAction(action, label)) throw new Error('Invalid bot action');
        recordAfter(recordedMove);
        present?.(runner.state);
        setBotError(null);
        showFeed(entry, isMayorPhase ? BOT_DELAY_MAYOR_MS : ACTION_FEED_MS);
        setRoundLog(prev => [entry, ...prev]);
        forceUpdate();
      } catch (error) {
        if (!cancelled) {
          console.error('Bot move failed', error);
          setBotError('Nie udało się obliczyć ruchu bota.');
        }
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      workerRef.current?.cancel();
    };
  }, [runner, tick, showFeed, forceUpdate, presentationBlocked]);

  useEffect(() => () => {
    if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
    workerRef.current?.dispose();
  }, []);

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

  const applyHumanAction = useCallback((action: Action) => {
    if (presentationRef.current?.blocked) return;
    const setup = runner.getCurrentSetup();
    const label = describeAction(action, runner.state);
    const entry: ActionFeedItem = { playerName: setup.name, actionText: label, isBot: false };
    const present = presentationRef.current?.observe(action, runner.state, entry);
    const recordedMove = recordBefore(action, label);
    const ok = runner.applyAction(action, label);
    if (ok) {
      recordAfter(recordedMove);
      present?.(runner.state);
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
    botError,
    retryBot: () => { setBotError(null); forceUpdate(); },
    isWaitingForBot: !runner.isGameOver() && !runner.isCurrentPlayerHuman(),
  };
}
