import { API_URL } from '../config'

export function dealArtifactHref(dealId: string, path: string): string {
  return `${API_URL}/api/deals/${encodeURIComponent(dealId)}/artifacts?path=${encodeURIComponent(path)}`
}
