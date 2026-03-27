import type { DealLibraryItem } from '../types/deals'

interface SavedDealsPanelProps {
  deals: DealLibraryItem[]
  loading: boolean
  error: string | null
  onEditDeal: (dealId: string) => void
  onLaunchDeal: (dealId: string) => void
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
  if (label === 'running') return 'bg-cre-info/20 text-cre-info'
  if (label === 'complete') return 'bg-cre-success/20 text-cre-success'
  if (label === 'failed') return 'bg-cre-danger/20 text-cre-danger'
  if (label === 'sample') return 'bg-white/10 text-gray-300'
  if (label === 'ready') return 'bg-cre-success/15 text-cre-success'
  return 'bg-cre-warning/15 text-cre-warning'
}

function DealCard({
  item,
  onEditDeal,
  onLaunchDeal,
  launchingDealId,
  activeRunDealPath,
  activeRunState,
}: {
  item: DealLibraryItem
  onEditDeal: (dealId: string) => void
  onLaunchDeal: (dealId: string) => void
  launchingDealId?: string | null
  activeRunDealPath?: string | null
  activeRunState?: string
}) {
  const launching = launchingDealId === item.dealId
  const canLaunch = item.kind === 'sample' || item.saveState === 'ready'
  const location = [item.city, item.state].filter(Boolean).join(', ')

  return (
    <div className="card bg-cre-surface/60 h-full flex flex-col" data-testid={`deal-card-${item.dealId}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
            <h3 className="text-base font-semibold text-white">{item.dealName}</h3>
            <p className="text-xs text-gray-500 mt-1">{item.dealId}</p>
          </div>
        <span className={`status-badge ${statusClass(item, activeRunDealPath, activeRunState)}`}>
          {statusLabel(item, activeRunDealPath, activeRunState)}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-gray-400">
        <div>{item.address || 'Address pending'}</div>
        <div>{location || 'Location pending'}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-lg bg-black/20 px-3 py-2">
          <div className="text-lg font-semibold text-white tabular-nums">
            {item.totalUnits ?? '--'}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Units</div>
        </div>
        <div className="rounded-lg bg-black/20 px-3 py-2">
          <div className="text-lg font-semibold text-white tabular-nums">
            {formatCurrency(item.askingPrice)}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Price</div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Updated {new Date(item.updatedAt).toLocaleString()}
      </div>

      <div className="mt-5 flex items-center gap-2">
        {item.kind === 'user' && (
          <button
            onClick={() => onEditDeal(item.dealId)}
            data-testid={`edit-deal-${item.dealId}`}
            className="px-3 py-2 rounded-md text-sm font-medium bg-white/5 text-gray-200 hover:bg-white/10 transition-colors"
          >
            {item.saveState === 'draft' ? 'Continue' : 'Edit'}
          </button>
        )}
        <button
          onClick={() => onLaunchDeal(item.dealId)}
          disabled={!canLaunch || launching}
          data-testid={`launch-deal-${item.dealId}`}
          className="px-3 py-2 rounded-md text-sm font-semibold bg-cre-accent text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {launching ? 'Launching...' : item.kind === 'sample' ? 'Run Sample' : 'Launch'}
        </button>
      </div>
    </div>
  )
}

export default function SavedDealsPanel({
  deals,
  loading,
  error,
  onEditDeal,
  onLaunchDeal,
  launchingDealId,
  activeRunDealPath,
  activeRunState,
}: SavedDealsPanelProps) {
  const userDeals = deals.filter((item) => item.kind === 'user')
  const sampleDeals = deals.filter((item) => item.kind === 'sample')

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Deal Library
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Create a new deal, continue a draft, or run one of the included sample analyses.
            </p>
          </div>
          {loading && <span className="text-xs text-gray-500">Refreshing…</span>}
        </div>
        {error && (
          <p className="text-xs text-cre-danger mt-3">{error}</p>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Your Deals
          </h3>
          <span className="text-xs text-gray-500">{userDeals.length} saved</span>
        </div>
        {userDeals.length === 0 ? (
          <div className="card bg-cre-surface/50 text-sm text-gray-500">
            No saved deals yet. Start with the wizard to create your first one.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {userDeals.map((item) => (
              <DealCard
                key={item.dealId}
                item={item}
                onEditDeal={onEditDeal}
                onLaunchDeal={onLaunchDeal}
                launchingDealId={launchingDealId}
                activeRunDealPath={activeRunDealPath}
                activeRunState={activeRunState}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Sample Deals
          </h3>
          <span className="text-xs text-gray-500">{sampleDeals.length} included</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sampleDeals.map((item) => (
            <DealCard
              key={item.dealId}
                item={item}
                onEditDeal={onEditDeal}
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
