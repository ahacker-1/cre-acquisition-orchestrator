import { Suspense, lazy, useMemo } from 'react'
import StoryNarrative from './StoryNarrative'
import type { AgentCheckpoint, DealCheckpoint, DocumentArtifact, StoryEvent } from '../types/checkpoint'
import type { DealWorkspace, SourceDocument } from '../types/workspace'

const SwarmGoalConsole = lazy(() => import('./SwarmGoalConsole'))

interface MissionControlProps {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
  storyEvents: StoryEvent[]
  documentArtifacts: DocumentArtifact[]
  documents: SourceDocument[]
  workspace: DealWorkspace | null
  onOpenDocuments: () => void
  onOpenAgents: () => void
  onOpenWorkpapers: () => void
  onOpenPackage: () => void
  onOpenAdvanced: () => void
}

type WarRoomAgent = {
  key: string
  name: string
  phase: string
  status: string
  avatar: string
  action: string
  subline: string
  live: boolean
}

function MissionPanelSkeleton() {
  return (
    <div className="portal-panel animate-pulse">
      <div className="h-4 w-44 bg-white/10" />
      <div className="mt-4 h-24 bg-white/5" />
    </div>
  )
}

type MissionStage = {
  key: string
  label: string
  detail: string
  status: string
  tone: 'complete' | 'running' | 'pending' | 'blocked'
  agents: WarRoomAgent[]
}

function isRunning(status: string): boolean {
  return /running|starting|in_progress/i.test(status)
}

function isComplete(status: string): boolean {
  return /complete|completed/i.test(status)
}

