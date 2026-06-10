import { GameState } from './GameState';
import type { GamePhase } from './GamePhase';
import { FestivalBoard } from '../domain/FestivalBoard';
import type { FestivalUprawaQuest, FestivalProdukcjaQuest, FestivalBudowaQuest } from '../domain/FestivalBoard';
import { Player } from '../domain/Player';
import { Supply } from '../domain/Supply';
import { Ship } from '../domain/Ship';
import { TradingHouse } from '../domain/TradingHouse';
import { RoleCard } from '../domain/RoleCard';
import { Plantation } from '../domain/Plantation';
import { PlantationType, GoodType, RoleType } from '../core/types';
import {
  PLAYER_COUNT_CONFIG,
  PLANTATION_TOKEN_COUNTS,
  GOOD_TOKEN_COUNTS,
  QUARRY_TOKEN_COUNT,
} from '../core/constants';
import type { Building } from '../domain/buildings/Building';
import {
  SmallIndigoPlant, LargeIndigoPlant,
  SmallSugarMill, LargeSugarMill,
  TobaccoStorage, CoffeeRoaster,
} from '../domain/buildings/catalog/ProductionBuildings';
import {
  SmallMarket, Smithy, Hacienda, Hospice, SmallWarehouse, Office,
  LargeMarket, LargeWarehouse, Factory, University, Harbour, Wharf,
} from '../domain/buildings/catalog/SmallUtilityBuildings';
import {
  Fortress, GuildHall, CustomsHouse, CityHall, Residence,
} from '../domain/buildings/catalog/LargeBuildings';
import {
  Aqueduct, BlackMarket, Hut, Depot, Inn, TradingPost, Church, Marina,
  TransferStation, Lighthouse, Manufactory, Library, Monastery, Statue,
} from '../domain/buildings/catalog/NewBuildings1';
import {
  Chancellery, Chapel, HuntingLodge, MasonsGuild, Treasury, Villa, JewelersWorkshop, PalaceGarden,
} from '../domain/buildings/catalog/NewBuildings2';

// Ile sztuk każdego budynku trafia na planszę główną.
// Źródło: instrukcja Puerto Rico 3. edycji (Lacerta).
const BUILDING_COUNTS: [() => Building, number][] = [
  [() => new SmallIndigoPlant(), 4],
  [() => new SmallSugarMill(),   3],
  [() => new LargeIndigoPlant(), 3],
  [() => new LargeSugarMill(),   3],
  [() => new TobaccoStorage(),   3],
  [() => new CoffeeRoaster(),    3],
  [() => new SmallMarket(),      2],
  [() => new Smithy(),           2],
  [() => new Hacienda(),         2],
  [() => new Hospice(),          2],
  [() => new SmallWarehouse(),   2],
  [() => new Office(),           2],
  [() => new LargeMarket(),      2],
  [() => new LargeWarehouse(),   2],
  [() => new Factory(),          2],
  [() => new University(),       2],
  [() => new Harbour(),          2],
  [() => new Wharf(),            2],
  [() => new Fortress(),         1],
  [() => new GuildHall(),        1],
  [() => new CustomsHouse(),     1],
  [() => new CityHall(),         1],
  [() => new Residence(),        1],
];

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// Dobiera `count` plantacji z zakrytych stosów.
// Gdy stos się wyczerpie, tasuje odrzucone i tworzy nowy.
// Eksportowana, bo SettlerPhase użyje jej po każdej rundzie plantatora.
export function refillRevealedPlantations(supply: Supply, count: number): Plantation[] {
  const revealed: Plantation[] = [];
  let remaining = count;

  while (remaining > 0) {
    const deck = supply.plantationDecks.find(d => d.length > 0);
    if (!deck) {
      if (supply.discardedPlantations.length === 0) break;
      supply.plantationDecks.push(shuffle([...supply.discardedPlantations]));
      supply.discardedPlantations.length = 0;
      continue;
    }
    const take = Math.min(remaining, deck.length);
    revealed.push(...deck.splice(0, take));
    remaining -= take;
    if (deck.length === 0) {
      supply.plantationDecks.splice(supply.plantationDecks.indexOf(deck), 1);
    }
  }

  return revealed;
}

