import type { Platform } from '@benchpoints/core';
import { cn } from '@bench/lib/utils';

const PLATFORM_LABEL: Record<Platform, { short: string; full: string }> = {
  sleeper: { short: 'S', full: 'Sleeper' },
  espn: { short: 'E', full: 'ESPN' },
};

/** Subtle platform marker — an initial in a muted chip, never a color scheme. */
export function PlatformBadge({ platform, className }: { platform: Platform; className?: string }) {
  const { short, full } = PLATFORM_LABEL[platform];
  return (
    <span
      title={full}
      aria-label={full}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {short}
    </span>
  );
}
