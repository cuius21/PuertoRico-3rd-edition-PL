import { GoodType, PlantationType, RoleType } from './types';
export declare const GOOD_PRICES: Readonly<Record<GoodType, number>>;
export declare const GOOD_TO_PLANTATION: Readonly<Record<GoodType, PlantationType>>;
export declare const ISLAND_RURAL_SLOTS = 12;
export declare const ISLAND_URBAN_SLOTS = 12;
export declare const TRADING_HOUSE_SLOTS = 4;
export declare const SHIP_COUNT = 3;
export declare const QUARRY_TOKEN_COUNT = 8;
export declare const PLANTATION_TOKEN_COUNTS: Readonly<Record<GoodType, number>>;
export declare const GOOD_TOKEN_COUNTS: Readonly<Record<GoodType, number>>;
export interface PlayerCountConfig {
    readonly startingDoubloons: number;
    readonly shipCapacities: readonly [number, number, number];
    readonly victoryPointPool: number;
    readonly workersPool: number;
    readonly magistrateInitialWorkers: number;
    readonly plantationDeckCount: number;
    readonly revealedPlantationCount: number;
    readonly roleCardTypes: readonly RoleType[];
}
export declare const PLAYER_COUNT_CONFIG: Readonly<Record<3 | 4 | 5, PlayerCountConfig>>;
//# sourceMappingURL=constants.d.ts.map