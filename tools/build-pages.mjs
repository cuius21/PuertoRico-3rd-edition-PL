import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import config from '../vite.config.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist-pages/', import.meta.url);
const builtAt = new Date().toISOString();
const sha256 = data => createHash('sha256').update(data).digest('hex');
function sourceFiles(dir) {
  return readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap(entry => {
    const path = dir + '/' + entry.name;
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) && !/\.d\.ts$/.test(path) ? [path] : [];
  });
}
const botSources = ['../core', '../actions', '../domain', '../state', '../src/bots'].flatMap(sourceFiles).sort();
const botVersion = sha256(botSources.map(path => path + ':' + sha256(readFileSync(new URL(path, import.meta.url)))).join('\n')).slice(0, 20);
const gameBuild = builtAt.replace(/[^0-9]/g, '').slice(0, 14);
await build({
  ...config,
  root,
  configFile: false,
  base: '/',
  resolve: { preserveSymlinks: true },
  define: { 'import.meta.env.VITE_LAN_ENABLED': JSON.stringify('false'), 'import.meta.env.VITE_STATS_ENABLED': JSON.stringify('true'), 'import.meta.env.VITE_GAME_BUILD': JSON.stringify(gameBuild), 'import.meta.env.VITE_BOT_VERSION': JSON.stringify(botVersion) },
  build: { ...config.build, outDir: fileURLToPath(output) },
});

await build({ root, configFile: false, publicDir: false, build: { outDir: fileURLToPath(output), emptyOutDir: false, target: 'es2022', minify: true, lib: { entry: fileURLToPath(new URL('../statistics-server/worker.ts', import.meta.url)), formats: ['es'], fileName: () => '_worker.js' } } });
writeFileSync(new URL('_routes.json', output), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
const files = ['index.html', ...readdirSync(new URL('assets/', output)).map(name => 'assets/' + name)].sort();
const hashes = Object.fromEntries(files.map(name => [name, sha256(readFileSync(new URL(name, output)))]));
const version = {
  project: 'puerto-rico-3rd-edition',
  builtAt,
  gameBuild,
  botVersion,
  workerHash: sha256(readFileSync(new URL('_worker.js', output))),
  contentHash: sha256(JSON.stringify(hashes)),
  files: hashes,
};
writeFileSync(new URL('version.json', output), JSON.stringify(version, null, 2) + '\n');
writeFileSync(new URL('_headers', output), [
  '/', '  Cache-Control: public, max-age=0, must-revalidate',
  '/index.html', '  Cache-Control: public, max-age=0, must-revalidate',
  '/version.json', '  Cache-Control: no-store',
  '/assets/*', '  Cache-Control: public, max-age=31536000, immutable', '',
].join('\n'));
console.log(`Pages build ready: ${version.contentHash.slice(0, 12)} (${files.length} application files).`);
