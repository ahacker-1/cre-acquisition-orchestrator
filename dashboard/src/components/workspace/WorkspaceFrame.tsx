import type { ReactNode } from 'react'
import { IconAdjustmentsHorizontal, IconArrowRight, IconChevronDown } from '@tabler/icons-react'
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
  onOpenDealLibrary: () => void
  onOpenAdvanced: () => void
  primaryAction?: {
    label: string
    pendingLabel?: string
    testId: string
    disabled?: boolean
    pending?: boolean
    onClick: () => void
  }
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
  onOpenDealLibrary,
  onOpenAdvanced,
  primaryAction,
  children,
}: WorkspaceFrameProps) {
  return (
    <div className="portal-shell grid min-h-screen min-w-0 grid-cols-[minmax(0,1fr)] pb-24 xl:grid-cols-[185px_minmax(0,1fr)] xl:pb-0" data-testid="workspace-frame">
      <aside className="min-w-0 border-b border-cre-border bg-[#0c151c]/90 xl:min-h-screen xl:border-b-0 xl:border-r" aria-label="Workspace navigation">
        <div className="flex items-start justify-between gap-4 px-5 py-5 xl:block xl:px-5 xl:py-7">
          <div>
            <p className="font-serif text-[26px] font-medium leading-none tracking-[-0.04em] text-cre-primary" aria-hidden="true">AO</p>
            <p className="mt-5 hidden max-w-[132px] text-[13px] font-light leading-5 text-gray-300 xl:block">
              CRE Acquisition<br />Orchestrator
            </p>
          </div>
          <div className="min-w-0 xl:mt-9 xl:border-y xl:border-cre-border xl:py-5">
            <p className="portal-kicker">Deal</p>
            <button
              type="button"
              onClick={onOpenDealLibrary}
              aria-label={`Switch deal. Current deal: ${deal.dealName || 'Untitled Deal'}`}
              title="Switch deal"
              data-testid="workspace-switch-deal"
              className="mt-3 flex min-h-11 min-w-0 items-center gap-2 text-left text-xs text-gray-300 hover:text-white"
            >
              <span className="truncate">{deal.dealName || 'Untitled Deal'}</span>
              <IconChevronDown size={14} stroke={1.5} className="shrink-0 text-gray-600" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="xl:px-0">
          <p className="portal-kicker hidden px-5 pb-3 xl:block">Workflow</p>
          <LifecycleSpine stages={stages} activeStageId={activeStage} onFocusStage={onFocusStage} />
        </div>

        <div className="hidden px-5 pb-28 pt-8 xl:block">
          <span
            className="flex items-center gap-2 border-t border-cre-border pt-5 text-[10px] uppercase tracking-[0.12em] text-gray-500"
            data-testid="package-readiness"
          >
            <span className={DOT_CLASS[packageStatus]} aria-hidden="true" />
            {packageLabel}
          </span>
        </div>
      </aside>

      <div className="min-w-0 overflow-hidden xl:overflow-visible">
        <header className="flex min-h-[162px] flex-col justify-center gap-6 border-b border-cre-border px-6 py-8 md:px-10 lg:flex-row lg:items-center lg:justify-between xl:px-[54px]">
          <div className="min-w-0">
            <p className="portal-kicker xl:hidden">Acquisition workspace</p>
            <h1 className="mt-1 truncate font-serif text-4xl font-medium leading-none tracking-[-0.035em] text-cre-primary md:text-[52px]">
              {deal.dealName || 'Untitled Deal'}
            </h1>
            <p className="mt-4 text-xs font-light tracking-[0.14em] text-gray-500">{dealFacts(deal)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-4">
            <button
              type="button"
              data-testid="open-advanced"
              onClick={onOpenAdvanced}
              className="portal-button portal-button-secondary min-h-[46px] px-5"
            >
              <IconAdjustmentsHorizontal size={17} stroke={1.5} aria-hidden="true" />
              Advanced
            </button>
            {primaryAction && (
              <button
                type="button"
                data-testid={primaryAction.testId}
                disabled={primaryAction.disabled || primaryAction.pending}
                onClick={primaryAction.onClick}
                className="portal-button portal-button-primary min-h-[46px] min-w-[220px] justify-between px-6"
              >
                <span>{primaryAction.pending ? primaryAction.pendingLabel ?? 'Working…' : primaryAction.label}</span>
                <IconArrowRight size={18} stroke={1.5} aria-hidden="true" />
              </button>
            )}
          </div>
        </header>

        <section className="grid min-h-[calc(100vh-162px)] xl:grid-cols-[minmax(0,1fr)_330px]">
          <section className="min-w-0 px-6 py-10 md:px-10 xl:px-[54px]" data-testid="stage-outlet" aria-label={`${stageLabel} stage`}>
            {children}
          </section>
          <aside className="flex min-h-[640px] flex-col border-t border-cre-border px-5 py-7 xl:sticky xl:top-0 xl:h-[calc(100vh-162px)] xl:min-h-0 xl:self-start xl:overflow-y-auto xl:border-l xl:border-t-0" data-testid="workspace-rail">
            <LiveFeed storyEvents={storyEvents} />
            <div className="mt-6">
              <TeamRail
                stageLabel={stageLabel}
                agents={team}
                totalAgentCount={totalAgentCount}
                onOpenAgent={onOpenAgent}
                onSummon={onSummon}
              />
            </div>
            <div className="mt-auto pt-10">
              <CommandBar
                suggestions={suggestions}
                onSubmit={onCommandSubmit}
                onSuggestion={onCommandSuggestion}
              />
            </div>
          </aside>
        </section>
      </div>
    </div>
  )
}
