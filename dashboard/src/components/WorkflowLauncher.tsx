import { useEffect, useMemo, useState } from 'react'
import { useWorkflows } from '../hooks/useWorkflows'
import type { RunMode, RunSpeed } from '../types/checkpoint'
import type { DealLibraryItem, LaunchScenario } from '../types/deals'
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
}

const DRAFT_STORAGE_KEY = 'cre.workflowLauncher.v1'

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

function createInitialDraft(
  deals: DealLibraryItem[],
  defaultWorkflowId: string,
  initialDealId?: string,
): WorkflowSelectionDraft {
  const stored = readStoredDraft()
  const fallbackDealId = initialDealId || deals[0]?.dealId || ''
  return {
    dealId: typeof stored.dealId === 'string' ? stored.dealId : fallbackDealId,
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
    reset: typeof stored.reset === 'boolean' ? stored.reset : false,
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
    createInitialDraft(deals, 'full-acquisition-review', initialDealId)
  )
  const [activeStep, setActiveStep] = useState<'deal' | 'workflow' | 'review'>('deal')
  const [localMessage, setLocalMessage] = useState<string | null>(null)

  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.dealId === draft.dealId) ?? null,
    [deals, draft.dealId],
  )
  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === draft.workflowId) ?? workflows[0],
    [draft.workflowId, workflows],
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
    if (!selectedDeal && deals.length > 0) {
      setDraft((current) => ({ ...current, dealId: deals[0].dealId }))
    }
  }, [deals, selectedDeal])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [draft])

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
      dealId: preset.dealId || current.dealId,
      workflowId: preset.workflowId,
      scenario: preset.inputs.scenario,
      speed: preset.inputs.speed,
      mode: preset.inputs.mode,
      reset: preset.inputs.reset,
      notes: preset.inputs.notes || '',
      presetName: preset.name,
      presetId: preset.id,
    }))
    setActiveStep('review')
    setLocalMessage(`Loaded preset: ${preset.name}`)
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
          reset: draft.reset,
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

  async function handleLaunch(workflow: WorkflowDefinition | undefined = selectedWorkflow): Promise<void> {
    if (!workflow) {
      setLocalMessage('Workflow catalog is still loading.')
      return
    }
    if (!selectedDeal) {
      setLocalMessage('Choose a deal before launching.')
      setActiveStep('deal')
      return
    }
    try {
      const response = await launchWorkflow(workflow.id, {
        dealId: selectedDeal.dealId,
        presetId: draft.presetId,
        mode: draft.mode,
        speed: draft.speed,
        scenario: draft.scenario,
        reset: draft.reset,
        notes: draft.notes?.trim() || undefined,
      })
      const sourceCount = response.inputSnapshot?.sourceCoverage?.sourceDocumentCount
      setLocalMessage(
        `${workflow.name} launched for ${selectedDeal.dealName}${
          typeof sourceCount === 'number' ? ` with ${sourceCount} source docs captured` : ''
        }`,
      )
      onLaunchStarted?.(response)
    } catch (err) {
      setLocalMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const canLaunch = Boolean(selectedDeal && selectedWorkflow)
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
                  return (
                    <button
                      key={deal.dealId}
                      type="button"
                      onClick={() => {
                        setDraft((current) => ({ ...current, dealId: deal.dealId }))
                        setLocalMessage(null)
                      }}
                      className={`min-w-0 text-left border p-4 transition-colors ${
                        selected
                          ? 'border-cre-accent bg-cre-accent/10'
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
                      disabled={!selectedDeal || launching}
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
                  className={inputClassName()}
                >
                  {deals.map((deal) => (
                    <option key={deal.dealId} value={deal.dealId}>
                      {dealLabel(deal)}
                    </option>
                  ))}
                </select>
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
                <span className="block text-sm font-medium text-gray-200 mb-2">Run Speed</span>
                <select
                  data-testid="workflow-speed-select"
                  value={draft.speed}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, speed: event.target.value as RunSpeed }))
                  }
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
                <span className="block text-sm font-medium text-gray-200 mb-2">Mode</span>
                <select
                  value={draft.mode}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, mode: event.target.value as RunMode }))
                  }
                  className={inputClassName()}
                >
                  {MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 border border-cre-border bg-black/20 px-3 py-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={draft.reset}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, reset: event.target.checked }))
                  }
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
                  <dt className="text-gray-500">Coverage</dt>
                  <dd className="min-w-0 break-words text-right text-gray-200">
                    {selectedWorkflow?.phases.length ?? 0} phases, {totalAgentCount(selectedWorkflow)} agents
                  </dd>
                </div>
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
