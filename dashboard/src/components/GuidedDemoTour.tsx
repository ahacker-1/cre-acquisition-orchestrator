import { useEffect } from 'react'

export type GuidedDemoTab = 'mission' | 'agents' | 'workpapers' | 'package'

interface GuidedDemoStep {
  id: string
  title: string
  eyebrow: string
  body: string
  tab: GuidedDemoTab
  targetTestId: string
}

interface GuidedDemoTourProps {
  active: boolean
  stepIndex: number
  onStepIndexChange: (stepIndex: number) => void
  onTabChange: (tab: GuidedDemoTab) => void
  onClose: () => void
}

const GUIDED_DEMO_STEPS: GuidedDemoStep[] = [
  {
    id: 'acquisition-command',
    title: 'Acquisition Command',
    eyebrow: '1 / 5 · Executive state',
    tab: 'mission',
    targetTestId: 'mission-control',
    body:
      'Start with the command surface: deal stage, readiness, blockers, package state, and the latest material movement in one operator view.',
  },
  {
    id: 'swarm-goal-console',
    title: 'Swarm Goal Console',
    eyebrow: '2 / 5 · Goal to specialist team',
    tab: 'mission',
    targetTestId: 'swarm-goal-console',
    body:
      'The operator states the outcome. The swarm turns that goal into a recommended workflow, specialist roster, data gaps, handoff path, and next action.',
  },
  {
    id: 'deal-team',
    title: 'Deal Team',
    eyebrow: '3 / 5 · Visible coordination',
    tab: 'agents',
    targetTestId: 'agent-tree',
    body:
      'Specialist agents are organized by workstream so a reviewer can see who is queued, who filed work, and how diligence context moves across the team.',
  },
  {
    id: 'workpapers-evidence',
    title: 'Workpapers & Evidence',
    eyebrow: '4 / 5 · Audit trail',
    tab: 'workpapers',
    targetTestId: 'workpapers-evidence-view',
    body:
      'Agent outputs become reviewable workpapers and evidence-oriented artifacts instead of disappearing into a chat transcript.',
  },
  {
    id: 'ic-package',
    title: 'IC Package',
    eyebrow: '5 / 5 · Committee-ready output',
    tab: 'package',
    targetTestId: 'completion-package-view',
    body:
      'The payoff is an investment committee package: recommendation, phase outcomes, risks, data gaps, decision log, source-backed inputs, and workpaper links.',
  },
]

function scrollTargetIntoView(targetTestId: string): void {
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-testid="${targetTestId}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  })
}

export default function GuidedDemoTour({
  active,
  stepIndex,
  onStepIndexChange,
  onTabChange,
  onClose,
}: GuidedDemoTourProps) {
  const safeStepIndex = Math.min(Math.max(stepIndex, 0), GUIDED_DEMO_STEPS.length - 1)
  const step = GUIDED_DEMO_STEPS[safeStepIndex]
  const isFirst = safeStepIndex === 0
  const isLast = safeStepIndex === GUIDED_DEMO_STEPS.length - 1

  useEffect(() => {
    if (!active) return
    onTabChange(step.tab)
    scrollTargetIntoView(step.targetTestId)
  }, [active, onTabChange, step.tab, step.targetTestId])

  if (!active) return null

  return (
    <aside
      data-testid="guided-demo-overlay"
      className="fixed bottom-5 right-5 z-50 w-[min(92vw,440px)] border border-white/15 bg-black/95 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.65)]"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="portal-kicker" data-testid="guided-demo-step-count">
            {step.eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white" data-testid="guided-demo-step-title">
            {step.title}
          </h2>
        </div>
        <button
          type="button"
          data-testid="guided-demo-close"
          className="rounded-full border border-white/10 px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="Close guided demo"
        >
          Close
        </button>
      </div>

      <p className="mt-4 text-sm leading-6 text-gray-300" data-testid="guided-demo-step-body">
        {step.body}
      </p>
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-gray-500" data-testid="guided-demo-target-label">
        Showing: {step.title}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          data-testid="guided-demo-back"
          className="portal-button portal-button-secondary"
          disabled={isFirst}
          onClick={() => onStepIndexChange(safeStepIndex - 1)}
        >
          Back
        </button>
        <button
          type="button"
          data-testid={isLast ? 'guided-demo-finish' : 'guided-demo-next'}
          className="portal-button portal-button-primary"
          onClick={() => {
            if (isLast) {
              onClose()
              return
            }
            onStepIndexChange(safeStepIndex + 1)
          }}
        >
          {isLast ? 'Finish Tour' : 'Next'}
        </button>
      </div>
    </aside>
  )
}
