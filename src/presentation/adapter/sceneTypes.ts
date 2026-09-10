export type Area =
  | 'market'
  | 'trade'
  | 'plantations'
  | 'port'
  | 'festival'
  | 'magistrate'
  | 'corsair'
  | 'supplies'
  | 'scenery'
  | 'island'
  | 'stock';
export interface EntityRef {
  key: string;
  area: Area;
  playerId?: string;
  buildingId?: string;
  slotIndex?: number;
  shipIndex?: number;
}
export interface SceneObject {
  key: string;
  sprite: string;
  name: string;
  u: number;
  v: number;
  size: number;
  workers: number;
  nobles: number;
  capacity: number;
  target: EntityRef;
}
export interface PlayerScene {
  id: string;
  name: string;
  color: string;
  current: boolean;
  governor: boolean;
  coins: number;
  vp: number;
  pending: number;
  pendingNobles: number;
  held: number;
  heldNobles: number;
  goods: Record<string, number>;
  objects: SceneObject[];
  ruralUsed: number;
  urbanUsed: number;
}
export interface SceneSnapshot {
  round: number;
  phase: string;
  currentId: string;
  players: PlayerScene[];
  ships: { capacity: number; good: string | null; count: number }[];
  trade: (string | null)[];
  lastShipLoad: { sequence: number; shipIndex: number; good: string } | null;
  bank: number;
  vpPool: number;
  workersPool: number;
  magistrate: number;
  noblesPool: number;
  magistrateNobles: number;
  festival: boolean;
  nobles: boolean;
  corsair: boolean;
  newBuildings: boolean;
  legalTargets: string[];
}
