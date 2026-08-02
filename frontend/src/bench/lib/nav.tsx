import { createContext, useContext } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import type { Platform } from '@benchpoints/core';

// Bench is one widget inside the Bayard SPA, so it routes internally instead of by URL.
// This context + Link shim lets the ported Next.js components keep using <Link href="...">
// unchanged — hrefs are parsed into an internal view instead of a browser navigation.
export type BenchView =
  | { name: 'deck' }
  | { name: 'league'; platform: Platform; leagueId: string };

interface BenchNav {
  view: BenchView;
  navigate: (view: BenchView) => void;
}

const BenchNavContext = createContext<BenchNav | null>(null);

export function BenchNavProvider({ value, children }: { value: BenchNav; children: ReactNode }) {
  return <BenchNavContext.Provider value={value}>{children}</BenchNavContext.Provider>;
}

export function useBenchNav(): BenchNav {
  const ctx = useContext(BenchNavContext);
  if (!ctx) {
    throw new Error('useBenchNav must be used within a BenchNavProvider');
  }
  return ctx;
}

function parseHref(href: string): BenchView {
  const m = /^\/leagues\/([^/]+)\/([^/]+)\/?$/.exec(href);
  if (m) {
    return { name: 'league', platform: m[1] as Platform, leagueId: decodeURIComponent(m[2]) };
  }
  return { name: 'deck' };
}

type LinkProps = { href: string; children: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
>;

export function Link({ href, children, onClick, ...rest }: LinkProps) {
  const { navigate } = useBenchNav();
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    navigate(parseHref(href));
  }
  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
