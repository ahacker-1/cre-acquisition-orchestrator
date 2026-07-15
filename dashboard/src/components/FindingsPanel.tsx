import { useMemo } from 'react'
import { IconAlertTriangle, IconCircleCheck, IconHelpCircle } from '@tabler/icons-react'
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
    <div className="divide-y divide-white/10 border-y border-white/10">
      {/* Red Flags */}
      <section className="py-7" aria-labelledby="findings-red-flags">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="findings-red-flags" className="font-serif text-2xl text-white">Red Flags</h3>
          <span className="font-serif text-2xl tabular-nums text-cre-danger">{allRedFlags.length}</span>
        </div>
        {allRedFlags.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No red flags identified yet.</p>
        ) : (
          <ul className="mt-5 border-y border-white/10">
            {allRedFlags.map((flag, i) => (
              <li key={i} className="flex gap-4 border-t border-white/10 py-4 first:border-t-0">
                <IconAlertTriangle size={19} stroke={1.6} className="mt-0.5 shrink-0 text-cre-danger" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
                    <span
                      className={
                        flag.severity === 'HIGH'
                          ? 'text-cre-danger'
                          : flag.severity === 'MEDIUM'
                          ? 'text-cre-warning'
                          : 'text-gray-400'
                      }
                    >
                      {flag.severity}
                    </span>
                    <span className="text-gray-500">{flag.category}</span>
                    <span className="ml-auto text-gray-600">{flag.sourceAgent}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-300">{redFlagText(flag)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Key Findings */}
      <section className="py-7" aria-labelledby="findings-key-findings">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="findings-key-findings" className="font-serif text-2xl text-white">Key Findings</h3>
          <span className="font-serif text-2xl tabular-nums text-cre-success">{allFindings.length}</span>
        </div>
        {allFindings.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No findings reported yet.</p>
        ) : (
          <ul className="mt-5 border-y border-white/10">
            {allFindings.map((finding, i) => (
              <li key={i} className="flex gap-4 border-t border-white/10 py-4 first:border-t-0">
                <IconCircleCheck size={19} stroke={1.6} className="mt-0.5 shrink-0 text-cre-success" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">{finding.sourceAgent}</span>
                  <p className="mt-2 text-sm leading-6 text-gray-300">{finding.description}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Data Gaps */}
      <section className="py-7" aria-labelledby="findings-data-gaps">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="findings-data-gaps" className="font-serif text-2xl text-white">Data Gaps</h3>
          <span className="font-serif text-2xl tabular-nums text-cre-warning">{allDataGaps.length}</span>
        </div>
        {allDataGaps.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No data gaps identified.</p>
        ) : (
          <ul className="mt-5 border-y border-white/10">
            {allDataGaps.map((gap, i) => (
              <li key={i} className="flex gap-4 border-t border-white/10 py-4 first:border-t-0">
                <IconHelpCircle size={19} stroke={1.6} className="mt-0.5 shrink-0 text-cre-warning" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">{gap.sourceAgent}</span>
                  <p className="mt-2 text-sm leading-6 text-gray-300">{gap.description}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
