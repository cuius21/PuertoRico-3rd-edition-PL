import { GameState } from '../../state/GameState';
import type { PlayerSetup } from './GameRunner';
export interface SavedSetup {
    name: string;
    type: 'human' | 'bot';
    difficulty: 'easy' | 'hard';
}
type SavedPlantation = {
    type: string;
    workers: number;
};
type SavedBuildingSlot = null | {
    id: string;
    workers: number;
    shared?: true;
};
interface SavedPlayer {
    id: string;
    name: string;
    doubloons: number;
    vp: number;
    goods: Record<string, number>;
    pending: number;
    held: number;
    captainUsed: boolean;
    wharfUsed: boolean;
    plantations: (SavedPlantation | null)[];
    buildingSlots: SavedBuildingSlot[];
}
interface SavedSupply {
    doubloons: number;
    vp: number;
    workers: number;
    magistrate: number;
    goods: Record<string, number>;
    decks: SavedPlantation[][];
    revealed: SavedPlantation[];
    discarded: SavedPlantation[];
    quarries: number;
    buildings: {
        id: string;
        workers: number;
    }[];
}
interface SaveGame {
    version: 1;
    savedAt: number;
    setups: SavedSetup[];
    state: {
        governorIndex: number;
        roleSelectorIndex: number;
        currentPlayerIndex: number;
        roundNumber: number;
        gameOver: boolean;
        gameOverReason: string;
        phaseType: string;
        players: SavedPlayer[];
        supply: SavedSupply;
        ships: {
            cap: number;
            good: string | null;
            count: number;
        }[];
        tradingHouse: (string | null)[];
        roleCards: {
            type: string;
            doubloons: number;
            takenBy: string | null;
        }[];
    };
}
export declare function serializeGame(state: GameState, playerSetups: readonly PlayerSetup[]): void;
export declare function getSavedGame(): SaveGame | null;
export declare function clearSavedGame(): void;
export declare function deserializeGame(save: SaveGame): {
    state: GameState;
    setups: PlayerSetup[];
};
export type { SaveGame };
//# sourceMappingURL=GameSerializer.d.ts.map