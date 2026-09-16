import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshCache } from '@bench/lib/api';
import { useMockMode } from '@bench/lib/mock-mode';
import { cn } from '@bench/lib/utils';

type Status = 'idle' | 'refreshing' | 'error';

/**
 * Manual cache bust. Clicking clears both layers: the API's in-process cache (which the
 * browser can't reach, and whose TTLs run to five minutes on rosters) and then React
 * Query's, so every active view refetches from the platform.
 *
 * Deliberately manual. Everything else on the deck keeps serving cached data while you
 * click around; this is the escape hatch for "I just changed my lineup and I want to see it".
 */
export function RefreshButton() {
  const queryClient = useQueryClient();
  const [mock] = useMockMode();
  const [status, setStatus] = useState<Status>('idle');

  async function handleRefresh() {
    if (status === 'refreshing') return;
    setStatus('refreshing');
    try {
      await refreshCache(mock);
      // Resolves once the active queries have refetched, so the spinner covers the real wait.
      await queryClient.invalidateQueries();
      setStatus('idle');
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={status === 'refreshing'}
      title="Clear cached data and refetch from Sleeper and ESPN"
      className={cn(
        'flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground',
        'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring outline-none',
        'disabled:cursor-default disabled:opacity-70',
        status === 'error' && 'border-destructive text-destructive',
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className={cn('size-3.5', status === 'refreshing' && 'animate-spin')}
      >
        <path
          d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M13.5 1.5v3.5H10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {status === 'refreshing' ? 'Refreshing…' : status === 'error' ? 'Failed' : 'Refresh'}
    </button>
  );
}
