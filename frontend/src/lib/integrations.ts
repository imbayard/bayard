import { API_BASE } from './config'

/**
 * Integrations are shared across apps, not owned by one — Coach books calendar
 * events, Am I Healthy reads WHOOP, BenchPoints calls the same backend over
 * HTTP. So connecting them lives on the launcher, beside the app list.
 */

export interface Provider {
  id: string
  name: string
  /** Where the browser goes to begin the OAuth flow (a redirect on the backend). */
  startPath: string
  statusPath: string
  blurb: string
}

export const PROVIDERS: Provider[] = [
  {
    id: 'google',
    name: 'Google',
    startPath: '/integrations/oauth/start',
    statusPath: '/integrations/oauth/status',
    blurb: 'Calendar and email',
  },
  {
    id: 'whoop',
    name: 'WHOOP',
    startPath: '/integrations/whoop/oauth/start',
    statusPath: '/integrations/whoop/oauth/status',
    blurb: 'Strain, recovery and sleep',
  },
]

export interface ProviderStatus {
  authenticated: boolean
  /** Absent for providers that don't report it; treated as configured. */
  configured?: boolean
}

export function startUrl(provider: Provider): string {
  return `${API_BASE}${provider.startPath}`
}

export async function fetchStatus(provider: Provider): Promise<ProviderStatus> {
  const response = await fetch(`${API_BASE}${provider.statusPath}`)
  if (!response.ok) throw new Error(`${provider.name}: ${response.status}`)
  return response.json()
}

export async function fetchAllStatuses(): Promise<Record<string, ProviderStatus>> {
  const entries = await Promise.all(
    PROVIDERS.map(async (provider) => {
      try {
        return [provider.id, await fetchStatus(provider)] as const
      } catch {
        // A provider that can't be reached is reported as disconnected rather
        // than taking the whole launcher down with it.
        return [provider.id, { authenticated: false }] as const
      }
    }),
  )
  return Object.fromEntries(entries)
}
