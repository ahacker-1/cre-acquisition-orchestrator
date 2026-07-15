import type { SpineStage, StageId, StageStatus } from '../../lib/stageModel'
import { IconCheck } from '@tabler/icons-react'

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
      className="flex w-full overflow-x-auto border-t border-cre-border xl:block xl:overflow-visible xl:border-t-0"
      aria-label="Deal lifecycle"
      data-testid="lifecycle-spine"
    >
      {stages.map((stage, index) => {
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
              'group relative flex min-w-[124px] items-center gap-3 border-b border-cre-border px-4 py-4 text-left transition-colors xl:min-w-0 xl:border-b-0 xl:px-5 xl:py-3',
              active ? 'text-white' : 'text-gray-500 hover:text-gray-200',
            ].join(' ')}
          >
            <span className="relative flex h-8 w-4 shrink-0 items-center justify-center" aria-hidden="true">
              {index < stages.length - 1 && (
                <span className="absolute left-1/2 top-[21px] hidden h-[38px] w-px -translate-x-1/2 bg-cre-border xl:block" />
              )}
              <span className={[
                'relative z-[1] flex h-[14px] w-[14px] items-center justify-center rounded-full border bg-[#0c151c]',
                active ? 'border-cre-accent ring-1 ring-cre-accent/35' : stage.status === 'done' ? 'border-cre-success bg-cre-success' : stage.status === 'blocked' ? 'border-cre-danger' : 'border-gray-600',
              ].join(' ')}>
                {stage.status === 'done' && <IconCheck size={10} stroke={2.4} className="text-[#0c151c]" />}
                {active && stage.status !== 'done' && <span className="h-1 w-1 rounded-full bg-cre-primary" />}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium tracking-[-0.01em]">
                {stage.label}
              </span>
              <span className="mt-0.5 block truncate text-[10px] tracking-[0.02em] text-gray-600">
                {STATUS_HINT[stage.status]}
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