export class GameFactory {
  // Tworzy w pełni zainicjowany GameState gotowy do pierwszej rundy.
  // Wywołujący dostarcza initialPhase - po zaimplementowaniu faz będzie to RoleSelectionPhase.
  // Nowe budynki z Rozszerzenia I: każdy typ w 2 egzemplarzach (małe), duże po 1.
  static readonly NEW_BUILDING_COUNTS: [() => Building, number][] = [
    [() => new Aqueduct(),         2],
    [() => new BlackMarket(),      2],
    [() => new Hut(),              2],
    [() => new Depot(),            2],
    [() => new Inn(),              2],
    [() => new TradingPost(),      2],
    [() => new Church(),           2],
    [() => new Marina(),           2],
    [() => new TransferStation(),  2],
    [() => new Lighthouse(),       2],
    [() => new Manufactory(),      2],
    [() => new Library(),          2],
    [() => new Monastery(),        1],
    [() => new Statue(),           1],
  ];

  static readonly NOBLE_BUILDING_COUNTS: [() => Building, number][] = [
    [() => new Chancellery(),        2],
    [() => new Chapel(),             2],
    [() => new HuntingLodge(),       2],
    [() => new MasonsGuild(),        2],
    [() => new Treasury(),           2],
    [() => new Villa(),              2],
    [() => new JewelersWorkshop(),   2],
    [() => new PalaceGarden(),       1],
  ];

  static create(
    playerCount: 3 | 4 | 5,
    playerNames: readonly string[],
    initialPhase: GamePhase,
    expansions: { festival: boolean; corsair: boolean; newBuildings: boolean; nobleBuildings: boolean } = {
      festival: false, corsair: false, newBuildings: false, nobleBuildings: false,
    },
  ): GameState {
    if (playerNames.length !== playerCount) {
      throw new Error(`Oczekiwano ${playerCount} nazw graczy, otrzymano ${playerNames.length}`);
    }

    const config = PLAYER_COUNT_CONFIG[playerCount];

    // --- Gracze ---
    const players = Array.from(playerNames, (name, i) => new Player(`player-${i}`, name));

    // --- Zaopatrzenie ---
    const supply = new Supply();
    supply.doubloonsInBank = 150; // bank jest "nieograniczony" - zapas na całą grę
    supply.victoryPointPool = config.victoryPointPool;
    supply.workersPool = config.workersPool - config.magistrateInitialWorkers;
    supply.workersInMagistrate = config.magistrateInitialWorkers;

    // Żetony towarów
    for (const [good, count] of Object.entries(GOOD_TOKEN_COUNTS)) {
      supply.goodsPool.set(good as GoodType, count);
    }

    // Startowe dublony dla każdego gracza (wszyscy dostają tę samą kwotę)
    for (const player of players) {
      player.doubloons = supply.drawDoubloons(config.startingDoubloons);
    }

    // --- Startowe plantacje ---
    // Gracze 0...(indigoCount-1) dostają indygo, pozostali kukurydzę.
    // Podział wg zasad: 3 graczy → 2 indygo + 1 kukurydza;
    //                   4 graczy → 3 indygo + 1 kukurydza;
    //                   5 graczy → 3 indygo + 2 kukurydza.
    const indigoCount = playerCount === 5 ? 3 : playerCount - 1;
    const startUsed: Partial<Record<PlantationType, number>> = {
      [PlantationType.Indigo]: indigoCount,
      [PlantationType.Corn]: playerCount - indigoCount,
    };
    for (let i = 0; i < playerCount; i++) {
      const type = i < indigoCount ? PlantationType.Indigo : PlantationType.Corn;
      players[i]!.island.addPlantation(new Plantation(type));
    }

    // --- Talia plantacji ---
    // Tworzymy wszystkie żetony (minus startowe), tasujemy, dzielimy na stosy.
    const allPlantations: Plantation[] = [];
    for (const [typeStr, total] of Object.entries(PLANTATION_TOKEN_COUNTS)) {
      const type = typeStr as PlantationType;
      const used = startUsed[type] ?? 0;
      for (let i = 0; i < total - used; i++) {
        allPlantations.push(new Plantation(type));
      }
    }
    shuffle(allPlantations);

    const deckCount = config.plantationDeckCount;
    const deckSize = Math.ceil(allPlantations.length / deckCount);
    supply.plantationDecks = Array.from({ length: deckCount }, (_, i) =>
      allPlantations.slice(i * deckSize, (i + 1) * deckSize),
    ).filter(d => d.length > 0);

    // Odkryta pula na start
    supply.revealedPlantations = refillRevealedPlantations(supply, config.revealedPlantationCount);

    // Stos kamieniołomów (nie wchodzi do talii - osobny stos)
    supply.quarryStack = Array.from(
      { length: QUARRY_TOKEN_COUNT },
      () => new Plantation(PlantationType.Quarry),
    );

    // --- Dostępne budynki ---
    supply.availableBuildings = BUILDING_COUNTS.flatMap(([factory, count]) =>
      Array.from({ length: count }, factory),
    );

    if (expansions.newBuildings) {
      const newBuildingList = GameFactory.NEW_BUILDING_COUNTS.flatMap(([factory, count]) =>
        Array.from({ length: count }, factory),
      );
      supply.availableBuildings.push(...newBuildingList);
    }

    if (expansions.nobleBuildings) {
      const nobleBuildingList = GameFactory.NOBLE_BUILDING_COUNTS.flatMap(([factory, count]) =>
        Array.from({ length: count }, factory),
      );
      supply.availableBuildings.push(...nobleBuildingList);
      // 20 szlachciców w puli, 1 na start w Magistracie
      supply.noblesPool = 19;
      supply.noblesInMagistrate = 1;
    }

    // --- Statki ---
    const ships = [...config.shipCapacities].map(cap => new Ship(cap));

    // --- Targowisko ---
    const tradingHouse = new TradingHouse();

    // --- Karty postaci ---
    // 3 graczy: 6 kart (bez poszukiwacza)
    // 4 graczy: 7 kart (standardowe)
    // 5 graczy: 8 kart (dwa poszukiwacze)
    const roleTypes = [...config.roleCardTypes];
    if (playerCount === 3) {
      const idx = roleTypes.lastIndexOf(RoleType.Prospector);
      if (idx !== -1) roleTypes.splice(idx, 1);
    } else if (playerCount === 5) {
      roleTypes.push(RoleType.Prospector);
    }
    if (expansions.corsair) {
      roleTypes.push(RoleType.Corsair);
    }
    const roleCards = roleTypes.map(type => new RoleCard(type));

    const state = new GameState(players, supply, ships, tradingHouse, roleCards, initialPhase);

    if (expansions.festival) {
      state.festivalBoard = GameFactory.createFestivalBoard(supply);
    }

    if (expansions.nobleBuildings) {
      state.nobleExpansion = true;
    }

    return state;
  }

