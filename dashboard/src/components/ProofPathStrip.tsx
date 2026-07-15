export interface ProofPathStep {
  key: 'source-doc' | 'approved-field' | 'agent-workpaper' | 'ic-package'
  label: string
  detail?: string
  status: 'ready' | 'pending'
}

interface ProofPathStripProps {
  steps?: ProofPathStep[]
  className?: string
  testId?: string
}

const DEFAULT_STEPS: ProofPathStep[] = [
  { key: 'source-doc', label: 'Source doc', detail: 'Pending', status: 'pending' },
  { key: 'approved-field', label: 'Approved field', detail: 'Pending', status: 'pending' },
  { key: 'agent-workpaper', label: 'Agent workpaper', detail: 'Pending', status: 'pending' },
  { key: 'ic-package', label: 'IC package', detail: 'Pending', status: 'pending' },
]

function stepTone(status: ProofPathStep['status']): string {
  return status === 'ready' ? 'text-gray-300' : 'text-gray-500'
}

function statusDot(status: ProofPathStep['status']): string {
  return status === 'ready'
    ? 'cre-dot cre-dot-done'
    : 'h-2 w-2 shrink-0 rounded-full border border-white/25'
}

export default function ProofPathStrip({
  steps = DEFAULT_STEPS,
  className = '',
  testId = 'proof-path-strip',
}: ProofPathStripProps) {
  const resolved = DEFAULT_STEPS.map((fallback) => steps.find((step) => step.key === fallback.key) ?? fallback)

  return (
    <section data-testid={testId} aria-label="Source to IC proof path">
      <ol className={`grid border-y border-white/10 md:grid-cols-4 ${className}`}>
        {resolved.map((step, index) => {
          const detail = step.detail && step.detail.trim().length > 0 ? step.detail : 'Pending'
          const statusLabel = step.status === 'ready' ? 'Ready' : 'Pending'
          return (
            <li
              key={step.key}
              aria-label={`Step ${index + 1}: ${step.label}. ${statusLabel}. ${detail}`}
              className={[
                'grid min-h-[76px] grid-rows-[auto_1fr] gap-2 border-b border-white/[0.08] px-3 py-3 last:border-b-0 md:border-b-0 md:border-l md:first:border-l-0',
                stepTone(step.status),
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-[9px] text-cre-accent" aria-hidden="true">
                    0{index + 1}
                  </span>
                  <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em]">
                    {step.label}
                  </span>
                </span>
                <span className={statusDot(step.status)} aria-hidden="true" />
              </div>
              <p className="line-clamp-2 self-end text-xs leading-5 text-gray-500">{detail}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
