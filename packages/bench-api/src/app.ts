import { Hono } from 'hono';
import { AdapterNotConfiguredError } from './adapters.js';
import { env } from './env.js';
import { InvalidPlatformError } from './lib/platform.js';
import { benchIq } from './routes/bench-iq.js';
import { leagues } from './routes/leagues.js';
import { matchups } from './routes/matchups.js';
import { rosters } from './routes/rosters.js';

// Mounted under /api/bench so it can be served both by the Netlify Function
// (config.path = '/api/bench/*') and the local-dev standalone server (index.ts).
// No CORS: the function is same-origin with the SPA that calls it.
export const app = new Hono().basePath('/api/bench');

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/', leagues);
app.route('/', rosters);
app.route('/', matchups);
app.route('/', benchIq);

app.onError((err, c) => {
  if (err instanceof InvalidPlatformError || err instanceof AdapterNotConfiguredError) {
    return c.json({ error: err.message }, 400);
  }
  const message = err instanceof Error ? err.message : String(err);
  if (env.debug) {
    console.error(err);
  }
  return c.json({ error: message }, 502);
});
