import { buildAndSendDigest, dueDigest } from '@benchpoints/api/digest';

/**
 * Scheduled digest sender.
 *
 * Wakes every half hour and sends only when the current New York time lands in one of the
 * configured slots (see DIGEST_SCHEDULE). The alternative — a cron per send time — can't be
 * made correct: Netlify schedules in UTC, and the NFL season crosses the EDT/EST boundary,
 * which shifts every one of these times by an hour and two of them across a day boundary.
 * Waking often and checking local time costs ~48 no-op invocations a day and never drifts.
 *
 * Bundled by scripts/bundle-functions.mjs into a self-contained .mjs, same as bench.ts.
 */
export default async (): Promise<Response> => {
  const kind = dueDigest(new Date());
  if (!kind) {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await buildAndSendDigest(kind, false);
    return new Response(JSON.stringify({ sent: true, ...result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`digest "${kind}" failed: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { schedule: '*/30 * * * *' };
