import { IconPlus } from '@tabler/icons-react'
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
    <section
      data-testid="team-rail"
      aria-label="Your team"
      className="border-t border-white/[0.08] pt-6"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#aeb8bf]">
        Your Team <span className="text-[#65747e]">·</span> {stageLabel}
      </p>
      {agents.length === 0 ? (
        <p className="mt-4 max-w-[26ch] text-xs leading-5 text-[#8996a0]">
          No agents staffed on this stage yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-0.5">
          {agents.map((agent) => (
            <li key={agent.agentId}>
              <button
                type="button"
                data-testid={`team-agent-${agent.agentId}`}
                data-status={agent.status}
                onClick={() => onOpenAgent(agent.agentId)}
                className="group -mx-2 flex min-h-10 w-[calc(100%+1rem)] items-center gap-3 border border-transparent px-2 py-2 text-left text-xs text-[#dbe1e5] transition-colors hover:border-white/[0.08] hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#c98d61]"
              >
                <span className={DOT_CLASS[agent.status]} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate transition-colors group-hover:text-white">
                  {agent.name}
                </span>
                {agent.critical && (
                  <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-[#82909a]">
                    critical
                  </span>
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
        className="mt-4 inline-flex min-h-9 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#d39769] transition-colors hover:text-[#f0b584] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#c98d61]"
      >
        <IconPlus size={13} stroke={1.6} aria-hidden="true" />
        Summon any of {totalAgentCount} agents
      </button>
    </section>
  )
}
