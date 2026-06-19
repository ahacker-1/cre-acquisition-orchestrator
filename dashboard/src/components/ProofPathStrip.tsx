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
  return status === 'ready'
    ? 'border-cre-success/40 bg-cre-success/10 text-cre-success'
    : 'border-white/10 bg-black/20 text-gray-400'
}

export default function ProofPathStrip({
  steps = DEFAULT_STEPS,
  className = '',
  testId = 'proof-path-strip',
}: ProofPathStripProps) {
  const resolved = DEFAULT_STEPS.map((fallback) => steps.find((step) => step.key === fallback.key) ?? fallback)

  return (
    <section data-testid={testId} aria-label="Source to IC proof path">
      <ol className={`grid gap-2 md:grid-cols-4 ${className}`}>
        {resolved.map((step, index) => {
          const detail = step.detail && step.detail.trim().length > 0 ? step.detail : 'Pending'
          const statusLabel = step.status === 'ready' ? 'Ready' : 'Pending'
          return (
            <li
              key={step.key}
              aria-label={`Step ${index + 1}: ${step.label}. ${statusLabel}. ${detail}`}
              className={[
                'min-h-[76px] border px-3 py-2',
                'grid grid-rows-[auto_1fr] gap-1',
                stepTone(step.status),
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center border border-current text-[10px] font-semibold">
                  {index + 1}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{step.label}</span>
              </div>
              <p className="line-clamp-2 self-end text-xs leading-5 text-gray-400">{detail}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
