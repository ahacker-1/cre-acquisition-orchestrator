import { useEffect, useState, type ReactNode } from 'react'
import { useCheckpointData } from './hooks/useCheckpointData'
import ErrorBoundary from './components/ErrorBoundary'
import DealHeader from './components/DealHeader'
import PipelineView from './components/PipelineView'
import AgentTree from './components/AgentTree'
import LogStream from './components/LogStream'
import FindingsPanel from './components/FindingsPanel'
import TimelineView from './components/TimelineView'
import FinalReport from './components/FinalReport'
import StoryNarrative from './components/StoryNarrative'
import DocumentWall from './components/DocumentWall'
import DecisionLog from './components/DecisionLog'
import DealIntakeWizard from './components/DealIntakeWizard'
import SavedDealsPanel from './components/SavedDealsPanel'
import { useDealLibrary } from './hooks/useDealLibrary'
import type { DealLibraryItem } from './types/deals'

type TabName =
  | 'Pipeline'
  | 'Agent Tree'
  | 'Logs'
  | 'Findings'
  | 'Timeline'
  | 'Story'
  | 'Documents'
  | 'Decisions'
  | 'Final Report'

const TABS: TabName[] = ['Pipeline', 'Agent Tree', 'Timeline', 'Findings', 'Story', 'Documents', 'Decisions', 'Logs']

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
          <div className="w-12 h-12 rounded-lg bg-cre-accent/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-cre-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-200 mb-1">Ready to Start</h2>
            <p className="text-gray-400 text-sm">
              Create a deal from the dashboard, continue a saved draft, or launch one of the included sample analyses.
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
              New users should start with the deal wizard. Demo mode is still available for the classic sample run.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCreateDeal}
              data-testid="empty-new-deal-button"
              className="px-4 py-2 rounded-md text-sm font-semibold bg-cre-accent text-white hover:brightness-110 transition-colors"
            >
              New Deal
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
              className="flex items-center gap-4 p-3 rounded-lg bg-cre-surface/30 border border-cre-border/50"
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
            <span>Create a deal in the wizard or choose one from the library below</span>
          </li>
          <li className="flex gap-2">
            <span className="text-cre-accent font-mono">2.</span>
            <span>Review the launch check and save the deal to a reusable path</span>
          </li>
          <li className="flex gap-2">
            <span className="text-cre-accent font-mono">3.</span>
            <span>Launch the pipeline and monitor progress here in real time</span>
          </li>
        </ol>
      </div>

      {children}
    </div>
  )
}

