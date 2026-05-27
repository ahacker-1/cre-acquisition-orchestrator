import { useEffect } from 'react'
import type { StageId } from '../lib/stageModel'

interface GuidedDemoStep {
  id: string
  title: string
  eyebrow: string
  body: string
  stage: StageId
  targetTestId: string
}

interface GuidedDemoTourProps {
  active: boolean
  stepIndex: number
  onStepIndexChange: (stepIndex: number) => void
  onFocusStage: (stage: StageId) => void
  onClose: () => void
}

const GUIDED_DEMO_STEPS: GuidedDemoStep[] = [
  {
    id: 'deal-space',
    title: 'The Deal Space',
    eyebrow: '1 / 5 · The whole lifecycle',
    stage: 'intake',
    targetTestId: 'lifecycle-spine',
    body:
      'Every stage of the deal — Intake through IC — lives on one spine that is always visible. Click any stage to focus the workspace on it; the colored dots tell you what is done, live, or waiting on you.',
  },
  {
    id: 'command-console',
    title: 'Command Your Team',
    eyebrow: '2 / 5 · Tell them what to do',
    stage: 'intake',
    targetTestId: 'command-bar',
    body:
      'Drive the deal from one prompt. Tell the team what you want — or tap a suggestion — and the right specialists go to work. No menus, no forms.',
  },
  {
    id: 'your-team',
    title: 'Your Team',
    eyebrow: '3 / 5 · Summon a specialist',
    stage: 'diligence',
    targetTestId: 'team-rail',
    body:
      'Each stage shows the specialists staffed on it, with live status. Click one to put it to work and watch it run; summon any of the 31 agents on demand.',
  },
  {
    id: 'watch-it-work',
    title: 'Watch It Work',
    eyebrow: '4 / 5 · The live feed',
    stage: 'underwriting',
    targetTestId: 'live-feed',
    body:
      'The live feed is the heartbeat: a running, chronological view of every agent’s activity as the team works the deal — the moment you can watch the whole desk move.',
  },
  {
    id: 'ic-package',
    title: 'IC Package',
    eyebrow: '5 / 5 · Committee-ready output',
    stage: 'ic',
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
  onFocusStage,
  onClose,
}: GuidedDemoTourProps) {
  const safeStepIndex = Math.min(Math.max(stepIndex, 0), GUIDED_DEMO_STEPS.length - 1)
  const step = GUIDED_DEMO_STEPS[safeStepIndex]
  const isFirst = safeStepIndex === 0
  const isLast = safeStepIndex === GUIDED_DEMO_STEPS.length - 1

  useEffect(() => {
    if (!active) return
    onFocusStage(step.stage)
    scrollTargetIntoView(step.targetTestId)
  }, [active, onFocusStage, step.stage, step.targetTestId])

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
          className="border border-white/10 px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
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
