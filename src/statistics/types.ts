export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Level = 'human' | 'easy' | 'hard' | 'ai' | 'hardcore' | 'neural';
export interface Participant { seat: number; kind: 'human' | 'bot'; selected: Level; effective: Level }
export interface ResultSeat extends Participant {
  total: number; vpTokens: number; buildingVP: number; largeBuildingBonus: number;
  nobleVP: number; doubloons: number; goods: number; rank: number;
}
export interface Change { path: (string | number)[]; value?: Json; remove?: true }
export interface Move {
  seq: number; seat: number; round: number; phase: string; label: string;
  action: Json; elapsedMs: number; build: string; changes: Change[];
}
export interface Recording {
  schema: 1; id: string; startedAt: string; build: string; botVersion: string;
  playerCount: number; players: Participant[]; expansions: Record<string, boolean>;
  excluded: boolean; historyComplete: boolean; historyReason: string;
  initial: Json; moves: Move[]; actionCount: number; historyBytes: number;
}
export interface MatchReport {
  schema: 1; id: string; startedAt: string; endedAt: string;
  build: string; endBuild: string; botVersion: string;
  playerCount: number; expansions: Record<string, boolean>;
  players: ResultSeat[]; rounds: number; actionCount: number; endReason: string[];
  history: { complete: boolean; reason: string; initial: Json; moves: Move[]; final: Json };
}
export interface Summary {
  games: number; humanWins: number; botWins: number; ties: number;
  firstGame: string | null; lastGame: string | null;
  levels: { level: Level; appearances: number; wins: number; outrightWins: number; averageScore: number }[];
  configurations: { playerCount: number; games: number }[];
}
export const LEVEL_LABELS: Record<Level, string> = {
  human: 'Człowiek', easy: 'Losowy', hard: 'Zachłanny', ai: 'AI (MCTS)', hardcore: 'Hardcore', neural: 'Neural',
};

