import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import config from '../vite.config.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist-pages/', import.meta.url);
await build({
  ...config,
  root,
  configFile: false,
  base: '/',
  resolve: { preserveSymlinks: true },
  define: { 'import.meta.env.VITE_LAN_ENABLED': JSON.stringify('false') },
  build: { ...config.build, outDir: fileURLToPath(output) },
});

const sha256 = data => createHash('sha256').update(data).digest('hex');
const files = ['index.html', ...readdirSync(new URL('assets/', output)).map(name => 'assets/' + name)].sort();
const hashes = Object.fromEntries(files.map(name => [name, sha256(readFileSync(new URL(name, output)))]));
const version = {
  project: 'puerto-rico-3rd-edition',
  builtAt: new Date().toISOString(),
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
