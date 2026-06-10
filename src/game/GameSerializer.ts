import { GameState } from '../../state/GameState';
import { FestivalBoard } from '../../domain/FestivalBoard';
import type { FestivalUprawaQuest, FestivalProdukcjaQuest, FestivalBudowaQuest } from '../../domain/FestivalBoard';
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
import { MctsBot } from '../bots/MctsBot';

// Phase classes
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import { SettlerPhase } from '../../state/phases/SettlerPhase';
import { MayorPhase } from '../../state/phases/MayorPhase';
import { BuilderPhase } from '../../state/phases/BuilderPhase';
import { CraftsmanPhase } from '../../state/phases/CraftsmanPhase';
import { TraderPhase } from '../../state/phases/TraderPhase';
import { CaptainPhase } from '../../state/phases/CaptainPhase';
import { ProspectorPhase } from '../../state/phases/ProspectorPhase';
import { CorsairPhase } from '../../state/phases/CorsairPhase';
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
import {
  Aqueduct, BlackMarket, Hut, Depot, Inn, TradingPost, Church, Marina,
  TransferStation, Lighthouse, Manufactory, Library, Monastery, Statue,
} from '../../domain/buildings/catalog/NewBuildings1';
import {
  Chancellery, Chapel, HuntingLodge, MasonsGuild, Treasury, Villa, JewelersWorkshop, PalaceGarden,
} from '../../domain/buildings/catalog/NewBuildings2';

const STORAGE_KEY = 'puerto_rico_save';

// ── Save/load types ───────────────────────────────────────────────────────────

export interface SavedSetup {
  name: string;
  type: 'human' | 'bot';
  difficulty: 'easy' | 'hard' | 'ai';
}

type SavedPlantation = { type: string; workers: number; nobles?: number; forest?: boolean };
// null = empty slot; { shared: true } = large building occupying 2nd slot (same instance as previous)
type SavedBuildingSlot = null | { id: string; workers: number; nobles?: number; shared?: true };

interface SavedPlayer {
  id: string;
  name: string;
  doubloons: number;
  vp: number;
  goods: Record<string, number>;
  pending: number;
  held: number;
  pendingNobles?: number;
  heldNobles?: number;
  captainUsed: boolean;
  wharfUsed: boolean;
  treasuryUsed?: boolean;
  marinaGoods?: number;
  factoriaUsed?: boolean;
  plantations: (SavedPlantation | null)[];
  buildingSlots: SavedBuildingSlot[];
}

interface SavedSupply {
  doubloons: number;
  vp: number;
  workers: number;
  magistrate: number;
  noblesPool?: number;
  noblesMagistrate?: number;
  goods: Record<string, number>;
  decks: SavedPlantation[][];
  revealed: SavedPlantation[];
  discarded: SavedPlantation[];
  quarries: number;
  buildings: { id: string; workers: number; nobles?: number }[];
}

interface SavedFestivalQuest {
  type: 'uprawa' | 'produkcja' | 'budowa';
  completedBy: string | null;
  plantationType?: string;
  requiredGoods?: Record<string, number>;
  buildingId?: string;
  buildingDisplayName?: string;
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
    festivalBoard: { uprawa: SavedFestivalQuest; produkcja: SavedFestivalQuest; budowa: SavedFestivalQuest } | null;
    corsairTokenHolderId: string | null;
    capturedRoleCard: string | null;
    nobleExpansion?: boolean;
    captainStoragePending?: boolean;
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
  // Rozszerzenie I
  aqueduct:        () => new Aqueduct(),
  blackMarket:     () => new BlackMarket(),
  hut:             () => new Hut(),
  depot:           () => new Depot(),
  inn:             () => new Inn(),
  tradingPost:     () => new TradingPost(),
  church:          () => new Church(),
  marina:          () => new Marina(),
  transferStation: () => new TransferStation(),
  lighthouse:      () => new Lighthouse(),
  manufactory:     () => new Manufactory(),
  library:         () => new Library(),
  monastery:       () => new Monastery(),
  statue:          () => new Statue(),
  // Rozszerzenie II
  chancellery:       () => new Chancellery(),
  chapel:            () => new Chapel(),
  huntingLodge:      () => new HuntingLodge(),
  masonsGuild:       () => new MasonsGuild(),
  treasury:          () => new Treasury(),
  villa:             () => new Villa(),
  jewelersWorkshop:  () => new JewelersWorkshop(),
  palaceGarden:      () => new PalaceGarden(),
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
    case 'corsair':       return new CorsairPhase();
    case 'roundEnd':      return new RoundEndPhase();
    default:              return new GameOverPhase();
  }
}

