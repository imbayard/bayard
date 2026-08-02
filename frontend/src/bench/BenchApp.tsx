import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MockModeProvider } from '@bench/lib/mock-mode';
import { HiddenAlertsProvider } from '@bench/lib/hidden-alerts';
import { BenchNavProvider, type BenchView } from '@bench/lib/nav';
import { HealthAccent } from '@bench/components/system/health-accent';
import { Wordmark } from '@bench/components/system/wordmark';
import { DataFreshness } from '@bench/components/system/data-freshness';
import { CommandDeck } from '@bench/CommandDeck';
import { LeagueDetailView } from '@bench/components/league-detail/league-detail-view';
import '@bench/bench.css';

// BenchPoints as a self-contained Bayard widget. Everything (providers, theme, routing)
// lives under `.bench-scope` so bench's Tailwind/dark theme never leaks into Coach/Home.
export default function BenchApp({ onExitToHome }: { onExitToHome: () => void }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const [view, setView] = useState<BenchView>({ name: 'deck' });

  return (
    <QueryClientProvider client={queryClient}>
      <MockModeProvider>
        <HiddenAlertsProvider>
          <BenchNavProvider value={{ view, navigate: setView }}>
            <div className="bench-scope dark">
              <HealthAccent />
              <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
                <header className="flex h-16 shrink-0 items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={onExitToHome}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      ← Home
                    </button>
                    <Wordmark />
                  </div>
                  <DataFreshness />
                </header>
                <main className="flex-1 pb-6">
                  {view.name === 'deck' ? (
                    <CommandDeck />
                  ) : (
                    <LeagueDetailView platform={view.platform} leagueId={view.leagueId} />
                  )}
                </main>
              </div>
            </div>
          </BenchNavProvider>
        </HiddenAlertsProvider>
      </MockModeProvider>
    </QueryClientProvider>
  );
}
