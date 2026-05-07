import type { PhaseInfo, AgentCheckpoint } from '../types/checkpoint'

interface PhaseDetailProps {
  phase: PhaseInfo
  phaseName: string
  agentCheckpoints: Map<string, AgentCheckpoint>
}

function VerdictBadge({ verdict }: { verdict: PhaseInfo['outputs']['phaseVerdict'] }) {
  if (!verdict) return <span className="text-xs text-gray-600">Pending</span>

  const classes =
    verdict === 'PASS'
      ? 'bg-cre-success/20 text-cre-success'
      : verdict === 'FAIL'
      ? 'bg-cre-danger/20 text-cre-danger'
      : verdict === 'CONDITIONAL'
      ? 'bg-cre-warning/20 text-cre-warning'
      : 'bg-gray-600/20 text-gray-400'

  return <span className={`status-badge ${classes}`}>{verdict}</span>
}

export default function PhaseDetail({
  phase,
  phaseName,
  agentCheckpoints,
}: PhaseDetailProps) {
  const progressPercent = Math.round((phase.progress ?? 0) * 100)
  const agents = phase.agents || { total: 0, completed: 0, running: 0, failed: 0, pending: 0, skipped: 0 }
  const outputs = phase.outputs || { phaseSummary: '', keyFindings: [], redFlags: [], dataGaps: [], phaseVerdict: null }
  const redFlagText = (flag: PhaseInfo['outputs']['redFlags'][number]): string =>
    flag.description || flag.message || 'Flag'
  const dataGapText = (gap: PhaseInfo['outputs']['dataGaps'][number]): string =>
    gap.description || gap.message || 'Data gap'

  // Filter agent checkpoints belonging to this phase
  const phaseAgents: AgentCheckpoint[] = []
  for (const [, agent] of agentCheckpoints) {
    if (
      agent.phase === phaseName.toLowerCase().replace(/ /g, '_') ||
      agent.phase === phaseName
    ) {
      phaseAgents.push(agent)
    }
  }

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{phaseName}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`status-badge status-${phase.status || 'pending'}`}>{phase.status || 'pending'}</span>
            <VerdictBadge verdict={outputs.phaseVerdict} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{progressPercent}%</div>
          <div className="text-xs text-gray-500">complete</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar h-3">
        <div
          className={`progress-fill ${
            phase.status === 'failed'
              ? 'bg-cre-danger'
              : phase.status === 'complete'
              ? 'bg-cre-success'
              : phase.status === 'skipped'
              ? 'bg-gray-500'
              : 'bg-cre-accent'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Agent counts */}
      <div className="grid grid-cols-6 gap-2 text-center text-sm">
        <div>
          <div className="text-lg font-bold text-white">{agents.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div>
          <div className="text-lg font-bold text-cre-success">{agents.completed}</div>
          <div className="text-xs text-gray-500">Complete</div>
        </div>
        <div>
          <div className="text-lg font-bold text-cre-info">{agents.running}</div>
          <div className="text-xs text-gray-500">Running</div>
        </div>
        <div>
          <div className="text-lg font-bold text-cre-danger">{agents.failed}</div>
          <div className="text-xs text-gray-500">Failed</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-400">{agents.pending}</div>
          <div className="text-xs text-gray-500">Pending</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-500">{agents.skipped || 0}</div>
          <div className="text-xs text-gray-500">Skipped</div>
        </div>
      </div>

      {/* Agent list */}
      {phaseAgents.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Agents
          </h4>
          <div className="space-y-1">
            {phaseAgents.map((agent) => (
              <div
                key={agent.agentName}
                className="flex items-center justify-between px-3 py-2 rounded bg-black/20"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      agent.status === 'complete'
                        ? 'bg-cre-success'
                        : agent.status === 'running'
                        ? 'bg-cre-info'
                        : agent.status === 'failed'
                        ? 'bg-cre-danger'
                        : agent.status === 'skipped'
                        ? 'bg-gray-500'
                        : 'bg-gray-600'
                    }`}
                  />
                  <span className="text-sm text-gray-300">{agent.agentName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 tabular-nums">
                    {Math.round(agent.progress * 100)}%
                  </span>
                  <span className={`status-badge status-${agent.status}`}>
                    {agent.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase Summary */}
      {outputs.phaseSummary && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Phase Summary
          </h4>
          <p className="text-sm text-gray-300">{outputs.phaseSummary}</p>
        </div>
      )}

      {/* Key Findings */}
      {outputs.keyFindings.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-cre-success uppercase tracking-wider mb-2">
            Key Findings ({outputs.keyFindings.length})
          </h4>
          <ul className="space-y-1">
            {outputs.keyFindings.map((finding, i) => (
              <li key={i} className="finding text-sm text-gray-300">
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Red Flags */}
      {outputs.redFlags.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-cre-danger uppercase tracking-wider mb-2">
            Red Flags ({outputs.redFlags.length})
          </h4>
          <ul className="space-y-2">
            {outputs.redFlags.map((flag, i) => (
              <li key={i} className="red-flag">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`status-badge ${
                      flag.severity === 'HIGH'
                        ? 'bg-cre-danger/30 text-cre-danger'
                        : flag.severity === 'MEDIUM'
                        ? 'bg-cre-warning/30 text-cre-warning'
                        : 'bg-gray-600/30 text-gray-400'
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
      {outputs.dataGaps.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-cre-warning uppercase tracking-wider mb-2">
            Data Gaps ({outputs.dataGaps.length})
          </h4>
          <ul className="space-y-1">
            {outputs.dataGaps.map((gap, i) => (
              <li key={i} className="data-gap text-sm text-gray-300">
                {dataGapText(gap)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
