import { useMemo } from 'react'
import type { DealCheckpoint, AgentCheckpoint } from '../types/checkpoint'

interface TimelineViewProps {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
}

const PHASE_ORDER = [
  'due_diligence',
  'underwriting',
  'financing',
  'legal',
  'closing',
]

const PHASE_DISPLAY_NAMES: Record<string, string> = {
  due_diligence: 'Due Diligence',
  underwriting: 'Underwriting',
  financing: 'Financing',
  legal: 'Legal',
  closing: 'Closing',
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'complete':
      return '#38a169'
    case 'running':
      return '#3182ce'
    case 'failed':
      return '#e53e3e'
    case 'skipped':
      return '#718096'
    default:
      return '#4a5568'
  }
}

interface TimelineAgent {
  name: string
  phase: string
  status: string
  startMs: number | null
  endMs: number | null
}

export default function TimelineView({
  dealCheckpoint,
  agentCheckpoints,
}: TimelineViewProps) {
  const { agents, timeRange, hasTimingData } = useMemo(() => {
    const agentList: TimelineAgent[] = []
    let minTime = Infinity
    let maxTime = -Infinity
    let hasAnyTiming = false

    for (const [, agent] of agentCheckpoints) {
      const startMs = agent.startedAt ? new Date(agent.startedAt).getTime() : null
      const endMs = agent.completedAt
        ? new Date(agent.completedAt).getTime()
        : agent.status === 'running' && startMs
        ? Date.now()
        : null

      if (startMs !== null) {
        hasAnyTiming = true
        minTime = Math.min(minTime, startMs)
        if (endMs !== null) {
          maxTime = Math.max(maxTime, endMs)
        } else {
          maxTime = Math.max(maxTime, Date.now())
        }
      }

      agentList.push({
        name: agent.agentName,
        phase: agent.phase,
        status: agent.status,
        startMs,
        endMs,
      })
    }

    // Fallback: use deal start time
    if (dealCheckpoint.startedAt) {
      const dealStart = new Date(dealCheckpoint.startedAt).getTime()
      if (dealStart < minTime) minTime = dealStart
    }

    if (maxTime === -Infinity) maxTime = Date.now()
    if (minTime === Infinity) minTime = Date.now() - 3600000 // 1 hour ago fallback

    // Group by phase and sort within phase
    const phaseOrder = [...PHASE_ORDER]
    const extraPhases = [...new Set(agentList.map((a) => a.phase))].filter(
      (p) => !phaseOrder.includes(p)
    )
    const allPhases = [...phaseOrder, ...extraPhases]

    agentList.sort((a, b) => {
      const aIdx = allPhases.indexOf(a.phase)
      const bIdx = allPhases.indexOf(b.phase)
      if (aIdx !== bIdx) return aIdx - bIdx
      return (a.startMs ?? Infinity) - (b.startMs ?? Infinity)
    })

    return {
      agents: agentList,
      timeRange: { min: minTime, max: maxTime },
      hasTimingData: hasAnyTiming,
    }
  }, [dealCheckpoint, agentCheckpoints])

  if (!hasTimingData) {
    return (
      <div className="card flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-3xl text-gray-400 mb-3" aria-hidden="true">---</div>
          <p className="text-gray-500">
            Timeline will populate as agents run
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Agent start and completion times are required
          </p>
        </div>
      </div>
    )
  }

  const duration = timeRange.max - timeRange.min || 1
  const ROW_HEIGHT = 32
  const LABEL_WIDTH = 200
  const CHART_WIDTH = 600
  const PHASE_LABEL_WIDTH = 120

  // Group agents by phase for phase labels
  const phaseGroups: { phase: string; startRow: number; count: number }[] = []
  let currentPhase = ''
  agents.forEach((agent, i) => {
    if (agent.phase !== currentPhase) {
      phaseGroups.push({ phase: agent.phase, startRow: i, count: 1 })
      currentPhase = agent.phase
    } else {
      phaseGroups[phaseGroups.length - 1].count++
    }
  })

  // Time axis ticks
  const tickCount = 6
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = timeRange.min + (duration * i) / (tickCount - 1)
    const d = new Date(t)
    return {
      pos: (i / (tickCount - 1)) * 100,
      label: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    }
  })

  return (
    <div className="card overflow-x-auto">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Agent Timeline
      </h3>

      <div className="relative" style={{ minWidth: PHASE_LABEL_WIDTH + LABEL_WIDTH + CHART_WIDTH + 40 }}>
        {/* Time axis */}
        <div
          className="flex justify-between text-xs text-gray-600 mb-2"
          style={{ marginLeft: PHASE_LABEL_WIDTH + LABEL_WIDTH, width: CHART_WIDTH }}
        >
          {ticks.map((tick, i) => (
            <span key={i} style={{ position: 'absolute', left: `${(tick.pos / 100) * CHART_WIDTH + PHASE_LABEL_WIDTH + LABEL_WIDTH}px` }}>
              {tick.label}
            </span>
          ))}
        </div>

        <div className="mt-6">
          {agents.map((agent, i) => {
            const left =
              agent.startMs !== null
                ? ((agent.startMs - timeRange.min) / duration) * 100
                : 0
            const width =
              agent.startMs !== null && agent.endMs !== null
                ? Math.max(((agent.endMs - agent.startMs) / duration) * 100, 1)
                : agent.startMs !== null
                ? Math.max(((Date.now() - agent.startMs) / duration) * 100, 1)
                : 0

            // Find if this agent is the first in its phase group
            const phaseGroup = phaseGroups.find((g) => g.startRow === i)

            return (
              <div
                key={agent.name}
                className="flex items-center"
                style={{ height: ROW_HEIGHT }}
              >
                {/* Phase label (only for first agent in group) */}
                <div
                  className="flex-shrink-0 text-xs font-medium text-gray-500 truncate"
                  style={{ width: PHASE_LABEL_WIDTH }}
                >
                  {phaseGroup
                    ? PHASE_DISPLAY_NAMES[phaseGroup.phase] || phaseGroup.phase
                    : ''}
                </div>

                {/* Agent label */}
                <div
                  className="flex-shrink-0 text-xs text-gray-400 truncate pr-2"
                  style={{ width: LABEL_WIDTH }}
                >
                  {agent.name}
                </div>

                {/* Bar area */}
                <div
                  className="relative bg-cre-border/20 rounded-sm flex-shrink-0"
                  style={{ width: CHART_WIDTH, height: ROW_HEIGHT - 8 }}
                >
                  {agent.startMs !== null && width > 0 && (
                    <div
                      className="absolute top-0 h-full rounded-sm transition-all duration-300"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: getStatusColor(agent.status),
                        opacity: 0.8,
                      }}
                      title={`${agent.name}: ${agent.status}`}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Phase separator lines */}
        {phaseGroups.slice(1).map((group) => (
          <div
            key={group.phase}
            className="absolute left-0 right-0 border-t border-cre-border/30"
            style={{ top: group.startRow * ROW_HEIGHT + 24 }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 pt-3 border-t border-cre-border text-xs">
        {[
          { status: 'running', label: 'Running' },
          { status: 'complete', label: 'Complete' },
          { status: 'failed', label: 'Failed' },
          { status: 'pending', label: 'Pending' },
        ].map(({ status, label }) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: getStatusColor(status) }}
            />
            <span className="text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
