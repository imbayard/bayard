import type { Platform } from '@benchpoints/core';

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
