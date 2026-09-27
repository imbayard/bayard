import { env } from '../env.js';

export async function createCalendarEvent(params: {
  app: string;
  title: string;
  start: string;
  end: string;
  recurrence?: string[];
}): Promise<{ id: string }> {
  const res = await fetch(`${env.integrationsBaseUrl}/integrations/calendar/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = `: ${body.detail}`;
    } catch {
      // non-JSON error body; status alone is enough
    }
    throw new Error(`POST /integrations/calendar/events failed (${res.status})${detail}`);
  }

  return res.json() as Promise<{ id: string }>;
}

/** Same shared Google identity as the calendar integration — sends to the authenticated user. */
export async function sendDigestEmail(subject: string, body: string): Promise<{ id: string }> {
  const res = await fetch(`${env.integrationsBaseUrl}/integrations/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: 'bench', subject, body }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = `: ${body.detail}`;
    } catch {
      // non-JSON error body; status alone is enough
    }
    throw new Error(`POST /integrations/email/send failed (${res.status})${detail}`);
  }

  return res.json() as Promise<{ id: string }>;
}
