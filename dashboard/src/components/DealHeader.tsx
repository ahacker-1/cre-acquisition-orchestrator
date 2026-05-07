import type { DealCheckpoint } from '../types/checkpoint'

interface DealHeaderProps {
  dealCheckpoint: DealCheckpoint
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) {
    return `$${(price / 1_000_000).toFixed(1)}M`
  }
  if (price >= 1_000) {
    return `$${(price / 1_000).toFixed(0)}K`
  }
  return `$${price.toLocaleString()}`
}

function getPhaseCountsByStatus(phases: DealCheckpoint['phases']) {
  let completed = 0
  let running = 0
  let pending = 0
  let failed = 0
  let skipped = 0

  for (const phase of Object.values(phases)) {
    switch (phase.status) {
      case 'complete':
        completed++
        break
      case 'running':
        running++
        break
      case 'failed':
        failed++
        break
      case 'skipped':
        skipped++
        break
      default:
        pending++
    }
  }

  return { completed, running, pending, failed, skipped, total: Object.keys(phases).length }
}

export default function DealHeader({ dealCheckpoint }: DealHeaderProps) {
  const { dealName, dealId, property, overallProgress, phases } = dealCheckpoint
  const phaseCounts = getPhaseCountsByStatus(phases)
  const progressPercent = Math.round((overallProgress || 0) * 100)

  const addr = property?.address || 'N/A'
  const city = property?.city || ''
  const state = property?.state || ''
  const units = property?.totalUnits || 0
  const price = property?.askingPrice || 0

  return (
    <div className="card">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        {/* Left: Deal info */}
        <div>
          <h2 className="text-2xl font-bold text-white">{dealName}</h2>
          <p className="text-gray-400 mt-1">
            {addr}{city && `, ${city}`}{state && `, ${state}`}
          </p>
          <p className="text-xs text-gray-600 mt-1 font-mono">{dealId}</p>
          {dealCheckpoint.workflowName && (
            <p className="text-xs text-cre-accent mt-2 font-semibold">
              {dealCheckpoint.workflowName}
            </p>
          )}
        </div>

        {/* Right: Stats */}
        <div className="flex gap-6 items-center">
          {units > 0 && (
            <>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{units}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Units</div>
              </div>
              <div className="w-px h-10 bg-cre-border" />
            </>
          )}

          {price > 0 && (
            <>
              <div className="text-center">
                <div className="text-2xl font-bold text-cre-accent">
                  {formatPrice(price)}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  Asking Price
                </div>
              </div>
              <div className="w-px h-10 bg-cre-border" />
            </>
          )}

          <div className="text-center min-w-[120px]">
            <div className="text-2xl font-bold text-white">{progressPercent}%</div>
            <div className="progress-bar mt-1">
              <div
                className="progress-fill bg-cre-accent"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
              Progress
            </div>
          </div>
        </div>
      </div>

      {/* Phase summary bar */}
      <div className="flex gap-4 mt-4 pt-4 border-t border-cre-border text-sm">
        <span className="text-gray-400">
          Phases:{' '}
          <span className="text-white font-medium">{phaseCounts.total}</span>
        </span>
        {phaseCounts.completed > 0 && (
          <span className="text-cre-success">
            {phaseCounts.completed} complete
          </span>
        )}
        {phaseCounts.running > 0 && (
          <span className="text-cre-info">
            {phaseCounts.running} running
          </span>
        )}
        {phaseCounts.pending > 0 && (
          <span className="text-gray-400">
            {phaseCounts.pending} pending
          </span>
        )}
        {phaseCounts.failed > 0 && (
          <span className="text-cre-danger">
            {phaseCounts.failed} failed
          </span>
        )}
        {phaseCounts.skipped > 0 && (
          <span className="text-gray-500">
            {phaseCounts.skipped} skipped
          </span>
        )}
      </div>
    </div>
  )
}
