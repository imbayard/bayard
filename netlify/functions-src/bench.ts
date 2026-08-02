import { app } from '@benchpoints/api/app';

// Netlify Functions v2: bind this function to the API path and let Hono route.
// `app` is mounted at basePath '/api/bench', so it matches the incoming URL directly.
// The SPA catch-all redirect (/* -> /index.html, unforced) does not shadow this —
// function routes take precedence over non-forced redirects.
//
// This file is compiled by `scripts/bundle-functions.mjs` (our own esbuild step, run as
// part of the Netlify build) into a single self-contained netlify/functions/bench.mjs with
// every dependency inlined — including plain npm packages like hono, not just workspace
// packages. Netlify's own function-packaging step was found to externalize node_modules
// imports (both workspace AND regular deps) without reliably including them in the deployed
// zip, causing MODULE_NOT_FOUND at runtime despite a green build. Bundling ourselves removes
// that step's resolution from the critical path entirely.
export default (req: Request): Response | Promise<Response> => app.fetch(req);

export const config = { path: '/api/bench/*' };
