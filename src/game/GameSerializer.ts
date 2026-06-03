import { GameState } from '../../state/GameState';
import { Player } from '../../domain/Player';
import { Island } from '../../domain/Island';
import { Plantation } from '../../domain/Plantation';
import { Supply } from '../../domain/Supply';
import { Ship } from '../../domain/Ship';
import { TradingHouse } from '../../domain/TradingHouse';
import { RoleCard } from '../../domain/RoleCard';
import { GoodType, PlantationType, RoleType } from '../../core/types';
import type { GamePhase } from '../../state/GamePhase';
import type { Building } from '../../domain/buildings/Building';
import type { PlayerSetup } from './GameRunner';
import { RandomBot } from '../bots/RandomBot';
import { GreedyBot } from '../bots/GreedyBot';

// Phase classes
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { SettlerPhase } from '../../state/phases/SettlerPhase';
import { MayorPhase } from '../../state/phases/MayorPhase';
import { BuilderPhase } from '../../state/phases/BuilderPhase';
import { CraftsmanPhase } from '../../state/phases/CraftsmanPhase';
import { TraderPhase } from '../../state/phases/TraderPhase';
import { CaptainPhase } from '../../state/phases/CaptainPhase';
import { ProspectorPhase } from '../../state/phases/ProspectorPhase';
import { RoundEndPhase } from '../../state/phases/RoundEndPhase';
import { GameOverPhase } from '../../state/phases/GameOverPhase';

// Building classes
import {
  SmallIndigoPlant, LargeIndigoPlant,
  SmallSugarMill, LargeSugarMill,
  TobaccoStorage, CoffeeRoaster,
} from '../../domain/buildings/catalog/ProductionBuildings';
import {
  SmallMarket, Smithy, Hacienda, Hospice, SmallWarehouse, Office,
  LargeMarket, LargeWarehouse, Factory, University, Harbour, Wharf,
} from '../../domain/buildings/catalog/SmallUtilityBuildings';
import {
  Fortress, GuildHall, CustomsHouse, CityHall, Residence,
} from '../../domain/buildings/catalog/LargeBuildings';

const STORAGE_KEY = 'puerto_rico_save';

// ── Save/load types ───────────────────────────────────────────────────────────

export interface SavedSetup {
  name: string;
  type: 'human' | 'bot';
  difficulty: 'easy' | 'hard';
}

type SavedPlantation = { type: string; workers: number };
// null = empty slot; { shared: true } = large building occupying 2nd slot (same instance as previous)
type SavedBuildingSlot = null | { id: string; workers: number; shared?: true };

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
  buildings: { id: string; workers: number }[];
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
    ships: { cap: number; good: string | null; count: number }[];
    tradingHouse: (string | null)[];
    roleCards: { type: string; doubloons: number; takenBy: string | null }[];
  };
}

// ── Building factory ──────────────────────────────────────────────────────────

const BUILDING_FACTORIES: Record<string, () => Building> = {
  smallIndigoPlant: () => new SmallIndigoPlant(),
  largeIndigoPlant: () => new LargeIndigoPlant(),
  smallSugarMill: () => new SmallSugarMill(),
  largeSugarMill: () => new LargeSugarMill(),
  tobaccoStorage: () => new TobaccoStorage(),
  coffeeRoaster: () => new CoffeeRoaster(),
  smallMarket: () => new SmallMarket(),
  smithy: () => new Smithy(),
  hacienda: () => new Hacienda(),
  hospice: () => new Hospice(),
  smallWarehouse: () => new SmallWarehouse(),
  office: () => new Office(),
  largeMarket: () => new LargeMarket(),
  largeWarehouse: () => new LargeWarehouse(),
  factory: () => new Factory(),
  university: () => new University(),
  harbour: () => new Harbour(),
  wharf: () => new Wharf(),
  fortress: () => new Fortress(),
  guildHall: () => new GuildHall(),
  customsHouse: () => new CustomsHouse(),
  cityHall: () => new CityHall(),
  residence: () => new Residence(),
};

function makeBuilding(id: string): Building | null {
  return BUILDING_FACTORIES[id]?.() ?? null;
}

// ── Phase factory ─────────────────────────────────────────────────────────────

