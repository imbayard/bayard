import { useState } from 'react';
import { sendDigest } from '@bench/lib/api';
import { useMockMode } from '@bench/lib/mock-mode';
import { cn } from '@bench/lib/utils';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/**
 * On-demand pre-game digest — projections, flags and the injury report. Production sends
 * this on a schedule; the button is for reading it now. The post-game digest has no button
 * because there's nothing to act on when it arrives: `POST /digest/send?kind=post-game`.
 */
export function SendDigestButton() {
  const [mock] = useMockMode();
  const [status, setStatus] = useState<Status>('idle');

  async function handleSend() {
    if (status === 'sending') return;
    setStatus('sending');
    try {
      await sendDigest('pre-game', mock);
      setStatus('sent');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }

  return (
    <button
      onClick={handleSend}
      disabled={status === 'sending'}
      title="Email yourself this week's projections, flags and injury report"
      className={cn(
        'flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground',
        'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring outline-none',
        'disabled:cursor-default disabled:opacity-70',
        status === 'error' && 'border-destructive text-destructive',
      )}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
        <path
          d="M2 4h12v8H2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M2.5 4.5 8 9l5.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : status === 'error' ? 'Failed' : 'Digest'}
    </button>
  );
}
