
import type { Platform } from '@benchpoints/core';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@bench/components/ui/popover';
import { useLeagues } from '@bench/lib/queries';
import { cn } from '@bench/lib/utils';

const ALL_PLATFORMS: { platform: Platform; label: string }[] = [
  { platform: 'sleeper', label: 'Sleeper' },
  { platform: 'espn', label: 'ESPN' },
];

export function DataFreshness() {
  const { data, isPending, isError } = useLeagues();

  const failed = new Set(data?.errors.map((e) => e.platform) ?? []);
  const allDown = isError;
  const partial = !allDown && failed.size > 0;
  const live = !allDown && !isPending && failed.size === 0;

  const label = isPending
    ? 'Connecting…'
    : allDown
      ? 'Offline'
      : partial
        ? ALL_PLATFORMS.map(({ platform, label }) =>
            failed.has(platform) ? `${label} offline` : `${label} live`,
          ).join(' · ')
        : 'Live';

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground',
          'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring outline-none',
        )}
      >
        <span
          className={cn(
            'size-2 rounded-full',
            live && 'bg-emerald-500',
            partial && 'bg-amber-500',
            allDown && 'bg-red-500',
            isPending && 'bg-muted-foreground/40',
          )}
        />
        {label}
      </PopoverTrigger>
      <PopoverContent align="end">
        <PopoverHeader>
          <PopoverTitle>Data sources</PopoverTitle>
        </PopoverHeader>
        <ul className="flex flex-col gap-2">
          {ALL_PLATFORMS.map(({ platform, label }) => {
            const error = data?.errors.find((e) => e.platform === platform);
            const down = allDown || Boolean(error);
            return (
              <li key={platform} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span
                    className={cn('size-2 rounded-full', down ? 'bg-red-500' : 'bg-emerald-500')}
                  />
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground">{down ? 'offline' : 'live'}</span>
                </span>
                {error && (
                  <span className="pl-4 text-xs break-all text-muted-foreground">
                    {error.error}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
