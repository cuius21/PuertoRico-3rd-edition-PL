import { GameState } from './GameState';
import type { GamePhase } from './GamePhase';
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
  static create(
    playerCount: 3 | 4 | 5,
    playerNames: readonly string[],
    initialPhase: GamePhase,
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
    const roleCards = roleTypes.map(type => new RoleCard(type));

    return new GameState(players, supply, ships, tradingHouse, roleCards, initialPhase);
  }
}
