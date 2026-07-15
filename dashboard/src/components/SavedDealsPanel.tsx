import {
  IconArrowUpRight,
  IconFileUpload,
  IconPencil,
  IconPlayerPlay,
} from '@tabler/icons-react'
import type { DealLibraryItem } from '../types/deals'

interface SavedDealsPanelProps {
  variant?: 'full' | 'compact'
  deals: DealLibraryItem[]
  loading: boolean
  error: string | null
  onEditDeal: (dealId: string) => void
  onOpenWorkspace: (dealId: string, section?: 'mission' | 'documents') => void
  onLaunchDeal: (dealId: string) => void
  onViewAll?: () => void
  launchingDealId?: string | null
  activeRunDealPath?: string | null
  activeRunState?: string
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${value.toLocaleString()}`
}

function statusLabel(
  item: DealLibraryItem,
  activeRunDealPath?: string | null,
  activeRunState?: string,
): string {
  const runActive =
    (activeRunState === 'STARTING' || activeRunState === 'RUNNING' || activeRunState === 'STOPPING') &&
    activeRunDealPath === item.dealPath
  if (runActive) return 'Running'
  if (item.kind === 'sample') return 'Sample'
  if (item.pipelineStatus) {
    const normalized = item.pipelineStatus.toLowerCase()
    if (normalized === 'complete' || normalized === 'completed') return 'Complete'
    if (normalized === 'failed') return 'Failed'
    if (normalized === 'running' || normalized === 'pending') {
      return item.saveState === 'ready' ? 'Ready' : 'Draft'
    }
  }
  return item.saveState === 'ready' ? 'Ready' : 'Draft'
}

function statusClass(
  item: DealLibraryItem,
  activeRunDealPath?: string | null,
  activeRunState?: string,
): string {
  const label = statusLabel(item, activeRunDealPath, activeRunState).toLowerCase()
  if (label === 'running') return 'text-[#7da9c1] before:bg-[#7da9c1]'
  if (label === 'complete') return 'text-[#7fa68c] before:bg-[#7fa68c]'
  if (label === 'failed') return 'text-[#df8378] before:bg-[#df8378]'
  if (label === 'sample') return 'text-[#839099] before:bg-[#839099]'
  if (label === 'ready') return 'text-[#7fa68c] before:bg-[#7fa68c]'
  return 'text-[#c89b63] before:bg-[#c89b63]'
}

function DealCard({
  item,
  onEditDeal,
  onOpenWorkspace,
  onLaunchDeal,
  launchingDealId,
  activeRunDealPath,
  activeRunState,
}: {
  item: DealLibraryItem
  onEditDeal: (dealId: string) => void
  onOpenWorkspace: (dealId: string, section?: 'mission' | 'documents') => void
  onLaunchDeal: (dealId: string) => void
  launchingDealId?: string | null
  activeRunDealPath?: string | null
  activeRunState?: string
}) {
  const launching = launchingDealId === item.dealId
  const canLaunch = item.kind === 'sample' || item.saveState === 'ready'
  const location = [item.city, item.state].filter(Boolean).join(', ')
  const currentStatus = statusLabel(item, activeRunDealPath, activeRunState)

  return (
    <article
      className="group grid gap-6 border-t border-white/[0.09] py-7 first:border-t-0 lg:grid-cols-[minmax(260px,1.35fr)_minmax(210px,0.9fr)_180px_minmax(270px,auto)] lg:items-center"
      data-testid={`deal-card-${item.dealId}`}
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4 lg:block">
          <h3 className="truncate font-serif text-2xl font-normal leading-tight tracking-[-0.02em] text-[#eceae4] transition-colors group-hover:text-white">
            {item.dealName}
          </h3>
          <span
            className={`relative shrink-0 pl-3 text-[9px] font-semibold uppercase tracking-[0.16em] before:absolute before:left-0 before:top-1/2 before:h-1 before:w-1 before:-translate-y-1/2 ${statusClass(item, activeRunDealPath, activeRunState)}`}
            aria-label={`Status: ${currentStatus}`}
          >
            {currentStatus}
          </span>
        </div>
        <p className="mt-2 truncate text-[10px] uppercase tracking-[0.14em] text-[#5e6b74]">{item.dealId}</p>
      </div>

      <div className="min-w-0 text-[13px] leading-6 text-[#929da4]">
        <p className="truncate">{item.address || 'Address pending'}</p>
        <p className="truncate text-[#68767f]">{location || 'Location pending'}</p>
      </div>

      <dl className="grid grid-cols-2 gap-6 border-y border-white/[0.07] py-4 lg:border-y-0 lg:border-l lg:py-0 lg:pl-6">
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#596771]">Units</dt>
          <dd className="mt-1 font-serif text-xl tabular-nums text-[#d6d6d1]">{item.totalUnits ?? '--'}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#596771]">Price</dt>
          <dd className="mt-1 font-serif text-xl tabular-nums text-[#d6d6d1]">
            {formatCurrency(item.askingPrice)}
          </dd>
        </div>
      </dl>

      <div className="lg:justify-self-end">
        <p className="mb-4 text-[10px] leading-4 text-[#58666f] lg:text-right">
          Updated {new Date(item.updatedAt).toLocaleString()}
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:justify-end">
          {item.kind === 'user' && (
            <>
              <button
                type="button"
                onClick={() => onOpenWorkspace(item.dealId, 'documents')}
                data-testid={`workspace-docs-${item.dealId}`}
                className="inline-flex min-h-10 items-center gap-2 border-b border-transparent py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#849198] transition-colors hover:border-white/[0.18] hover:text-[#e4e5e1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d59667]"
              >
                <IconFileUpload aria-hidden="true" className="h-4 w-4" stroke={1.4} />
                Upload Docs
              </button>
              <button
                type="button"
                onClick={() => onEditDeal(item.dealId)}
                data-testid={`edit-deal-${item.dealId}`}
                className="inline-flex min-h-10 items-center gap-2 border-b border-transparent py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#849198] transition-colors hover:border-white/[0.18] hover:text-[#e4e5e1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d59667]"
              >
                <IconPencil aria-hidden="true" className="h-3.5 w-3.5" stroke={1.4} />
                {item.saveState === 'draft' ? 'Continue' : 'Edit'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onLaunchDeal(item.dealId)}
            disabled={!canLaunch || launching}
            data-testid={`launch-deal-${item.dealId}`}
            className="inline-flex min-h-10 items-center gap-2 bg-[#b87345] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#09141b] transition-colors hover:bg-[#ca8656] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d59667] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-[#57636b]"
          >
            <IconPlayerPlay aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor" stroke={1.4} />
            {launching ? 'Launching...' : item.kind === 'sample' ? 'Run with Codex' : 'Launch'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function SavedDealsPanel({
  variant = 'full',
  deals,
  loading,
  error,
  onEditDeal,
  onOpenWorkspace,
  onLaunchDeal,
  onViewAll,
  launchingDealId,
  activeRunDealPath,
  activeRunState,
}: SavedDealsPanelProps) {
  const userDeals = deals.filter((item) => item.kind === 'user')
  const sampleDeals = deals.filter((item) => item.kind === 'sample')

  if (variant === 'compact') {
    const recentDeals = [...userDeals]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 5)

    return (
      <section className="border-y border-white/[0.09] bg-[#0a141c]" data-testid="recent-deals-strip">
        <div className="flex flex-wrap items-end justify-between gap-5 px-6 py-8 sm:px-10 lg:px-12">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#b87345]">Recent Deals</p>
            <h2 className="mt-3 font-serif text-3xl font-normal tracking-[-0.025em] text-[#eceae4]">
              Pick up where you left off
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {loading && <span className="text-[10px] uppercase tracking-[0.12em] text-[#617079]">Refreshing...</span>}
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 border-b border-white/[0.14] py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa5ab] transition-colors hover:border-[#b87345] hover:text-[#eceae4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d59667]"
              onClick={onViewAll}
            >
              View All Deals
              <IconArrowUpRight aria-hidden="true" className="h-4 w-4 text-[#b87345]" stroke={1.4} />
            </button>
          </div>
        </div>
        {error && (
          <p className="mx-6 border-t border-[#df8378]/30 py-4 text-xs text-[#df8378] sm:mx-10 lg:mx-12" role="alert">
            {error}
          </p>
        )}
        {recentDeals.length === 0 ? (
          <div className="border-t border-white/[0.08] px-6 py-8 text-sm text-[#68767f] sm:px-10 lg:px-12">
            No deals yet. Drop your documents above to start your first deal.
          </div>
        ) : (
          <div className="border-t border-white/[0.08] px-6 sm:px-10 lg:px-12">
            {recentDeals.map((item) => {
              const isDraft = item.saveState === 'draft'
              const currentStatus = statusLabel(item, activeRunDealPath, activeRunState)
              return (
                <article
                  key={item.dealId}
                  className="group grid gap-5 border-t border-white/[0.07] py-5 first:border-t-0 md:grid-cols-[minmax(0,1.25fr)_minmax(160px,0.6fr)_auto] md:items-center"
                  data-testid={`deal-card-${item.dealId}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-4">
                      <h3 className="truncate font-serif text-xl font-normal text-[#dddcd7] transition-colors group-hover:text-white">
                        {item.dealName}
                      </h3>
                      <span
                        className={`relative shrink-0 pl-3 text-[9px] font-semibold uppercase tracking-[0.15em] before:absolute before:left-0 before:top-1/2 before:h-1 before:w-1 before:-translate-y-1/2 ${statusClass(item, activeRunDealPath, activeRunState)}`}
                        aria-label={`Status: ${currentStatus}`}
                      >
                        {currentStatus}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[9px] uppercase tracking-[0.13em] text-[#5d6a73]">{item.dealId}</p>
                  </div>
                  <p className="truncate text-xs text-[#6f7d85]">
                    {[item.city, item.state].filter(Boolean).join(', ') || item.address || 'Location pending'}
                  </p>
                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center justify-between gap-5 border-b border-white/[0.13] py-2 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-[#a7b0b5] transition-colors hover:border-[#b87345] hover:text-[#eceae4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d59667]"
                    onClick={() => (isDraft ? onEditDeal(item.dealId) : onOpenWorkspace(item.dealId, 'documents'))}
                    data-testid={isDraft ? `edit-deal-${item.dealId}` : `workspace-docs-${item.dealId}`}
                  >
                    {isDraft ? 'Continue' : 'Open Workspace'}
                    <IconArrowUpRight aria-hidden="true" className="h-4 w-4 text-[#b87345]" stroke={1.4} />
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  return (
    <div>
      <header className="border-y border-white/[0.09] px-6 py-10 sm:px-10 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#b87345]">Portfolio</p>
            <h2 className="mt-3 font-serif text-4xl font-normal tracking-[-0.03em] text-[#eceae4]">Deal Library</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#74828a]">
              Open a deal's workspace, drop in source documents, or run a live Codex review.
            </p>
          </div>
          {loading && <span className="text-[10px] uppercase tracking-[0.14em] text-[#68767f]">Refreshing…</span>}
        </div>
        {error && (
          <p className="mt-5 border-t border-[#df8378]/30 pt-4 text-xs text-[#df8378]" role="alert">
            {error}
          </p>
        )}
      </header>

      <section className="px-6 py-12 sm:px-10 lg:px-12">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.09] pb-5">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#aab2b6]">Your Deals</h3>
          <span className="text-[10px] uppercase tracking-[0.14em] text-[#5f6d75]">{userDeals.length} saved</span>
        </div>
        {userDeals.length === 0 ? (
          <div className="border-b border-white/[0.08] py-8 text-sm text-[#68767f]">
            No saved deals yet. Click New Deal to drop in your documents and create your first one.
          </div>
        ) : (
          <div>
            {userDeals.map((item) => (
              <DealCard
                key={item.dealId}
                item={item}
                onEditDeal={onEditDeal}
                onOpenWorkspace={onOpenWorkspace}
                onLaunchDeal={onLaunchDeal}
                launchingDealId={launchingDealId}
                activeRunDealPath={activeRunDealPath}
                activeRunState={activeRunState}
              />
            ))}
          </div>
        )}
      </section>

      <section className="px-6 pb-12 sm:px-10 lg:px-12">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.09] pb-5">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#aab2b6]">Sample Deals</h3>
          <span className="text-[10px] uppercase tracking-[0.14em] text-[#5f6d75]">{sampleDeals.length} included</span>
        </div>
        <div>
          {sampleDeals.map((item) => (
            <DealCard
              key={item.dealId}
                item={item}
                onEditDeal={onEditDeal}
                onOpenWorkspace={onOpenWorkspace}
                onLaunchDeal={onLaunchDeal}
                launchingDealId={launchingDealId}
                activeRunDealPath={activeRunDealPath}
                activeRunState={activeRunState}
              />
            ))}
        </div>
      </section>
    </div>
  )
}