// ── Serialization ─────────────────────────────────────────────────────────────

function savePlantation(p: Plantation): SavedPlantation {
  const saved: SavedPlantation = { type: p.type, workers: p.occupiedWorkers };
  if (p.occupiedNobles) saved.nobles = p.occupiedNobles;
  if (p.isForest) saved.forest = true;
  return saved;
}

function saveBuildingSlots(island: Island): SavedBuildingSlot[] {
  const raw = island.getBuildingSlots();
  const result: SavedBuildingSlot[] = [];
  for (let i = 0; i < raw.length; i++) {
    const slot = raw[i];
    if (!slot) { result.push(null); continue; }
    // Large building: same object reference appears in 2 consecutive slots
    if (i > 0 && raw[i - 1] === slot) {
      const entry: SavedBuildingSlot = { id: slot.id, workers: slot.occupiedWorkers, shared: true };
      if (slot.occupiedNobles) (entry as { id: string; workers: number; nobles?: number; shared?: true }).nobles = slot.occupiedNobles;
      result.push(entry);
    } else {
      const entry: SavedBuildingSlot = { id: slot.id, workers: slot.occupiedWorkers };
      if (slot.occupiedNobles) (entry as { id: string; workers: number; nobles?: number }).nobles = slot.occupiedNobles;
      result.push(entry);
    }
  }
  return result;
}

