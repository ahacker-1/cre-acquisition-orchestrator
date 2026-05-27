import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'
import type {
  ApplyOperatorFieldEditResult,
  DealCriteria,
  DealWorkspace,
  ExtractionPreview,
  ExtractionReviewStatus,
  GuideChecklistStatus,
  IcStarterPackageExport,
  PhaseWorkspaceStatus,
  ReviewExtractionResult,
  SourceDocument,
} from '../types/workspace'
import { uploadDealDocument } from '../lib/documentUpload'

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
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
    setWorking(true)
    try {
      const document = await uploadDealDocument(dealId, file)
      await refreshWorkspace()
      setError(null)
      return document
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

  async function loadExtraction(documentId: string): Promise<ExtractionPreview> {
    if (!dealId) throw new Error('Choose a deal before reviewing extracted fields.')
    setWorking(true)
    try {
      const response = await fetch(
        `${API_URL}/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(documentId)}/extraction`,
      )
      const payload = await parseJson<{ extraction?: ExtractionPreview; error?: string }>(response)
      if (!response.ok || !payload.extraction) {
        throw new Error(payload.error || 'Failed to load extraction preview')
      }
      setLastExtraction(payload.extraction)
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

  async function reviewExtraction(
    documentId: string,
    fieldIds: string[],
    reviewStatus: Extract<ExtractionReviewStatus, 'candidate' | 'rejected' | 'waived'>,
    note?: string,
  ): Promise<ReviewExtractionResult> {
    if (!dealId) throw new Error('Choose a deal before reviewing extracted fields.')
    setWorking(true)
    try {
      const response = await fetch(
        `${API_URL}/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(documentId)}/review-extraction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldIds, reviewStatus, note }),
        },
      )
      const payload = await parseJson<ReviewExtractionResult & { error?: string }>(response)
      if (!response.ok || !payload.extraction) throw new Error(payload.error || 'Failed to review extraction')
      setLastExtraction(payload.extraction)
      await refreshWorkspace()
      setError(null)
      return payload
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setWorking(false)
    }
  }

  // I1: inline operator override — edit an auto-populated deal field directly. Persists the
  // value with provenance + audit (server side), then refreshes the workspace.
  async function editField(path: string, value: unknown, label?: string): Promise<ApplyOperatorFieldEditResult> {
    if (!dealId) throw new Error('Choose a deal before editing fields.')
    setWorking(true)
    try {
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}/field-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, value, label }),
      })
      const payload = await parseJson<ApplyOperatorFieldEditResult & { error?: string }>(response)
      if (!response.ok || !payload.field) throw new Error(payload.error || 'Failed to apply field edit')
      await refreshWorkspace()
      setError(null)
      return payload
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setWorking(false)
    }
  }

  async function exportPackage(workflowId = 'full-acquisition-review'): Promise<IcStarterPackageExport> {
    if (!dealId) throw new Error('Choose a deal before exporting the IC package.')
    setWorking(true)
    try {
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}/ic-starter-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId }),
      })
      const payload = await parseJson<IcStarterPackageExport & { error?: string }>(response)
      if (!response.ok || !payload.packageJson) throw new Error(payload.error || 'Failed to export IC starter package')
      setError(null)
      return payload
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setWorking(false)
    }
  }

  async function savePhaseChecklist(
    phaseSlug: string,
    checklist: Record<string, GuideChecklistStatus>,
    notes?: Record<string, string>,
  ): Promise<PhaseWorkspaceStatus[]> {
    if (!dealId) return workspace?.phases ?? []
    setWorking(true)
    try {
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}/phase-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseSlug, checklist, notes }),
      })
      const payload = await parseJson<{ phases?: PhaseWorkspaceStatus[]; error?: string }>(response)
      if (!response.ok || !payload.phases) throw new Error(payload.error || 'Failed to save phase checklist')
      setWorkspace((current) => (current ? { ...current, phases: payload.phases ?? current.phases } : current))
      await refreshWorkspace()
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
    loadExtraction,
    applyExtraction,
    reviewExtraction,
    editField,
    exportPackage,
    savePhaseChecklist,
  }
}
