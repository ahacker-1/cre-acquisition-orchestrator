import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconBuildingEstate,
  IconFolder,
  IconMessages,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconSparkles,
  IconX,
} from '@tabler/icons-react'
import { normalizeDealCheckpoint, useCheckpointData } from './hooks/useCheckpointData'
import ErrorBoundary from './components/ErrorBoundary'
import DealIntakeWizard from './components/DealIntakeWizard'
import DropZoneHero, { type OutcomeIntent } from './components/DropZoneHero'
import QuickDealCreate from './components/QuickDealCreate'
import SavedDealsPanel from './components/SavedDealsPanel'
import { useDealLibrary } from './hooks/useDealLibrary'
import { conversationPathForDeal } from './lib/conversationNavigation'
import { uploadDealDocument } from './lib/documentUpload'
import type { DealCheckpoint, PhaseInfo } from './types/checkpoint'
import type { DealLibraryItem, DealRecordResponse } from './types/deals'

type WorkspaceInitialTab = 'mission' | 'documents' | 'agents' | 'workpapers' | 'package' | 'advanced'
type WorkflowLauncherStep = 'deal' | 'workflow' | 'review'

const GUIDED_DEMO_DEAL_ID = 'parkview-2026-001'
const ConversationHome = lazy(() => import('./components/ConversationHome'))
const DealWorkspace = lazy(() => import('./components/DealWorkspace'))
const WorkflowLauncher = lazy(() => import('./components/WorkflowLauncher'))

