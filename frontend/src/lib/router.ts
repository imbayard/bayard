import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  return () => window.removeEventListener('popstate', callback)
}

function getSnapshot() {
  return window.location.pathname
}

/** Current URL path, kept in sync with browser back/forward and `navigate()` calls. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => '/')
}

/** Push a new URL path without a full page reload. */
export function navigate(path: string) {
  if (path === window.location.pathname) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
