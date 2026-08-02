
import { createContext, useContext, useEffect, useState } from 'react';
import type { BenchIqFlag, League } from '@benchpoints/core';

const STORAGE_KEY = 'bp-hidden-alerts';

interface HiddenAlertsContextValue {
  hidden: Set<string>;
  hide: (key: string) => void;
  unhide: (key: string) => void;
}

const HiddenAlertsContext = createContext<HiddenAlertsContextValue | null>(null);

function readStored(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function HiddenAlertsProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    setHidden(readStored());
  }, []);

  function persist(next: Set<string>) {
    setHidden(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
  }

  function hide(key: string) {
    persist(new Set(hidden).add(key));
  }

  function unhide(key: string) {
    const next = new Set(hidden);
    next.delete(key);
    persist(next);
  }

  return (
    <HiddenAlertsContext.Provider value={{ hidden, hide, unhide }}>
      {children}
    </HiddenAlertsContext.Provider>
  );
}

export function useHiddenAlerts(): HiddenAlertsContextValue {
  const context = useContext(HiddenAlertsContext);
  if (!context) {
    throw new Error('useHiddenAlerts must be used within a HiddenAlertsProvider');
  }
  return context;
}

/** Only "warning"-level flags are hideable — critical flags always stay visible. */
export function isHideableAlert(flag: BenchIqFlag): boolean {
  return flag.level === 'warning';
}

/** Stable identity for a flag within a league — flags themselves carry no id. */
export function alertKey(league: Pick<League, 'platform' | 'externalLeagueId'>, flag: BenchIqFlag): string {
  return `${league.platform}:${league.externalLeagueId}:${flag.type}:${flag.playerId ?? 'null'}:${flag.slot ?? 'null'}`;
}
