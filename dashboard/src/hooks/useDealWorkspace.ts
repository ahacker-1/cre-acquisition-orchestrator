import { useCallback, useEffect, useState } from 'react'
import type {
  DealCriteria,
  DealWorkspace,
  ExtractionPreview,
  PhaseWorkspaceStatus,
  SourceDocument,
} from '../types/workspace'

const API_URL = 'http://localhost:8081'
const MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function useDealWorkspace(dealId: string | null | undefined) {
  const [workspace, setWorkspace] = useState<DealWorkspace | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastExtraction, setLastExtraction] = useState<ExtractionPreview | null>(null)

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    if (!dealId) {
      setWorkspace(null)
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}/workspace`)
      const payload = await parseJson<DealWorkspace & { error?: string }>(response)
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load deal workspace')
      }
      setWorkspace(payload)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    void refreshWorkspace()
  }, [refreshWorkspace])

  async function saveCriteria(criteria: DealCriteria): Promise<void> {
    if (!dealId) return
    setWorking(true)
    try {
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}/criteria`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria),
      })
      const payload = await parseJson<{ criteria?: DealCriteria; error?: string }>(response)
      if (!response.ok) throw new Error(payload.error || 'Failed to save criteria')
      await refreshWorkspace()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setWorking(false)
    }
  }

  async function uploadDocument(file: File): Promise<SourceDocument> {
    if (!dealId) throw new Error('Choose a deal before uploading documents.')
    if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      throw new Error(`${file.name} is larger than the 50 MB local upload limit.`)
    }
    setWorking(true)
    try {
      const contentBase64 = await readFileAsBase64(file)
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mime: file.type,
          size: file.size,
          contentBase64,
        }),
      })
      const payload = await parseJson<{ document?: SourceDocument; error?: string }>(response)
      if (!response.ok || !payload.document) {
        throw new Error(payload.error || 'Failed to upload document')
      }
      await refreshWorkspace()
      setError(null)
      return payload.document
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setWorking(false)
    }
  }

  async function extractDocument(documentId: string): Promise<ExtractionPreview> {
    if (!dealId) throw new Error('Choose a deal before extracting documents.')
    setWorking(true)
    try {
      const response = await fetch(
        `${API_URL}/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(documentId)}/extract`,
        { method: 'POST' },
      )
      const payload = await parseJson<{ extraction?: ExtractionPreview; error?: string }>(response)
      if (!response.ok || !payload.extraction) {
        throw new Error(payload.error || 'Failed to extract document')
      }
      setLastExtraction(payload.extraction)
      await refreshWorkspace()
      setError(null)
      return payload.extraction
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setWorking(false)
    }
  }

  async function applyExtraction(documentId: string, fieldIds?: string[], confirmConflictReview = false): Promise<void> {
    if (!dealId) return
    setWorking(true)
    try {
      const response = await fetch(
        `${API_URL}/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(documentId)}/apply-extraction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldIds, confirmConflictReview }),
        },
      )
      const payload = await parseJson<{ error?: string }>(response)
      if (!response.ok) throw new Error(payload.error || 'Failed to apply extraction')
      setLastExtraction(null)
      await refreshWorkspace()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setWorking(false)
    }
  }

  async function savePhaseChecklist(
    phaseSlug: string,
    checklist: Record<string, 'pending' | 'complete'>,
  ): Promise<PhaseWorkspaceStatus[]> {
    if (!dealId) return workspace?.phases ?? []
    setWorking(true)
    try {
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}/phase-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseSlug, checklist }),
      })
      const payload = await parseJson<{ phases?: PhaseWorkspaceStatus[]; error?: string }>(response)
      if (!response.ok || !payload.phases) throw new Error(payload.error || 'Failed to save phase checklist')
      setWorkspace((current) => (current ? { ...current, phases: payload.phases ?? current.phases } : current))
      setError(null)
      return payload.phases
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setWorking(false)
    }
  }

  return {
    workspace,
    loading,
    working,
    error,
    lastExtraction,
    setLastExtraction,
    refreshWorkspace,
    saveCriteria,
    uploadDocument,
    extractDocument,
    applyExtraction,
    savePhaseChecklist,
  }
}
