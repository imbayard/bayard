// Relative import, not the package specifier: Netlify's function bundler externalizes pnpm
// workspace packages (symlinked outside node_modules via `workspace:*`) instead of inlining
// them, which throws MODULE_NOT_FOUND at runtime even though the build itself succeeds.
// A relative path to the built dist makes esbuild treat this as first-party source and inline it.
import { app } from '../../packages/bench-api/dist/app.js';

// Netlify Functions v2: bind this function to the API path and let Hono route.
// `app` is mounted at basePath '/api/bench', so it matches the incoming URL directly.
// The SPA catch-all redirect (/* -> /index.html, unforced) does not shadow this —
// function routes take precedence over non-forced redirects.
export default (req: Request): Response | Promise<Response> => app.fetch(req);

export const config = { path: '/api/bench/*' };
