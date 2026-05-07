import { useEffect, useState, type ReactNode } from 'react'
import { useCheckpointData } from './hooks/useCheckpointData'
import ErrorBoundary from './components/ErrorBoundary'
import DealIntakeWizard from './components/DealIntakeWizard'
import SavedDealsPanel from './components/SavedDealsPanel'
import WorkflowLauncher from './components/WorkflowLauncher'
import DealWorkspace from './components/DealWorkspace'
import { useDealLibrary } from './hooks/useDealLibrary'
import type { DealCheckpoint, PhaseInfo } from './types/checkpoint'
import type { DealLibraryItem, DealRecordResponse } from './types/deals'

type WorkspaceInitialTab = 'overview' | 'documents'

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

// Demo-friendly: Show example pipeline phases before data loads
function ReadyToStartPanel({
  onCreateDeal,
  onStart,
  starting,
  runError,
  children,
}: {
  onCreateDeal: () => void
  onStart: () => void
  starting: boolean
  runError: string | null
  children: ReactNode
}) {
  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 border border-white/15 bg-white/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-cre-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-200 mb-1">Ready to Start</h2>
            <p className="text-gray-400 text-sm">
              Create a draft workspace, upload source documents, approve extracted inputs, then choose the operator workflow.
            </p>
          </div>
        </div>
      </div>

      <div className="card bg-cre-surface/50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Guided Start
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              New users can save a light draft first, then upload rent rolls, T12s, offering memos, LOIs, and legal files before filling every form field by hand.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCreateDeal}
              data-testid="empty-new-deal-button"
              className="px-4 py-2 text-sm font-semibold uppercase bg-white text-black hover:bg-gray-200 transition-colors"
            >
              Create Upload Workspace
            </button>
            <button
              onClick={onStart}
              disabled={starting}
              className="px-4 py-2 rounded-md text-sm font-semibold bg-white/5 text-gray-100 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {starting ? 'Starting...' : 'Run Demo'}
            </button>
          </div>
        </div>
        {runError && (
          <p className="text-xs text-cre-danger mt-3">
            {runError}
          </p>
        )}
      </div>

      {/* Pipeline Preview */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Pipeline Phases
        </h3>
        <div className="space-y-3">
          {[
            { name: 'Due Diligence', agents: 7, desc: 'Property analysis, market research, risk assessment' },
            { name: 'Underwriting', agents: 3, desc: 'Financial modeling, scenario analysis, return projections' },
            { name: 'Financing', agents: 3, desc: 'Lender outreach, term comparison, debt sizing' },
            { name: 'Legal', agents: 6, desc: 'PSA review, title search, estoppel tracking' },
            { name: 'Closing', agents: 2, desc: 'Readiness assessment, fund flow, final checklist' },
          ].map((phase, idx) => (
            <div
              key={phase.name}
              className="flex items-center gap-4 p-3 bg-cre-surface/30 border border-cre-border/50"
            >
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-sm font-medium">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-300">{phase.name}</span>
                  <span className="text-xs text-gray-600">{phase.agents} agents</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{phase.desc}</p>
              </div>
              <span className="text-xs text-gray-600 uppercase">Pending</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Start Instructions */}
      <div className="card bg-cre-surface/50">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Quick Start
        </h3>
        <ol className="space-y-2 text-sm text-gray-400">
          <li className="flex gap-2">
            <span className="text-cre-accent font-mono">1.</span>
            <span>Create a light draft workspace or choose one from the library below</span>
          </li>
          <li className="flex gap-2">
            <span className="text-cre-accent font-mono">2.</span>
            <span>Open Upload Docs, add financials, LOIs, offering memoranda, and legal files, then extract fields</span>
          </li>
          <li className="flex gap-2">
            <span className="text-cre-accent font-mono">3.</span>
            <span>Approve source-backed inputs and launch the workflow when the deal is ready</span>
          </li>
        </ol>
      </div>

      {children}
    </div>
  )
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
  const [workspaceInitialTab, setWorkspaceInitialTab] = useState<WorkspaceInitialTab>('overview')

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

  function recommendedScenarioForDeal(item: DealLibraryItem): 'core-plus' | 'value-add' | 'distressed' {
    if (item.investmentStrategy === 'value-add') return 'value-add'
    if (item.investmentStrategy === 'opportunistic') return 'distressed'
    return 'core-plus'
  }

  function openNewDealWizard(): void {
    setEditingDealId(null)
    setWizardOpen(true)
  }

  function openEditDealWizard(dealId: string): void {
    setEditingDealId(dealId)
    setWizardOpen(true)
    setLibraryOpen(false)
    setWorkflowOpen(false)
  }

  async function openDealWorkspace(dealId: string, section: WorkspaceInitialTab = 'overview'): Promise<void> {
    setLibraryError(null)
    try {
      const record = await loadDeal(dealId)
      setWorkspaceCheckpoint(checkpointFromDealRecord(record))
      setWorkspaceInitialTab(section)
      setLibraryOpen(false)
      setWorkflowOpen(false)
      setWizardOpen(false)
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleWorkflowLaunchStarted(): void {
    setLibraryError(null)
    setWorkflowOpen(false)
    setWorkspaceCheckpoint(null)
    void refreshDeals()
    void refreshRunStatus()
  }

  async function handleLaunchDeal(dealId: string): Promise<void> {
    const match = deals.find((item) => item.dealId === dealId)
    if (!match) return

    setLaunchingDealId(dealId)
    setLibraryError(null)
    try {
      await launchDeal(dealId, {
        scenario: recommendedScenarioForDeal(match),
        speed: 'normal',
        reset: match.kind === 'sample',
      })
      setWorkspaceCheckpoint(null)
      setLibraryOpen(false)
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : String(err))
    } finally {
      setLaunchingDealId(null)
    }
  }

  useEffect(() => {
    void refreshDeals()
  }, [refreshDeals, runStatus.runId, runStatus.state])

  const visibleDealCheckpoint = workspaceCheckpoint ?? dealCheckpoint
  const showingManualWorkspace = Boolean(workspaceCheckpoint)

  return (
    <div className="min-h-screen bg-cre-bg text-gray-100">
      {/* Header */}
      <header className="bg-cre-surface border-b border-cre-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">CRE Acquisition Dashboard</h1>
          {visibleDealCheckpoint && (
            <span className="text-sm text-gray-500">
              | {visibleDealCheckpoint.dealName || 'Unnamed Deal'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Run Status */}
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                runStatus.state === 'RUNNING' || runStatus.state === 'STARTING'
                  ? 'bg-cre-info'
                  : runStatus.state === 'FAILED'
                    ? 'bg-cre-danger'
                    : runStatus.state === 'COMPLETED'
                      ? 'bg-cre-success'
                      : 'bg-gray-500'
              }`}
            />
            <span className="text-gray-400">
              Run: {runStateLabel}
            </span>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                connected ? 'bg-cre-success' : 'bg-cre-danger'
              }`}
            />
            <span className="text-gray-400">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <button
            onClick={() => setWorkflowOpen(true)}
            data-testid="header-workflows-button"
            className="px-3 py-1.5 text-xs font-semibold uppercase bg-white text-black hover:bg-gray-200 transition-colors"
          >
            Workflows
          </button>

          <button
            onClick={openNewDealWizard}
            data-testid="header-new-deal-button"
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white/5 text-gray-100 hover:bg-white/10 transition-colors"
          >
            New Deal
          </button>

          <button
            onClick={() => setLibraryOpen(true)}
            data-testid="header-deals-button"
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white/5 text-gray-100 hover:bg-white/10 transition-colors"
          >
            Deals
          </button>

          <button
            onClick={() => void startLiveRun()}
            disabled={!canStart}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white/5 text-gray-100 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {runRequestPending ? 'Working...' : 'Run Demo'}
          </button>

          <button
            onClick={() => void stopRun()}
            disabled={!canStop || runRequestPending}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-cre-danger/80 text-white hover:bg-cre-danger disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Stop
          </button>
        </div>
      </header>

      {/* Reconnection Banner */}
      {!connected && reconnectAttempt > 0 && (
        <div className="bg-amber-900/60 border-b border-amber-700/50 px-6 py-2.5 flex items-center justify-center gap-3 text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
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
      <main className="p-6 max-w-[1440px] mx-auto">
        <ErrorBoundary>
          {!visibleDealCheckpoint ? (
            <ReadyToStartPanel
              onCreateDeal={openNewDealWizard}
              onStart={() => void startLiveRun()}
              starting={runRequestPending || runStatus.state === 'STARTING'}
              runError={runStatus.error}
            >
              <WorkflowLauncher
                deals={deals}
                onLaunchStarted={handleWorkflowLaunchStarted}
                onPresetSaved={() => void refreshDeals()}
              />

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
            </ReadyToStartPanel>
          ) : (
            <DealWorkspace
              dealCheckpoint={visibleDealCheckpoint}
              agentCheckpoints={showingManualWorkspace ? new Map() : agentCheckpoints}
              logEntries={showingManualWorkspace ? [] : logEntries}
              storyEvents={showingManualWorkspace ? [] : storyEvents}
              documentArtifacts={showingManualWorkspace ? [] : documentArtifacts}
              deals={deals}
              initialTab={workspaceInitialTab}
              onLaunchStarted={handleWorkflowLaunchStarted}
              onPresetSaved={() => void refreshDeals()}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Footer - minimal, demo-friendly */}
      <footer className="border-t border-cre-border px-6 py-3 text-center">
        <p className="text-xs text-gray-600">
          CRE Acquisition Orchestrator | AI-Powered Deal Analysis
        </p>
      </footer>

      {libraryOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-6 lg:p-10">
            <div
              data-testid="deal-library-modal"
              className="w-full max-w-6xl border border-cre-border bg-cre-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            >
              <div className="border-b border-cre-border px-6 py-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-cre-accent font-semibold">
                    Deal Library
                  </p>
                  <h2 className="text-2xl font-bold text-white mt-2">Saved and Sample Deals</h2>
                </div>
                <button
                  onClick={() => setLibraryOpen(false)}
                  className="rounded-full p-2 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                  aria-label="Close deal library"
                >
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                    <path d="M5 5L15 15M15 5L5 15" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="p-6">
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
              className="w-full max-w-6xl border border-cre-border bg-cre-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            >
              <div className="border-b border-cre-border px-6 py-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-cre-accent font-semibold">
                    Acquisition Cockpit
                  </p>
                  <h2 className="text-2xl font-bold text-white mt-2">Workflow Launcher</h2>
                </div>
                <button
                  onClick={() => setWorkflowOpen(false)}
                  className="rounded-full p-2 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                  aria-label="Close workflow launcher"
                >
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                    <path d="M5 5L15 15M15 5L5 15" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="p-6">
                <WorkflowLauncher
                  deals={deals}
                  initialDealId={visibleDealCheckpoint?.dealId}
                  onLaunchStarted={handleWorkflowLaunchStarted}
                  onPresetSaved={() => void refreshDeals()}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <DealIntakeWizard
        isOpen={wizardOpen}
        suggestedDealId={suggestedDealId}
        editingDealId={editingDealId}
        onClose={() => setWizardOpen(false)}
        onLoadDeal={loadDeal}
        onValidateDeal={validateDeal}
        onSaveDeal={saveDeal}
        onLaunchDeal={launchDeal}
        onSaved={(dealId, intent) => {
          setLibraryError(null)
          void refreshDeals()
          if (dealId && intent === 'documents') {
            void openDealWorkspace(dealId, 'documents')
          }
        }}
        onLaunched={() => {
          setLibraryError(null)
          void refreshDeals()
        }}
      />
    </div>
  )
}
