import type { GameState } from '../../state/GameState';
import type { Recording } from './types';

// Save files carry this envelope; the engine and LAN runner never depend on telemetry.
export const recordings = new WeakMap<GameState, Recording>();