  private static createFestivalBoard(supply: Supply): FestivalBoard {
    const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

    // Uprawa: losowa plantacja (nie kamieniołom)
    const plantationTypes = [
      PlantationType.Corn, PlantationType.Indigo, PlantationType.Sugar,
      PlantationType.Tobacco, PlantationType.Coffee,
    ];
    const uprawa: FestivalUprawaQuest = {
      type: 'uprawa',
      plantationType: rand(plantationTypes),
      completedBy: null,
    };

    // Produkcja: 3 losowe znaczniki towaru (z powtórzeniami)
    const goodTypes = [GoodType.Corn, GoodType.Indigo, GoodType.Sugar, GoodType.Tobacco, GoodType.Coffee];
    const drawnGoods = [rand(goodTypes), rand(goodTypes), rand(goodTypes)];
    const requiredGoods: Partial<Record<GoodType, number>> = {};
    for (const g of drawnGoods) {
      requiredGoods[g] = (requiredGoods[g] ?? 0) + 1;
    }
    const produkcja: FestivalProdukcjaQuest = {
      type: 'produkcja',
      requiredGoods,
      completedBy: null,
    };

    // Budowa: losowy budynek grupy 3 (3 PZ) z puli dostępnych, z wyłączeniem
    // budynków produkcyjnych dla towarów w zadaniu produkcji
    const prodBuildingIds: Partial<Record<GoodType, string>> = {
      [GoodType.Indigo]:  'largeIndigoPlant',
      [GoodType.Sugar]:   'largeSugarMill',
      [GoodType.Tobacco]: 'tobaccoStorage',
      [GoodType.Coffee]:  'coffeeRoaster',
    };
    const excludedBuildingIds = new Set(
      Object.keys(requiredGoods).map(g => prodBuildingIds[g as GoodType]).filter(Boolean) as string[],
    );
    const group3Candidates = supply.availableBuildings.filter(
      b => b.victoryPoints === 3 && !excludedBuildingIds.has(b.id),
    );
    const budowaBuilding = rand(group3Candidates.length > 0 ? group3Candidates : supply.availableBuildings.filter(b => b.victoryPoints === 3));
    const budowa: FestivalBudowaQuest = {
      type: 'budowa',
      buildingId: budowaBuilding?.id ?? 'harbour',
      buildingDisplayName: budowaBuilding?.displayName ?? 'Port',
      completedBy: null,
    };

    return new FestivalBoard(uprawa, produkcja, budowa);
  }
}
