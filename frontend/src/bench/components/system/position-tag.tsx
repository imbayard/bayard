import { cn } from '@bench/lib/utils';
import { normalizePosition, positionColor, positionSurface } from '../../../lib/positions';

/**
 * A player's position, color-coded by the global `--pos-*` tokens so QB/RB/WR/TE/K/DEF
 * read the same everywhere they appear.
 */
export function PositionTag({
  position,
  className,
}: {
  position: string | null | undefined;
  className?: string;
}) {
  const label = normalizePosition(position) || 'UNK';
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-9 items-center justify-center rounded px-1.5 text-[11px] font-semibold tracking-wide',
        className,
      )}
      style={{ color: positionColor(label), backgroundColor: positionSurface(label) }}
    >
      {label}
    </span>
  );
}
