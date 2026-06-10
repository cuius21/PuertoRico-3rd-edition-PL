import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState } from '../../state/GameState';
import type { Action } from '../../actions/Action';
import type { GameEvent } from '../game/GameRunner';
import { deserializeGameState } from '../game/GameSerializer';
import type { SaveGame } from '../game/GameSerializer';
import type { ExpansionConfig } from '../components/SetupScreen';

export interface MultiplayerHook {
  gameState: GameState | null;
  playerNames: string[] | null;
  log: GameEvent[];
  error: string | null;
  connected: boolean;
  createGame: (playerNames: string[], expansions: ExpansionConfig) => void;
  sendAction: (action: Action) => void;
  resetGame: () => void;
  clearError: () => void;
}

export function useMultiplayerGame(): MultiplayerHook {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerNames, setPlayerNames] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [, forceUpdate] = useState(0);
  const logRef = useRef<GameEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); wsRef.current = null; };
    ws.onerror = () => setError('Nie można połączyć się z serwerem');

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(event.data) as typeof msg;
      } catch {
        return;
      }

      if (msg['type'] === 'sync') {
        const rawState = msg['state'] as SaveGame['state'] | null;
        if (rawState) {
          setGameState(deserializeGameState(rawState));
          setPlayerNames(msg['playerNames'] as string[]);
        } else {
          setGameState(null);
          setPlayerNames(null);
        }
        return;
      }

      if (msg['type'] === 'error') {
        setError(msg['message'] as string);
      }
    };

    return () => ws.close();
  }, []);

  const createGame = useCallback((pNames: string[], expansions: ExpansionConfig) => {
    wsRef.current?.send(JSON.stringify({ type: 'create', playerNames: pNames, expansions }));
  }, []);

  // Spreads class instance own properties into a plain serializable object
  const sendAction = useCallback((action: Action) => {
    wsRef.current?.send(JSON.stringify({ type: 'action', action: { ...action } }));
    // Optimistic log entry so the UI reacts immediately
    logRef.current.unshift({ playerName: '…', actionText: '…', isBot: false });
    forceUpdate(v => v + 1);
  }, []);

  const resetGame = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'reset' }));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { gameState, playerNames, log: logRef.current, error, connected, createGame, sendAction, resetGame, clearError };
}