function makePhase(type: string): GamePhase {
  switch (type) {
    case 'roleSelection': return new RoleSelectionPhase();
    case 'settler':       return new SettlerPhase();
    case 'mayor':         return new MayorPhase();
    case 'builder':       return new BuilderPhase();
    case 'craftsman':     return new CraftsmanPhase();
    case 'trader':        return new TraderPhase();
    case 'captain':       return new CaptainPhase();
    case 'prospector':    return new ProspectorPhase();
    case 'roundEnd':      return new RoundEndPhase();
    default:              return new GameOverPhase();
  }
}

// ── Serialization ─────────────────────────────────────────────────────────────

function savePlantation(p: Plantation): SavedPlantation {
  return { type: p.type, workers: p.occupiedWorkers };
}

function saveBuildingSlots(island: Island): SavedBuildingSlot[] {
  const raw = island.getBuildingSlots();
  const result: SavedBuildingSlot[] = [];
  for (let i = 0; i < raw.length; i++) {
    const slot = raw[i];
    if (!slot) { result.push(null); continue; }
    // Large building: same object reference appears in 2 consecutive slots
    if (i > 0 && raw[i - 1] === slot) {
      result.push({ id: slot.id, workers: slot.occupiedWorkers, shared: true });
    } else {
      result.push({ id: slot.id, workers: slot.occupiedWorkers });
    }
  }
  return result;
}

function savePlayer(p: Player): SavedPlayer {
  const goods: Record<string, number> = {};
  for (const [g, n] of p.storedGoods.entries()) goods[g] = n;
  return {
    id: p.id,
    name: p.name,
    doubloons: p.doubloons,
    vp: p.victoryPointTokens,
    goods,
    pending: p.pendingWorkers,
    held: p.heldWorkers,
    captainUsed: p.hasUsedCaptainBonusThisPhase,
    wharfUsed: p.hasUsedWharfThisPhase,
    plantations: p.island.getPlantationSlots().map(pl => pl ? savePlantation(pl) : null),
    buildingSlots: saveBuildingSlots(p.island),
  };
}

function saveSupply(s: Supply): SavedSupply {
  const goods: Record<string, number> = {};
  for (const [g, n] of s.goodsPool.entries()) goods[g] = n;
  return {
    doubloons: s.doubloonsInBank,
    vp: s.victoryPointPool,
    workers: s.workersPool,
    magistrate: s.workersInMagistrate,
    goods,
    decks: s.plantationDecks.map(deck => deck.map(savePlantation)),
    revealed: s.revealedPlantations.map(savePlantation),
    discarded: s.discardedPlantations.map(savePlantation),
    quarries: s.quarryStack.length,
    buildings: s.availableBuildings.map(b => ({ id: b.id, workers: b.occupiedWorkers })),
  };
}

function buildSaveGame(state: GameState, playerSetups: readonly PlayerSetup[]): SaveGame {
  return {
    version: 1,
    savedAt: Date.now(),
    setups: playerSetups.map(s => ({
      name: s.name,
      type: s.type,
      difficulty: s.type === 'bot'
        ? (s.bot.name === 'GreedyBot' ? 'hard' : 'easy')
        : 'easy',
    })),
    state: {
      governorIndex: state.governorIndex,
      roleSelectorIndex: state.roleSelectorIndex,
      currentPlayerIndex: state.currentPlayerIndex,
      roundNumber: state.roundNumber,
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      phaseType: state.getCurrentPhase().type,
      players: state.players.map(savePlayer),
      supply: saveSupply(state.supply),
      ships: state.ships.map(sh => ({
        cap: sh.capacity,
        good: sh.loadedGood,
        count: sh.loadedCount,
      })),
      tradingHouse: [...state.tradingHouse.getSlots()],
      roleCards: state.roleCards.map(c => ({
        type: c.type,
        doubloons: c.doubloonsOnCard,
        takenBy: c.takenBy,
      })),
    },
  };
}

// ── Deserialization ───────────────────────────────────────────────────────────

function restoreIsland(
  plantations: (SavedPlantation | null)[],
  buildingSlotData: SavedBuildingSlot[],
): Island {
  const island = new Island();

  // Restore plantations preserving slot positions
  const restoredPlantations: (Plantation | null)[] = plantations.map(pl => {
    if (!pl) return null;
    const p = new Plantation(pl.type as PlantationType);
    p.occupiedWorkers = pl.workers;
    return p;
  });
  island.restorePlantationSlots(restoredPlantations);

  // Restore building slots: track last created instance for large buildings
  let lastBuilding: Building | null = null;
  const restoredBuildings: (Building | null)[] = buildingSlotData.map(data => {
    if (!data) { lastBuilding = null; return null; }
    if (data.shared && lastBuilding) return lastBuilding;
    const b = makeBuilding(data.id);
    if (!b) { lastBuilding = null; return null; }
    b.occupiedWorkers = data.workers;
    lastBuilding = b;
    return b;
  });
  island.restoreBuildingSlots(restoredBuildings);

  return island;
}

