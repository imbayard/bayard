
import { Link } from '@bench/lib/nav';
import { usePortfolioHealth } from '@bench/lib/portfolio-health';

/** BenchPoints wordmark with a bottom-glowing underline tinted by live portfolio health. */
export function Wordmark() {
  const { color } = usePortfolioHealth();
  return (
    <Link
      href="/"
      className="inline-flex flex-col text-lg font-bold tracking-tight text-foreground"
    >
      BenchPoints
      <span
        aria-hidden
        className="mt-1 h-0.5 w-full rounded-full"
        style={{
          backgroundColor: color ?? 'transparent',
          boxShadow: color ? `0 2px 8px ${color}` : 'none',
          transition: 'background-color 600ms ease, box-shadow 600ms ease',
        }}
      />
    </Link>
  );
}
