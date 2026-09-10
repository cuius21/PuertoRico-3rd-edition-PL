import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Keep deployment logs with this project; authentication remains managed by Wrangler.
const directory = new URL('../.hardcore-work/cloudflare/', import.meta.url);
mkdirSync(directory, { recursive: true });
process.env.WRANGLER_LOG_PATH ??= fileURLToPath(new URL('wrangler.log', directory));
process.env.WRANGLER_SEND_METRICS ??= 'false';
