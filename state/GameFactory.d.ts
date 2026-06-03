import { GameState } from './GameState';
import type { GamePhase } from './GamePhase';
import { Supply } from '../domain/Supply';
import { Plantation } from '../domain/Plantation';
export declare function refillRevealedPlantations(supply: Supply, count: number): Plantation[];
export declare class GameFactory {
    static create(playerCount: 3 | 4 | 5, playerNames: readonly string[], initialPhase: GamePhase): GameState;
}
//# sourceMappingURL=GameFactory.d.ts.map