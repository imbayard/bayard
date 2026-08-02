import { app } from '@benchpoints/api/app';

// Netlify Functions v2: bind this function to the API path and let Hono route.
// `app` is mounted at basePath '/api/bench', so it matches the incoming URL directly.
// The SPA catch-all redirect (/* -> /index.html, unforced) does not shadow this —
// function routes take precedence over non-forced redirects.
export default (req: Request): Response | Promise<Response> => app.fetch(req);

export const config = { path: '/api/bench/*' };
