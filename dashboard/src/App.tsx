import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import {
  IconAdjustmentsHorizontal,
  IconBuildingEstate,
  IconFolder,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconSparkles,
  IconX,
} from '@tabler/icons-react'
import { useCheckpointData } from './hooks/useCheckpointData'
import ErrorBoundary from './components/ErrorBoundary'
import DealIntakeWizard from './components/DealIntakeWizard'
import DropZoneHero, { type OutcomeIntent } from './components/DropZoneHero'
import QuickDealCreate from './components/QuickDealCreate'
import SavedDealsPanel from './components/SavedDealsPanel'
import { useDealLibrary } from './hooks/useDealLibrary'
import { uploadDealDocument } from './lib/documentUpload'
import type { DealCheckpoint, PhaseInfo } from './types/checkpoint'
import type { DealLibraryItem, DealRecordResponse } from './types/deals'

type WorkspaceInitialTab = 'mission' | 'documents' | 'agents' | 'workpapers' | 'package' | 'advanced'

const GUIDED_DEMO_DEAL_ID = 'parkview-2026-001'
const DealWorkspace = lazy(() => import('./components/DealWorkspace'))
const WorkflowLauncher = lazy(() => import('./components/WorkflowLauncher'))

function RouteSkeleton({ label }: { label: string }) {
  return (
    <div className="portal-panel animate-pulse">
      <div className="h-4 w-40 bg-white/10" />
      <div className="mt-4 h-24 bg-white/5" />
      <p className="mt-3 text-sm text-gray-500">{label}</p>
    </div>
  )
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pendingPhase(name: string, totalAgents: number): PhaseInfo {
  return {
    name,
    status: 'pending',
    progress: 0,
    startedAt: null,
    completedAt: null,
    agents: {
      total: totalAgents,
      completed: 0,
      running: 0,
      failed: 0,
      pending: totalAgents,
      skipped: 0,
    },
    outputs: {
      phaseSummary: 'Waiting for source documents, criteria, and workflow launch.',
      keyFindings: [],
      redFlags: [],
      dataGaps: [],
      phaseVerdict: null,
    },
    agentStatuses: {},
    verdict: undefined,
  }
}

function checkpointFromDealRecord(record: DealRecordResponse): DealCheckpoint {
  const property = asObject(record.deal.property)
  if (record.checkpoint) {
    const checkpointProperty = asObject(record.checkpoint.property)
    return {
      ...record.checkpoint,
      dealId: record.checkpoint.dealId || record.item.dealId,
      dealName: record.checkpoint.dealName || record.item.dealName,
      property: {
        address: asString(checkpointProperty.address, asString(property.address, record.item.address || '')),
        city: asString(checkpointProperty.city, asString(property.city, record.item.city || '')),
        state: asString(checkpointProperty.state, asString(property.state, record.item.state || '')),
        zip: asString(checkpointProperty.zip, asString(property.zip)),
        totalUnits: asNumber(checkpointProperty.totalUnits, asNumber(property.totalUnits, record.item.totalUnits ?? 0)),
        askingPrice: asNumber(checkpointProperty.askingPrice, asNumber(asObject(record.deal.financials).askingPrice, record.item.askingPrice ?? 0)),
      },
      status: record.checkpoint.status || record.item.pipelineStatus || record.item.saveState,
      workflowName: record.checkpoint.workflowName || 'Deal Workspace',
      overallProgress: asNumber(record.checkpoint.overallProgress, 0),
      startedAt: asString(record.checkpoint.startedAt, record.item.createdAt || record.item.updatedAt),
      lastUpdatedAt: asString(record.checkpoint.lastUpdatedAt, record.item.updatedAt),
      phases: record.checkpoint.phases || {
        dueDiligence: pendingPhase('Due Diligence', 7),
        underwriting: pendingPhase('Underwriting', 3),
        financing: pendingPhase('Financing', 3),
        legal: pendingPhase('Legal', 6),
        closing: pendingPhase('Closing', 2),
      },
      resumeInstructions:
        record.checkpoint.resumeInstructions || 'Review source documents, phase outcomes, and the IC package.',
    }
  }
  return {
    dealId: record.item.dealId,
    dealName: record.item.dealName,
    property: {
      address: asString(property.address, record.item.address || ''),
      city: asString(property.city, record.item.city || ''),
      state: asString(property.state, record.item.state || ''),
      zip: asString(property.zip),
      totalUnits: asNumber(property.totalUnits, record.item.totalUnits ?? 0),
      askingPrice: asNumber(asObject(record.deal.financials).askingPrice, record.item.askingPrice ?? 0),
    },
    status: record.item.pipelineStatus || record.item.saveState,
    workflowName: 'Deal Workspace',
    overallProgress: 0,
    startedAt: record.item.createdAt || record.item.updatedAt,
    lastUpdatedAt: record.item.updatedAt,
    phases: {
      dueDiligence: pendingPhase('Due Diligence', 7),
      underwriting: pendingPhase('Underwriting', 3),
      financing: pendingPhase('Financing', 3),
      legal: pendingPhase('Legal', 6),
      closing: pendingPhase('Closing', 2),
    },
    resumeInstructions: 'Upload source documents, review extracted fields, then launch a workflow.',
  }
}

function checkpointFromDealLibraryItem(item: DealLibraryItem): DealCheckpoint {
  return {
    dealId: item.dealId,
    dealName: item.dealName,
    property: {
      address: item.address || '',
      city: item.city || '',
      state: item.state || '',
      totalUnits: item.totalUnits ?? 0,
      askingPrice: item.askingPrice ?? 0,
    },
    status: item.pipelineStatus || 'running',
    workflowName: 'Full Acquisition Review',
    overallProgress: 0,
    startedAt: item.createdAt || item.updatedAt,
    lastUpdatedAt: item.updatedAt,
    phases: {
      dueDiligence: pendingPhase('Due Diligence', 7),
      underwriting: pendingPhase('Underwriting', 3),
      financing: pendingPhase('Financing', 3),
      legal: pendingPhase('Legal', 6),
      closing: pendingPhase('Closing', 2),
    },
    resumeInstructions: 'Workflow launched. Waiting for live checkpoint updates from the run.',
  }
}

function scrollToPageTop(): void {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  })
}

