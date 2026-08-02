import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './env.js';

// Local-dev standalone server. Production serves `app` via the Netlify Function
// (netlify/functions/bench.ts). Kept so `pnpm --filter @benchpoints/api dev` works.
serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`BenchPoints API listening on http://localhost:${info.port}/api/bench`);
});

export { app };