function savePlayer(p: Player): SavedPlayer {
  const goods: Record<string, number> = {};
  for (const [g, n] of p.storedGoods.entries()) goods[g] = n;
  const savedP: SavedPlayer = {
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
  if (p.pendingNobles) savedP.pendingNobles = p.pendingNobles;
  if (p.heldNobles) savedP.heldNobles = p.heldNobles;
  if (p.marinaGoodsLoaded) savedP.marinaGoods = p.marinaGoodsLoaded;
  if (p.hasUsedFactoriaThisPhase) savedP.factoriaUsed = true;
  if (p.hasUsedTreasuryThisPhase) savedP.treasuryUsed = true;
  return savedP;
}

function saveSupply(s: Supply): SavedSupply {
  const goods: Record<string, number> = {};
  for (const [g, n] of s.goodsPool.entries()) goods[g] = n;
  const saved: SavedSupply = {
    doubloons: s.doubloonsInBank,
    vp: s.victoryPointPool,
    workers: s.workersPool,
    magistrate: s.workersInMagistrate,
    goods,
    decks: s.plantationDecks.map(deck => deck.map(savePlantation)),
    revealed: s.revealedPlantations.map(savePlantation),
    discarded: s.discardedPlantations.map(savePlantation),
    quarries: s.quarryStack.length,
    buildings: s.availableBuildings.map(b => {
      const entry: { id: string; workers: number; nobles?: number } = { id: b.id, workers: b.occupiedWorkers };
      if (b.occupiedNobles) entry.nobles = b.occupiedNobles;
      return entry;
    }),
  };
  if (s.noblesPool) saved.noblesPool = s.noblesPool;
  if (s.noblesInMagistrate) saved.noblesMagistrate = s.noblesInMagistrate;
  return saved;
}

function buildSaveGame(state: GameState, playerSetups: readonly PlayerSetup[]): SaveGame {
  return {
    version: 1,
    savedAt: Date.now(),
    setups: playerSetups.map(s => ({
      name: s.name,
      type: s.type,
      difficulty: s.type === 'bot'
        ? (s.bot.name === 'MctsBot' ? 'ai' : s.bot.name === 'GreedyBot' ? 'hard' : 'easy')
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
      festivalBoard: state.festivalBoard ? {
        uprawa:    { type: 'uprawa',    completedBy: state.festivalBoard.uprawa.completedBy,    plantationType: state.festivalBoard.uprawa.plantationType },
        produkcja: { type: 'produkcja', completedBy: state.festivalBoard.produkcja.completedBy, requiredGoods: state.festivalBoard.produkcja.requiredGoods as Record<string, number> },
        budowa:    { type: 'budowa',    completedBy: state.festivalBoard.budowa.completedBy,    buildingId: state.festivalBoard.budowa.buildingId, buildingDisplayName: state.festivalBoard.budowa.buildingDisplayName },
      } : null,
      corsairTokenHolderId: state.corsairTokenHolderId,
      capturedRoleCard: state.capturedRoleCard,
      ...(state.nobleExpansion ? { nobleExpansion: true as const } : {}),
      ...(state.captainStoragePending ? { captainStoragePending: true as const } : {}),
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
    if (pl.nobles) p.occupiedNobles = pl.nobles;
    if (pl.forest) p.isForest = true;
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
    if (data.nobles) b.occupiedNobles = data.nobles;
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
  if (p.pendingNobles) player.pendingNobles = p.pendingNobles;
  if (p.heldNobles) player.heldNobles = p.heldNobles;
  player.hasUsedCaptainBonusThisPhase = p.captainUsed;
  player.hasUsedWharfThisPhase = p.wharfUsed;
  if (p.marinaGoods) player.marinaGoodsLoaded = p.marinaGoods;
  if (p.factoriaUsed) player.hasUsedFactoriaThisPhase = true;
  if (p.treasuryUsed) player.hasUsedTreasuryThisPhase = true;
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
    if (b.nobles) building.occupiedNobles = b.nobles;
    return building;
  }).filter(Boolean);
  if (s.noblesPool) supply.noblesPool = s.noblesPool;
  if (s.noblesMagistrate) supply.noblesInMagistrate = s.noblesMagistrate;
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

  if (s.festivalBoard) {
    const fb = s.festivalBoard;
    const uprawa: FestivalUprawaQuest = {
      type: 'uprawa',
      plantationType: fb.uprawa.plantationType as import('../../core/types').PlantationType,
      completedBy: fb.uprawa.completedBy,
    };
    const produkcja: FestivalProdukcjaQuest = {
      type: 'produkcja',
      requiredGoods: fb.produkcja.requiredGoods ?? {},
      completedBy: fb.produkcja.completedBy,
    };
    const budowa: FestivalBudowaQuest = {
      type: 'budowa',
      buildingId: fb.budowa.buildingId ?? '',
      buildingDisplayName: fb.budowa.buildingDisplayName ?? '',
      completedBy: fb.budowa.completedBy,
    };
    state.festivalBoard = new FestivalBoard(uprawa, produkcja, budowa);
  }

  state.corsairTokenHolderId = s.corsairTokenHolderId ?? null;
  state.capturedRoleCard = (s.capturedRoleCard as RoleType | null) ?? null;
  if (s.nobleExpansion) state.nobleExpansion = true;
  if (s.captainStoragePending) state.captainStoragePending = true;

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
          bot: s.difficulty === 'ai' ? new MctsBot() : s.difficulty === 'hard' ? new GreedyBot() : new RandomBot(),
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

// For server-side use (no localStorage dependency)
export function serializeGameState(state: GameState): SaveGame['state'] {
  return buildSaveGame(state, []).state;
}
export function deserializeGameState(data: SaveGame['state']): GameState {
  return restoreGameState(data);
}
