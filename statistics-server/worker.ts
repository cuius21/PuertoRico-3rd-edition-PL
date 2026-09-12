import { validateReport } from './validation';
import type { MatchReport } from '../src/statistics/types';

interface QueryResult { results: Record<string, unknown>[]; meta?: { changes?: number } }
export interface Statement {
  bind(...values: unknown[]): Statement;
  all(): Promise<QueryResult>;
  run(): Promise<QueryResult>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<QueryResult[]> }
export interface Env { STATS_DB: Database; ASSETS: { fetch(request: Request): Promise<Response> } }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

async function boundedBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > 1_200_000) throw new Error('Too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty body');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_200_000) { await reader.cancel(); throw new Error('Too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(buffer));
}
export async function insertMatch(db: Database, report: MatchReport): Promise<boolean> {
  const { history, ...result } = report;
  const winners = report.players.filter(p => p.rank === 1);
  const humans = report.players.filter(p => p.kind === 'human').length;
  const humanCredit = winners.filter(p => p.kind === 'human').length / winners.length;
  const row = await db.prepare(`INSERT INTO matches
    (id, ended_at, player_count, kind, expansions, build, bot_version, human_credit, bot_credit, tied, result_json, history_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).bind(
    report.id, report.endedAt, report.playerCount, humans === 0 ? 'bots' : humans === report.playerCount ? 'humans' : 'mixed',
    Object.keys(report.expansions).filter(k => report.expansions[k]).sort().join(','), report.build, report.botVersion,
    humanCredit, 1 - humanCredit, Number(winners.length > 1), JSON.stringify(result), JSON.stringify(history),
  ).run();
  return (row.meta?.changes ?? 0) > 0;
}
async function summary(db: Database, url: URL): Promise<Response> {
  const clauses: string[] = [], params: unknown[] = [];
  const count = url.searchParams.get('players'), kind = url.searchParams.get('kind'), expansion = url.searchParams.get('expansions');
  if (count) { if (!['3','4','5'].includes(count)) return json({ error: 'Invalid player count' }, 400); clauses.push('m.player_count = ?'); params.push(Number(count)); }
  if (kind) { if (!['mixed','bots','humans'].includes(kind)) return json({ error: 'Invalid kind' }, 400); clauses.push('m.kind = ?'); params.push(kind); }
  if (expansion) {
    if (!['base','expanded'].includes(expansion)) return json({ error: 'Invalid expansions' }, 400);
    clauses.push(expansion === 'base' ? "m.expansions = ''" : "m.expansions <> ''");
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const queries = [
    `SELECT COUNT(*) AS games, COALESCE(SUM(human_credit),0) AS humanWins, COALESCE(SUM(bot_credit),0) AS botWins,
      COALESCE(SUM(tied),0) AS ties, MIN(ended_at) AS firstGame, MAX(ended_at) AS lastGame FROM matches m${where}`,
    `SELECT json_extract(p.value,'$.effective') AS level, COUNT(*) AS appearances,
      SUM(CASE WHEN json_extract(p.value,'$.rank') = 1 THEN
        1.0/(SELECT COUNT(*) FROM json_each(m.result_json,'$.players') w WHERE json_extract(w.value,'$.rank') = 1) ELSE 0 END) AS wins,
      SUM(CASE WHEN json_extract(p.value,'$.rank') = 1 AND m.tied = 0 THEN 1 ELSE 0 END) AS outrightWins,
      AVG(json_extract(p.value,'$.total')) AS averageScore
      FROM matches m, json_each(m.result_json,'$.players') p${where} GROUP BY level`,
    `SELECT player_count AS playerCount, COUNT(*) AS games FROM matches m${where} GROUP BY player_count ORDER BY player_count`,
  ];
  const data = await db.batch(queries.map(q => db.prepare(q).bind(...params)));
  return json({ ...data[0]!.results[0], levels: data[1]!.results, configurations: data[2]!.results });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.STATS_DB) return json({ error: 'Statistics unavailable' }, 503);
    try {
      if (url.pathname === '/api/stats' && request.method === 'GET') return await summary(env.STATS_DB, url);
      if (url.pathname === '/api/matches' && request.method === 'POST') {
        // Browser collection stays same-origin. This is observational data, not an authenticated ranking.
        if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Origin rejected' }, 403);
        if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'JSON required' }, 415);
        let report: MatchReport;
        try { report = validateReport(await boundedBody(request)); } catch { return json({ error: 'Invalid match report' }, 400); }
        const created = await insertMatch(env.STATS_DB, report);
        return json({ id: report.id, saved: true, duplicate: !created }, created ? 201 : 200);
      }
      // Histories are deliberately absent from the public API. The owner exports through Cloudflare authentication.
      return json({ error: 'Not found' }, 404);
    } catch {
      return json({ error: 'Statistics temporarily unavailable' }, 503);
    }
  },
};

