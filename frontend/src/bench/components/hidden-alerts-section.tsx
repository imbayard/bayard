
import { useState } from 'react';
import type { BenchIqFlag, League } from '@benchpoints/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@bench/components/ui/badge';
import { useHiddenAlerts } from '@bench/lib/hidden-alerts';

export interface HiddenAlertEntry {
  key: string;
  league: League;
  flag: BenchIqFlag;
}

export function HiddenAlertsSection({ entries }: { entries: HiddenAlertEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const { unhide } = useHiddenAlerts();

  if (entries.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span>
          {entries.length} hidden {entries.length === 1 ? 'alert' : 'alerts'}
        </span>
      </button>
      {expanded && (
        <ul className="flex flex-col gap-1.5 px-4 pb-2">
          {entries.map(({ key, league, flag }) => (
            <li
              key={key}
              className="flex items-center gap-3 rounded-xl bg-card px-4 py-2 ring-1 ring-foreground/10"
            >
              <Badge variant="secondary">warning</Badge>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                <span className="font-medium">{league.name}</span> · {flag.message}
              </span>
              <button
                type="button"
                onClick={() => unhide(key)}
                className="shrink-0 text-xs font-medium text-brand hover:underline"
              >
                Unhide
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
