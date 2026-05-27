import type { StageStatus } from '../../lib/stageModel'

const DOT_CLASS: Record<StageStatus, string> = {
  live: 'cre-dot cre-dot-live cre-dot-pulse',
  done: 'cre-dot cre-dot-done',
  blocked: 'cre-dot cre-dot-blocked',
  idle: 'cre-dot cre-dot-idle',
}

export interface TeamAgentView {
  agentId: string
  name: string
  critical?: boolean
  status: StageStatus
}

interface TeamRailProps {
  stageLabel: string
  agents: TeamAgentView[]
  totalAgentCount: number
  onOpenAgent: (agentId: string) => void
  onSummon: () => void
}

/**
 * "Your Team" for the focused stage. Click an agent to open its panel (summon → watch →
 * read → re-task, wired in Phase 3); "summon any of N" opens the full roster picker.
 */
export default function TeamRail({
  stageLabel,
  agents,
  totalAgentCount,
  onOpenAgent,
  onSummon,
}: TeamRailProps) {
  return (
    <section data-testid="team-rail" aria-label="Your team">
      <p className="portal-kicker">Your Team · {stageLabel}</p>
      {agents.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-gray-600">No agents staffed on this stage yet.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {agents.map((agent) => (
            <li key={agent.agentId}>
              <button
                type="button"
                data-testid={`team-agent-${agent.agentId}`}
                data-status={agent.status}
                onClick={() => onOpenAgent(agent.agentId)}
                className="flex w-full items-center gap-2 border border-transparent px-1 py-1.5 text-left text-xs text-gray-300 transition-colors hover:border-white/10 hover:bg-white/[0.03]"
              >
                <span className={DOT_CLASS[agent.status]} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                {agent.critical && (
                  <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-gray-600">critical</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        data-testid="team-summon"
        onClick={onSummon}
        className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cre-live transition-colors hover:text-white"
      >
        + summon any of {totalAgentCount} agents
      </button>
    </section>
  )
}