function titleize(value: unknown, fallback = 'Team'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function eventText(event: StoryEvent): string {
  return String(event.summary || event.title || event.subtitle || 'Team update received.')
}

function party(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? titleize(value, fallback) : fallback
}

function agentAvatar(agentName: string): string {
  const words = titleize(agentName, 'Agent').split(' ').filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

function agentActionLine(agentName: string, status = 'pending'): string {
  if (/failed|blocked/i.test(status)) return 'Needs operator review'
  if (/pending|queued/i.test(status)) return 'Queued for handoff'
  if (/skipped/i.test(status)) return 'Skipped by orchestrator'
  const completePrefix = isComplete(status) ? 'Filed' : ''
  const name = agentName.toLowerCase()
  const verb = name.includes('rent') ? 'Reconciling leases'
    : name.includes('opex') || name.includes('expense') ? 'Normalizing expenses'
    : name.includes('inspection') || name.includes('physical') ? 'Sizing capex exposure'
    : name.includes('market') ? 'Benchmarking comps'
    : name.includes('environmental') ? 'Scanning environmental risk'
    : name.includes('legal') || name.includes('title') || name.includes('psa') || name.includes('loan-doc') ? 'Scanning legal blockers'
    : name.includes('model') || name.includes('scenario') ? 'Stress-testing returns'
    : name.includes('memo') || name.includes('ic') ? 'Drafting IC narrative'
    : name.includes('lender') || name.includes('quote') || name.includes('term') ? 'Comparing financing paths'
    : name.includes('closing') || name.includes('funds') ? 'Preparing closing handoff'
    : 'Working the deal file'
  return completePrefix ? `${completePrefix}: ${verb}` : verb
}

function agentSubline(agentName: string, phase?: string): string {
  const name = agentName.toLowerCase()
  if (name.includes('rent')) return 'Rent roll, unit mix, and loss-to-lease.'
  if (name.includes('opex')) return 'Expense variance and normalized run rate.'
  if (name.includes('market')) return 'Comps, submarket context, and demand signals.'
  if (name.includes('inspection') || name.includes('physical')) return 'Property condition and capex exposure.'
  if (name.includes('legal') || name.includes('title') || name.includes('psa')) return 'Title, survey, PSA, and closing blockers.'
  if (name.includes('model') || name.includes('scenario')) return 'Downside/base-case return sensitivity.'
  if (name.includes('memo') || name.includes('ic')) return 'Committee-ready investment narrative.'
  if (name.includes('lender') || name.includes('quote') || name.includes('term')) return 'Leverage, covenants, and lender paths.'
  if (name.includes('closing') || name.includes('funds')) return 'Closing checklist and funds-flow handoff.'
  return `${titleize(phase || 'deal')} workstream context.`
}

function packageState(progress: number, artifacts: number, events: number): string {
  if (progress >= 100) return 'Ready for IC'
  if (artifacts > 0) return 'Assembling'
  if (events > 0 || progress > 0) return 'In motion'
  return 'Not started'
}

function statusBadgeClass(status: string): string {
  if (/blocked|failed/i.test(status)) return 'status-blocked'
  if (isRunning(status)) return 'status-running'
  if (isComplete(status) || /ready/i.test(status)) return 'status-complete'
  return 'status-pending'
}

function eventBadge(event: StoryEvent): string {
  if (event.requiresHuman === true || event.kind === 'agent_dependency') return 'Blocker'
  if (event.kind === 'phase_handoff') return 'Workstream'
  if (event.kind === 'agent_handoff') return 'Handoff'
  if (event.kind === 'agent_review') return 'Review'
  if (event.kind === 'document_created') return 'Workpaper'
  if (event.kind === 'agent_message') return 'Update'
  return 'Signal'
}

function handoffHeadline(event: StoryEvent): string {
  if (event.kind === 'document_created') return `${party(event.agent, 'Specialist')} filed ${event.title || 'a workpaper'}`
  if (event.kind === 'agent_review') return `${party(event.agent, 'Specialist')} completed review`
  const from = party(event.fromAgent || event.fromPhase || event.agent, 'Team')
  const to = party(event.toAgent || event.toPhase, event.kind === 'phase_handoff' ? 'Next workstream' : 'Next team')
  return `${from} handed off to ${to}`
}

function artifactLine(event: StoryEvent): string | null {
  const refs = Array.isArray(event.artifactRefs) ? event.artifactRefs : []
  if (refs.length > 0) {
    const titles = refs
      .map((ref) => typeof ref === 'object' && ref !== null && 'title' in ref ? String((ref as { title?: unknown }).title || '') : '')
      .filter(Boolean)
      .slice(0, 2)
    if (titles.length > 0) return `Evidence passed: ${titles.join(', ')}`
  }
  if (typeof event.phase === 'string') return `Workstream: ${titleize(event.phase)}`
  return null
}

function commandTitle(dealCheckpoint: DealCheckpoint, hasBlockers: boolean, hasActivity: boolean): string {
  if (hasBlockers) return 'The team needs one answer to keep moving'
  if (isComplete(dealCheckpoint.status)) return 'Decision package is ready for committee review'
  if (isRunning(dealCheckpoint.status) || hasActivity) return 'Deal team is coordinating diligence now'
  return 'Source the file, then release the deal team'
}

function commandBody(dealCheckpoint: DealCheckpoint, hasBlockers: boolean, hasActivity: boolean): string {
  if (hasBlockers) return 'A specialist escalated an item that needs operator judgment before the next workstream can rely on it.'
  if (isComplete(dealCheckpoint.status)) return 'The acquisition team filed workpapers, reconciled diligence signals, and assembled the package for review.'
  if (isRunning(dealCheckpoint.status) || hasActivity) {
    return `Specialists are reading evidence, reconciling assumptions, handing context forward, and assembling ${dealCheckpoint.workflowName || 'the acquisition package'}.`
  }
  return 'Upload source material, confirm the goal, and the specialist team will coordinate diligence, underwriting, legal review, and package assembly.'
}

function primaryActionLabel(dealCheckpoint: DealCheckpoint, hasBlockers: boolean, hasActivity: boolean): string {
  if (hasBlockers) return 'Review Blocker'
  if (isComplete(dealCheckpoint.status)) return 'Open IC Package'
  if (isRunning(dealCheckpoint.status) || hasActivity) return 'Open Package'
  return 'Release Deal Team'
}

function primaryActionTarget(dealCheckpoint: DealCheckpoint, hasBlockers: boolean, hasActivity: boolean, onOpenDocuments: () => void, onOpenPackage: () => void, onOpenAdvanced: () => void): () => void {
  if (hasBlockers) return onOpenDocuments
  if (isComplete(dealCheckpoint.status) || isRunning(dealCheckpoint.status) || hasActivity) return onOpenPackage
  return onOpenAdvanced
}

function buildWarRoomAgents(agents: AgentCheckpoint[], storyEvents: StoryEvent[], workspace: DealWorkspace | null): WarRoomAgent[] {
  const runtimeAgents = [...agents]
    .sort((a, b) => Number(isRunning(b.status)) - Number(isRunning(a.status)) || Number(isComplete(b.status)) - Number(isComplete(a.status)))
    .slice(0, 8)
    .map((agent) => ({
      key: slugify(agent.agentName),
      name: titleize(agent.agentName),
      phase: titleize(agent.phase || 'general'),
      status: agent.status,
      avatar: agentAvatar(agent.agentName),
      action: agentActionLine(agent.agentName, agent.status),
      subline: agentSubline(agent.agentName, agent.phase),
      live: isRunning(agent.status),
    }))

  if (runtimeAgents.length >= 5) return runtimeAgents

  const planned = (workspace?.phases ?? [])
    .flatMap((phase) => phase.agents.map((agent) => ({ agent, phase })))
    .filter(({ agent }) => !runtimeAgents.some((runtime) => slugify(runtime.name) === slugify(agent.name)))
    .slice(0, 8 - runtimeAgents.length)
    .map(({ agent, phase }) => ({
      key: slugify(agent.name),
      name: agent.name,
      phase: phase.label,
      status: storyEvents.length > 0 ? 'queued' : 'pending',
      avatar: agentAvatar(agent.name),
      action: storyEvents.length > 0 ? agentActionLine(agent.name, 'queued') : 'Queued for release',
      subline: agentSubline(agent.name, phase.label),
      live: false,
    }))

  return [...runtimeAgents, ...planned]
}

function buildMissionStages({
  workspace,
  warRoomAgents,
  documents,
  hasRuntimeEvidence,
  packageLabel,
  activeAgentCount,
  isCompleteRun,
}: {
  workspace: DealWorkspace | null
  warRoomAgents: WarRoomAgent[]
  documents: SourceDocument[]
  hasRuntimeEvidence: boolean
  packageLabel: string
  activeAgentCount: number
  isCompleteRun: boolean
}): MissionStage[] {
  const stages: MissionStage[] = [
    {
      key: 'source',
      label: 'Source evidence',
      detail: documents.length > 0 ? `${documents.length} file${documents.length === 1 ? '' : 's'} on file` : hasRuntimeEvidence ? 'Sample bundle' : 'Needed',
      status: documents.length > 0 || hasRuntimeEvidence ? 'Ready' : 'Needed',
      tone: documents.length > 0 || hasRuntimeEvidence ? 'complete' : 'pending',
      agents: [],
    },
    {
      key: 'mission',
      label: 'Mission goal',
      detail: workspace?.criteria?.scenario ? titleize(workspace.criteria.scenario) : 'Committee package',
      status: workspace?.criteria ? 'Set' : 'Draft',
      tone: workspace?.criteria ? 'complete' : 'pending',
      agents: [],
    },
  ]

  const phaseStages = (workspace?.phases ?? []).slice(0, 4).map((phase) => {
    const phaseAgents = warRoomAgents.filter((agent) => slugify(agent.phase) === slugify(phase.label)).slice(0, 3)
    const completePhase = isCompleteRun || phase.readiness === 'ready'
    const tone: MissionStage['tone'] = completePhase
      ? 'complete'
      : phase.readiness === 'blocked'
        ? 'blocked'
        : phaseAgents.some((agent) => agent.live) || activeAgentCount > 0
          ? 'running'
          : 'pending'
    return {
      key: phase.phaseSlug,
      label: phase.label,
      detail: phaseAgents[0]?.action ?? (completePhase ? 'Filed' : titleize(phase.readiness || 'Queued')),
      status: completePhase ? 'Filed' : tone === 'running' ? 'Working' : titleize(phase.readiness || 'Queued'),
      tone,
      agents: phaseAgents,
    }
  })

  const fallbackStage: MissionStage = {
    key: 'agent-work',
    label: 'Agent work',
    detail: activeAgentCount > 0 ? `${activeAgentCount} working now` : 'Team staged',
    status: activeAgentCount > 0 ? 'Working' : 'Queued',
    tone: activeAgentCount > 0 ? 'running' : 'pending',
    agents: warRoomAgents.slice(0, 3),
  }
  const packageTone: MissionStage['tone'] = packageLabel === 'Ready for IC' ? 'complete' : packageLabel === 'Not started' ? 'pending' : 'running'
  const packageStage: MissionStage = {
    key: 'package',
    label: 'IC package',
    detail: packageLabel,
    status: packageLabel,
    tone: packageTone,
    agents: warRoomAgents.filter((agent) => /memo|ic|package/i.test(agent.name)).slice(0, 2),
  }

  return [
    ...stages,
    ...(phaseStages.length > 0 ? phaseStages : [fallbackStage]),
    packageStage,
  ].slice(0, 7)
}

export default function MissionControl({
  dealCheckpoint,
  agentCheckpoints,
  storyEvents,
  documentArtifacts,
  documents,
  workspace,
  onOpenDocuments,
  onOpenAgents,
  onOpenWorkpapers,
  onOpenPackage,
  onOpenAdvanced,
}: MissionControlProps) {
  const agents = useMemo(() => [...agentCheckpoints.values()], [agentCheckpoints])
  const activeAgents = agents.filter((agent) => isRunning(agent.status))
  const completedAgents = agents.filter((agent) => isComplete(agent.status))
  const failedAgents = agents.filter((agent) => agent.status === 'failed')
  const recentEvents = useMemo(
    () => [...storyEvents].sort((a, b) => b.seq - a.seq).slice(0, 5).reverse(),
    [storyEvents],
  )
  const humanQuestions = useMemo(
    () => storyEvents.filter((event) => (
      event.requiresHuman === true ||
      event.kind === 'agent_dependency' ||
      event.kind === 'human_input_required' ||
      /blocker|missing|question|review/i.test(String(event.title ?? event.summary ?? ''))
    )).slice(-3),
    [storyEvents],
  )
  const handoffs = useMemo(
    () => storyEvents.filter((event) => (
      event.kind === 'agent_handoff' ||
      event.kind === 'phase_handoff' ||
      event.kind === 'agent_review' ||
      event.kind === 'agent_dependency' ||
      event.kind === 'document_created' ||
      Boolean(event.fromAgent || event.toAgent || event.fromPhase || event.toPhase)
    )).slice(-6),
    [storyEvents],
  )

  const packageProgress = Math.round((dealCheckpoint.overallProgress ?? 0) * 100)
  const phases = workspace?.phases ?? []
  const plannedAgents = phases.reduce((sum, phase) => sum + phase.agents.length, 0)
  const workpaperCount = documentArtifacts.filter((artifact) => artifact.docType === 'workpaper' || artifact.tags?.includes('workpaper')).length
  const packageLabel = packageState(packageProgress, documentArtifacts.length, storyEvents.length)
  const hasActivity = storyEvents.length > 0 || documentArtifacts.length > 0 || completedAgents.length > 0 || isComplete(dealCheckpoint.status)
  const hasRuntimeEvidence = documents.length > 0 || documentArtifacts.length > 0 || storyEvents.length > 0 || isComplete(dealCheckpoint.status)
  const filedWorkpaperCount = workpaperCount || documentArtifacts.length || (isComplete(dealCheckpoint.status) ? completedAgents.length : 0)
  const warRoomAgents = buildWarRoomAgents(agents, storyEvents, workspace)
  const missionStages = buildMissionStages({
    workspace,
    warRoomAgents,
    documents,
    hasRuntimeEvidence,
    packageLabel,
    activeAgentCount: activeAgents.length,
    isCompleteRun: isComplete(dealCheckpoint.status),
  })
  const latestMaterialEvent = [...storyEvents].reverse().find((event) => (
    event.kind === 'agent_handoff' || event.kind === 'phase_handoff' || event.kind === 'agent_review' || event.kind === 'document_created' || event.kind === 'agent_dependency'
  )) ?? storyEvents[storyEvents.length - 1]
  const visibleAgents = warRoomAgents.slice(0, 4)
  const latestArtifacts = documentArtifacts.slice(-2)
  const sourcePackageTitle = documents.length > 0
    ? `${documents.length} uploaded document${documents.length === 1 ? '' : 's'}`
    : hasRuntimeEvidence
      ? 'Sample evidence is powering this run'
      : 'No source package yet'
  const sourcePackageDetail = documents.length > 0
    ? 'Uploaded source files are available for extraction, review, and specialist use.'
    : hasRuntimeEvidence
      ? 'This demo run is using the sample evidence bundle; upload live files when you want to replace it.'
      : 'Drop source files, approve extracted fields, then release the team.'
  const hasBlockers = !isComplete(dealCheckpoint.status) && (humanQuestions.length > 0 || failedAgents.length > 0)
  const primaryAction = primaryActionTarget(dealCheckpoint, hasBlockers, hasActivity, onOpenDocuments, onOpenPackage, onOpenAdvanced)

  return (
    <div className="mission-command-layout" data-testid="mission-control">
      <section className="mission-command-hero agent-scan-line">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="portal-kicker">Acquisition Command</p>
              <span className={`status-badge ${hasBlockers ? 'status-blocked' : statusBadgeClass(dealCheckpoint.status)}`}>
                {hasBlockers ? 'operator attention' : dealCheckpoint.status}
              </span>
              <span className="status-badge status-pending">{dealCheckpoint.workflowName || 'Committee package'}</span>
            </div>
            <h2 className="mission-command-title">{commandTitle(dealCheckpoint, hasBlockers, hasActivity)}</h2>
            <p className="mission-command-copy">{commandBody(dealCheckpoint, hasBlockers, hasActivity)}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
            <button type="button" className="portal-button portal-button-primary" onClick={primaryAction}>
              {primaryActionLabel(dealCheckpoint, hasBlockers, hasActivity)}
            </button>
            <button type="button" className="portal-button portal-button-secondary" onClick={onOpenDocuments}>
              Add Source Material
            </button>
          </div>
        </div>

        <div className="mission-command-metrics">
          <div className="mission-command-metric"><span>Specialists active</span><strong>{activeAgents.length || (hasActivity ? 1 : 0)}</strong></div>
          <div className="mission-command-metric"><span>Filed workpapers</span><strong>{filedWorkpaperCount}</strong></div>
          <div className="mission-command-metric"><span>Package state</span><strong>{packageLabel}</strong></div>
        </div>
      </section>

      <Suspense fallback={<MissionPanelSkeleton />}>
        <SwarmGoalConsole
          workspace={workspace}
          dealCheckpoint={dealCheckpoint}
          agentCheckpoints={agentCheckpoints}
          storyEvents={storyEvents}
          onOpenDocuments={onOpenDocuments}
          onOpenAgents={onOpenAgents}
          onOpenPackage={onOpenPackage}
          onOpenAdvanced={onOpenAdvanced}
        />
      </Suspense>

      <section className="mission-orchestration-stage" data-testid="agent-war-room-strip">
        <div className="portal-section-header">
          <div>
            <p className="portal-kicker">Orchestration Map</p>
            <h3 className="portal-title text-xl">Source package to IC package</h3>
          </div>
          <button type="button" className="portal-button portal-button-secondary" onClick={onOpenAgents}>View Deal Team</button>
        </div>
        <div className="orchestration-map mt-6">
          {missionStages.map((stage, index) => (
            <article key={stage.key} className={`orchestration-phase orchestration-phase-${stage.tone}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="orchestration-step">{String(index + 1).padStart(2, '0')}</span>
                <span className={`status-badge ${stage.tone === 'blocked' ? 'status-blocked' : stage.tone === 'running' ? 'status-running' : stage.tone === 'complete' ? 'status-complete' : 'status-pending'}`}>
                  {stage.status}
                </span>
              </div>
              <h4>{stage.label}</h4>
              <p>{stage.detail}</p>
              {stage.agents.length > 0 && (
                <div className="orchestration-agent-row" aria-label={`${stage.label} agents`}>
                  {stage.agents.map((agent) => (
                    <span key={`${stage.key}-${agent.key}`} className={`orchestration-agent-token ${agent.live ? 'orchestration-agent-token-live' : ''}`} title={`${agent.name}: ${agent.action}`}>
                      {agent.avatar}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {hasBlockers && (
        <section className="mission-attention-card mission-attention-card-hot">
          <div>
            <p className="portal-kicker">Operator Attention</p>
            <h3 className="portal-title text-xl">{humanQuestions.length || failedAgents.length} item{(humanQuestions.length || failedAgents.length) === 1 ? '' : 's'} need review</h3>
            <p className="mt-2 text-sm leading-6 text-amber-100/75">
              {humanQuestions[0] ? eventText(humanQuestions[0]) : `${failedAgents.length} specialist${failedAgents.length === 1 ? '' : 's'} failed and need operator review.`}
            </p>
          </div>
          <button type="button" className="portal-button portal-button-primary" onClick={onOpenDocuments}>Answer Now</button>
        </section>
      )}

      <section className="mission-intelligence-rail">
        <article className="mission-attention-card">
          <div className="portal-section-header">
            <div>
              <p className="portal-kicker">Team Pulse</p>
              <h3 className="portal-title text-xl">
                {activeAgents.length > 0
                  ? `${activeAgents.length} specialist${activeAgents.length === 1 ? '' : 's'} working now`
                  : hasActivity
                    ? 'No blockers. The team will ask only when judgment is needed.'
                    : `${plannedAgents || visibleAgents.length} specialists staged`}
              </h3>
            </div>
            <button type="button" className="portal-button portal-button-secondary" onClick={onOpenAgents}>Roster</button>
          </div>
          <div className="mt-4 space-y-3">
            {visibleAgents.map((agent) => (
              <div key={agent.key} className="mission-agent-pulse-row">
                <span className={`orchestration-agent-token ${agent.live ? 'orchestration-agent-token-live' : ''}`}>{agent.avatar}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-100">{agent.name}</span>
                  <span className="block truncate text-xs text-gray-500">{agent.action} · {agent.subline}</span>
                </span>
                <span className={`status-badge ${agent.live ? 'status-running' : isComplete(agent.status) ? 'status-complete' : 'status-pending'}`}>
                  {agent.live ? 'live' : isComplete(agent.status) ? 'filed' : 'queued'}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="mission-latest-card">
          <p className="portal-kicker">Latest Material Movement</p>
          {latestMaterialEvent ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <span className="status-badge status-running">{eventBadge(latestMaterialEvent)}</span>
                <span className="text-xs text-gray-600">Seq {latestMaterialEvent.seq}</span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white">{handoffHeadline(latestMaterialEvent)}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">{eventText(latestMaterialEvent)}</p>
            </>
          ) : isComplete(dealCheckpoint.status) ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <span className="status-badge status-complete">Package</span>
                <span className="text-xs text-gray-600">Complete</span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white">Final committee package assembled</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">The selected acquisition workflow completed and the IC package is ready for operator review.</p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-gray-500">No material movement yet. Once the team starts, the latest consequential filing or handoff appears here.</p>
          )}
        </article>
      </section>

      <section className="mission-package-preview">
        <div>
          <p className="portal-kicker">Decision Package</p>
          <h3 className="portal-title text-xl">{packageLabel === 'Ready for IC' ? 'Committee package is ready' : 'Committee package is assembling'}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            {latestArtifacts.length > 0
              ? `${latestArtifacts.length} latest filing${latestArtifacts.length === 1 ? '' : 's'} are feeding the IC narrative and evidence-backed exhibits.`
              : isComplete(dealCheckpoint.status)
                ? 'The acquisition team completed the selected workflow. Open the IC package for the committee narrative and evidence trail.'
                : 'Workpapers, diligence findings, financing paths, and risk calls will assemble here as specialists file evidence.'}
          </p>
        </div>
        <div className="mission-package-artifacts">
          {latestArtifacts.map((artifact) => (
            <div key={artifact.docId}>
              <strong>{artifact.title}</strong>
              <span>{titleize(artifact.agent)} · {titleize(artifact.phase)}</span>
            </div>
          ))}
          {latestArtifacts.length === 0 && <p>{isComplete(dealCheckpoint.status) ? 'Final package is ready for review.' : 'No workpapers filed yet.'}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="portal-button portal-button-secondary" onClick={onOpenWorkpapers}>Review Workpapers</button>
          <button type="button" className="portal-button portal-button-primary" onClick={onOpenPackage}>Open IC Package</button>
        </div>
      </section>

      <details className="mission-disclosure" data-testid="agent-handoffs">
        <summary>
          <span>
            <span className="portal-kicker">Team Activity</span>
            <strong>Handoff ledger and latest moves</strong>
          </span>
          <span className="status-badge status-pending">{handoffs.length} handoffs</span>
        </summary>
        <div className="mission-disclosure-body">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.75fr)]">
            <div className="space-y-3">
              {handoffs.length > 0 ? handoffs.map((event) => {
                const artifact = artifactLine(event)
                return (
                  <div key={`${event.runId}-${event.seq}`} className="handoff-ledger-row handoff-card-enter" data-testid={`handoff-card-${event.seq}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-200">{handoffHeadline(event)}</p>
                      <span className="status-badge status-running">{eventBadge(event)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{eventText(event)}</p>
                    {artifact && <p className="mt-2 text-[11px] uppercase text-gray-600">{artifact}</p>}
                  </div>
                )
              }) : (
                <p className="border border-white/10 bg-black p-4 text-sm text-gray-500">
                  No handoffs yet. Once the first specialist files a workpaper, the next specialist will receive context here.
                </p>
              )}
            </div>
            <StoryNarrative storyEvents={recentEvents} compact />
          </div>
        </div>
      </details>

      <details className="mission-disclosure">
        <summary>
          <span>
            <span className="portal-kicker">Source Evidence</span>
            <strong>{sourcePackageTitle}</strong>
          </span>
          <span className="status-badge status-pending">Details</span>
        </summary>
        <div className="mission-disclosure-body">
          <p className="text-sm leading-6 text-gray-400">{sourcePackageDetail}</p>
          <button type="button" className="portal-button portal-button-secondary mt-4" onClick={onOpenDocuments}>Open Evidence</button>
        </div>
      </details>
    </div>
  )
}