// Demo-friendly: Show example findings structure
function EmptyFindingsPreview() {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Findings Preview
      </h3>
      <p className="text-gray-500 text-sm mb-4">
        As agents complete their analysis, findings will appear here organized by category.
      </p>
      <div className="space-y-3">
        {[
          { type: 'Red Flag', color: 'bg-cre-danger', desc: 'Critical issues requiring attention' },
          { type: 'Warning', color: 'bg-cre-warning', desc: 'Moderate concerns to address' },
          { type: 'Info', color: 'bg-cre-info', desc: 'Neutral findings and observations' },
          { type: 'Positive', color: 'bg-cre-success', desc: 'Favorable indicators' },
        ].map((item) => (
          <div key={item.type} className="flex items-center gap-3 p-2 rounded bg-cre-surface/30">
            <span className={`w-3 h-3 rounded-full ${item.color}`} />
            <span className="text-gray-300 text-sm font-medium">{item.type}</span>
            <span className="text-gray-500 text-xs">{item.desc}</span>
          </div>
        ))}
      </div>
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
  const [activeTab, setActiveTab] = useState<TabName>('Pipeline')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [editingDealId, setEditingDealId] = useState<string | null>(null)
  const [launchingDealId, setLaunchingDealId] = useState<string | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)

  // Demo-friendly: Default to Pipeline tab, auto-expand relevant sections
  const hasActiveData = dealCheckpoint && !/^pending$/i.test(dealCheckpoint.status)
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

  return (
    <div className="min-h-screen bg-cre-bg text-gray-100">
      {/* Header */}
      <header className="bg-cre-surface border-b border-cre-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">CRE Acquisition Dashboard</h1>
          {dealCheckpoint && (
            <span className="text-sm text-gray-500">
              | {dealCheckpoint.dealName || 'Unnamed Deal'}
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
            onClick={openNewDealWizard}
            data-testid="header-new-deal-button"
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-cre-accent text-white hover:brightness-110 transition-colors"
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
          {!dealCheckpoint ? (
            <ReadyToStartPanel
              onCreateDeal={openNewDealWizard}
              onStart={() => void startLiveRun()}
              starting={runRequestPending || runStatus.state === 'STARTING'}
              runError={runStatus.error}
            >
              <SavedDealsPanel
                deals={deals}
                loading={dealsLoading}
                error={libraryError || dealsError}
                onEditDeal={openEditDealWizard}
                onLaunchDeal={(dealId) => void handleLaunchDeal(dealId)}
                launchingDealId={launchingDealId}
                activeRunDealPath={runStatus.dealPath}
                activeRunState={runStatus.state}
              />
            </ReadyToStartPanel>
          ) : (
            <>
              <DealHeader dealCheckpoint={dealCheckpoint} />

              {/* Tab Bar */}
              <div className="flex gap-1 mt-6 border-b border-cre-border">
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`tab ${activeTab === tab ? 'tab-active' : 'tab-inactive'}`}
                  >
                    {tab}
                    {/* Badge for findings count */}
                    {tab === 'Findings' && hasActiveData && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-cre-surface text-gray-400">
                        {Array.from(agentCheckpoints.values()).reduce(
                          (sum, a) => sum + (a.outputs?.findings?.length || 0),
                          0
                        ) || '-'}
                      </span>
                    )}
                    {/* Badge for log entries */}
                    {tab === 'Logs' && logEntries.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-cre-surface text-gray-400">
                        {logEntries.length}
                      </span>
                    )}
                    {tab === 'Story' && storyEvents.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-cre-surface text-gray-400">
                        {storyEvents.length}
                      </span>
                    )}
                    {tab === 'Documents' && documentArtifacts.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-cre-surface text-gray-400">
                        {documentArtifacts.length}
                      </span>
                    )}
                    {tab === 'Decisions' && storyEvents.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-cre-surface text-gray-400">
                        {storyEvents.filter((event) => event.kind === 'decision_made').length}
                      </span>
                    )}
                  </button>
                ))}
                {/^complete$/i.test(dealCheckpoint.status) && (
                  <button
                    onClick={() => setActiveTab('Final Report')}
                    className={`tab ml-auto ${
                      activeTab === 'Final Report'
                        ? 'tab-active !border-cre-success'
                        : 'bg-cre-success/20 text-cre-success hover:bg-cre-success/30 font-semibold'
                    }`}
                  >
                    Final Report
                  </button>
                )}
              </div>

              {/* Tab Content */}
              <div className="mt-4">
                {activeTab === 'Pipeline' && (
                  <PipelineView
                    dealCheckpoint={dealCheckpoint}
                    agentCheckpoints={agentCheckpoints}
                  />
                )}
                {activeTab === 'Agent Tree' && (
                  <AgentTree
                    dealCheckpoint={dealCheckpoint}
                    agentCheckpoints={agentCheckpoints}
                  />
                )}
                {activeTab === 'Logs' && (
                  logEntries.length > 0 ? (
                    <LogStream logEntries={logEntries} />
                  ) : (
                    <div className="card text-center py-12">
                      <div className="text-gray-600 text-4xl mb-3">---</div>
                      <p className="text-gray-400">No log entries yet</p>
                      <p className="text-gray-500 text-sm mt-1">
                        Logs will appear here as agents run
                      </p>
                    </div>
                  )
                )}
                {activeTab === 'Findings' && (
                  hasActiveData ? (
                    <FindingsPanel
                      dealCheckpoint={dealCheckpoint}
                      agentCheckpoints={agentCheckpoints}
                    />
                  ) : (
                    <EmptyFindingsPreview />
                  )
                )}
                {activeTab === 'Timeline' && (
                  <TimelineView
                    dealCheckpoint={dealCheckpoint}
                    agentCheckpoints={agentCheckpoints}
                  />
                )}
                {activeTab === 'Story' && (
                  <StoryNarrative storyEvents={storyEvents} />
                )}
                {activeTab === 'Documents' && (
                  <DocumentWall documentArtifacts={documentArtifacts} />
                )}
                {activeTab === 'Decisions' && (
                  <DecisionLog storyEvents={storyEvents} />
                )}
                {activeTab === 'Final Report' && (
                  <FinalReport dealCheckpoint={dealCheckpoint} />
                )}
              </div>
            </>
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
              className="w-full max-w-6xl rounded-[28px] border border-cre-border bg-cre-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
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

      <DealIntakeWizard
        isOpen={wizardOpen}
        suggestedDealId={suggestedDealId}
        editingDealId={editingDealId}
        onClose={() => setWizardOpen(false)}
        onLoadDeal={loadDeal}
        onValidateDeal={validateDeal}
        onSaveDeal={saveDeal}
        onLaunchDeal={launchDeal}
        onSaved={() => {
          setLibraryError(null)
          void refreshDeals()
        }}
        onLaunched={() => {
          setLibraryError(null)
          void refreshDeals()
        }}
      />
    </div>
  )
}
