import type { Json, MatchReport, ResultSeat } from '../src/statistics/types';

const levels = ['human', 'easy', 'hard', 'ai', 'hardcore', 'neural'];
const expansionNames = ['festival', 'corsair', 'newBuildings', 'nobleBuildings'];
const reasonNames = ['vp-depleted', 'workers-depleted', 'city-full'];
const actionTypes = new Set(['SELECT_ROLE','TAKE_PLANTATION','BUILD','PLACE_WORKER','BUY_PLANTATION_FROM_DECK','SELL_PLANTATION','TREASURY','SELL_GOOD','CRAFTSMAN_BONUS','LOAD_SHIP','SELECT_STORAGE','TAKE_DOUBLOON','CORSAIR_PIRACY','CORSAIR_PLUNDER','CORSAIR_RAID','CORSAIR_CAPTURE','PASS','MAYOR_PASS']);
function requireThat(condition: unknown): asserts condition { if (!condition) throw new Error('Invalid match'); }
function obj(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function integer(v: unknown, min: number, max: number): v is number { return Number.isInteger(v) && Number(v) >= min && Number(v) <= max; }
function short(v: unknown, max = 160): v is string { return typeof v === 'string' && v.length <= max; }
function identifier(v: unknown): v is string { return typeof v === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(v); }

function safeJson(value: unknown, depth = 0): value is Json {
  if (depth > 24) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 500;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e13;
  if (Array.isArray(value)) return value.length <= 5000 && value.every(v => safeJson(v, depth + 1));
  return obj(value) && Object.entries(value).every(([key, v]) =>
    key.length < 100 && !['__proto__','constructor','prototype','name','playerName','gameOverReason'].includes(key) && safeJson(v, depth + 1));
}

export function validateReport(input: unknown, now = Date.now()): MatchReport {
  requireThat(obj(input) && input['schema'] === 1);
  requireThat(typeof input['id'] === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input['id']));
  requireThat(short(input['startedAt'], 32) && short(input['endedAt'], 32));
  const start = Date.parse(input['startedAt']), end = Date.parse(input['endedAt']);
  requireThat(Number.isFinite(start) && Number.isFinite(end) && end >= start && end <= now + 600_000 && start >= Date.UTC(2026, 0, 1));
  requireThat(identifier(input['build']) && identifier(input['endBuild']) && identifier(input['botVersion']));
  const count = input['playerCount'];
  requireThat(integer(count, 3, 5) && integer(input['rounds'], 1, 1000) && integer(input['actionCount'], 1, 100_000));
  requireThat(obj(input['expansions']) && Object.keys(input['expansions']).length === 4);
  const expansions: Record<string, boolean> = {};
  for (const key of expansionNames) {
    requireThat(typeof input['expansions'][key] === 'boolean');
    expansions[key] = input['expansions'][key];
  }
  const neuralActive = count === 3 && !Object.values(expansions).some(Boolean);
  requireThat(Array.isArray(input['players']) && input['players'].length === count);
  const players: ResultSeat[] = input['players'].map((p: unknown, seat: number) => {
    requireThat(obj(p) && p['seat'] === seat && ['human','bot'].includes(String(p['kind'])));
    requireThat(levels.includes(String(p['selected'])) && levels.includes(String(p['effective'])));
    requireThat((p['kind'] === 'human') === (p['selected'] === 'human'));
    requireThat(p['effective'] === (p['selected'] === 'neural' && !neuralActive ? 'hardcore' : p['selected']));
    for (const key of ['total','vpTokens','buildingVP','largeBuildingBonus','nobleVP','doubloons','goods']) requireThat(integer(p[key], 0, 10_000));
    requireThat(p['total'] === Number(p['vpTokens']) + Number(p['buildingVP']) + Number(p['largeBuildingBonus']) + Number(p['nobleVP']));
    return {
      seat, kind: p['kind'], selected: p['selected'], effective: p['effective'],
      total: p['total'], vpTokens: p['vpTokens'], buildingVP: p['buildingVP'], largeBuildingBonus: p['largeBuildingBonus'],
      nobleVP: p['nobleVP'], doubloons: p['doubloons'], goods: p['goods'], rank: 0,
    } as ResultSeat;
  });
  const ordered = [...players].sort((a, b) => b.total - a.total || b.doubloons - a.doubloons || b.goods - a.goods);
  ordered.forEach((p, i) => {
    const prev = ordered[i - 1];
    p.rank = prev && p.total === prev.total && p.doubloons === prev.doubloons && p.goods === prev.goods ? prev.rank : i + 1;
  });
  requireThat(Array.isArray(input['endReason']) && input['endReason'].length > 0 && input['endReason'].length <= 3 && input['endReason'].every(r => reasonNames.includes(String(r))));
  const h = input['history'];
  requireThat(obj(h) && typeof h['complete'] === 'boolean' && ['', 'old-save','size-limit','storage-limit','recording-error'].includes(String(h['reason'])));
  requireThat(safeJson(h['initial']) && safeJson(h['final']) && obj(h['final']) && h['final']['gameOver'] === true);
  requireThat(Array.isArray(h['final']['players']) && h['final']['players'].length === count);
  requireThat(Array.isArray(h['moves']) && h['moves'].length <= 5000 && h['moves'].length <= input['actionCount']);
  requireThat(!h['complete'] || (h['reason'] === '' && h['moves'].length === input['actionCount']));
  requireThat(safeJson(h['moves']));
  h['moves'].forEach((m: unknown, i: number) => {
    requireThat(obj(m) && m['seq'] === i + 1 && integer(m['seat'], 0, count - 1) && integer(m['round'], 0, 1000));
    requireThat(short(m['phase'], 40) && short(m['label'], 300) && integer(m['elapsedMs'], 0, 1e13) && identifier(m['build']));
    requireThat(obj(m['action']) && actionTypes.has(String(m['action']['type'])));
    requireThat(Array.isArray(m['changes']) && m['changes'].length <= 2000);
    for (const change of m['changes']) {
      requireThat(obj(change) && Array.isArray(change['path']) && change['path'].length <= 24);
      requireThat(change['path'].every((v: unknown) => (integer(v, 0, 5000) || (short(v, 100) && !['__proto__','constructor','prototype'].includes(v)))));
      requireThat(change['remove'] === true || Object.hasOwn(change, 'value'));
    }
  });
  return {
    schema: 1, id: input['id'], startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(),
    build: input['build'], endBuild: input['endBuild'], botVersion: input['botVersion'],
    playerCount: count, expansions, players, rounds: input['rounds'], actionCount: input['actionCount'],
    endReason: input['endReason'] as string[], history: h as unknown as MatchReport['history'],
  };
}

