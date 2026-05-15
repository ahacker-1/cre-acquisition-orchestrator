import React, { useState } from 'react'
import type { DealCheckpoint, AgentCheckpoint } from '../types/checkpoint'
import type { PhaseWorkspaceStatus } from '../types/workspace'
import AgentCard from './AgentCard'

interface AgentTreeProps {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
  plannedPhases?: PhaseWorkspaceStatus[]
}

const PHASE_ORDER = [
  'due-diligence',
  'due_diligence',
  'dueDiligence',
  'underwriting',
  'financing',
  'legal',
  'closing',
]

const PHASE_DISPLAY_NAMES: Record<string, string> = {
  'due-diligence': 'Due Diligence',
  'due_diligence': 'Due Diligence',
  'dueDiligence': 'Due Diligence',
  underwriting: 'Underwriting',
  financing: 'Financing',
  legal: 'Legal',
  closing: 'Closing',
}

function normalizePhaseKey(phase: string) {
  if (phase === 'due_diligence' || phase === 'dueDiligence') return 'due-diligence'
  return phase
}

function phaseKeyAliases(phase: string): string[] {
  const normalized = normalizePhaseKey(phase)
  if (normalized === 'due-diligence') return ['due-diligence', 'due_diligence', 'dueDiligence']
  return [normalized]
}

function getPhaseInfo(dealCheckpoint: DealCheckpoint, phaseKey: string) {
  for (const candidate of phaseKeyAliases(phaseKey)) {
    const phaseInfo = dealCheckpoint.phases[candidate]
    if (phaseInfo) return phaseInfo
  }
  return undefined
}

function normalizeAgentName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}


