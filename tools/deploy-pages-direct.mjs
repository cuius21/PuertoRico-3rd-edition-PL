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
const authConfigPath = join(process.env.APPDATA ?? '', 'xdg.config', '.wrangler', 'config', 'default.toml');

function tomlString(text, name) {
  const match = text.match(new RegExp(`^${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`, 'm'));
  if (!match) throw new Error(`Brak ${name} w konfiguracji.`);
  return JSON.parse(match[1]);
}

function replaceTomlString(text, name, value) {
  const line = `${name} = ${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${name}\\s*=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
}

async function accessToken() {
  let config = readFileSync(authConfigPath, 'utf8');
  let token = tomlString(config, 'oauth_token');
  const expiry = Date.parse(tomlString(config, 'expiration_time'));
  if (Number.isFinite(expiry) && expiry > Date.now() + 60_000) return token;

  const refreshToken = tomlString(config, 'refresh_token');
  const response = await fetch('https://dash.cloudflare.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.WRANGLER_CLIENT_ID ?? '54d11594-84e4-41aa-b438-e81b8fa78ee7',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== 'string') {
    throw new Error('Sesja Cloudflare wygasła i nie udało się jej odświeżyć. Uruchom npx wrangler login.');
  }
  token = result.access_token;
  config = replaceTomlString(config, 'oauth_token', token);
  config = replaceTomlString(config, 'expiration_time', new Date(Date.now() + Number(result.expires_in) * 1000).toISOString());
  if (typeof result.refresh_token === 'string') config = replaceTomlString(config, 'refresh_token', result.refresh_token);
  writeFileSync(authConfigPath, config);
  return token;
}

async function cloudflare(path, token, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    const message = Array.isArray(body.errors) ? body.errors.map(error => error.message).filter(Boolean).join('; ') : '';
    throw new Error(`Cloudflare API ${response.status}${message ? `: ${message}` : ''}`);
  }
  return body.result;
}

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
const deployment = await cloudflare(
  `/accounts/${accountId}/pages/projects/${projectName}/deployments`, token,
  { method: 'POST', body: form },
);
console.log(`Deployment complete: ${deployment.url}`);