function syncConversationUrlToDeal(dealId: string): void {
  if (typeof window === 'undefined') return
  const nextPath = conversationPathForDeal(window.location.href, dealId)
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextPath !== currentPath) window.history.replaceState(null, '', nextPath)
}

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
    const rawCheckpoint = asObject(record.checkpoint)
    const checkpointProperty = asObject(rawCheckpoint.property)
    const rawPhases = asObject(rawCheckpoint.phases)
    const normalized = normalizeDealCheckpoint({
      ...rawCheckpoint,
      dealId: asString(rawCheckpoint.dealId, record.item.dealId),
      dealName: asString(rawCheckpoint.dealName, record.item.dealName),
      property: {
        ...checkpointProperty,
        address: asString(checkpointProperty.address, asString(property.address, record.item.address || '')),
        city: asString(checkpointProperty.city, asString(property.city, record.item.city || '')),
        state: asString(checkpointProperty.state, asString(property.state, record.item.state || '')),
        zip: asString(checkpointProperty.zip, asString(property.zip)),
        totalUnits: asNumber(checkpointProperty.totalUnits, asNumber(property.totalUnits, record.item.totalUnits ?? 0)),
        askingPrice: asNumber(checkpointProperty.askingPrice, asNumber(asObject(record.deal.financials).askingPrice, record.item.askingPrice ?? 0)),
      },
      status: asString(rawCheckpoint.status, record.item.pipelineStatus || record.item.saveState),
      workflowName: asString(rawCheckpoint.workflowName, 'Deal Workspace'),
      overallProgress: asNumber(rawCheckpoint.overallProgress, 0),
      startedAt: asString(rawCheckpoint.startedAt, record.item.createdAt || record.item.updatedAt),
      lastUpdatedAt: asString(rawCheckpoint.lastUpdatedAt, record.item.updatedAt),
      phases: Object.keys(rawPhases).length > 0 ? rawPhases : {
        dueDiligence: pendingPhase('Due Diligence', 7),
        underwriting: pendingPhase('Underwriting', 3),
        financing: pendingPhase('Financing', 3),
        legal: pendingPhase('Legal', 6),
        closing: pendingPhase('Closing', 2),
      },
      resumeInstructions:
        asString(rawCheckpoint.resumeInstructions, 'Review source documents, phase outcomes, and the IC package.'),
    })
    if (normalized) return normalized
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
    conversationEvents,
    connected,
    reconnectAttempt,
    reconnectIn,
    runStatus,
    runRequestPending,
    startLiveRun,
    stopRun,
    refreshRunStatus,
  } = useCheckpointData()
  const overlayDialogRef = useRef<HTMLDivElement | null>(null)
  const overlayOpenerRef = useRef<HTMLElement | null>(null)
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
  const [workflowInitialStep, setWorkflowInitialStep] = useState<WorkflowLauncherStep>('deal')
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
  const [frontDoorPinned, setFrontDoorPinned] = useState(true)
  const [homeMode, setHomeMode] = useState<'conversation' | 'new-deal'>('conversation')
  const [conversationHomeDealId, setConversationHomeDealId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('deal')
  })

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

  function openConversationHome(dealId?: string): void {
    setLibraryError(null)
    setFrontDoorPinned(true)
    setWorkspaceCheckpoint(null)
    setWorkspaceInitialTab('documents')
    setGuidedDemoAutoStart(false)
    setFrontDoorOpen(true)
    setHomeMode('conversation')
    if (dealId) {
      setConversationHomeDealId(dealId)
      syncConversationUrlToDeal(dealId)
    }
    setLibraryOpen(false)
    setWorkflowOpen(false)
    setWizardOpen(false)
    scrollToPageTop()
  }

  function openNewDeal(): void {
    openConversationHome()
    setHomeMode('new-deal')
  }

  function openWorkflowControls(initialStep: WorkflowLauncherStep = 'deal'): void {
    setWorkflowInitialStep(initialStep)
    setWorkflowOpen(true)
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
    setConversationHomeDealId(dealId)
    setFrontDoorPinned(false)
    setFrontDoorOpen(false)
    setLibraryOpen(false)
    setWorkflowOpen(false)
    setWizardOpen(false)
    try {
      const record = await loadDeal(dealId)
      syncConversationUrlToDeal(dealId)
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
    await refreshDeals()
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('deal', dealId)
      url.searchParams.delete('agent')
      url.searchParams.delete('thread')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
    const opened = await openDealWorkspace(dealId, 'documents')
    if (!opened) openConversationHome(dealId)
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

  // Treat the two header overlays as real modal dialogs: contain focus, keep the page still,
  // support Escape, and return keyboard users to the control that opened the overlay.
  useEffect(() => {
    if (!libraryOpen && !workflowOpen) return
    overlayOpenerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    const focusFirstControl = window.requestAnimationFrame(() => {
      const dialog = overlayDialogRef.current
      const first = dialog?.querySelector<HTMLElement>(focusableSelector)
      ;(first ?? dialog)?.focus()
    })
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        setLibraryOpen(false)
        setWorkflowOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = overlayDialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector)
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFirstControl)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      const opener = overlayOpenerRef.current
      queueMicrotask(() => {
        // A library action can hand off directly to the edit wizard. Do not move focus behind
        // that successor modal after it has already claimed focus.
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
        opener?.focus()
      })
    }
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
    <div className="flex min-h-dvh flex-col bg-cre-bg text-gray-100">
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
              <button
                onClick={() => openConversationHome(visibleDealCheckpoint.dealId)}
                data-testid="header-conversations-button"
                className="p-2 text-gray-500 transition-colors hover:text-white"
                aria-label="Back to conversations"
                title="Back to conversations"
              >
                <IconMessages size={17} stroke={1.5} aria-hidden="true" />
              </button>
              <button onClick={() => openWorkflowControls()} data-testid="header-workflows-button" className="p-2 text-gray-500 transition-colors hover:text-white" aria-label="Advanced workflows" title="Advanced workflows">
                <IconAdjustmentsHorizontal size={17} stroke={1.5} aria-hidden="true" />
              </button>
              <button onClick={openNewDeal} data-testid="header-new-deal-button" className="p-2 text-gray-500 transition-colors hover:text-white" aria-label="New Deal" title="New Deal">
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
        <header className="shrink-0 border-b border-cre-border bg-[#0c151c]/72 px-4 py-3 backdrop-blur sm:px-8 sm:py-3.5">
          <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3">
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <span className="font-serif text-2xl font-medium tracking-[-0.04em] text-cre-primary" aria-hidden="true">AO</span>
              <div>
                <h1 className="sr-only text-sm font-medium text-cre-primary sm:not-sr-only">CRE Acquisition Orchestrator</h1>
                <div className="flex items-center gap-1.5 text-[9px] tracking-[0.06em] text-gray-500 sm:mt-1 sm:gap-2 sm:text-[10px] sm:tracking-[0.08em]" role="status" aria-live="polite">
                  <span className={`cre-dot ${connected ? 'cre-dot-done' : 'cre-dot-blocked'}`} aria-hidden="true" />
                  {connected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
            </div>
            <nav className="flex shrink-0 items-center gap-1 sm:gap-3" aria-label="Application actions">
              {runActive && (
                <>
                  <div
                    className="sr-only lg:not-sr-only lg:flex lg:min-h-10 lg:items-center lg:gap-3 lg:border lg:border-cre-live/25 lg:bg-cre-live/[0.06] lg:px-3 lg:text-[10px] lg:text-gray-300"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="cre-dot cre-dot-live cre-dot-pulse" aria-hidden="true" />
                    <span>Run: {runStateLabel}{runProviderLabel ? ` / ${runProviderLabel}` : ''}</span>
                  </div>
                  <button
                    type="button"
                    data-testid="header-stop-run"
                    onClick={() => void stopRun()}
                    disabled={!canStop || runRequestPending}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 border border-cre-danger/25 px-2 text-cre-danger transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 xl:px-3"
                    aria-label="Stop active run"
                  >
                    <IconPlayerStop size={14} stroke={1.5} aria-hidden="true" />
                    <span className="hidden xl:inline">Stop</span>
                  </button>
                </>
              )}
              <button onClick={() => openWorkflowControls()} data-testid="header-workflows-button" aria-label="Advanced workflows" title="Advanced workflows" className="portal-button portal-button-secondary min-h-11 min-w-11 px-2 sm:px-4">
                <IconAdjustmentsHorizontal size={16} stroke={1.5} aria-hidden="true" /> <span className="hidden sm:inline">Advanced</span>
              </button>
              <button onClick={() => setLibraryOpen(true)} data-testid="header-deals-button" aria-label="Deals" title="Deals" className="portal-button portal-button-secondary min-h-11 min-w-11 px-2 sm:px-4">
                <IconBuildingEstate size={16} stroke={1.5} aria-hidden="true" /> <span className="hidden sm:inline">Deals</span>
              </button>
              <button onClick={openNewDeal} data-testid="header-new-deal-button" aria-label="New Deal" title="New Deal" className="portal-button portal-button-primary min-h-11 min-w-11 px-2 sm:px-4">
                <IconPlus size={16} stroke={1.5} aria-hidden="true" /> <span className="hidden sm:inline">New Deal</span>
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
      <main className={visibleDealCheckpoint
        ? 'min-h-screen'
        : homeMode === 'conversation'
          ? 'min-h-0 flex-1'
          : 'mx-auto max-w-[1320px] px-5 py-10 sm:px-8 sm:py-14'}>
        <ErrorBoundary routeName={visibleDealCheckpoint ? 'Deal workspace' : 'Home'} onGoHome={openConversationHome}>
          {!visibleDealCheckpoint ? (
            homeMode === 'conversation' ? (
              <ErrorBoundary routeName="Deal conversations">
                <Suspense fallback={<RouteSkeleton label="Loading conversations..." />}>
                  <ConversationHome
                    deals={deals}
                    dealsLoading={dealsLoading}
                    dealsError={libraryError || dealsError}
                    conversationEvents={conversationEvents}
                    connected={connected}
                    initialDealId={conversationHomeDealId}
                    onOpenWorkspace={(dealId) => void openDealWorkspace(dealId, 'documents')}
                    onOpenAdvanced={() => openWorkflowControls('review')}
                    onNewDeal={openNewDeal}
                  />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <ErrorBoundary routeName="New deal">
                <div className="space-y-6">
                  <button
                    type="button"
                    onClick={() => openConversationHome()}
                    className="portal-button portal-button-secondary"
                    data-testid="back-to-conversations"
                  >
                    <IconArrowLeft size={16} stroke={1.5} aria-hidden="true" />
                    Back to conversations
                  </button>
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
            )
          ) : (
            <ErrorBoundary routeName="Deal workspace" onGoHome={openConversationHome}>
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
                  conversationEvents={conversationEvents}
                  conversationConnected={connected}
                  deals={deals}
                  initialTab={workspaceInitialTab}
                  startGuidedDemo={guidedDemoAutoStart}
                  onGuidedDemoConsumed={() => setGuidedDemoAutoStart(false)}
                  onOpenEditDetails={openEditDealWizard}
                  onOpenDeals={() => setLibraryOpen(true)}
                  onLaunchStarted={handleWorkflowLaunchStarted}
                  onPresetSaved={() => void refreshDeals()}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </ErrorBoundary>
      </main>

      {/* Footer - minimal, demo-friendly */}
      {!visibleDealCheckpoint && homeMode === 'new-deal' && <footer className="border-t border-cre-border px-6 py-4 text-center">
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
              ref={overlayDialogRef}
              tabIndex={-1}
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
                <ErrorBoundary routeName="Deal library" onGoHome={openConversationHome}>
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
              ref={overlayDialogRef}
              tabIndex={-1}
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
                <ErrorBoundary routeName="Workflow launcher" onGoHome={openConversationHome}>
                  <Suspense fallback={<RouteSkeleton label="Loading workflow launcher..." />}>
                    <WorkflowLauncher
                      deals={deals}
                      initialDealId={visibleDealCheckpoint?.dealId ?? conversationHomeDealId ?? undefined}
                      initialStep={workflowInitialStep}
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
