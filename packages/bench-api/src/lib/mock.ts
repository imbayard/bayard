import type { Context } from 'hono';

export function isMockRequested(c: Context): boolean {
  return c.req.header('x-bp-mock') === '1';
}
