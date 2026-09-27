import type { DigestKind } from '@benchpoints/core';
import { Hono } from 'hono';
import { buildAndSendDigest } from '../lib/digest.js';
import { isMockRequested } from '../lib/mock.js';

export const digest = new Hono();

const KINDS: DigestKind[] = ['pre-game', 'post-game'];

/**
 * Portfolio-wide, unlike every other route here which is scoped to one league — a digest is
 * the one thing you want summed across everything at once. Sent on a schedule in production
 * (see the bench-digest scheduled function); this route is the manual trigger and the way to
 * preview either kind on demand.
 */
digest.post('/digest/send', async (c) => {
  const requested = c.req.query('kind') ?? 'pre-game';
  if (!KINDS.includes(requested as DigestKind)) {
    return c.json({ error: `Unknown digest kind "${requested}". Expected one of: ${KINDS.join(', ')}` }, 400);
  }

  try {
    const result = await buildAndSendDigest(requested as DigestKind, isMockRequested(c));
    return c.json({ sent: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 502);
  }
});