function titleize(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function agentAvatar(agentName: string) {
  const words = titleize(agentName).split(' ').filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

function agentMove(agentName: string, status: string) {
  if (status === 'complete') {
    const name = agentName.toLowerCase()
    if (name.includes('model') || name.includes('scenario')) return 'Filed: Stress-testing returns'
    if (name.includes('memo') || name.includes('ic')) return 'Filed: Drafting IC narrative'
    if (name.includes('rent')) return 'Filed: Reconciling leases'
    if (name.includes('legal') || name.includes('title') || name.includes('psa')) return 'Filed: Scanning legal blockers'
    return 'Filed workpaper'
  }
  if (status === 'running') return 'Working now'
  if (status === 'failed') return 'Blocked'
  if (status === 'skipped') return 'Skipped'
  const name = agentName.toLowerCase()
  if (name.includes('model') || name.includes('scenario')) return 'Stress-testing returns'
  if (name.includes('memo') || name.includes('ic')) return 'Drafting IC narrative'
  if (name.includes('lender') || name.includes('quote') || name.includes('term')) return 'Comparing financing paths'
  if (name.includes('rent')) return 'Reconciling leases'
  if (name.includes('legal') || name.includes('title') || name.includes('psa')) return 'Scanning legal blockers'
  return 'Queued'
}

function StatusDot({ status }: { status: string }) {
  const colorClass =
    status === 'complete'
      ? 'bg-cre-success'
      : status === 'running'
      ? 'bg-cre-info'
      : status === 'failed'
      ? 'bg-cre-danger'
      : status === 'skipped'
      ? 'bg-gray-500'
      : 'bg-gray-600'

  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colorClass} flex-shrink-0`}
    />
  )
}

function AgentNode({
  agent,
  isSelected,
  onClick,
}: {
  agent: AgentCheckpoint
  isSelected: boolean
  onClick: () => void
}) {
  const normalized = normalizeAgentName(agent.agentName)
  const displayName = titleize(agent.agentName)
  const move = agentMove(agent.agentName, agent.status)

  return (
    <button
      onClick={onClick}
      data-testid={`agent-row-${normalized}`}
      className={`flex items-start gap-3 px-3 py-2 rounded text-sm w-full text-left transition-colors ${
        isSelected
          ? 'bg-cre-accent/20 text-cre-accent'
          : 'hover:bg-cre-surface/60 text-gray-300'
      }`}
    >
      <span className={`grid h-8 w-8 place-items-center border border-white/10 bg-white/5 text-[10px] font-bold ${agent.status === 'running' ? 'agent-live-pulse' : ''}`}>
        {agentAvatar(agent.agentName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-gray-200">{displayName}</span>
        <span className="block truncate text-xs text-gray-500">{move}</span>
      </span>
      <StatusDot status={agent.status} />
    </button>
  )
}

function plannedAgentCheckpoint(dealId: string, phase: PhaseWorkspaceStatus, agentName: string): AgentCheckpoint {
  return {
    agentName,
    phase: normalizePhaseKey(phase.phaseSlug),
    dealId,
    status: 'pending',
    progress: 0,
    startedAt: null,
    completedAt: null,
    lastUpdatedAt: null,
    resumePoint: null,
    outputs: {
      summary: `Planned ${phase.label} team member.`,
      findings: [],
      metrics: {},
      verdict: null,
    },
    dataGaps: [],
    errors: [],
    redFlags: [],
    childAgents: [],
  }
}

export default function AgentTree({ dealCheckpoint, agentCheckpoints, plannedPhases = [] }: AgentTreeProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(
    new Set(PHASE_ORDER)
  )
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const togglePhase = (phaseKey: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(phaseKey)) {
        next.delete(phaseKey)
      } else {
        next.add(phaseKey)
      }
      return next
    })
  }

  // Group agents by phase
  const agentsByPhase = new Map<string, AgentCheckpoint[]>()
  for (const [, agent] of agentCheckpoints) {
    const phase = normalizePhaseKey(agent.phase || 'unknown')
    if (!agentsByPhase.has(phase)) {
      agentsByPhase.set(phase, [])
    }
    agentsByPhase.get(phase)!.push(agent)
  }
  for (const phase of plannedPhases) {
    const phaseKey = normalizePhaseKey(phase.phaseSlug)
    if (!agentsByPhase.has(phaseKey)) agentsByPhase.set(phaseKey, [])
    const agents = agentsByPhase.get(phaseKey)!
    const existingNames = new Set(agents.map((agent) => normalizeAgentName(agent.agentName)))
    for (const playbook of phase.agents) {
      if (!existingNames.has(normalizeAgentName(playbook.name))) {
        agents.push(plannedAgentCheckpoint(dealCheckpoint.dealId, phase, playbook.name))
      }
    }
  }

  const orderedPhases = PHASE_ORDER.filter(
    (key) => key === normalizePhaseKey(key) && (Boolean(getPhaseInfo(dealCheckpoint, key)) || agentsByPhase.has(key))
  )
  const extraPhases = [...agentsByPhase.keys()].filter(
    (key) => !PHASE_ORDER.includes(key) && key !== 'unknown'
  )
  const allPhases = [...orderedPhases, ...extraPhases]

  const selectedAgentData = selectedAgent
    ? agentCheckpoints.get(selectedAgent) || null
    : null

  return (
    <div className="flex gap-4" data-testid="agent-tree">
      {/* Tree panel */}
      <div className="card flex-1 min-w-0 max-w-md">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Acquisition Team
        </h3>
        <p className="mb-4 text-xs leading-5 text-gray-500">
          Master orchestrator, phase leads, specialist agents, and child tasks coordinating the deal.
        </p>

        {/* Master orchestrator */}
        <div className="mb-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium text-white bg-cre-accent/10">
            <StatusDot status={dealCheckpoint.status} />
            <span>Deal Team Lead</span>
            <span className="ml-auto text-xs text-gray-500">Coordinates mission</span>
          </div>
        </div>

        {/* Phases */}
        <div className="space-y-1 ml-4 border-l border-cre-border pl-3">
          {allPhases.map((phaseKey) => {
            const phaseInfo = getPhaseInfo(dealCheckpoint, phaseKey)
            const agents = agentsByPhase.get(phaseKey) || []
            const isExpanded = expandedPhases.has(phaseKey)
            const displayName =
              PHASE_DISPLAY_NAMES[phaseKey] ||
              phaseInfo?.name ||
              phaseKey

            return (
              <div key={phaseKey}>
                {/* Phase orchestrator node */}
                <button
                  onClick={() => togglePhase(phaseKey)}
                  data-testid={`agent-phase-row-${phaseKey}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium w-full text-left hover:bg-cre-surface/60 text-gray-200"
                >
                  <span className="text-gray-500 w-4 text-center text-xs">
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  <StatusDot status={phaseInfo?.status || 'pending'} />
                  <span className="flex-1">{displayName}</span>
                  <span className="text-xs text-gray-600">
                    {titleize(phaseInfo?.status || 'pending')} · {agents.length} agent{agents.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {/* Specialist agents */}
                {isExpanded && agents.length > 0 && (
                  <div className="ml-6 border-l border-cre-border/50 pl-2 space-y-0.5 mt-0.5">
                    {agents.map((agent) => (
                      <React.Fragment key={agent.agentName}>
                        <AgentNode
                          agent={agent}
                          isSelected={selectedAgent === agent.agentName}
                          onClick={() =>
                            setSelectedAgent(
                              selectedAgent === agent.agentName
                                ? null
                                : agent.agentName
                            )
                          }
                        />
                        {/* Child agents */}
                        {agent.childAgents && agent.childAgents.length > 0 && (
                          <div className="ml-6 border-l border-cre-border/30 pl-2 space-y-0.5">
                            {agent.childAgents.map((child) => (
                              <div
                                key={child.taskId}
                                className="flex items-center gap-2 px-3 py-1 text-xs text-gray-500"
                              >
                                <StatusDot status={child.status} />
                                <span className="truncate">{child.agentName}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {isExpanded && agents.length === 0 && (
                  <div className="ml-6 pl-2 text-xs text-gray-600 py-1">
                    Team assigned; waiting for mission start
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0">
        {selectedAgentData ? (
          <AgentCard agent={selectedAgentData} />
        ) : (
          <div className="card flex items-center justify-center h-64 text-gray-500">
            Select a team member to see current task, outputs, blockers, and dependencies.
          </div>
        )}
      </div>
    </div>
  )
}