function restorePlayer(p: SavedPlayer): Player {
  const island = restoreIsland(p.plantations, p.buildingSlots);
  const player = new Player(p.id, p.name, island);
  player.doubloons = p.doubloons;
  player.victoryPointTokens = p.vp;
  for (const [g, n] of Object.entries(p.goods)) {
    player.storedGoods.set(g as GoodType, n);
  }
  player.pendingWorkers = p.pending;
  player.heldWorkers = p.held ?? 0;
  player.hasUsedCaptainBonusThisPhase = p.captainUsed;
  player.hasUsedWharfThisPhase = p.wharfUsed;
  return player;
}

function restoreSupply(s: SavedSupply): Supply {
  const supply = new Supply();
  supply.doubloonsInBank = s.doubloons;
  supply.victoryPointPool = s.vp;
  supply.workersPool = s.workers;
  supply.workersInMagistrate = s.magistrate;
  for (const [g, n] of Object.entries(s.goods)) {
    supply.goodsPool.set(g as GoodType, n);
  }
  supply.plantationDecks = s.decks.map(deck =>
    deck.map(pl => {
      const p = new Plantation(pl.type as PlantationType);
      p.occupiedWorkers = pl.workers;
      return p;
    }),
  );
  supply.revealedPlantations = s.revealed.map(pl => {
    const p = new Plantation(pl.type as PlantationType);
    p.occupiedWorkers = pl.workers;
    return p;
  });
  supply.discardedPlantations = s.discarded.map(pl => {
    const p = new Plantation(pl.type as PlantationType);
    p.occupiedWorkers = pl.workers;
    return p;
  });
  supply.quarryStack = Array.from({ length: s.quarries }, () => new Plantation(PlantationType.Quarry));
  supply.availableBuildings = s.buildings.map(b => {
    const building = makeBuilding(b.id)!;
    building.occupiedWorkers = b.workers;
    return building;
  }).filter(Boolean);
  return supply;
}

function restoreGameState(s: SaveGame['state']): GameState {
  const players = s.players.map(restorePlayer);
  const supply = restoreSupply(s.supply);

  const ships = s.ships.map(sh => {
    const ship = new Ship(sh.cap);
    ship.loadedGood = sh.good as GoodType | null;
    ship.loadedCount = sh.count;
    return ship;
  });

  const tradingHouse = new TradingHouse();
  for (const good of s.tradingHouse) {
    if (good) tradingHouse.addGood(good as GoodType);
  }

  const roleCards = s.roleCards.map(c => {
    const card = new RoleCard(c.type as RoleType);
    card.doubloonsOnCard = c.doubloons;
    card.takenBy = c.takenBy;
    return card;
  });

  // Construct with no-op initial phase, then restore real phase without calling onEnter
  const state = new GameState(players, supply, ships, tradingHouse, roleCards, new GameOverPhase());
  state.governorIndex = s.governorIndex;
  state.roleSelectorIndex = s.roleSelectorIndex;
  state.currentPlayerIndex = s.currentPlayerIndex;
  state.roundNumber = s.roundNumber;
  state.gameOver = s.gameOver;
  state.gameOverReason = s.gameOverReason ?? '';
  state.restorePhase(makePhase(s.phaseType));
  return state;
}

function restoreSetups(setups: SavedSetup[]): PlayerSetup[] {
  return setups.map(s =>
    s.type === 'human'
      ? { type: 'human', name: s.name }
      : {
          type: 'bot',
          name: s.name,
          bot: s.difficulty === 'hard' ? new GreedyBot() : new RandomBot(),
        },
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function serializeGame(state: GameState, playerSetups: readonly PlayerSetup[]): void {
  try {
    const save = buildSaveGame(state, playerSetups);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // ignore storage errors (private mode, quota exceeded, etc.)
  }
}

export function getSavedGame(): SaveGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveGame;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedGame(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function deserializeGame(save: SaveGame): { state: GameState; setups: PlayerSetup[] } {
  const setups = restoreSetups(save.setups);
  const state = restoreGameState(save.state);
  return { state, setups };
}

export type { SaveGame };
