import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { networkInterfaces } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameFactory } from '../state/GameFactory';
import { RoleSelectionPhase } from '../state/phases/RoleSelectionPhase';
import { serializeGameState, deserializeGameState } from '../src/game/GameSerializer';
import { deserializeAction } from './ActionFactory';
import type { GameState } from '../state/GameState';
import type { SaveGame } from '../src/game/GameSerializer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 3001;
const DIST = join(__dirname, '../dist');

let gameState: GameState | null = null;
let playerNames: string[] | null = null;

const app = express();
app.use(express.json());

// Static assets (JS/CSS/images) — no index fallback so we control HTML serving
app.use(express.static(DIST, { index: false }));

// Mode detection endpoint (used by client before WebSocket connect)
app.get('/api/mode', (_req, res) => {
  res.json({ multiplayer: true, gameStarted: gameState !== null });
});

// Inject multiplayer meta tag into index.html for all HTML requests (SPA fallback)
app.get('*', (_req, res) => {
  try {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const patched = html.replace('</head>', '<meta name="app-mode" content="multiplayer"></head>');
    res.type('html').send(patched);
  } catch {
    res.status(503).send(
      'Najpierw zbuduj frontend:\n\n  npm run build:app\n\nPotem uruchom serwer ponownie.',
    );
  }
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const clients = new Set<WebSocket>();

function syncAll(): void {
  if (!gameState || !playerNames) {
    const msg = JSON.stringify({ type: 'sync', state: null, playerNames: null });
    for (const ws of clients) if (ws.readyState === 1) ws.send(msg);
    return;
  }
  const stateData: SaveGame['state'] = serializeGameState(gameState);
  const msg = JSON.stringify({ type: 'sync', state: stateData, playerNames });
  for (const ws of clients) if (ws.readyState === 1) ws.send(msg);
}

wss.on('connection', (ws) => {
  clients.add(ws);

  // Immediately send current state to new client
  if (gameState && playerNames) {
    const stateData: SaveGame['state'] = serializeGameState(gameState);
    ws.send(JSON.stringify({ type: 'sync', state: stateData, playerNames }));
  } else {
    ws.send(JSON.stringify({ type: 'sync', state: null, playerNames: null }));
  }

  ws.on('close', () => clients.delete(ws));

  ws.on('message', (data) => {
    let msg: { type: string; [key: string]: unknown };
    try {
      msg = JSON.parse(data.toString()) as typeof msg;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Nieprawidłowy JSON' }));
      return;
    }

    if (msg['type'] === 'create') {
      if (gameState) {
        ws.send(JSON.stringify({ type: 'error', message: 'Gra już jest uruchomiona. Odśwież stronę.' }));
        return;
      }
      const names = msg['playerNames'] as string[] | undefined;
      const expansions = (msg['expansions'] ?? {}) as {
        festival: boolean; corsair: boolean; newBuildings: boolean; nobleBuildings: boolean;
      };
      if (!names || names.length < 3 || names.length > 5) {
        ws.send(JSON.stringify({ type: 'error', message: 'Wymagane 3–5 graczy' }));
        return;
      }
      gameState = GameFactory.create(
        names.length as 3 | 4 | 5,
        names,
        new RoleSelectionPhase(),
        expansions,
      );
      playerNames = names;
      console.log(`[Gra] Nowa gra: ${names.join(', ')} | rozszerzenia:`, expansions);
      syncAll();
      return;
    }

    if (msg['type'] === 'action') {
      if (!gameState) {
        ws.send(JSON.stringify({ type: 'error', message: 'Brak aktywnej gry' }));
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const action = deserializeAction(msg['action'] as Record<string, any>);
      if (!action) {
        ws.send(JSON.stringify({ type: 'error', message: 'Nieznana akcja' }));
        return;
      }
      const result = gameState.apply(action);
      if (!result.ok) {
        ws.send(JSON.stringify({ type: 'error', message: result.error }));
        return;
      }
      syncAll();
      return;
    }

    if (msg['type'] === 'reset') {
      gameState = null;
      playerNames = null;
      syncAll();
      return;
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  const nets = networkInterfaces();
  const lanIPs: string[] = [];
  for (const iface of Object.values(nets)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) lanIPs.push(addr.address);
    }
  }

  console.log(`\n🌎  Puerto Rico — serwer nasłuchuje na porcie ${PORT}`);
  console.log(`   Lokalnie:  http://localhost:${PORT}`);
  if (lanIPs.length > 0) {
    for (const ip of lanIPs) {
      console.log(`   Sieć LAN:  http://${ip}:${PORT}  ← podaj ten adres znajomym`);
    }
  } else {
    console.log(`   Sieć LAN:  (nie wykryto interfejsu sieciowego)`);
  }
  console.log();
});
