import { accessToken, cloudflare, tomlString } from './cloudflare-api.mjs';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);
const { hash: blake3 } = require('blake3-wasm');
const mime = require('mime');

const projectRoot = resolve(new URL('../', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));
const outputDirectory = join(projectRoot, 'dist-pages');
const projectConfig = readFileSync(join(projectRoot, 'wrangler.toml'), 'utf8');
const projectName = tomlString(projectConfig, 'name');
const accountId = tomlString(projectConfig, 'account_id');
function applicationFiles(directory, base = directory) {
  const ignored = new Set(['_headers', '_redirects', '_routes.json', '_worker.js']);
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...applicationFiles(path, base));
    else if (entry.isFile()) files.push({ path, name: relative(base, path).split(sep).join('/') });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

function assetHash(path, bytes) {
  const extension = extname(path).slice(1);
  return blake3(bytes.toString('base64') + extension).toString('hex').slice(0, 32);
}

const token = await accessToken();
const uploadToken = await cloudflare(
  `/accounts/${accountId}/pages/projects/${projectName}/upload-token`, token,
);
const jwt = uploadToken.jwt;
if (typeof jwt !== 'string') throw new Error('Cloudflare nie zwrócił tokenu wysyłania plików.');

const files = applicationFiles(outputDirectory).map(file => {
  const bytes = readFileSync(file.path);
  const contentType = (mime.getType?.(file.name) ?? mime.lookup?.(file.name)) || 'application/octet-stream';
  return { ...file, bytes, hash: assetHash(file.path, bytes), contentType: contentType.startsWith('text/') ? `${contentType}; charset=utf-8` : contentType };
});
const missing = await cloudflare('/pages/assets/check-missing', jwt, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hashes: files.map(file => file.hash) }),
});
const missingSet = new Set(missing);
const uploads = files.filter(file => missingSet.has(file.hash)).map(file => ({
  key: file.hash, value: file.bytes.toString('base64'),
  metadata: { contentType: file.contentType }, base64: true,
}));
if (uploads.length) {
  await cloudflare('/pages/assets/upload', jwt, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uploads),
  });
}
try {
  await cloudflare('/pages/assets/upsert-hashes', jwt, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes: files.map(file => file.hash) }),
  });
} catch {
  // This cache hint is optional; uploaded assets remain valid for the deployment.
}

const manifest = Object.fromEntries(files.map(file => [`/${file.name}`, file.hash]));
const form = new FormData();
form.append('manifest', JSON.stringify(manifest));
form.append('branch', 'main');
form.append('commit_dirty', 'true');
form.append('commit_message', 'Aktualizacja Puerto Rico');
form.append('pages_build_output_dir', 'dist-pages');
const headersPath = join(outputDirectory, '_headers');
if (statSync(headersPath).isFile()) form.append('_headers', new File([readFileSync(headersPath)], '_headers'));
const worker = new FormData();
worker.set('metadata', JSON.stringify({ main_module: '_worker.js', compatibility_date: tomlString(projectConfig, 'compatibility_date') }));
worker.set('_worker.js', new File([readFileSync(join(outputDirectory, '_worker.js'))], '_worker.js', { type: 'application/javascript+module' }));
const workerBundle = await new Response(worker).blob();
form.append('_worker.bundle', new File([workerBundle], '_worker.bundle', { type: workerBundle.type }));
form.append('_routes.json', new File([readFileSync(join(outputDirectory, '_routes.json'))], '_routes.json'));
const deployment = await cloudflare(
  `/accounts/${accountId}/pages/projects/${projectName}/deployments`, token,
  { method: 'POST', body: form },
);
console.log(`Deployment complete: ${deployment.url}`);
