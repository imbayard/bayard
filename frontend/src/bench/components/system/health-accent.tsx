
import { useEffect } from 'react';
import { usePortfolioHealth } from '@bench/lib/portfolio-health';

/**
 * Drives the global `--brand` accent from live portfolio health, so every
 * accent surface (week light, mock toggle, card hover rings, ambient wash)
 * tracks the same color as the header underline and health gauge.
 * Renders nothing; falls back to the CSS-defined orange while data loads.
 */
export function HealthAccent() {
  const { color } = usePortfolioHealth();

  useEffect(() => {
    // Tokens are scoped to `.bench-scope`, so drive --brand there rather than on :root.
    const root = document.querySelector<HTMLElement>('.bench-scope');
    if (!root) return;
    if (color) {
      root.style.setProperty('--brand', color);
    } else {
      root.style.removeProperty('--brand');
    }
    return () => {
      root.style.removeProperty('--brand');
    };
  }, [color]);

  return null;
}
