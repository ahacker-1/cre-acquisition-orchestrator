import { useEffect, useMemo, useState } from 'react'
import { useWorkflows } from '../hooks/useWorkflows'
import { API_URL } from '../config'
import type { RunMode, RunSpeed, RuntimeProvider } from '../types/checkpoint'
import type { DealLibraryItem, LaunchScenario } from '../types/deals'
import type { LaunchReadinessResult } from '../types/workspace'
import type {
  WorkflowDefinition,
  WorkflowLaunchResponse,
  WorkflowPreset,
  WorkflowSelectionDraft,
} from '../types/workflows'

interface WorkflowLauncherProps {
  deals: DealLibraryItem[]
  initialDealId?: string
  onLaunchStarted?: (response: WorkflowLaunchResponse) => void
  onPresetSaved?: (preset: WorkflowPreset) => void
  className?: string
  compact?: boolean
  launchReadiness?: LaunchReadinessResult[]
  defaultRequireSourceBackedInputs?: boolean
  lockDealSelection?: boolean
}

const DRAFT_STORAGE_KEY = 'cre.workflowLauncher.v2'

interface CodexAuthStatus {
  installed: boolean
  loggedIn: boolean
  usingChatGpt: boolean
  version: string | null
  loginStatus: string | null
  error: string | null
  authStorage?: string
  storesCredentialsInRepo?: boolean
}

interface CodexLoginResponse {
  started: boolean
  message?: string
  error?: string
  codexStatus?: CodexAuthStatus
}

const SCENARIOS: { value: LaunchScenario; label: string }[] = [
  { value: 'core-plus', label: 'Core Plus' },
  { value: 'value-add', label: 'Value Add' },
  { value: 'distressed', label: 'Distressed' },
]

const SPEEDS: { value: RunSpeed; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'normal', label: 'Normal' },
  { value: 'slow', label: 'Slow' },
]

const MODES: { value: RunMode; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'fast', label: 'Fast Run' },
]

const RUNTIME_PROVIDERS: { value: RuntimeProvider; label: string }[] = [
  { value: 'codex', label: 'Codex / ChatGPT' },
  { value: 'simulation', label: 'Simulation Demo' },
]

const CODEX_AGENT_LIMITS: { value: string; label: string }[] = [
  { value: '', label: 'All selected' },
  { value: '1', label: '1 agent' },
  { value: '2', label: '2 agents' },
]

