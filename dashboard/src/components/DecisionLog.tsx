import { useMemo } from 'react'
import { IconArrowRight, IconScale } from '@tabler/icons-react'
import type { StoryEvent } from '../types/checkpoint'

interface DecisionLogProps {
  storyEvents: StoryEvent[]
}

function prettyTs(value: string): string {
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return value
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
}

export default function DecisionLog({ storyEvents }: DecisionLogProps) {
  const decisions = useMemo(() => {
    return storyEvents
      .filter((event) => event.kind === 'decision_made')
      .sort((a, b) => a.seq - b.seq)
  }, [storyEvents])

  if (decisions.length === 0) {
    return (
      <section className="flex min-h-64 items-center justify-center border-y border-white/10 px-6 text-center" aria-labelledby="decision-ribbon-title">
        <div>
          <h3 id="decision-ribbon-title" className="font-serif text-2xl text-gray-300">Decision Ribbon</h3>
          <p className="mt-4 text-gray-400">No decisions logged yet.</p>
          <p className="mt-2 text-xs text-gray-600">
            Verdict and gating rationale will appear here.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="border-y border-white/10 py-7" aria-labelledby="decision-ribbon-title">
      <div className="flex items-end justify-between gap-4">
        <h3 id="decision-ribbon-title" className="font-serif text-2xl text-white">Decision Ribbon</h3>
        <span className="font-serif text-2xl tabular-nums text-gray-400">{decisions.length}</span>
      </div>
      <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
        {decisions.map((decision) => (
          <article key={`${decision.runId}-${decision.seq}`} className="grid gap-4 py-5 md:grid-cols-[150px_minmax(0,1fr)]">
            <div className="text-xs text-gray-600">
              <div className="flex items-center gap-2 text-cre-warning">
                <IconScale size={18} stroke={1.5} aria-hidden="true" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Decision</span>
              </div>
              {typeof decision.phase === 'string' && (
                <p className="mt-3 text-gray-500">{decision.phase}</p>
              )}
              <p className="mt-1 font-mono text-[11px]">{prettyTs(decision.ts)}</p>
            </div>
            <div className="min-w-0">
              <h4 className="font-serif text-xl leading-snug text-gray-200">
                {typeof decision.title === 'string' ? decision.title : 'Decision'}
              </h4>
              {typeof decision.rationale === 'string' && decision.rationale.length > 0 && (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">{decision.rationale}</p>
              )}
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                {Array.isArray(decision.inputs) && decision.inputs.length > 0 && (
                  <div className="border-l border-white/15 pl-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Inputs</p>
                    <ul className="mt-3 space-y-2">
                      {decision.inputs.map((input, idx) => (
                        <li key={idx} className="flex items-start gap-3 text-xs leading-5 text-gray-400">
                          <IconArrowRight size={14} stroke={1.6} className="mt-0.5 shrink-0 text-cre-accent" aria-hidden="true" />
                          <span>{input}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(decision.impact) && decision.impact.length > 0 && (
                  <div className="border-l border-white/15 pl-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Impact</p>
                    <ul className="mt-3 space-y-2">
                      {decision.impact.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3 text-xs leading-5 text-gray-400">
                          <IconArrowRight size={14} stroke={1.6} className="mt-0.5 shrink-0 text-cre-accent" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
