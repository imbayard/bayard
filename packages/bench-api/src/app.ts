import { EspnApiError } from '@benchpoints/core';
import { Hono } from 'hono';
import { AdapterNotConfiguredError } from './adapters.js';
import { env } from './env.js';
import { InvalidPlatformError } from './lib/platform.js';
import { benchIq } from './routes/bench-iq.js';
import { digest } from './routes/digest.js';
import { leagues } from './routes/leagues.js';
import { matchups } from './routes/matchups.js';
import { refresh } from './routes/refresh.js';
import { rosters } from './routes/rosters.js';
import { scout } from './routes/scout.js';
import { weather } from './routes/weather.js';

// Mounted under /api/bench so it can be served both by the Netlify Function
// (config.path = '/api/bench/*') and the local-dev standalone server (index.ts).
// No CORS: the function is same-origin with the SPA that calls it.
export const app = new Hono().basePath('/api/bench');

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/', leagues);
app.route('/', rosters);
app.route('/', matchups);
app.route('/', benchIq);
app.route('/', scout);
app.route('/', refresh);
app.route('/', digest);
app.route('/', weather);

app.onError((err, c) => {
  if (err instanceof InvalidPlatformError || err instanceof AdapterNotConfiguredError) {
    return c.json({ error: err.message }, 400);
  }
  // A 404 from ESPN (or from an id we were never configured with) is the caller's miss, not ours.
  if (err instanceof EspnApiError && err.status === 404) {
    return c.json({ error: err.message }, 404);
  }
  const message = err instanceof Error ? err.message : String(err);
  if (env.debug) {
    console.error(err);
  }
  return c.json({ error: message }, 502);
});