function readStoredDraft(): Partial<WorkflowSelectionDraft> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<WorkflowSelectionDraft>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function dealLabel(deal: DealLibraryItem): string {
  const location = [deal.city, deal.state].filter(Boolean).join(', ')
  return [deal.dealName, location].filter(Boolean).join(' - ')
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${value.toLocaleString()}`
}

function displayPhase(phaseKey: string): string {
  return phaseKey
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function totalAgentCount(workflow: WorkflowDefinition | undefined): string {
  if (!workflow) return '0'
  const total = workflow.phases.reduce((sum, phase) => sum + phase.agents.length, 0)
  return total > 0 ? String(total) : 'All'
}

function statusText(loading: boolean, count: number, error: string | null): string {
  if (loading) return 'Loading workflow catalog...'
  if (error) return error
  return `${count} workflows available`
}

function inputClassName(): string {
  return 'w-full rounded-lg border border-cre-border bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-cre-accent'
}

function buttonClassName(kind: 'primary' | 'secondary' | 'ghost'): string {
  if (kind === 'primary') {
    return 'px-4 py-2 text-sm font-semibold uppercase bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  }
  if (kind === 'secondary') {
    return 'px-4 py-2 rounded-md text-sm font-semibold bg-white/8 text-gray-100 hover:bg-white/12 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  }
  return 'px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
}

function workflowLaunchTestId(workflowId: string): string {
  if (workflowId === 'full-acquisition-review') return 'workflow-launch-full-acquisition-review'
  if (workflowId === 'quick-deal-screen') return 'workflow-launch-quick-deal-screen'
  return `workflow-launch-${workflowId}`
}

function readinessStatusClass(status: string | undefined): string {
  if (status === 'ready') return 'status-complete'
  if (status === 'warning') return 'status-running'
  if (status === 'blocked') return 'status-blocked'
  return 'status-pending'
}

async function readCodexStatus(): Promise<CodexAuthStatus> {
  const response = await fetch(`${API_URL}/api/codex/status`)
  const payload = (await response.json()) as CodexAuthStatus & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to read Codex status')
  }
  return payload
}

async function startCodexLogin(): Promise<CodexLoginResponse> {
  const response = await fetch(`${API_URL}/api/codex/login`, { method: 'POST' })
  const payload = (await response.json()) as CodexLoginResponse
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to start Codex login')
  }
  return payload
}

function createInitialDraft(
  deals: DealLibraryItem[],
  defaultWorkflowId: string,
  initialDealId?: string,
  defaultRequireSourceBackedInputs = false,
): WorkflowSelectionDraft {
  const stored = readStoredDraft()
  const fallbackDealId = initialDealId || deals[0]?.dealId || ''
  return {
    dealId: initialDealId || (typeof stored.dealId === 'string' ? stored.dealId : fallbackDealId),
    workflowId: typeof stored.workflowId === 'string' ? stored.workflowId : defaultWorkflowId,
    scenario:
      stored.scenario === 'value-add' || stored.scenario === 'distressed'
        ? stored.scenario
        : 'core-plus',
    speed:
      stored.speed === 'fast' || stored.speed === 'slow' || stored.speed === 'normal'
        ? stored.speed
        : 'normal',
    mode: stored.mode === 'fast' ? 'fast' : 'live',
    runtimeProvider: stored.runtimeProvider === 'simulation' ? 'simulation' : 'codex',
    reset: typeof stored.reset === 'boolean' ? stored.reset : false,
    codexMaxAgents:
      typeof stored.codexMaxAgents === 'number' && stored.codexMaxAgents > 0
        ? Math.round(stored.codexMaxAgents)
        : null,
    codexConcurrency:
      typeof stored.codexConcurrency === 'number' && stored.codexConcurrency > 0
        ? Math.round(stored.codexConcurrency)
        : 2,
    codexSearch: stored.codexSearch === true,
    requireSourceBackedInputs:
      defaultRequireSourceBackedInputs
        ? true
        : typeof stored.requireSourceBackedInputs === 'boolean'
        ? stored.requireSourceBackedInputs
        : defaultRequireSourceBackedInputs,
    notes: typeof stored.notes === 'string' ? stored.notes : '',
    presetName: typeof stored.presetName === 'string' ? stored.presetName : '',
    presetId: typeof stored.presetId === 'string' ? stored.presetId : undefined,
  }
}

function WorkflowLauncher({
  deals,
  initialDealId,
  onLaunchStarted,
  onPresetSaved,
  className = '',
  compact = false,
  launchReadiness = [],
  defaultRequireSourceBackedInputs = false,
  lockDealSelection = false,
}: WorkflowLauncherProps) {
  const {
    workflows,
    defaultWorkflowId,
    presets,
    catalogLoading,
    presetsLoading,
    savingPreset,
    launchingWorkflowId,
    error,
    savePreset,
    launchWorkflow,
  } = useWorkflows()

  const [draft, setDraft] = useState<WorkflowSelectionDraft>(() =>
    createInitialDraft(deals, defaultWorkflowId || 'full-acquisition-review', initialDealId, defaultRequireSourceBackedInputs)
  )
  const [activeStep, setActiveStep] = useState<'deal' | 'workflow' | 'review'>('deal')
  const [localMessage, setLocalMessage] = useState<string | null>(null)
  const [codexStatus, setCodexStatus] = useState<CodexAuthStatus | null>(null)
  const [codexStatusLoading, setCodexStatusLoading] = useState(false)
  const [codexLoginStarting, setCodexLoginStarting] = useState(false)

  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.dealId === draft.dealId) ?? null,
    [deals, draft.dealId],
  )
  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === draft.workflowId) ?? workflows[0],
    [draft.workflowId, workflows],
  )
  const scopedReadiness = useMemo(
    () => (lockDealSelection ? launchReadiness : []),
    [lockDealSelection, launchReadiness],
  )
  const selectedReadiness = useMemo(
    () => scopedReadiness.find((entry) => entry.workflowId === draft.workflowId) ?? null,
    [draft.workflowId, scopedReadiness],
  )
  const compatiblePresets = useMemo(
    () => presets.filter((preset) => !selectedWorkflow || preset.workflowId === selectedWorkflow.id),
    [presets, selectedWorkflow],
  )

  useEffect(() => {
    if (workflows.length === 0) return
    setDraft((current) => {
      if (workflows.some((workflow) => workflow.id === current.workflowId)) return current
      const nextWorkflow = workflows.find((workflow) => workflow.id === defaultWorkflowId) ?? workflows[0]
      return {
        ...current,
        workflowId: nextWorkflow.id,
        scenario: nextWorkflow.recommendedScenario,
      }
    })
  }, [defaultWorkflowId, workflows])

  useEffect(() => {
    if (lockDealSelection && initialDealId) return
    if (!selectedDeal && deals.length > 0) {
      setDraft((current) => ({ ...current, dealId: deals[0].dealId }))
    }
  }, [deals, initialDealId, lockDealSelection, selectedDeal])

  useEffect(() => {
    if (!initialDealId) return
    setDraft((current) => (
      current.dealId === initialDealId ? current : { ...current, dealId: initialDealId }
    ))
  }, [initialDealId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [draft])

  useEffect(() => {
    if (draft.runtimeProvider !== 'codex') return
    let cancelled = false
    setCodexStatusLoading(true)
    readCodexStatus()
      .then((status) => {
        if (!cancelled) setCodexStatus(status)
      })
      .catch((err) => {
        if (!cancelled) {
          setLocalMessage(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setCodexStatusLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [draft.runtimeProvider])

  function chooseWorkflow(workflow: WorkflowDefinition): void {
    setDraft((current) => ({
      ...current,
      workflowId: workflow.id,
      scenario: workflow.recommendedScenario,
      presetId: undefined,
    }))
    setActiveStep('review')
    setLocalMessage(null)
  }

  function applyPreset(preset: WorkflowPreset): void {
    setDraft((current) => ({
      ...current,
      dealId: lockDealSelection && initialDealId ? initialDealId : preset.dealId || current.dealId,
      workflowId: preset.workflowId,
      scenario: preset.inputs.scenario,
      speed: preset.inputs.speed,
      mode: preset.inputs.mode,
      runtimeProvider: preset.inputs.runtimeProvider,
      reset: preset.inputs.reset,
      codexMaxAgents: preset.inputs.codexMaxAgents ?? null,
      codexConcurrency: preset.inputs.codexConcurrency ?? 2,
      codexSearch: preset.inputs.codexSearch === true,
      requireSourceBackedInputs: preset.inputs.requireSourceBackedInputs === true,
      notes: preset.inputs.notes || '',
      presetName: preset.name,
      presetId: preset.id,
    }))
    setActiveStep('review')
    setLocalMessage(`Loaded preset: ${preset.name}`)
  }

  function readinessForWorkflow(workflowId: string): LaunchReadinessResult | null {
    return scopedReadiness.find((entry) => entry.workflowId === workflowId) ?? null
  }

  function launchBlockMessageFor(workflowId: string): string | null {
    const readiness = readinessForWorkflow(workflowId)
    if (!readiness) return null
    if (readiness.blockers[0]) return readiness.blockers[0]
    if (!draft.requireSourceBackedInputs) return null
    if (readiness.missingApprovedFields.length > 0) {
      return `Launch gate is on. Approve ${readiness.missingApprovedFields.length} missing source-backed field${readiness.missingApprovedFields.length === 1 ? '' : 's'} before launching.`
    }
    if (readiness.sourceCoverage.staleDocumentCount > 0) {
      return 'Launch gate is on. Re-extract stale source documents before launching.'
    }
    if (readiness.sourceCoverage.invalidApprovedFieldCount > 0) {
      return 'Launch gate is on. Re-approve fields whose source evidence is missing or stale before launching.'
    }
    return null
  }

  async function handleSavePreset(): Promise<void> {
    if (!selectedWorkflow) {
      setLocalMessage('Choose a workflow before saving a preset.')
      return
    }
    const name = draft.presetName.trim() || `${selectedWorkflow.name} preset`
    try {
      const preset = await savePreset({
        name,
        workflowId: selectedWorkflow.id,
        dealId: draft.dealId || undefined,
        inputs: {
          scenario: draft.scenario,
          speed: draft.speed,
          mode: draft.mode,
          runtimeProvider: draft.runtimeProvider,
          reset: draft.runtimeProvider === 'codex' ? false : draft.reset,
          codexMaxAgents: draft.runtimeProvider === 'codex' ? draft.codexMaxAgents : undefined,
          codexConcurrency: draft.runtimeProvider === 'codex' ? draft.codexConcurrency : undefined,
          codexSearch: draft.runtimeProvider === 'codex' ? draft.codexSearch : undefined,
          requireSourceBackedInputs: draft.requireSourceBackedInputs,
          notes: draft.notes?.trim() || undefined,
        },
      })
      setDraft((current) => ({ ...current, presetName: preset.name, presetId: preset.id }))
      setLocalMessage(`Saved preset: ${preset.name}`)
      onPresetSaved?.(preset)
    } catch (err) {
      setLocalMessage(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRefreshCodexStatus(): Promise<void> {
    setCodexStatusLoading(true)
    try {
      setCodexStatus(await readCodexStatus())
      setLocalMessage(null)
    } catch (err) {
      setLocalMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setCodexStatusLoading(false)
    }
  }

  async function handleCodexLogin(): Promise<void> {
    setCodexLoginStarting(true)
    try {
      const response = await startCodexLogin()
      if (response.codexStatus) setCodexStatus(response.codexStatus)
      setLocalMessage(response.message || 'Codex login started. Choose Sign in with ChatGPT, then refresh status.')
      window.setTimeout(() => void handleRefreshCodexStatus(), 2500)
    } catch (err) {
      setLocalMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setCodexLoginStarting(false)
    }
  }

  async function handleLaunch(workflow: WorkflowDefinition | undefined = selectedWorkflow): Promise<void> {
    if (!workflow) {
      setLocalMessage('Workflow catalog is still loading.')
      return
    }
    const launchBlockMessage = launchBlockMessageFor(workflow.id)
    if (launchBlockMessage) {
      setLocalMessage(launchBlockMessage)
      setActiveStep('review')
      return
    }
    if (!selectedDeal) {
      setLocalMessage(
        lockDealSelection && initialDealId
          ? 'The open workspace deal is not available in the deal library yet. Refresh the deal list before launching.'
          : 'Choose a deal before launching.',
      )
      setActiveStep('deal')
      return
    }
    if (
      draft.runtimeProvider === 'codex' &&
      !(codexStatus?.installed && codexStatus.loggedIn && codexStatus.usingChatGpt)
    ) {
      setLocalMessage('Login to ChatGPT with Codex before launching a live Codex workflow.')
      setActiveStep('review')
      return
    }
    try {
      const response = await launchWorkflow(workflow.id, {
        dealId: selectedDeal.dealId,
        presetId: draft.presetId,
        mode: draft.mode,
        speed: draft.speed,
        scenario: draft.scenario,
        reset: draft.runtimeProvider === 'codex' ? false : draft.reset,
        runtimeProvider: draft.runtimeProvider,
        codexMaxAgents: draft.runtimeProvider === 'codex' ? draft.codexMaxAgents : undefined,
        codexConcurrency: draft.runtimeProvider === 'codex' ? draft.codexConcurrency : undefined,
        codexSearch: draft.runtimeProvider === 'codex' ? draft.codexSearch : undefined,
        requireSourceBackedInputs: draft.requireSourceBackedInputs,
        notes: draft.notes?.trim() || undefined,
      })
      const sourceCount = response.inputSnapshot?.sourceCoverage?.sourceDocumentCount
      setLocalMessage(
        `${workflow.name} launched for ${selectedDeal.dealName}${
          typeof sourceCount === 'number' ? ` with ${sourceCount} source docs captured` : ''
        }${response.outputPath ? ` / output ${response.outputPath}` : ''}`,
      )
      onLaunchStarted?.(response)
    } catch (err) {
      setLocalMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const isCodexRun = draft.runtimeProvider === 'codex'
  const codexReady = Boolean(codexStatus?.installed && codexStatus.loggedIn && codexStatus.usingChatGpt)
  const selectedLaunchBlockMessage = selectedWorkflow ? launchBlockMessageFor(selectedWorkflow.id) : null
  const sourceGateBlocked = Boolean(selectedLaunchBlockMessage)
  const codexStatusLabel = !codexStatus
    ? 'Not checked'
    : !codexStatus.installed
      ? 'Codex CLI not installed'
      : !codexStatus.loggedIn
        ? 'Not logged in'
        : codexStatus.usingChatGpt
          ? 'Logged in with ChatGPT'
          : 'Logged in, but not confirmed as ChatGPT'
  const canLaunch = Boolean(selectedDeal && selectedWorkflow && (!isCodexRun || codexReady) && !sourceGateBlocked)
  const codexAgentLimitLabel =
    typeof draft.codexMaxAgents === 'number' && draft.codexMaxAgents > 0
      ? `${draft.codexMaxAgents} agent${draft.codexMaxAgents === 1 ? '' : 's'}`
      : 'All selected'
  const dealStepClassName = compact
    ? 'grid min-w-0 gap-4'
    : 'grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]'
  const dealGridClassName = compact ? 'grid gap-3' : 'grid gap-3 md:grid-cols-2'
  const workflowGridClassName = compact ? 'grid min-w-0 gap-4' : 'grid min-w-0 gap-4 xl:grid-cols-2'
  const reviewGridClassName = compact
    ? 'grid min-w-0 gap-4'
    : 'grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.85fr)]'
  const reviewInputGridClassName = compact ? 'grid gap-4' : 'grid gap-4 md:grid-cols-2'

  return (
    <div className={`min-w-0 space-y-5 ${className}`}>
      <div className="card min-w-0">
        <div className={compact ? 'space-y-3' : 'flex flex-wrap items-start justify-between gap-4'}>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Workflow Launcher
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Choose a saved deal, pick the outcome workflow, review the launch inputs, and keep presets for repeat screens.
            </p>
          </div>
          <span
            data-testid="workflow-catalog-load"
            className={`status-badge w-fit ${
              error ? 'status-failed' : catalogLoading ? 'status-running' : 'status-complete'
            }`}
          >
            {statusText(catalogLoading, workflows.length, error)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b border-cre-border">
        {[
          { id: 'deal', label: 'Deal' },
          { id: 'workflow', label: 'Workflow' },
          { id: 'review', label: 'Review' },
        ].map((step) => (
          <button
            key={step.id}
            type="button"
            data-testid={`workflow-step-${step.id}`}
            onClick={() => setActiveStep(step.id as typeof activeStep)}
            className={`tab min-w-0 text-center ${activeStep === step.id ? 'tab-active' : 'tab-inactive'}`}
          >
            {step.label}
          </button>
        ))}
      </div>

      {activeStep === 'deal' && (
        <section className={dealStepClassName}>
          <div className="card min-w-0">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Choose Deal
              </h3>
              <span className="text-xs text-gray-500">{deals.length} available</span>
            </div>
            {deals.length === 0 ? (
              <div className="rounded-lg border border-cre-border bg-black/20 p-4 text-sm text-gray-500">
                No deals are available yet. Create or save a deal before launching a workflow.
              </div>
            ) : (
              <div className={dealGridClassName}>
                {deals.map((deal) => {
                  const selected = deal.dealId === selectedDeal?.dealId
                  const dealLockedOut = lockDealSelection && deal.dealId !== initialDealId
                  return (
                    <button
                      key={deal.dealId}
                      type="button"
                      disabled={dealLockedOut}
                      onClick={() => {
                        if (dealLockedOut) return
                        setDraft((current) => ({ ...current, dealId: deal.dealId }))
                        setLocalMessage(null)
                      }}
                      className={`min-w-0 text-left border p-4 transition-colors ${
                        selected
                          ? 'border-cre-accent bg-cre-accent/10'
                          : dealLockedOut
                            ? 'border-cre-border bg-black/20 opacity-45'
                            : 'border-cre-border bg-black/20 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-white">{deal.dealName}</p>
                          <p className="mt-1 break-all font-mono text-xs text-gray-500">{deal.dealId}</p>
                        </div>
                        <span className="status-badge shrink-0 bg-white/10 text-gray-300">
                          {deal.kind}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                        <div className="min-w-0 bg-black/20 px-3 py-2">
                          <div className="truncate text-sm font-semibold text-gray-100">
                            {deal.totalUnits ?? '--'}
                          </div>
                          <div className="text-gray-500 uppercase tracking-wider">Units</div>
                        </div>
                        <div className="min-w-0 bg-black/20 px-3 py-2">
                          <div className="truncate text-sm font-semibold text-gray-100">
                            {formatCurrency(deal.askingPrice)}
                          </div>
                          <div className="text-gray-500 uppercase tracking-wider">Price</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <aside className="card min-w-0 bg-cre-surface/60">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Presets
            </h3>
            {presetsLoading ? (
              <p className="text-sm text-gray-500 mt-4">Loading presets...</p>
            ) : compatiblePresets.length === 0 ? (
              <p className="text-sm text-gray-500 mt-4">No saved presets for this workflow yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {compatiblePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="w-full min-w-0 border border-cre-border bg-black/20 p-3 text-left transition-colors hover:bg-white/5"
                  >
                    <div className="break-words text-sm font-medium text-gray-200">{preset.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {preset.inputs.scenario} - {preset.inputs.speed}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </section>
      )}

      {activeStep === 'workflow' && (
        <section className={workflowGridClassName}>
          {workflows.map((workflow) => {
            const selected = workflow.id === selectedWorkflow?.id
            const launching = launchingWorkflowId === workflow.id
            const workflowBlocked = Boolean(launchBlockMessageFor(workflow.id))
            return (
              <div
                key={workflow.id}
                className={`card min-w-0 bg-cre-surface/60 ${selected ? 'border-cre-accent' : ''}`}
              >
                <div className={compact ? 'space-y-3' : 'flex items-start justify-between gap-4'}>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white">{workflow.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{workflow.summary}</p>
                  </div>
                  <span className="status-badge w-fit shrink-0 bg-cre-info/20 text-cre-info">
                    {workflow.phases.length} phases
                  </span>
                </div>
                <p className="text-sm text-gray-300 mt-4">{workflow.operatorGoal}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {workflow.phases.map((phase) => (
                    <span
                      key={phase.phaseKey}
                      className="bg-black/20 px-2.5 py-1 text-xs text-gray-300"
                    >
                      {displayPhase(phase.phaseKey)}
                    </span>
                  ))}
                </div>
                <div className={compact ? 'mt-5 space-y-3' : 'mt-5 flex items-center justify-between gap-3'}>
                  <div className="text-xs text-gray-500">
                    {totalAgentCount(workflow)} agents - {workflow.recommendedScenario}
                  </div>
                  <div className={compact ? 'grid grid-cols-2 gap-2' : 'flex gap-2'}>
                    <button
                      type="button"
                      onClick={() => chooseWorkflow(workflow)}
                      className={buttonClassName(selected ? 'secondary' : 'ghost')}
                    >
                      {selected ? 'Selected' : 'Select'}
                    </button>
                    <button
                      type="button"
                      data-testid={workflowLaunchTestId(workflow.id)}
                      onClick={() => void handleLaunch(workflow)}
                      disabled={!selectedDeal || launching || (isCodexRun && !codexReady) || workflowBlocked}
                      className={buttonClassName('primary')}
                    >
                      {launching ? 'Launching...' : 'Launch'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {activeStep === 'review' && (
        <section className={reviewGridClassName}>
          <div className="card min-w-0">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
              Review Inputs
            </h3>
            <div className={reviewInputGridClassName}>
              <label className="block">
                <span className="block text-sm font-medium text-gray-200 mb-2">Deal</span>
                <select
                  data-testid="workflow-deal-select"
                  value={draft.dealId}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, dealId: event.target.value }))
                  }
                  disabled={lockDealSelection}
                  className={inputClassName()}
                >
                  {deals.map((deal) => (
                    <option key={deal.dealId} value={deal.dealId}>
                      {dealLabel(deal)}
                    </option>
                  ))}
                </select>
                {lockDealSelection && (
                  <span className="mt-2 block text-xs leading-5 text-gray-500">
                    Locked to the open workspace so saved presets cannot switch the launch to another deal.
                  </span>
                )}
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-200 mb-2">Workflow</span>
                <select
                  data-testid="workflow-select"
                  value={draft.workflowId}
                  onChange={(event) => {
                    const workflow = workflows.find((entry) => entry.id === event.target.value)
                    if (workflow) chooseWorkflow(workflow)
                  }}
                  className={inputClassName()}
                >
                  {workflows.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-200 mb-2">Runtime</span>
                <select
                  data-testid="workflow-runtime-provider-select"
                  value={draft.runtimeProvider}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      runtimeProvider: event.target.value as RuntimeProvider,
                      reset: event.target.value === 'codex' ? false : current.reset,
                    }))
                  }
                  className={inputClassName()}
                >
                  {RUNTIME_PROVIDERS.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-200 mb-2">Scenario</span>
                <select
                  data-testid="workflow-scenario-select"
                  value={draft.scenario}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      scenario: event.target.value as LaunchScenario,
                    }))
                  }
                  className={inputClassName()}
                >
                  {SCENARIOS.map((scenario) => (
                    <option key={scenario.value} value={scenario.value}>
                      {scenario.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-200 mb-2">Demo Speed</span>
                <select
                  data-testid="workflow-speed-select"
                  value={draft.speed}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, speed: event.target.value as RunSpeed }))
                  }
                  disabled={isCodexRun}
                  className={inputClassName()}
                >
                  {SPEEDS.map((speed) => (
                    <option key={speed.value} value={speed.value}>
                      {speed.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-200 mb-2">Demo Mode</span>
                <select
                  data-testid="workflow-mode-select"
                  value={draft.mode}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, mode: event.target.value as RunMode }))
                  }
                  disabled={isCodexRun}
                  className={inputClassName()}
                >
                  {MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
              {isCodexRun && (
                <>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-200 mb-2">Codex Agents</span>
                    <select
                      data-testid="workflow-codex-agent-limit-select"
                      value={
                        typeof draft.codexMaxAgents === 'number' && draft.codexMaxAgents > 0
                          ? String(draft.codexMaxAgents)
                          : ''
                      }
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          codexMaxAgents:
                            event.target.value === '' ? null : Number(event.target.value),
                        }))
                      }
                      className={inputClassName()}
                    >
                      {CODEX_AGENT_LIMITS.map((limit) => (
                        <option key={limit.value || 'all'} value={limit.value}>
                          {limit.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-200 mb-2">Codex Concurrency</span>
                    <input
                      data-testid="workflow-codex-concurrency-input"
                      type="number"
                      min={1}
                      max={4}
                      value={draft.codexConcurrency ?? 1}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          codexConcurrency: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                      className={inputClassName()}
                    />
                  </label>
                  <div
                    data-testid="workflow-codex-auth-card"
                    className="md:col-span-2 border border-cre-border bg-black/20 p-4 text-sm text-gray-300"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          ChatGPT Authentication
                        </div>
                        <div className="mt-1 text-base font-semibold text-white">{codexStatusLabel}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {codexStatus?.version || 'Codex CLI status will appear here.'}
                        </div>
                        <p className="mt-3 leading-6">
                          No authentication is stored in this repository. Codex CLI keeps credentials outside the project;
                          this app only checks status and starts the local login flow.
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          data-testid="workflow-codex-refresh-status"
                          onClick={() => void handleRefreshCodexStatus()}
                          disabled={codexStatusLoading}
                          className={buttonClassName('secondary')}
                        >
                          {codexStatusLoading ? 'Checking...' : 'Refresh Status'}
                        </button>
                        <button
                          type="button"
                          data-testid="workflow-codex-login-chatgpt"
                          onClick={() => void handleCodexLogin()}
                          disabled={codexLoginStarting || codexStatusLoading || codexReady}
                          className={buttonClassName('primary')}
                        >
                          {codexLoginStarting ? 'Starting...' : 'Login to ChatGPT'}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
              <label className="md:col-span-2 flex items-start gap-3 border border-cre-border bg-black/20 px-3 py-3 text-sm text-gray-200">
                <input
                  type="checkbox"
                  data-testid="workflow-require-source-backed-inputs"
                  checked={draft.requireSourceBackedInputs === true}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, requireSourceBackedInputs: event.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 accent-cre-accent"
                />
                <span>
                  <span className="block font-semibold text-white">Require source-backed launch inputs</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-500">
                    Block launch until this workflow's required fields have approved document evidence.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 border border-cre-border bg-black/20 px-3 py-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={!isCodexRun && draft.reset}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, reset: event.target.checked }))
                  }
                  disabled={isCodexRun}
                  className="h-4 w-4 accent-cre-accent"
                />
                Reset prior run artifacts before launch
              </label>
            </div>
            <label className="block mt-4">
              <span className="block text-sm font-medium text-gray-200 mb-2">Operator Notes</span>
              <textarea
                value={draft.notes || ''}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
                rows={4}
                className={inputClassName()}
                placeholder="Add lender constraints, IC deadline, diligence focus, or memo context."
              />
            </label>
          </div>

          <aside className="min-w-0 space-y-4">
            {selectedReadiness && (
              <div
                className="card min-w-0 bg-cre-surface/60"
                data-testid="workflow-launch-readiness"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                      Readiness Check
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Source-backed confidence for the selected workflow.
                    </p>
                  </div>
                  <span className={`status-badge ${readinessStatusClass(selectedReadiness.status)}`}>
                    {selectedReadiness.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                  <div className="bg-black/20 px-2 py-2">
                    <div className="text-sm font-semibold text-white">
                      {Math.max(
                        0,
                        selectedReadiness.sourceCoverage.requiredApprovedFieldCount -
                          selectedReadiness.sourceCoverage.missingApprovedFieldCount,
                      )}
                      /{selectedReadiness.sourceCoverage.requiredApprovedFieldCount}
                    </div>
                    <div className="mt-1 text-[11px] uppercase text-gray-500">Inputs</div>
                  </div>
                  <div className="bg-black/20 px-2 py-2">
                    <div className="text-sm font-semibold text-white">
                      {selectedReadiness.sourceCoverage.reviewReadyDocumentCount}
                    </div>
                    <div className="mt-1 text-[11px] uppercase text-gray-500">Review</div>
                  </div>
                  <div className="bg-black/20 px-2 py-2">
                    <div className="text-sm font-semibold text-white">
                      {selectedReadiness.warnings.length}
                    </div>
                    <div className="mt-1 text-[11px] uppercase text-gray-500">Warnings</div>
                  </div>
                  <div className="bg-black/20 px-2 py-2">
                    <div className={`text-sm font-semibold ${selectedReadiness.sourceCoverage.staleDocumentCount > 0 ? 'text-amber-200' : 'text-white'}`}>
                      {selectedReadiness.sourceCoverage.staleDocumentCount}
                    </div>
                    <div className="mt-1 text-[11px] uppercase text-gray-500">Stale</div>
                  </div>
                  <div className="bg-black/20 px-2 py-2">
                    <div className={`text-sm font-semibold ${selectedReadiness.sourceCoverage.invalidApprovedFieldCount > 0 ? 'text-amber-200' : 'text-white'}`}>
                      {selectedReadiness.sourceCoverage.invalidApprovedFieldCount}
                    </div>
                    <div className="mt-1 text-[11px] uppercase text-gray-500">Invalid</div>
                  </div>
                </div>
                {(sourceGateBlocked || selectedReadiness.blockers[0] || selectedReadiness.warnings[0]) && (
                  <p className="mt-3 text-xs leading-5 text-gray-500">
                    {sourceGateBlocked
                      ? selectedLaunchBlockMessage
                      : selectedReadiness.blockers[0] || selectedReadiness.warnings[0]}
                  </p>
                )}
                {!draft.requireSourceBackedInputs &&
                  (selectedReadiness.sourceCoverage.staleDocumentCount > 0 ||
                    selectedReadiness.sourceCoverage.invalidApprovedFieldCount > 0) && (
                    <p className="mt-3 border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                      Source gate is off, so launch is allowed as an operator override. Turn on source-backed launch inputs to block stale or invalid evidence.
                    </p>
                  )}
              </div>
            )}
            <div className="card min-w-0 bg-cre-surface/60">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Launch Package
              </h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Deal</dt>
                  <dd className="min-w-0 break-words text-right text-gray-200">{selectedDeal?.dealName || 'None'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Workflow</dt>
                  <dd className="min-w-0 break-words text-right text-gray-200">{selectedWorkflow?.name || 'None'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Scenario</dt>
                  <dd className="min-w-0 break-words text-right text-gray-200">{draft.scenario}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Runtime</dt>
                  <dd className="min-w-0 break-words text-right text-gray-200">
                    {isCodexRun ? 'Codex / ChatGPT' : 'Simulation Demo'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Coverage</dt>
                  <dd className="min-w-0 break-words text-right text-gray-200">
                    {selectedWorkflow?.phases.length ?? 0} phases, {totalAgentCount(selectedWorkflow)} agents
                  </dd>
                </div>
                {isCodexRun && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Codex Run</dt>
                    <dd className="min-w-0 break-words text-right text-gray-200">
                      {codexAgentLimitLabel} / {draft.codexConcurrency ?? 1} parallel
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  value={draft.presetName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, presetName: event.target.value }))
                  }
                  className={`${inputClassName()} flex-1 min-w-0`}
                  placeholder="Preset name"
                />
                <button
                  type="button"
                  data-testid="workflow-preset-save"
                  onClick={() => void handleSavePreset()}
                  disabled={!selectedWorkflow || savingPreset}
                  className={buttonClassName('secondary')}
                >
                  {savingPreset ? 'Saving...' : 'Save Preset'}
                </button>
              </div>
              <button
                type="button"
                data-testid="workflow-launch-selected"
                onClick={() => void handleLaunch()}
                disabled={!canLaunch || launchingWorkflowId !== null}
                className={`${buttonClassName('primary')} mt-4 w-full`}
              >
                {launchingWorkflowId ? 'Launching...' : 'Launch Selected Workflow'}
              </button>
            </div>

            {(localMessage || error) && (
              <div className="card bg-black/20 text-sm text-gray-300">
                {localMessage || error}
              </div>
            )}
          </aside>
        </section>
      )}
    </div>
  )
}

export { WorkflowLauncher }
export default WorkflowLauncher
