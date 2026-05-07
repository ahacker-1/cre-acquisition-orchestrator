import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  WorkflowCatalogResponse,
  WorkflowDefinition,
  WorkflowLaunchRequest,
  WorkflowLaunchResponse,
  WorkflowPreset,
  WorkflowPresetSaveRequest,
  WorkflowPresetSaveResponse,
  WorkflowPresetsResponse,
} from '../types/workflows'

const API_URL = 'http://localhost:8081'

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T
  return payload
}

async function readApiError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = await parseJsonResponse<{ error?: string; message?: string }>(response)
    return new Error(payload.error || payload.message || fallback)
  } catch {
    return new Error(fallback)
  }
}

function normalizeCatalog(payload: unknown): WorkflowCatalogResponse {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const rawWorkflows = Array.isArray(value.workflows) ? value.workflows : Array.isArray(payload) ? payload : []
  const workflows = rawWorkflows
    .map((entry) => normalizeWorkflow(entry))
    .filter((workflow): workflow is WorkflowDefinition => workflow !== null)
  const defaultWorkflowId =
    typeof value.defaultWorkflowId === 'string'
      ? value.defaultWorkflowId
      : workflows[0]?.id ?? 'full-acquisition-review'

  return {
    version: typeof value.version === 'number' ? value.version : 1,
    defaultWorkflowId,
    workflows,
  }
}

function normalizeWorkflow(entry: unknown): WorkflowDefinition | null {
  if (!entry || typeof entry !== 'object') return null
  const value = entry as Record<string, unknown>
  const id = typeof value.id === 'string' ? value.id : ''
  if (!id) return null
  const rawPhases = Array.isArray(value.phases) ? value.phases : []
  return {
    id,
    name: typeof value.name === 'string' ? value.name : id,
    summary: typeof value.summary === 'string' ? value.summary : '',
    operatorGoal: typeof value.operatorGoal === 'string' ? value.operatorGoal : '',
    recommendedScenario:
      value.recommendedScenario === 'value-add' || value.recommendedScenario === 'distressed'
        ? value.recommendedScenario
        : 'core-plus',
    phases: rawPhases
      .map((phase) => {
        if (!phase || typeof phase !== 'object') return null
        const rawPhase = phase as Record<string, unknown>
        const phaseKey = typeof rawPhase.phaseKey === 'string' ? rawPhase.phaseKey : ''
        if (!phaseKey) return null
        return {
          phaseKey,
          agents: Array.isArray(rawPhase.agents)
            ? rawPhase.agents.filter((agent): agent is string => typeof agent === 'string')
            : [],
        }
      })
      .filter((phase): phase is WorkflowDefinition['phases'][number] => phase !== null),
  }
}

function normalizePreset(entry: unknown): WorkflowPreset | null {
  if (!entry || typeof entry !== 'object') return null
  const value = entry as Record<string, unknown>
  const id =
    typeof value.id === 'string'
      ? value.id
      : typeof value.presetId === 'string'
        ? value.presetId
        : ''
  const workflowId = typeof value.workflowId === 'string' ? value.workflowId : ''
  if (!id || !workflowId) return null
  const rawInputs = value.inputs && typeof value.inputs === 'object'
    ? (value.inputs as Record<string, unknown>)
    : {}
  return {
    id,
    name: typeof value.name === 'string' ? value.name : id,
    workflowId,
    dealId: typeof value.dealId === 'string' ? value.dealId : undefined,
    inputs: {
      scenario:
        rawInputs.scenario === 'value-add' || rawInputs.scenario === 'distressed' || rawInputs.scenario === 'core-plus'
          ? rawInputs.scenario
          : value.scenario === 'value-add' || value.scenario === 'distressed' || value.scenario === 'core-plus'
            ? value.scenario
          : 'core-plus',
      speed:
        rawInputs.speed === 'fast' || rawInputs.speed === 'slow' || rawInputs.speed === 'normal'
          ? rawInputs.speed
          : value.speed === 'fast' || value.speed === 'slow' || value.speed === 'normal'
            ? value.speed
          : 'normal',
      mode: rawInputs.mode === 'fast' ? 'fast' : 'live',
      reset: typeof rawInputs.reset === 'boolean' ? rawInputs.reset : false,
      notes: typeof rawInputs.notes === 'string' ? rawInputs.notes : undefined,
      tags: Array.isArray(rawInputs.tags)
        ? rawInputs.tags.filter((tag): tag is string => typeof tag === 'string')
        : undefined,
    },
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  }
}

