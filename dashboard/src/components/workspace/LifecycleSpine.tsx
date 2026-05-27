import type { SpineStage, StageId, StageStatus } from '../../lib/stageModel'

// Status drives only the small dot marker (color), never the label text — the brand
// expresses hierarchy through weight/size/space, and reserves color for state cues.
const DOT_CLASS: Record<StageStatus, string> = {
  live: 'cre-dot cre-dot-live cre-dot-pulse',
  done: 'cre-dot cre-dot-done',
  blocked: 'cre-dot cre-dot-blocked',
  idle: 'cre-dot cre-dot-idle',
}

const STATUS_HINT: Record<StageStatus, string> = {
  live: 'working',
  done: 'done',
  blocked: 'needs you',
  idle: 'pending',
}

interface LifecycleSpineProps {
  stages: SpineStage[]
  activeStageId: StageId
  onFocusStage: (id: StageId) => void
}

/**
 * The always-visible deal lifecycle. Replaces the old 6-tab nav: every stage of the deal
 * is shown at once; clicking one focuses the center stage on it.
 */
export default function LifecycleSpine({ stages, activeStageId, onFocusStage }: LifecycleSpineProps) {
  return (
    <nav
      className="flex w-full flex-wrap gap-1 border-b border-white/10 sm:flex-nowrap sm:overflow-x-auto"
      aria-label="Deal lifecycle"
      data-testid="lifecycle-spine"
    >
      {stages.map((stage) => {
        const active = stage.id === activeStageId
        return (
          <button
            key={stage.id}
            type="button"
            data-testid={`spine-step-${stage.id}`}
            data-status={stage.status}
            aria-current={active ? 'step' : undefined}
            onClick={() => onFocusStage(stage.id)}
            className={[
              'flex min-w-0 flex-1 items-center gap-2 border-b-2 px-3 py-3 text-left transition-colors',
              active ? 'border-white text-white' : 'border-transparent text-gray-500 hover:text-gray-200',
            ].join(' ')}
          >
            <span className={DOT_CLASS[stage.status]} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.12em]">
                {stage.label}
              </span>
              <span className="block truncate text-[10px] tracking-[0.1em] text-gray-600">
                {STATUS_HINT[stage.status]}
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
