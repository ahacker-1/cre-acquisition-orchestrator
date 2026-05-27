function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function defaultWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8080'
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

// `import.meta.env` is injected by Vite at build time. Guard the access so this module can also
// be imported under a plain Node/tsx runner (e.g. unit tests), where `import.meta.env` is absent.
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

export const API_URL = stripTrailingSlash(viteEnv.VITE_API_URL || '')
export const WS_URL = viteEnv.VITE_WS_URL || defaultWsUrl()