export default function App() {
  const {
    dealCheckpoint,
    agentCheckpoints,
    logEntries,
    storyEvents,
    documentArtifacts,
    connected,
    reconnectAttempt,
    reconnectIn,
    runStatus,
    runRequestPending,
    startLiveRun,
    stopRun,
    refreshRunStatus,
  } = useCheckpointData()
  const {
    deals,
    suggestedDealId,
    loading: dealsLoading,
    error: dealsError,
    refreshDeals,
    loadDeal,
    validateDeal,
    saveDeal,
    launchDeal,
  } = useDealLibrary()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [editingDealId, setEditingDealId] = useState<string | null>(null)
  const [launchingDealId, setLaunchingDealId] = useState<string | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [workspaceCheckpoint, setWorkspaceCheckpoint] = useState<DealCheckpoint | null>(null)
  const [workspaceInitialTab, setWorkspaceInitialTab] = useState<WorkspaceInitialTab>('documents')
  const [frontDoorOpen, setFrontDoorOpen] = useState(true)
  const [guidedDemoAutoStart, setGuidedDemoAutoStart] = useState(false)
  const [guidedDemoLoading, setGuidedDemoLoading] = useState(false)
  const [quickCreateFiles, setQuickCreateFiles] = useState<File[]>([])
  const [quickCreateIntent, setQuickCreateIntent] = useState<OutcomeIntent>('ic-package')
  const [quickCreateGoal, setQuickCreateGoal] = useState('Build an IC-ready acquisition package')
  const [frontDoorPinned, setFrontDoorPinned] = useState(false)

  // Demo-friendly: Default to Pipeline tab, auto-expand relevant sections
  const runActive = runStatus.state === 'STARTING' || runStatus.state === 'RUNNING' || runStatus.state === 'STOPPING'
  const canStart = !runActive && !runRequestPending
  const canStop = runStatus.state === 'STARTING' || runStatus.state === 'RUNNING'

  const runStateLabel = (() => {
    switch (runStatus.state) {
      case 'STARTING':
        return 'Starting'
      case 'RUNNING':
        return 'Running'
      case 'STOPPING':
        return 'Stopping'
      case 'COMPLETED':
        return 'Completed'
      case 'FAILED':
        return 'Failed'
      case 'STOPPED':
        return 'Stopped'
      default:
        return 'Idle'
    }
  })()
  const runProviderLabel =
    runStatus.runtimeProvider === 'codex'
      ? 'Codex'
      : runStatus.runtimeProvider === 'simulation'
        ? 'Simulation'
        : null

  function recommendedScenarioForDeal(item: DealLibraryItem): 'core-plus' | 'value-add' | 'distressed' {
    if (item.investmentStrategy === 'value-add') return 'value-add'
    if (item.investmentStrategy === 'opportunistic') return 'distressed'
    return 'core-plus'
  }

  function openUploadFrontDoor(): void {
    setLibraryError(null)
    setFrontDoorPinned(true)
    setWorkspaceCheckpoint(null)
    setWorkspaceInitialTab('documents')
    setGuidedDemoAutoStart(false)
    setFrontDoorOpen(true)
    setLibraryOpen(false)
    setWorkflowOpen(false)
    setWizardOpen(false)
    scrollToPageTop()
  }

  function openEditDealWizard(dealId: string): void {
    setFrontDoorPinned(false)
    setFrontDoorOpen(false)
    setEditingDealId(dealId)
    setWizardOpen(true)
    setLibraryOpen(false)
    setWorkflowOpen(false)
  }

  async function openDealWorkspace(dealId: string, section: WorkspaceInitialTab = 'documents'): Promise<boolean> {
    setLibraryError(null)
    setFrontDoorPinned(false)
    setFrontDoorOpen(false)
    setLibraryOpen(false)
    setWorkflowOpen(false)
    setWizardOpen(false)
    try {
      const record = await loadDeal(dealId)
      setWorkspaceCheckpoint(checkpointFromDealRecord(record))
      setWorkspaceInitialTab(section)
      scrollToPageTop()
      return true
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  async function openGuidedDemo(): Promise<void> {
    setGuidedDemoLoading(true)
    setGuidedDemoAutoStart(false)
    const opened = await openDealWorkspace(GUIDED_DEMO_DEAL_ID, 'mission')
    if (opened) {
      setGuidedDemoAutoStart(true)
    }
    setGuidedDemoLoading(false)
  }

  function handleQuickFiles(files: File[], intent: OutcomeIntent, goalText: string): void {
    setLibraryError(null)
    setFrontDoorPinned(true)
    setFrontDoorOpen(true)
    setQuickCreateIntent(intent)
    setQuickCreateGoal(goalText)
    setQuickCreateFiles(files)
  }

  async function handleQuickDealCreated(dealId: string): Promise<void> {
    setQuickCreateFiles([])
    setFrontDoorPinned(false)
    setFrontDoorOpen(false)
    await refreshDeals()
    await openDealWorkspace(dealId, 'documents')
  }

  function handleWorkflowLaunchStarted(): void {
    setLibraryError(null)
    setFrontDoorPinned(false)
    setFrontDoorOpen(false)
    setWorkflowOpen(false)
    setWorkspaceCheckpoint(null)
    void refreshDeals()
    void refreshRunStatus()
    scrollToPageTop()
  }

  async function handleLaunchDeal(dealId: string): Promise<void> {
    const match = deals.find((item) => item.dealId === dealId)
    if (!match) return

    setLaunchingDealId(dealId)
    setLibraryError(null)
    try {
      const launchResponse = await launchDeal(dealId, {
        scenario: recommendedScenarioForDeal(match),
        speed: 'normal',
        reset: match.kind === 'sample',
        runtimeProvider: 'codex',
        codexMaxAgents: null,
        codexConcurrency: 2,
        codexSearch: true,
      })
      setFrontDoorPinned(false)
      setFrontDoorOpen(false)
      setWorkspaceCheckpoint(checkpointFromDealLibraryItem(launchResponse.deal))
      setLibraryOpen(false)
      scrollToPageTop()
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : String(err))
    } finally {
      setLaunchingDealId(null)
    }
  }

  useEffect(() => {
    void refreshDeals()
  }, [refreshDeals, runStatus.runId, runStatus.state])

  useEffect(() => {
    const shouldRevealRunWorkspace =
      dealCheckpoint &&
      !frontDoorPinned &&
      (runActive || runStatus.state === 'COMPLETED')

    if (shouldRevealRunWorkspace) {
      setFrontDoorOpen(false)
    }
  }, [dealCheckpoint, frontDoorPinned, runActive, runStatus.runId, runStatus.state])

  useEffect(() => {
    if (workspaceCheckpoint && dealCheckpoint?.dealId === workspaceCheckpoint.dealId && runActive) {
      setWorkspaceCheckpoint(null)
    }
  }, [dealCheckpoint, runActive, workspaceCheckpoint])

  // Dialog a11y: let keyboard users dismiss the header overlays (deal library / workflow
  // launcher) with Escape, matching the role="dialog" + aria-modal semantics they carry.
  useEffect(() => {
    if (!libraryOpen && !workflowOpen) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setLibraryOpen(false)
      setWorkflowOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [libraryOpen, workflowOpen])

  const visibleDealCheckpoint = frontDoorOpen ? null : workspaceCheckpoint ?? dealCheckpoint
  const showingManualWorkspace = Boolean(workspaceCheckpoint)
  // W72: the partial-failure recovery panel reads the LIVE checkpoint + live agent
  // checkpoints for the viewed deal even when the manual workspace is the active view, so
  // failed agents surface without the live checkpoint hijacking the manual workspace.
  const recoveryDealCheckpoint =
    !frontDoorOpen && dealCheckpoint && visibleDealCheckpoint && dealCheckpoint.dealId === visibleDealCheckpoint.dealId
      ? dealCheckpoint
      : null
  const visibleStoryEvents = useMemo(() => {
    if (!visibleDealCheckpoint) return []
    return storyEvents.filter((event) => event.dealId === visibleDealCheckpoint.dealId)
  }, [storyEvents, visibleDealCheckpoint])
  const visibleDocumentArtifacts = useMemo(() => {
    if (!visibleDealCheckpoint) return []
    return documentArtifacts.filter((artifact) => artifact.dealId === visibleDealCheckpoint.dealId)
  }, [documentArtifacts, visibleDealCheckpoint])

  return (
    <div className="min-h-screen bg-cre-bg text-gray-100">
      {/* The workspace turns the global toolbar into a quiet utility dock inside the left rail. */}
      {visibleDealCheckpoint ? (
        <header className="fixed bottom-0 left-0 z-30 w-full border-t border-cre-border bg-[#0c151c]/95 px-4 py-3 backdrop-blur xl:w-[185px]" aria-label="Workspace utilities">
          <h1 className="sr-only">CRE Acquisition Orchestrator</h1>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[10px] text-gray-500" role="status" aria-live="polite">
              <span className={`cre-dot ${connected ? 'cre-dot-done' : 'cre-dot-blocked'}`} aria-hidden="true" />
              <span>{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setWorkflowOpen(true)} data-testid="header-workflows-button" className="p-2 text-gray-500 transition-colors hover:text-white" aria-label="Advanced workflows" title="Advanced workflows">
                <IconAdjustmentsHorizontal size={17} stroke={1.5} aria-hidden="true" />
              </button>
              <button onClick={openUploadFrontDoor} data-testid="header-new-deal-button" className="p-2 text-gray-500 transition-colors hover:text-white" aria-label="New Deal" title="New Deal">
                <IconPlus size={17} stroke={1.5} aria-hidden="true" />
              </button>
              <button onClick={() => setLibraryOpen(true)} data-testid="header-deals-button" className="p-2 text-gray-500 transition-colors hover:text-white" aria-label="Deals" title="Deals">
                <IconFolder size={17} stroke={1.5} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-cre-border pt-2">
            <div className="min-w-0 text-[9px] leading-4 text-gray-600" role="status" aria-live="polite">
              Run: {runStateLabel}{runProviderLabel ? ` / ${runProviderLabel}` : ''}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => void openGuidedDemo()}
                data-testid="guided-demo-header-cta"
                disabled={guidedDemoLoading}
                className="p-1.5 text-gray-500 transition-colors hover:text-cre-accent disabled:opacity-40"
                aria-label={guidedDemoLoading ? 'Opening Parkview demo' : 'Open Parkview demo'}
                title="Parkview demo"
              >
                <IconSparkles size={16} stroke={1.5} aria-hidden="true" />
              </button>
              <button
                onClick={() => { setFrontDoorPinned(false); setFrontDoorOpen(false); void startLiveRun() }}
                disabled={!canStart}
                className="p-1.5 text-gray-500 transition-colors hover:text-cre-success disabled:opacity-35"
                aria-label={runRequestPending ? 'Working' : 'Run Codex'}
                title="Run Codex"
              >
                <IconPlayerPlay size={16} stroke={1.5} aria-hidden="true" />
              </button>
              <button onClick={() => void stopRun()} disabled={!canStop || runRequestPending} className="p-1.5 text-gray-500 transition-colors hover:text-cre-danger disabled:opacity-35" aria-label="Stop" title="Stop">
                <IconPlayerStop size={16} stroke={1.5} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header className="border-b border-cre-border bg-[#0c151c]/72 px-5 py-5 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-[1320px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="font-serif text-2xl font-medium tracking-[-0.04em] text-cre-primary" aria-hidden="true">AO</span>
              <div>
                <h1 className="text-sm font-medium text-cre-primary">CRE Acquisition Orchestrator</h1>
                <div className="mt-1 flex items-center gap-2 text-[10px] tracking-[0.08em] text-gray-500" role="status" aria-live="polite">
                  <span className={`cre-dot ${connected ? 'cre-dot-done' : 'cre-dot-blocked'}`} aria-hidden="true" />
                  {connected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
            </div>
            <nav className="flex flex-wrap items-center gap-3" aria-label="Application actions">
              {runActive && (
                <div
                  className="flex min-h-10 items-center gap-3 border border-cre-live/25 bg-cre-live/[0.06] px-3 text-[10px] text-gray-300"
                  role="status"
                  aria-live="polite"
                >
                  <span className="cre-dot cre-dot-live cre-dot-pulse" aria-hidden="true" />
                  <span>Run: {runStateLabel}{runProviderLabel ? ` / ${runProviderLabel}` : ''}</span>
                  <button
                    type="button"
                    data-testid="header-stop-run"
                    onClick={() => void stopRun()}
                    disabled={!canStop || runRequestPending}
                    className="inline-flex min-h-7 items-center gap-1.5 border-l border-cre-border pl-3 text-cre-danger transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Stop active run"
                  >
                    <IconPlayerStop size={14} stroke={1.5} aria-hidden="true" />
                    Stop
                  </button>
                </div>
              )}
              <button onClick={() => setWorkflowOpen(true)} data-testid="header-workflows-button" className="portal-button portal-button-secondary min-h-10 px-4">
                <IconAdjustmentsHorizontal size={16} stroke={1.5} aria-hidden="true" /> Advanced
              </button>
              <button onClick={() => setLibraryOpen(true)} data-testid="header-deals-button" className="portal-button portal-button-secondary min-h-10 px-4">
                <IconBuildingEstate size={16} stroke={1.5} aria-hidden="true" /> Deals
              </button>
              <button onClick={openUploadFrontDoor} data-testid="header-new-deal-button" className="portal-button portal-button-primary min-h-10 px-4">
                <IconPlus size={16} stroke={1.5} aria-hidden="true" /> New Deal
              </button>
            </nav>
          </div>
        </header>
      )}

      {/* Reconnection Banner */}
      {!connected && reconnectAttempt > 0 && (
        <div className="bg-amber-900/60 border-b border-amber-700/50 px-6 py-2.5 flex items-center justify-center gap-3 text-sm" role="status" aria-live="polite">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
          <span className="text-amber-200">
            Reconnecting{reconnectIn > 0 ? ` in ${reconnectIn}s` : '...'}{' '}
            <span className="text-amber-400/80">
              (attempt {reconnectAttempt} of 20)
            </span>
          </span>
          <button
            onClick={() => window.location.reload()}
            className="ml-2 px-2 py-0.5 rounded text-xs bg-amber-700/50 text-amber-200 hover:bg-amber-700/70 transition-colors"
          >
            Refresh Now
          </button>
        </div>
      )}

      {/* Content */}
      <main className={visibleDealCheckpoint ? 'min-h-screen' : 'mx-auto max-w-[1320px] px-5 py-10 sm:px-8 sm:py-14'}>
        <ErrorBoundary routeName={visibleDealCheckpoint ? 'Deal workspace' : 'Home'} onGoHome={openUploadFrontDoor}>
          {!visibleDealCheckpoint ? (
            <ErrorBoundary routeName="New deal">
              <div className="space-y-6">
                <DropZoneHero
                  onFilesSelected={handleQuickFiles}
                  onTryDemo={() => void openGuidedDemo()}
                  starting={guidedDemoLoading}
                  runError={runStatus.error}
                />
                <SavedDealsPanel
                  variant="compact"
                  deals={deals}
                  loading={dealsLoading}
                  error={libraryError || dealsError}
                  onEditDeal={openEditDealWizard}
                  onOpenWorkspace={(dealId, section) => void openDealWorkspace(dealId, section)}
                  onLaunchDeal={(dealId) => void handleLaunchDeal(dealId)}
                  onViewAll={() => setLibraryOpen(true)}
                  launchingDealId={launchingDealId}
                  activeRunDealPath={runStatus.dealPath}
                  activeRunState={runStatus.state}
                />
              </div>
            </ErrorBoundary>
          ) : (
            <ErrorBoundary routeName="Deal workspace" onGoHome={openUploadFrontDoor}>
              <Suspense fallback={<RouteSkeleton label="Loading workspace..." />}>
                <DealWorkspace
                  key={visibleDealCheckpoint.dealId}
                  dealCheckpoint={visibleDealCheckpoint}
                  agentCheckpoints={showingManualWorkspace ? new Map() : agentCheckpoints}
                  liveDealCheckpoint={recoveryDealCheckpoint}
                  liveAgentCheckpoints={recoveryDealCheckpoint ? agentCheckpoints : new Map()}
                  logEntries={showingManualWorkspace ? [] : logEntries}
                  storyEvents={visibleStoryEvents}
                  documentArtifacts={visibleDocumentArtifacts}
                  deals={deals}
                  initialTab={workspaceInitialTab}
                  startGuidedDemo={guidedDemoAutoStart}
                  onGuidedDemoConsumed={() => setGuidedDemoAutoStart(false)}
                  onOpenEditDetails={openEditDealWizard}
                  onLaunchStarted={handleWorkflowLaunchStarted}
                  onPresetSaved={() => void refreshDeals()}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </ErrorBoundary>
      </main>

      {/* Footer - minimal, demo-friendly */}
      {!visibleDealCheckpoint && <footer className="border-t border-cre-border px-6 py-4 text-center">
        <p className="text-xs text-gray-600">
          CRE Acquisition Orchestrator · Built by{' '}
          <a
            href="https://www.theaiconsultingnetwork.com"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:text-gray-300 hover:underline"
          >
            Avi Hacker, J.D. — The AI Consulting Network
          </a>
        </p>
      </footer>}

      {libraryOpen && (
        <div data-testid="deal-library-backdrop" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-6 lg:p-10">
            <div
              data-testid="deal-library-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="deal-library-title"
              className="w-full max-w-6xl border border-cre-border bg-cre-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            >
              <div className="border-b border-cre-border px-6 py-5 flex items-start justify-between gap-4">
                <div>
                  <p className="portal-kicker text-cre-accent">
                    Deal Library
                  </p>
                  <h2 id="deal-library-title" className="mt-2 font-serif text-3xl font-medium text-cre-primary">Saved and Sample Deals</h2>
                </div>
                <button
                  onClick={() => setLibraryOpen(false)}
                  className="rounded-full p-2 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                  aria-label="Close deal library"
                >
                  <IconX size={20} stroke={1.5} aria-hidden="true" />
                </button>
              </div>
              <div className="p-6">
                <ErrorBoundary routeName="Deal library" onGoHome={openUploadFrontDoor}>
                  <SavedDealsPanel
                    deals={deals}
                    loading={dealsLoading}
                    error={libraryError || dealsError}
                    onEditDeal={openEditDealWizard}
                    onOpenWorkspace={(dealId, section) => void openDealWorkspace(dealId, section)}
                    onLaunchDeal={(dealId) => void handleLaunchDeal(dealId)}
                    launchingDealId={launchingDealId}
                    activeRunDealPath={runStatus.dealPath}
                    activeRunState={runStatus.state}
                  />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      )}

      {workflowOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-6 lg:p-10">
            <div
              data-testid="workflow-launcher-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="workflow-launcher-title"
              className="w-full max-w-6xl border border-cre-border bg-cre-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            >
              <div className="border-b border-cre-border px-6 py-5 flex items-start justify-between gap-4">
                <div>
                  <p className="portal-kicker text-cre-accent">
                    Advanced Orchestration Controls
                  </p>
                  <h2 id="workflow-launcher-title" className="mt-2 font-serif text-3xl font-medium text-cre-primary">Launch Orchestration</h2>
                </div>
                <button
                  onClick={() => setWorkflowOpen(false)}
                  className="rounded-full p-2 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                  aria-label="Close workflow launcher"
                >
                  <IconX size={20} stroke={1.5} aria-hidden="true" />
                </button>
              </div>
              <div className="p-6">
                <ErrorBoundary routeName="Workflow launcher" onGoHome={openUploadFrontDoor}>
                  <Suspense fallback={<RouteSkeleton label="Loading workflow launcher..." />}>
                    <WorkflowLauncher
                      deals={deals}
                      initialDealId={visibleDealCheckpoint?.dealId}
                      onLaunchStarted={handleWorkflowLaunchStarted}
                      onPresetSaved={() => void refreshDeals()}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      )}

      <DealIntakeWizard
        isOpen={wizardOpen}
        suggestedDealId={suggestedDealId}
        editingDealId={editingDealId}
        onClose={() => {
          setWizardOpen(false)
          setEditingDealId(null)
        }}
        onLoadDeal={loadDeal}
        onValidateDeal={validateDeal}
        onSaveDeal={saveDeal}
        onLaunchDeal={launchDeal}
        onSaved={async (dealId, intent) => {
          setLibraryError(null)
          await refreshDeals()
          if (dealId && intent === 'documents') {
            await openDealWorkspace(dealId, 'documents')
          }
        }}
        onLaunched={() => {
          setLibraryError(null)
          setFrontDoorPinned(false)
          setFrontDoorOpen(false)
          void refreshDeals()
          scrollToPageTop()
        }}
      />

      <QuickDealCreate
        files={quickCreateFiles}
        intent={quickCreateIntent}
        goalText={quickCreateGoal}
        suggestedDealId={suggestedDealId}
        dealIdReady={!dealsLoading && !dealsError && Boolean(suggestedDealId)}
        isOpen={quickCreateFiles.length > 0}
        onCancel={() => setQuickCreateFiles([])}
        onCreated={(dealId) => void handleQuickDealCreated(dealId)}
        saveDeal={saveDeal}
        uploadDealDocument={uploadDealDocument}
      />
    </div>
  )
}
