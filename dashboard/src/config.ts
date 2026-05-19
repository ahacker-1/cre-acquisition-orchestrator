function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function defaultWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8080'
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export const API_URL = stripTrailingSlash(import.meta.env.VITE_API_URL || '')
export const WS_URL = import.meta.env.VITE_WS_URL || defaultWsUrl()
