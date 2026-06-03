import { GoodType, PlantationType, RoleType } from './types';

// --- Ceny towarów na Targowisku ---

export const GOOD_PRICES: Readonly<Record<GoodType, number>> = {
  [GoodType.Corn]: 0,
  [GoodType.Indigo]: 1,
  [GoodType.Sugar]: 2,
  [GoodType.Tobacco]: 3,
  [GoodType.Coffee]: 4,
};

// Mapowanie towaru na typ plantacji, która go produkuje.
export const GOOD_TO_PLANTATION: Readonly<Record<GoodType, PlantationType>> = {
  [GoodType.Corn]: PlantationType.Corn,
  [GoodType.Indigo]: PlantationType.Indigo,
  [GoodType.Sugar]: PlantationType.Sugar,
  [GoodType.Tobacco]: PlantationType.Tobacco,
  [GoodType.Coffee]: PlantationType.Coffee,
};

// --- Rozmiary plansz ---

export const ISLAND_RURAL_SLOTS = 12;
export const ISLAND_URBAN_SLOTS = 12;
export const TRADING_HOUSE_SLOTS = 4;
export const SHIP_COUNT = 3;

// --- Pule żetonów ---

export const QUARRY_TOKEN_COUNT = 8;

export const PLANTATION_TOKEN_COUNTS: Readonly<Record<GoodType, number>> = {
  [GoodType.Corn]: 10,
  [GoodType.Indigo]: 12,
  [GoodType.Sugar]: 11,
  [GoodType.Tobacco]: 9,
  [GoodType.Coffee]: 8,
};

// Liczba znaczników towarów dostępna w puli globalnej (do produkcji).
export const GOOD_TOKEN_COUNTS: Readonly<Record<GoodType, number>> = {
  [GoodType.Corn]: 10,
  [GoodType.Indigo]: 11,
  [GoodType.Sugar]: 11,
  [GoodType.Tobacco]: 9,
  [GoodType.Coffee]: 9,
};

// --- Konfiguracja zależna od liczby graczy ---

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

const STANDARD_ROLES: readonly RoleType[] = [
  RoleType.Settler,
  RoleType.Mayor,
  RoleType.Builder,
  RoleType.Craftsman,
  RoleType.Trader,
  RoleType.Captain,
  RoleType.Prospector,
];

export const PLAYER_COUNT_CONFIG: Readonly<Record<3 | 4 | 5, PlayerCountConfig>> = {
  3: {
    startingDoubloons: 2,
    shipCapacities: [4, 5, 6],
    victoryPointPool: 76,
    workersPool: 55,
    magistrateInitialWorkers: 3,
    plantationDeckCount: 4,
    revealedPlantationCount: 4,
    roleCardTypes: STANDARD_ROLES, // dla 3 graczy: 6 z 7 (jeden poszukiwacz usuwany w konfiguracji)
  },
  4: {
    startingDoubloons: 3,
    shipCapacities: [5, 6, 7],
    victoryPointPool: 101,
    workersPool: 75,
    magistrateInitialWorkers: 4,
    plantationDeckCount: 5,
    revealedPlantationCount: 5,
    roleCardTypes: STANDARD_ROLES,
  },
  5: {
    startingDoubloons: 4,
    shipCapacities: [6, 7, 8],
    victoryPointPool: 126,
    workersPool: 95,
    magistrateInitialWorkers: 5,
    plantationDeckCount: 6,
    revealedPlantationCount: 6,
    roleCardTypes: STANDARD_ROLES, // dla 5 graczy: wszystkie 8 kart (z dwoma poszukiwaczami) - obsłużymy w setup
  },
};
