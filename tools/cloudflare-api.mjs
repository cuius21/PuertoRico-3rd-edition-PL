import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const authConfigPath = join(process.env.APPDATA ?? '', 'xdg.config', '.wrangler', 'config', 'default.toml');

export function tomlString(text, name) {
  const match = text.match(new RegExp(`^${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`, 'm'));
  if (!match) throw new Error(`Brak ${name} w konfiguracji.`);
  return JSON.parse(match[1]);
}

function replaceTomlString(text, name, value) {
  const line = `${name} = ${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${name}\\s*=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
}

export async function accessToken() {
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

export async function cloudflare(path, token, options = {}) {
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

