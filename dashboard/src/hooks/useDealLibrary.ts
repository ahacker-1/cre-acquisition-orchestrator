import { useCallback, useEffect, useState } from 'react'
import type { RunSpeed } from '../types/checkpoint'
import type {
  DealFormData,
  DealLibraryItem,
  DealLibraryResponse,
  DealRecordResponse,
  DealSaveMode,
  DealValidationResult,
  LaunchDealResponse,
  SaveDealResponse,
} from '../types/deals'
import { serializeDealFormData } from '../lib/dealForm'

const API_URL = 'http://localhost:8081'

interface LaunchOptions {
  scenario: string
  speed: RunSpeed
  reset?: boolean
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

export function useDealLibrary() {
  const [deals, setDeals] = useState<DealLibraryItem[]>([])
  const [suggestedDealId, setSuggestedDealId] = useState('DEAL-2026-001')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshDeals = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/deals`)
      if (!response.ok) {
        throw new Error('Failed to load saved deals')
      }
      const payload = await parseJsonResponse<DealLibraryResponse>(response)
      setDeals(payload.deals)
      setSuggestedDealId(payload.suggestedDealId)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshDeals()
  }, [refreshDeals])

  async function loadDeal(dealId: string): Promise<DealRecordResponse> {
    const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}`)
    if (!response.ok) {
      const payload = await parseJsonResponse<{ error?: string }>(response)
      throw new Error(payload.error || 'Failed to load deal')
    }
    return parseJsonResponse<DealRecordResponse>(response)
  }

  async function validateDeal(
    form: DealFormData,
    mode: DealSaveMode,
    currentDealId?: string,
  ): Promise<DealValidationResult> {
    const response = await fetch(`${API_URL}/api/deals/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deal: serializeDealFormData(form),
        mode,
        currentDealId,
      }),
    })
    if (!response.ok) {
      const payload = await parseJsonResponse<{ error?: string }>(response)
      throw new Error(payload.error || 'Validation failed')
    }
    return parseJsonResponse<DealValidationResult>(response)
  }

  async function saveDeal(
    form: DealFormData,
    mode: DealSaveMode,
    currentDealId?: string,
  ): Promise<SaveDealResponse> {
    const response = await fetch(`${API_URL}/api/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deal: serializeDealFormData(form),
        mode,
        currentDealId,
      }),
    })
    const payload = await parseJsonResponse<SaveDealResponse & { error?: string; validation?: DealValidationResult }>(response)
    if (!response.ok) {
      const error = new Error(payload.error || 'Failed to save deal') as Error & {
        validation?: DealValidationResult
      }
      error.validation = payload.validation
      throw error
    }
    await refreshDeals()
    return payload
  }

  async function launchDeal(dealId: string, options: LaunchOptions): Promise<LaunchDealResponse> {
    const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(dealId)}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
    const payload = await parseJsonResponse<LaunchDealResponse & { error?: string; validation?: DealValidationResult }>(response)
    if (!response.ok) {
      const error = new Error(payload.error || 'Failed to launch deal') as Error & {
        validation?: DealValidationResult
      }
      error.validation = payload.validation
      throw error
    }
    await refreshDeals()
    return payload
  }

  return {
    deals,
    suggestedDealId,
    loading,
    error,
    refreshDeals,
    loadDeal,
    validateDeal,
    saveDeal,
    launchDeal,
  }
}
