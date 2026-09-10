import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const origin = 'https://puerto-rico-3rd-edition.pages.dev/';
const expected = JSON.parse(readFileSync(new URL('../dist-pages/version.json', import.meta.url), 'utf8'));
const nonce = Date.now();

async function download(path) {
  const url = new URL(path, origin);
  url.searchParams.set('verify', String(nonce));
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const actual = JSON.parse((await download('version.json')).toString('utf8'));
if (actual.project !== expected.project || actual.contentHash !== expected.contentHash || actual.builtAt !== expected.builtAt) {
  throw new Error('Production does not yet match the local Pages build. Retry npm run pages:verify after propagation.');
}
for (const [file, hash] of Object.entries(expected.files)) {
  const bytes = await download(file === 'index.html' ? '' : file);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== hash) throw new Error(`Production file does not match the build: ${file}`);
}
console.log(`Verified production: ${origin} — ${actual.contentHash.slice(0, 12)}.`);
