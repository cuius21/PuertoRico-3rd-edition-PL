import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessToken, cloudflare, tomlString } from './cloudflare-api.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = resolve(root, 'wrangler.toml');
let config = readFileSync(configPath, 'utf8');
const account = tomlString(config, 'account_id');
const project = tomlString(config, 'name');
if (project !== 'puerto-rico-3rd-edition') throw new Error('Unexpected Cloudflare project');
const action = process.argv[2] ?? 'list';
if (!['setup','list','export'].includes(action)) throw new Error('Use setup, list or export <match-id>');
const token = await accessToken();
const prefix = '/accounts/' + account;
const dbName = 'puerto-rico-match-statistics';
const databases = await cloudflare(prefix + '/d1/database', token);
let database = databases.find(db => db.name === dbName);
if (!database && action === 'setup') database = await cloudflare(prefix + '/d1/database', token, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: dbName }),
});
if (!database) throw new Error('Run npm run stats:setup first');
async function query(sql, params = []) {
  const result = await cloudflare(prefix + '/d1/database/' + database.uuid + '/query', token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }),
  });
  if (!Array.isArray(result) || result.some(r => r.success === false)) throw new Error('D1 query failed');
  return result[0]?.results ?? [];
}
if (action === 'setup') {
  const schema = readFileSync(resolve(root, 'statistics-server/schema.sql'), 'utf8');
  for (const sql of schema.split(';').map(s => s.trim()).filter(Boolean)) await query(sql);
  const pagePath = prefix + '/pages/projects/' + project;
  const page = await cloudflare(pagePath, token);
  const production = page.deployment_configs.production;
  await cloudflare(pagePath, token, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deployment_configs: { preview: page.deployment_configs.preview, production: {
      ...production, d1_databases: { ...production.d1_databases, STATS_DB: { id: database.uuid } },
    } } }),
  });
  if (!config.includes('binding = "STATS_DB"')) {
    config += '\n[[d1_databases]]\nbinding = "STATS_DB"\ndatabase_name = "' + dbName + '"\ndatabase_id = "' + database.uuid + '"\n';
    writeFileSync(configPath, config);
  } else if (tomlString(config, 'database_id') !== database.uuid) {
    throw new Error('Database ID mismatch in wrangler.toml');
  }
  console.log('Statistics database and production binding ready: ' + database.uuid);
} else if (action === 'list') {
  console.table(await query('SELECT id, ended_at, player_count, kind, human_credit, bot_credit FROM matches ORDER BY ended_at DESC LIMIT 30'));
} else {
  const id = process.argv[3];
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Provide a match UUID from npm run stats:list');
  const rows = await query('SELECT result_json, history_json FROM matches WHERE id = ?', [id]);
  if (!rows[0]) throw new Error('Match not found');
  const report = { ...JSON.parse(rows[0].result_json), history: JSON.parse(rows[0].history_json) };
  const target = resolve(root, 'work/private-statistics', id);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target + '.json', JSON.stringify(report, null, 2) + '\n');
  const template = readFileSync(resolve(root, 'tools/statistics-viewer.html'), 'utf8');
  writeFileSync(target + '.html', template.replace('<!--MATCH_DATA-->', JSON.stringify(report).replaceAll('<', '\\u003c')));
  console.log('Private exports: ' + target + '.json and .html');
}

