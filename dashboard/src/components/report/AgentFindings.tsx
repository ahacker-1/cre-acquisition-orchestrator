import type { DealCheckpoint } from '../../types/checkpoint'
import {
  safeStr,
  safeObj,
  verdictColor,
  verdictLabel,
  SectionHeading,
} from './ReportHelpers'
import EmptyPhaseState from './EmptyPhaseState'

interface Props {
  dealCheckpoint: DealCheckpoint
}

/** Convert "rent-roll-analyst" to "Rent Roll Analyst" */
function formatAgentName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Determine badge color for agent status strings */
function agentStatusColor(status: string): string {
  const upper = status.toUpperCase()
  if (upper === 'COMPLETE' || upper === 'ACCEPTABLE' || upper === 'CLEAR' || upper === 'BOUND')
    return 'bg-cre-success/20 text-cre-success'
  if (upper === 'FAILED' || upper === 'ERROR')
    return 'bg-cre-danger/20 text-cre-danger'
  if (upper === 'RUNNING' || upper === 'IN_PROGRESS')
    return 'bg-cre-info/20 text-cre-info'
  return 'bg-[#4b5563]/20 text-gray-400'
}

function AgentFindingCard({
  agentName,
  status,
  finding,
}: {
  agentName: string
  status: string
  finding: string
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm font-semibold text-white">{formatAgentName(agentName)}</h5>
        <span className={`status-badge ${agentStatusColor(status)}`}>
          {status.toUpperCase()}
        </span>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed">{finding}</p>
    </div>
  )
}

function PhaseSection({
  title,
  verdict,
  agentFindings,
}: {
  title: string
  verdict: string | null | undefined
  agentFindings: Record<string, unknown>
}) {
  const entries = Object.entries(agentFindings)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h4 className="text-sm font-semibold text-gray-200">{title}</h4>
        <span className={`status-badge ${verdictColor(verdict)}`}>
          {verdictLabel(verdict)}
        </span>
        <span className="text-xs text-gray-500">
          {entries.length} agent{entries.length !== 1 ? 's' : ''}
        </span>
      </div>

      {entries.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {entries.map(([name, data]) => {
            const agent = safeObj(data as Record<string, unknown>)
            return (
              <AgentFindingCard
                key={name}
                agentName={name}
                status={safeStr(agent.status, 'N/A')}
                finding={safeStr(agent.finding, 'No finding recorded.')}
              />
            )
          })}
        </div>
      ) : (
        <div className="card">
          <p className="text-sm text-gray-500">No agent findings available for this phase.</p>
        </div>
      )}
    </div>
  )
}

export default function AgentFindings({ dealCheckpoint }: Props) {
  const { phases } = dealCheckpoint

  /* Guard: need at least one phase with data */
  if (
    !phases?.due_diligence?.dataForDownstream &&
    !phases?.underwriting?.dataForDownstream &&
    !phases?.financing?.dataForDownstream
  ) {
    return (
      <EmptyPhaseState
        sectionTitle="Agent Findings"
        phaseName="Due Diligence, Underwriting, and Financing"
      />
    )
  }

  /* Extract agent findings from each phase's dataForDownstream */
  const dd = (phases?.due_diligence?.dataForDownstream || {}) as Record<string, unknown>
  const uw = (phases?.underwriting?.dataForDownstream || {}) as Record<string, unknown>
  const fin = (phases?.financing?.dataForDownstream || {}) as Record<string, unknown>

  const ddFindings = safeObj(dd.agentFindings)
  const uwFindings = safeObj(uw.agentFindings)
  const finFindings = safeObj(fin.agentFindings)

  /* Phase verdicts */
  const ddVerdict = phases?.due_diligence?.verdict || phases?.due_diligence?.outputs?.phaseVerdict || null
  const uwVerdict = phases?.underwriting?.verdict || phases?.underwriting?.outputs?.phaseVerdict || null
  const finVerdict = phases?.financing?.verdict || phases?.financing?.outputs?.phaseVerdict || null

  return (
    <section className="space-y-6">
      <SectionHeading>Agent Findings</SectionHeading>

      {/* Due Diligence Agents */}
      <PhaseSection
        title="Due Diligence Agents"
        verdict={typeof ddVerdict === 'string' ? ddVerdict : null}
        agentFindings={ddFindings}
      />

      {/* Divider */}
      <div className="border-t border-cre-border/50" />

      {/* Underwriting Agents */}
      <PhaseSection
        title="Underwriting Agents"
        verdict={typeof uwVerdict === 'string' ? uwVerdict : null}
        agentFindings={uwFindings}
      />

      {/* Divider */}
      <div className="border-t border-cre-border/50" />

      {/* Financing Agents */}
      <PhaseSection
        title="Financing Agents"
        verdict={typeof finVerdict === 'string' ? finVerdict : null}
        agentFindings={finFindings}
      />
    </section>
  )
}
