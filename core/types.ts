// Centralne enumy gry. Wartości stringowe wybrane tak, by GoodType i PlantationType
// pokrywały się dla rodzajów towarów - upraszcza to konwersje między nimi.

export enum GoodType {
  Corn = 'corn',
  Indigo = 'indigo',
  Sugar = 'sugar',
  Tobacco = 'tobacco',
  Coffee = 'coffee',
}

export enum PlantationType {
  Corn = 'corn',
  Indigo = 'indigo',
  Sugar = 'sugar',
  Tobacco = 'tobacco',
  Coffee = 'coffee',
  Quarry = 'quarry',
}

// Postacie wybierane przez graczy w każdej rundzie (MVP: bez Korsarza).
export enum RoleType {
  Settler = 'settler',       // Plantator
  Mayor = 'mayor',           // Burmistrz
  Builder = 'builder',       // Budowniczy
  Craftsman = 'craftsman',   // Zarządca
  Trader = 'trader',         // Kupiec
  Captain = 'captain',       // Kapitan
  Prospector = 'prospector', // Poszukiwacz
}

// Typ aktualnej fazy gry - używany przez GamePhase jako tag stanu.
export enum PhaseType {
  Setup = 'setup',
  RoleSelection = 'roleSelection',
  Settler = 'settler',
  Mayor = 'mayor',
  Builder = 'builder',
  Craftsman = 'craftsman',
  Trader = 'trader',
  Captain = 'captain',
  Prospector = 'prospector',
  RoundEnd = 'roundEnd',
  GameOver = 'gameOver',
}

// Kategoria budynku - rozróżnia jak zachowuje się na wyspie i podczas akcji.
export enum BuildingCategory {
  Production = 'production',
  SmallUtility = 'smallUtility',
  LargeUtility = 'largeUtility',
}

// Grupa cenowa budynku (1-4) - decyduje o maksymalnej zniżce od kamieniołomów.
export enum BuildingPriceGroup {
  Group1 = 1,
  Group2 = 2,
  Group3 = 3,
  Group4 = 4,
}

export type PlayerId = string;
