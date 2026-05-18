import type { AgentCheckpoint, DealCheckpoint, StoryEvent } from '../types/checkpoint'
import type { DealWorkspace } from '../types/workspace'

type SwarmGoalConsoleProps = {
  workspace: DealWorkspace | null
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
  storyEvents: StoryEvent[]
  onOpenDocuments: () => void
  onOpenAgents: () => void
  onOpenPackage: () => void
  onOpenAdvanced: () => void
}

type SwarmAgent = {
  agentId: string
  name: string
  phaseLabel: string
  critical: boolean
  status: string
  reason: string
}

function titleize(value: unknown, fallback = 'Agent'): string {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function getMissionGoal(workspace: DealWorkspace | null): string {
  const mission = workspace?.deal?.deal?.mission
  if (typeof mission === 'object' && mission !== null && 'goalText' in mission) {
    const value = (mission as { goalText?: unknown }).goalText
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  if (workspace?.criteria?.notes?.trim()) return workspace.criteria.notes.trim()
  return 'Build an IC-ready acquisition package with source-backed workpapers.'
}

function getRecommendedWorkflow(workspace: DealWorkspace | null, dealCheckpoint: DealCheckpoint): { id: string; label: string; status: string } {
  const checkpointWorkflowId = dealCheckpoint.workflowId || ''
  if (checkpointWorkflowId) {
    return {
      id: checkpointWorkflowId,
      label: dealCheckpoint.workflowName || titleize(checkpointWorkflowId, 'Selected Workflow'),
      status: /complete/i.test(dealCheckpoint.status) ? 'complete' : /running|starting|in_progress/i.test(dealCheckpoint.status) ? 'running' : 'ready',
    }
  }
  const mission = workspace?.deal?.deal?.mission
  const missionWorkflow = typeof mission === 'object' && mission !== null && 'recommendedWorkflowId' in mission
    ? String((mission as { recommendedWorkflowId?: unknown }).recommendedWorkflowId || '')
    : ''
  const readiness = workspace?.launchReadiness?.find((entry) => entry.workflowId === missionWorkflow)
    ?? workspace?.launchReadiness?.find((entry) => entry.status !== 'blocked')
    ?? workspace?.launchReadiness?.[0]
  const id = missionWorkflow || readiness?.workflowId || 'full-acquisition-review'
  return {
    id,
    label: titleize(id, 'Full Acquisition Review'),
    status: readiness?.status || 'ready',
  }
}

function agentReason(agentId: string): string {
  const name = agentId.toLowerCase()
  if (name.includes('rent')) return 'reconciles rent roll, unit mix, and loss-to-lease signals'
  if (name.includes('opex')) return 'normalizes expense variance before underwriting relies on it'
  if (name.includes('market')) return 'benchmarks comps and submarket demand'
  if (name.includes('inspection') || name.includes('physical')) return 'sizes physical condition and capex exposure'
  if (name.includes('model')) return 'builds the base economic case for IC review'
  if (name.includes('scenario')) return 'stress-tests upside and downside return paths'
  if (name.includes('memo') || name.includes('ic')) return 'turns workpapers into committee language'
  if (name.includes('lender') || name.includes('quote') || name.includes('term')) return 'compares financing paths and debt constraints'
  if (name.includes('legal') || name.includes('title') || name.includes('psa')) return 'surfaces legal, title, and contract blockers'
  if (name.includes('closing') || name.includes('funds')) return 'prepares the closing and funds-flow handoff'
  return 'helps convert source evidence into a decision-ready workpaper'
}

function buildSwarmAgents(workspace: DealWorkspace | null, checkpoints: Map<string, AgentCheckpoint>): SwarmAgent[] {
  const agents: SwarmAgent[] = []
  for (const phase of workspace?.phases ?? []) {
    for (const agent of phase.agents) {
      const checkpoint = checkpoints.get(agent.agentId)
      agents.push({
        agentId: agent.agentId,
        name: agent.name || titleize(agent.agentId),
        phaseLabel: phase.label,
        critical: agent.critical,
        status: checkpoint?.status || (phase.readiness === 'blocked' ? 'blocked' : 'planned'),
        reason: agentReason(agent.agentId),
      })
    }
  }
  return agents.sort((a, b) => Number(b.critical) - Number(a.critical) || a.phaseLabel.localeCompare(b.phaseLabel)).slice(0, 8)
}

function buildBlockers(workspace: DealWorkspace | null): string[] {
  const blockers = new Set<string>()
  workspace?.launchReadiness?.forEach((entry) => entry.blockers.slice(0, 2).forEach((blocker) => blockers.add(blocker)))
  workspace?.progressionGuide?.sections?.forEach((section) => section.blockers.slice(0, 2).forEach((blocker) => blockers.add(blocker)))
  return [...blockers].slice(0, 4)
}

function buildHandoffLine(workspace: DealWorkspace | null, storyEvents: StoryEvent[]): string {
  const liveHandoff = [...storyEvents].reverse().find((event) => event.kind === 'agent_handoff' || event.kind === 'phase_handoff')
  if (liveHandoff) {
    const from = titleize(liveHandoff.fromAgent || liveHandoff.fromPhase || liveHandoff.agent, 'Specialist')
    const to = titleize(liveHandoff.toAgent || liveHandoff.toPhase, 'Next team')
    return `${from} → ${to}`
  }
  const phases = workspace?.phases?.map((phase) => phase.label).filter(Boolean) ?? []
  if (phases.length >= 2) return `${phases[0]} → ${phases[1]} → ${phases[phases.length - 1]}`
  return 'Source intake → specialist review → IC package'
}

export default function SwarmGoalConsole({
  workspace,
  dealCheckpoint,
  agentCheckpoints,
  storyEvents,
  onOpenDocuments,
  onOpenAgents,
  onOpenPackage,
  onOpenAdvanced,
}: SwarmGoalConsoleProps) {
  const goal = getMissionGoal(workspace)
  const workflow = getRecommendedWorkflow(workspace, dealCheckpoint)
  const agents = buildSwarmAgents(workspace, agentCheckpoints)
  const blockers = buildBlockers(workspace)
  const handoffLine = buildHandoffLine(workspace, storyEvents)
  const nextAction = blockers.length > 0
    ? { label: 'Unblock the swarm', detail: blockers[0], onClick: onOpenDocuments }
    : workflow.status === 'ready'
      ? { label: 'Launch recommended swarm', detail: `Open controls for ${workflow.label}.`, onClick: onOpenAdvanced }
      : { label: 'Review decision package', detail: 'The swarm has enough movement to review outputs.', onClick: onOpenPackage }

  return (
    <section className="portal-panel" data-testid="swarm-goal-console">
      <div className="portal-section-header">
        <div>
          <p className="portal-kicker">Swarm Goal Console</p>
          <h3 className="portal-title text-xl">Tell the team the goal. The swarm maps who helps next.</h3>
        </div>
        <span className={`status-badge ${blockers.length > 0 ? 'status-blocked' : workflow.status === 'ready' ? 'status-complete' : 'status-pending'}`} data-testid="swarm-readiness">
          {blockers.length > 0 ? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}` : workflow.status}
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.55fr)]">
        <article className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4" data-testid="swarm-mission-goal">
          <p className="portal-kicker">Goal</p>
          <p className="mt-2 text-lg font-semibold text-white">“{goal}”</p>
          <p className="mt-3 text-sm leading-6 text-cyan-100/75" data-testid="swarm-recommended-workflow">
            Recommended swarm: <strong>{workflow.label}</strong> · {workflow.id}
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-black/40 p-4" data-testid="swarm-next-action">
          <p className="portal-kicker">Next best action</p>
          <h4 className="mt-2 text-lg font-semibold text-white">{nextAction.label}</h4>
          <p className="mt-2 text-sm leading-6 text-gray-400">{nextAction.detail}</p>
          <button type="button" className="portal-button portal-button-primary mt-4" onClick={nextAction.onClick}>
            {nextAction.label}
          </button>
        </article>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
        <article className="rounded-2xl border border-white/10 bg-black/40 p-4" data-testid="swarm-agent-roster">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="portal-kicker">Recommended specialist swarm</p>
              <h4 className="mt-1 text-base font-semibold text-white">{agents.length || 'No'} agents staged around the goal</h4>
            </div>
            <button type="button" className="portal-button portal-button-secondary" onClick={onOpenAgents}>Open Team</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {agents.map((agent) => (
              <div key={`${agent.phaseLabel}-${agent.agentId}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3" data-testid={`swarm-agent-${agent.agentId}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-100">{agent.name}</span>
                  <span className={`status-badge ${/complete|filed/i.test(agent.status) ? 'status-complete' : /blocked|failed/i.test(agent.status) ? 'status-blocked' : 'status-pending'}`}>
                    {agent.critical ? 'critical' : agent.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{agent.phaseLabel} · {agent.reason}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-white/10 bg-black/40 p-4" data-testid="swarm-blockers">
          <p className="portal-kicker">Blockers & handoffs</p>
          <h4 className="mt-2 text-base font-semibold text-white" data-testid="swarm-handoff-map">{handoffLine}</h4>
          {blockers.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-amber-100/80">
              {blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-gray-400">No hard blocker detected. The handoff ledger will keep filling as specialists file workpapers and pass context.</p>
          )}
        </article>
      </div>
    </section>
  )
}
