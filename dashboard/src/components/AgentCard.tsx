import type { AgentCheckpoint } from '../types/checkpoint'

interface AgentCardProps {
  agent: AgentCheckpoint
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return '--'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function computeDuration(start: string | null, end: string | null): string {
  if (!start) return '--'
  const startDate = new Date(start)
  const endDate = end ? new Date(end) : new Date()
  const diffMs = endDate.getTime() - startDate.getTime()

  if (diffMs < 0) return '--'

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function VerdictBadge({ verdict }: { verdict: AgentCheckpoint['outputs']['verdict'] }) {
  if (!verdict) return null

  const classes =
    verdict === 'PASS'
      ? 'bg-cre-success/20 text-cre-success'
      : verdict === 'FAIL'
      ? 'bg-cre-danger/20 text-cre-danger'
      : verdict === 'CONDITIONAL'
      ? 'bg-cre-warning/20 text-cre-warning'
      : 'bg-[#4b5563]/20 text-gray-400'

  return <span className={`status-badge ${classes}`}>{verdict}</span>
}

export default function AgentCard({ agent }: AgentCardProps) {
  const progressPercent = Math.round(agent.progress * 100)
  const gapText = (gap: AgentCheckpoint['dataGaps'][number]): string =>
    gap.description || gap.message || 'Data gap'
  const redFlagText = (flag: AgentCheckpoint['redFlags'][number]): string =>
    flag.description || flag.message || 'Flag'

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{agent.agentName}</h3>
          <p className="text-sm text-gray-500 mt-0.5">Phase: {agent.phase}</p>
        </div>
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={agent.outputs.verdict} />
          <span className={`status-badge status-${agent.status}`}>{agent.status}</span>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-gray-400">Progress</span>
          <span className="text-white font-medium">{progressPercent}%</span>
        </div>
        <div className="progress-bar h-3">
          <div
            className={`progress-fill ${
              agent.status === 'failed'
                ? 'bg-cre-danger'
                : agent.status === 'complete'
                ? 'bg-cre-success'
                : 'bg-cre-accent'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Summary */}
      {agent.outputs.summary && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Summary
          </h4>
          <p className="text-sm text-gray-300">{agent.outputs.summary}</p>
        </div>
      )}

      {/* Findings */}
      {agent.outputs.findings.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Findings ({agent.outputs.findings.length})
          </h4>
          <ul className="space-y-1">
            {agent.outputs.findings.map((finding, i) => (
              <li key={i} className="finding text-sm text-gray-300">
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Red Flags */}
      {agent.redFlags.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-cre-danger uppercase tracking-wider mb-2">
            Red Flags ({agent.redFlags.length})
          </h4>
          <ul className="space-y-2">
            {agent.redFlags.map((flag, i) => (
              <li key={i} className="red-flag">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`status-badge ${
                      flag.severity === 'HIGH'
                        ? 'bg-cre-danger/30 text-cre-danger'
                        : flag.severity === 'MEDIUM'
                        ? 'bg-cre-warning/30 text-cre-warning'
                        : 'bg-[#4b5563]/30 text-gray-400'
                    }`}
                  >
                    {flag.severity}
                  </span>
                  <span className="text-xs text-gray-500">{flag.category}</span>
                </div>
                <p className="text-sm text-gray-300">{redFlagText(flag)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Data Gaps */}
      {agent.dataGaps.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-cre-warning uppercase tracking-wider mb-2">
            Data Gaps ({agent.dataGaps.length})
          </h4>
          <ul className="space-y-1">
            {agent.dataGaps.map((gap, i) => (
              <li key={i} className="data-gap text-sm text-gray-300">
                {gapText(gap)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Errors */}
      {agent.errors.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-cre-danger uppercase tracking-wider mb-2">
            Errors ({agent.errors.length})
          </h4>
          <ul className="space-y-2">
            {agent.errors.map((error, i) => (
              <li key={i} className="red-flag">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500">
                    {formatTimestamp(error.timestamp)}
                  </span>
                  <span
                    className={`status-badge ${
                      error.recoverable
                        ? 'bg-cre-warning/20 text-cre-warning'
                        : 'bg-cre-danger/20 text-cre-danger'
                    }`}
                  >
                    {error.recoverable ? 'Recoverable' : 'Fatal'}
                  </span>
                </div>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black/30 rounded p-2 mt-1">
                  {error.message}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timing */}
      <div className="border-t border-cre-border pt-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Timing
        </h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500 block text-xs">Started</span>
            <span className="text-gray-300">{formatTimestamp(agent.startedAt)}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Completed</span>
            <span className="text-gray-300">{formatTimestamp(agent.completedAt)}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Duration</span>
            <span className="text-gray-300">
              {computeDuration(agent.startedAt, agent.completedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Child Agents */}
      {agent.childAgents.length > 0 && (
        <div className="border-t border-cre-border pt-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Child Agents ({agent.childAgents.length})
          </h4>
          <div className="space-y-1">
            {agent.childAgents.map((child) => (
              <div
                key={child.taskId}
                className="flex items-center justify-between text-sm px-2 py-1 rounded bg-black/20"
              >
                <span className="text-gray-300">{child.agentName}</span>
                <span className={`status-badge status-${child.status}`}>
                  {child.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
