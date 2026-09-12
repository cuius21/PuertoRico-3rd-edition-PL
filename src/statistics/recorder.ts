import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import { ScoreCalculator } from '../../state/ScoreCalculator';
import type { PlayerSetup } from '../game/GameRunner';
import { serializeGameState } from '../game/GameSerializer';
import { botDifficulty } from '../bots/createBot';
import { supportsNeuralState } from '../bots/neural/features';
import { diff } from './delta';
import { recordings } from './store';
import type { Json, MatchReport, Move, Recording } from './types';

export const STATS_ENABLED = import.meta.env?.VITE_STATS_ENABLED === 'true';
const BUILD = import.meta.env?.VITE_GAME_BUILD ?? 'local';
const BOT_VERSION = import.meta.env?.VITE_BOT_VERSION ?? 'local';

export function snapshot(state: GameState): Json {
  const ids = new Map(state.players.map((p, i) => [p.id, 'seat-' + i]));
  // End-game messages can contain entered names. Store structured end reasons separately.
  return JSON.parse(JSON.stringify(serializeGameState(state), (key, value: unknown) => {
    if (key === 'name' || key === 'gameOverReason') return undefined;
    return typeof value === 'string' ? ids.get(value) ?? value : value;
  })) as Json;
}

const NEW_BUILDING_IDS = new Set(['aqueduct','blackMarket','hut','depot','inn','tradingPost','church','marina','transferStation','lighthouse','manufactory','library','monastery','statue']);
function actualExpansions(state: GameState): Record<string, boolean> {
  const buildings = [...state.supply.availableBuildings, ...state.players.flatMap(p => p.island.getBuildings())];
  return { festival: !!state.festivalBoard, corsair: state.roleCards.some(c => c.type === 'corsair'),
    newBuildings: buildings.some(b => NEW_BUILDING_IDS.has(b.id)), nobleBuildings: state.nobleExpansion };
}

export class MatchRecorder {
  readonly data: Recording;
  private previous: Json;
  constructor(readonly state: GameState, setups: readonly PlayerSetup[], expansions: Record<string, boolean>, resumed: boolean, excluded: boolean) {
    this.previous = snapshot(state);
    this.data = recordings.get(state) ?? {
      schema: 1, id: crypto.randomUUID(), startedAt: new Date().toISOString(),
      build: BUILD, botVersion: BOT_VERSION, playerCount: setups.length,
      players: setups.map((setup, seat) => {
        const selected = setup.type === 'human' ? 'human' : botDifficulty(setup.bot);
        return { seat, kind: setup.type, selected, effective: selected === 'neural' && !supportsNeuralState(state) ? 'hardcore' : selected };
      }),
      expansions: { ...expansions, ...actualExpansions(state) }, excluded, historyComplete: !resumed,
      historyReason: resumed ? 'old-save' : '', initial: this.previous, moves: [], actionCount: 0, historyBytes: 0,
    };
    if (excluded) this.data.excluded = true;
    recordings.set(state, this.data);
  }
  before(action: Action, label: string): Omit<Move, 'changes'> {
    const ids = new Map(this.state.players.map((p, i) => [p.id, 'seat-' + i]));
    return {
      seq: this.data.actionCount + 1, seat: this.state.currentPlayerIndex, round: this.state.roundNumber,
      phase: this.state.getCurrentPhase().type, label, build: BUILD,
      elapsedMs: Math.max(0, Date.now() - Date.parse(this.data.startedAt)),
      action: JSON.parse(JSON.stringify(action, (key, value: unknown) =>
        key === 'name' ? undefined : typeof value === 'string' ? ids.get(value) ?? value : value)) as Json,
    };
  }
  after(move: Omit<Move, 'changes'>): void {
    const next = snapshot(this.state);
    this.data.actionCount++;
    if (!['size-limit', 'storage-limit', 'recording-error'].includes(this.data.historyReason)) {
      const entry = { ...move, changes: diff(this.previous, next) };
      const bytes = new TextEncoder().encode(JSON.stringify(entry)).length;
      if (this.data.historyBytes + bytes < 850_000 && this.data.moves.length < 5000) {
        this.data.moves.push(entry);
        this.data.historyBytes += bytes;
      } else {
        this.data.historyComplete = false;
        this.data.historyReason = 'size-limit';
      }
    }
    this.previous = next;
  }
  report(): MatchReport | null {
    if (!this.state.gameOver || this.data.excluded) return null;
    const scores = ScoreCalculator.calculate(this.state);
    return {
      schema: 1, id: this.data.id, startedAt: this.data.startedAt, endedAt: new Date().toISOString(),
      build: this.data.build, endBuild: BUILD, botVersion: this.data.botVersion,
      playerCount: this.data.playerCount, expansions: this.data.expansions,
      players: this.data.players.map(player => {
        const score = scores.find(s => s.playerId === this.state.players[player.seat]!.id)!;
        const { playerId: _id, playerName: _name, ...result } = score;
        return { ...player, ...result };
      }),
      rounds: this.state.roundNumber, actionCount: this.data.actionCount,
      endReason: [
        ...(this.state.supply.victoryPointPool === 0 ? ['vp-depleted'] : []),
        ...(!this.state.nobleExpansion && this.state.supply.workersPool === 0 && this.state.supply.workersInMagistrate === 0 ? ['workers-depleted'] : []),
        ...(this.state.players.some(p => p.island.isCityFull()) ? ['city-full'] : []),
      ],
      history: { complete: this.data.historyComplete, reason: this.data.historyReason, initial: this.data.initial, moves: this.data.moves, final: snapshot(this.state) },
    };
  }
}