function normalizePresets(payload: unknown): WorkflowPreset[] {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const rawPresets = Array.isArray(value.presets) ? value.presets : Array.isArray(payload) ? payload : []
  return rawPresets
    .map((entry) => normalizePreset(entry))
    .filter((preset): preset is WorkflowPreset => preset !== null)
}

export function useWorkflows() {
  const [catalog, setCatalog] = useState<WorkflowCatalogResponse>({
    version: 1,
    defaultWorkflowId: 'full-acquisition-review',
    workflows: [],
  })
  const [presets, setPresets] = useState<WorkflowPreset[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [presetsLoading, setPresetsLoading] = useState(true)
  const [savingPreset, setSavingPreset] = useState(false)
  const [launchingWorkflowId, setLaunchingWorkflowId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const workflowsById = useMemo(() => {
    return new Map(catalog.workflows.map((workflow) => [workflow.id, workflow]))
  }, [catalog.workflows])

  const refreshCatalog = useCallback(async (): Promise<WorkflowCatalogResponse> => {
    setCatalogLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/workflows`)
      if (!response.ok) {
        throw await readApiError(response, 'Failed to load workflow catalog')
      }
      const nextCatalog = normalizeCatalog(await parseJsonResponse<unknown>(response))
      setCatalog(nextCatalog)
      setError(null)
      return nextCatalog
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  const refreshPresets = useCallback(async (): Promise<WorkflowPreset[]> => {
    setPresetsLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/workflow-presets`)
      if (!response.ok) {
        throw await readApiError(response, 'Failed to load workflow presets')
      }
      const nextPresets = normalizePresets(await parseJsonResponse<WorkflowPresetsResponse | WorkflowPreset[]>(response))
      setPresets(nextPresets)
      setError(null)
      return nextPresets
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setPresetsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshCatalog().catch(() => undefined)
    void refreshPresets().catch(() => undefined)
  }, [refreshCatalog, refreshPresets])

  const savePreset = useCallback(async (request: WorkflowPresetSaveRequest): Promise<WorkflowPreset> => {
    setSavingPreset(true)
    try {
      const response = await fetch(`${API_URL}/api/workflow-presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const payload = await parseJsonResponse<WorkflowPresetSaveResponse & { error?: string }>(response)
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save workflow preset')
      }
      const normalizedPreset = normalizePreset(payload.preset ?? payload)
      if (!normalizedPreset) {
        throw new Error('Preset response was missing required fields')
      }
      setPresets(payload.presets ? normalizePresets(payload.presets) : (current) => {
        const withoutExisting = current.filter((preset) => preset.id !== normalizedPreset.id)
        return [normalizedPreset, ...withoutExisting]
      })
      setError(null)
      return normalizedPreset
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setSavingPreset(false)
    }
  }, [])

  const launchWorkflow = useCallback(
    async (
      workflowId: string,
      request: WorkflowLaunchRequest,
    ): Promise<WorkflowLaunchResponse> => {
      setLaunchingWorkflowId(workflowId)
      try {
        const response = await fetch(`${API_URL}/api/workflows/${encodeURIComponent(workflowId)}/launch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        })
        const payload = await parseJsonResponse<WorkflowLaunchResponse & { error?: string }>(response)
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to launch workflow')
        }
        setError(null)
        return payload
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        throw err
      } finally {
        setLaunchingWorkflowId(null)
      }
    },
    [],
  )

  return {
    catalog,
    workflows: catalog.workflows,
    workflowsById,
    defaultWorkflowId: catalog.defaultWorkflowId,
    presets,
    catalogLoading,
    presetsLoading,
    loading: catalogLoading || presetsLoading,
    savingPreset,
    launchingWorkflowId,
    error,
    refreshCatalog,
    refreshPresets,
    savePreset,
    launchWorkflow,
  }
}
