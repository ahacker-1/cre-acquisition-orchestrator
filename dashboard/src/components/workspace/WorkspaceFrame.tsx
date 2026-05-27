import type { ReactNode } from 'react'
import type { DealCheckpoint, StoryEvent } from '../../types/checkpoint'
import type { SpineStage, StageId, StageStatus } from '../../lib/stageModel'
import type { CommandSuggestion } from '../../lib/commandModel'
import LifecycleSpine from './LifecycleSpine'
import LiveFeed from './LiveFeed'
import TeamRail, { type TeamAgentView } from './TeamRail'
import CommandBar from './CommandBar'

const DOT_CLASS: Record<StageStatus, string> = {
  live: 'cre-dot cre-dot-live cre-dot-pulse',
  done: 'cre-dot cre-dot-done',
  blocked: 'cre-dot cre-dot-blocked',
  idle: 'cre-dot cre-dot-idle',
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${value.toLocaleString()}`
}

function dealFacts(deal: DealCheckpoint): string {
  const parts: string[] = []
  if (deal.property.totalUnits > 0) parts.push(`${deal.property.totalUnits.toLocaleString()} units`)
  const price = formatCurrency(deal.property.askingPrice)
  if (price !== '—') parts.push(price)
  const place = [deal.property.city, deal.property.state].filter(Boolean).join(', ')
  if (place) parts.push(place)
  return parts.join(' · ')
}

interface WorkspaceFrameProps {
  deal: DealCheckpoint
  stages: SpineStage[]
  activeStage: StageId
  onFocusStage: (id: StageId) => void
  storyEvents: StoryEvent[]
  team: TeamAgentView[]
  totalAgentCount: number
  stageLabel: string
  packageLabel: string
  packageStatus: StageStatus
  suggestions: CommandSuggestion[]
  onCommandSubmit: (text: string) => void
  onCommandSuggestion: (suggestion: CommandSuggestion) => void
  onOpenAgent: (agentId: string) => void
  onSummon: () => void
  onOpenAdvanced: () => void
  children: ReactNode
}

/**
 * The persistent "deal space": a deal header, the always-visible lifecycle spine, a
 * context-sensitive center stage (passed as children), a right rail (live feed + team),
 * and the command bar. Replaces the old 6-tab DealWorkspace chrome.
 */
export default function WorkspaceFrame({
  deal,
  stages,
  activeStage,
  onFocusStage,
  storyEvents,
  team,
  totalAgentCount,
  stageLabel,
  packageLabel,
  packageStatus,
  suggestions,
  onCommandSubmit,
  onCommandSuggestion,
  onOpenAgent,
  onSummon,
  onOpenAdvanced,
  children,
}: WorkspaceFrameProps) {
  return (
    <div className="portal-shell" data-testid="workspace-frame">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="portal-kicker">Acquisition Workspace</p>
          <h1 className="mt-1 truncate font-serif text-3xl font-semibold tracking-[-0.02em] text-white md:text-4xl">
            {deal.dealName || 'Untitled Deal'}
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-gray-500">{dealFacts(deal)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className="flex items-center gap-2 border border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-gray-300"
            data-testid="package-readiness"
          >
            <span className={DOT_CLASS[packageStatus]} aria-hidden="true" />
            {packageLabel}
          </span>
          <button
            type="button"
            data-testid="open-advanced"
            onClick={onOpenAdvanced}
            className="portal-button portal-button-secondary min-h-9 px-3 py-1"
          >
            Advanced
          </button>
        </div>
      </header>

      <LifecycleSpine stages={stages} activeStageId={activeStage} onFocusStage={onFocusStage} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4" data-testid="stage-outlet">
          {children}
        </div>
        <aside className="space-y-5" data-testid="workspace-rail">
          <div className="portal-panel">
            <LiveFeed storyEvents={storyEvents} />
          </div>
          <div className="portal-panel">
            <TeamRail
              stageLabel={stageLabel}
              agents={team}
              totalAgentCount={totalAgentCount}
              onOpenAgent={onOpenAgent}
              onSummon={onSummon}
            />
          </div>
        </aside>
      </section>

      <CommandBar
        suggestions={suggestions}
        onSubmit={onCommandSubmit}
        onSuggestion={onCommandSuggestion}
      />
    </div>
  )
}
