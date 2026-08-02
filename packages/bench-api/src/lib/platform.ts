// Relative import (see adapters.ts) — avoids Netlify's workspace-package externalization bug.
import type { Platform } from '../../../bench-core/dist/index.js';

export function parsePlatform(value: string): Platform {
  if (value !== 'sleeper' && value !== 'espn') {
    throw new InvalidPlatformError(value);
  }
  return value;
}

export class InvalidPlatformError extends Error {
  constructor(value: string) {
    super(`Unknown platform "${value}". Expected "sleeper" or "espn".`);
  }
}
