import { useMemo } from 'react'
import type { DealCheckpoint, AgentCheckpoint, RedFlag, DataGap } from '../types/checkpoint'

interface FindingsPanelProps {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
}

interface RedFlagWithSource extends RedFlag {
  sourceAgent: string
}

interface FindingWithSource {
  description: string
  sourceAgent: string
}

interface DataGapWithSource {
  description: string
  sourceAgent: string
}

const SEVERITY_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
}

export default function FindingsPanel({
  dealCheckpoint,
  agentCheckpoints,
}: FindingsPanelProps) {
  const redFlagText = (flag: RedFlag): string => flag.description || flag.message || 'Flag'
  const gapText = (gap: DataGap): string => gap.description || gap.message || 'Data gap'

  // Aggregate all red flags, findings, and data gaps from all agents
  const { allRedFlags, allFindings, allDataGaps } = useMemo(() => {
    const redFlags: RedFlagWithSource[] = []
    const findings: FindingWithSource[] = []
    const dataGaps: DataGapWithSource[] = []

    // From agent checkpoints
    for (const [, agent] of agentCheckpoints) {
      for (const flag of agent.redFlags) {
        redFlags.push({ ...flag, sourceAgent: agent.agentName })
      }
      for (const finding of agent.outputs.findings) {
        findings.push({ description: finding, sourceAgent: agent.agentName })
      }
      for (const gap of agent.dataGaps) {
        dataGaps.push({ description: gapText(gap), sourceAgent: agent.agentName })
      }
    }

    // From phase outputs
    for (const [, phase] of Object.entries(dealCheckpoint.phases)) {
      for (const flag of phase.outputs.redFlags) {
        // Avoid duplicates by checking description
        if (!redFlags.some((f) => f.description === flag.description)) {
          redFlags.push({ ...flag, sourceAgent: phase.name })
        }
      }
      for (const finding of phase.outputs.keyFindings) {
        if (!findings.some((f) => f.description === finding)) {
          findings.push({ description: finding, sourceAgent: phase.name })
        }
      }
      for (const gap of phase.outputs.dataGaps) {
        const text = gapText(gap)
        if (!dataGaps.some((g) => g.description === text)) {
          dataGaps.push({ description: text, sourceAgent: phase.name })
        }
      }
    }

    // Sort red flags by severity (HIGH first)
    redFlags.sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
    )

    return {
      allRedFlags: redFlags,
      allFindings: findings,
      allDataGaps: dataGaps,
    }
  }, [dealCheckpoint, agentCheckpoints])

  return (
    <div className="space-y-6">
      {/* Red Flags */}
      <section className="card">
        <h3 className="text-sm font-semibold text-cre-danger uppercase tracking-wider mb-3 flex items-center gap-2">
          Red Flags
          <span className="status-badge status-failed">{allRedFlags.length}</span>
        </h3>
        {allRedFlags.length === 0 ? (
          <p className="text-sm text-gray-500">No red flags identified yet.</p>
        ) : (
          <ul className="space-y-2">
            {allRedFlags.map((flag, i) => (
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
                  <span className="text-xs text-gray-600 ml-auto">
                    {flag.sourceAgent}
                  </span>
                </div>
                <p className="text-sm text-gray-300">{redFlagText(flag)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Key Findings */}
      <section className="card">
        <h3 className="text-sm font-semibold text-cre-success uppercase tracking-wider mb-3 flex items-center gap-2">
          Key Findings
          <span className="status-badge status-complete">{allFindings.length}</span>
        </h3>
        {allFindings.length === 0 ? (
          <p className="text-sm text-gray-500">No findings reported yet.</p>
        ) : (
          <ul className="space-y-2">
            {allFindings.map((finding, i) => (
              <li key={i} className="finding">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{finding.sourceAgent}</span>
                </div>
                <p className="text-sm text-gray-300">{finding.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Data Gaps */}
      <section className="card">
        <h3 className="text-sm font-semibold text-cre-warning uppercase tracking-wider mb-3 flex items-center gap-2">
          Data Gaps
          <span className="status-badge bg-cre-warning/20 text-cre-warning">
            {allDataGaps.length}
          </span>
        </h3>
        {allDataGaps.length === 0 ? (
          <p className="text-sm text-gray-500">No data gaps identified.</p>
        ) : (
          <ul className="space-y-2">
            {allDataGaps.map((gap, i) => (
              <li key={i} className="data-gap">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{gap.sourceAgent}</span>
                </div>
                <p className="text-sm text-gray-300">{gap.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
