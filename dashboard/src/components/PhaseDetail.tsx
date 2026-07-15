import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconClock,
  IconHelpCircle,
  IconLoader2,
  IconPlayerSkipForward,
} from '@tabler/icons-react'
import type { PhaseInfo, AgentCheckpoint, AgentStatus } from '../types/checkpoint'

interface PhaseDetailProps {
  phase: PhaseInfo
  phaseName: string
  agentCheckpoints: Map<string, AgentCheckpoint>
}

const EMPTY_AGENTS: PhaseInfo['agents'] = {
  total: 0,
  completed: 0,
  running: 0,
  failed: 0,
  pending: 0,
  skipped: 0,
}

const EMPTY_OUTPUTS: PhaseInfo['outputs'] = {
  phaseSummary: '',
  keyFindings: [],
  redFlags: [],
  dataGaps: [],
  phaseVerdict: null,
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

function normalizeProgress(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0

  const percent = value >= 0 && value <= 1 ? value * 100 : value
  return Math.round(Math.min(100, Math.max(0, percent)))
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return 'Pending'

  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function verdictTone(verdict: string | null): string {
  switch (verdict?.toUpperCase()) {
    case 'PASS':
      return 'text-cre-success'
    case 'FAIL':
      return 'text-cre-danger'
    case 'CONDITIONAL':
      return 'text-[#c88768]'
    case 'NEEDS_REVIEW':
    case 'PROCEED_WITH_MITIGATIONS':
      return 'text-cre-warning'
    default:
      return 'text-gray-400'
  }
}

function redFlagText(flag: PhaseInfo['outputs']['redFlags'][number]): string {
  return flag.description || flag.message || 'Flag requires review'
}

function dataGapText(gap: PhaseInfo['outputs']['dataGaps'][number]): string {
  return gap.description || gap.message || 'Data gap requires review'
}

function getNextAction(
  outputs: PhaseInfo['outputs'],
  agents: PhaseInfo['agents'],
  phaseStatus: PhaseInfo['status'],
): string {
  const priorityFlag = [...outputs.redFlags].sort(
    (left, right) =>
      (SEVERITY_ORDER[left.severity] ?? Number.MAX_SAFE_INTEGER) -
      (SEVERITY_ORDER[right.severity] ?? Number.MAX_SAFE_INTEGER),
  )[0]

  if (priorityFlag) return 'Assign ownership for red flags before advancing the acquisition.'
  if (outputs.dataGaps[0]) return `Close data gap: ${dataGapText(outputs.dataGaps[0])}`
  if (outputs.phaseSummary) return `Review decision context: ${outputs.phaseSummary}`
  if (outputs.keyFindings[0]) return `Validate finding: ${outputs.keyFindings[0]}`
  if (agents.failed > 0) {
    return `Review ${agents.failed} failed agent ${agents.failed === 1 ? 'run' : 'runs'}`
  }
  if (agents.running > 0) {
    return `Monitor ${agents.running} active agent ${agents.running === 1 ? 'run' : 'runs'}`
  }
  if (agents.pending > 0) {
    return `Start ${agents.pending} pending agent ${agents.pending === 1 ? 'run' : 'runs'}`
  }
  if (phaseStatus === 'complete') return 'Review phase readiness before advancing'
  return 'Review phase inputs and begin analysis'
}

function AgentStatusIcon({ status }: { status: AgentStatus }) {
  const iconProps = { size: 18, stroke: 1.7, 'aria-hidden': true as const }

  switch (status) {
    case 'complete':
      return <IconCircleCheck {...iconProps} className="text-cre-success" />
    case 'running':
      return <IconLoader2 {...iconProps} className="text-cre-info motion-safe:animate-spin" />
    case 'failed':
      return <IconAlertCircle {...iconProps} className="text-cre-danger" />
    case 'skipped':
      return <IconPlayerSkipForward {...iconProps} className="text-gray-500" />
    default:
      return <IconClock {...iconProps} className="text-gray-500" />
  }
}

export default function PhaseDetail({
  phase,
  phaseName,
  agentCheckpoints,
}: PhaseDetailProps) {
  const progressPercent = normalizeProgress(phase.progress)
  const agents = phase.agents ?? EMPTY_AGENTS
  const outputs = phase.outputs ?? EMPTY_OUTPUTS
  const verdict = outputs.phaseVerdict ?? phase.verdict ?? null
  const phaseStatus = phase.status ?? 'pending'
  const phaseId = `phase-${phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const nextAction = getNextAction(outputs, agents, phaseStatus)

  const phaseAgents: AgentCheckpoint[] = []
  for (const [, agent] of agentCheckpoints) {
    if (
      agent.phase === phaseName.toLowerCase().replace(/ /g, '_') ||
      agent.phase === phaseName
    ) {
      phaseAgents.push(agent)
    }
  }

  const activityCounts = [
    { label: 'Total', value: agents.total, tone: 'text-white' },
    { label: 'Complete', value: agents.completed, tone: 'text-cre-success' },
    { label: 'Running', value: agents.running, tone: 'text-cre-info' },
    { label: 'Failed', value: agents.failed, tone: 'text-cre-danger' },
    { label: 'Pending', value: agents.pending, tone: 'text-gray-300' },
    { label: 'Skipped', value: agents.skipped ?? 0, tone: 'text-gray-400' },
  ]

  return (
    <section className="min-w-0" aria-labelledby={`${phaseId}-title`}>
      <header className="grid items-end gap-8 border-b border-white/10 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(330px,0.9fr)]">
        <div>
          <p className="text-base font-medium tracking-[0.02em] text-gray-400">{phaseName}</p>
          <h3 id={`${phaseId}-title`} className={`mt-3 font-serif text-5xl leading-none sm:text-[68px] ${verdictTone(verdict)}`}>
            {formatLabel(verdict)}
          </h3>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_92px] items-end gap-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Phase status</p>
            <p className="mt-3 text-sm leading-6 text-gray-200">
              {phaseName} {formatLabel(phaseStatus).toLowerCase()}
              {verdict ? <> with verdict {String(verdict).toUpperCase()}.</> : '.'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Progress</p>
            <p className="mt-2 font-serif text-3xl tabular-nums text-cre-primary">{progressPercent}%</p>
            <p className="mt-1 text-xs text-gray-600">complete</p>
          </div>
          <div
            className="col-span-2 h-px w-full bg-white/10"
            role="progressbar"
            aria-label={`${phaseName} completion`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <div className={`h-px ${phaseStatus === 'failed' ? 'bg-cre-danger' : 'bg-cre-accent'}`} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </header>

      {outputs.phaseSummary && (
        <section className="border-b border-white/10 py-6" aria-labelledby={`${phaseId}-brief`}>
          <h4 id={`${phaseId}-brief`} className="font-serif text-2xl text-white">
            {phaseName} brief
          </h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">One next action. Ranked findings for a clear path forward.</p>
          <div className="mt-5 flex items-start gap-5 border-y border-l-2 border-white/10 border-l-cre-accent py-4 pl-5">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-cre-accent text-cre-accent" aria-hidden="true">
              <IconArrowRight size={19} stroke={1.6} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cre-accent">Next action</p>
              <p className="mt-1 font-serif text-base leading-6 text-gray-200">{nextAction}</p>
              <p className="mt-1 text-xs text-gray-600">{outputs.phaseSummary}</p>
            </div>
          </div>
        </section>
      )}

      {outputs.keyFindings.length > 0 && (
        <section className="border-l-2 border-cre-success py-4 pl-6" aria-labelledby={`${phaseId}-findings`}>
          <div className="flex items-baseline justify-between gap-4">
            <h4 id={`${phaseId}-findings`} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cre-success">
              Key findings
            </h4>
            <span className="text-xs tabular-nums text-gray-500">{outputs.keyFindings.length}</span>
          </div>
          <ul className="mt-2 border-b border-white/10">
            {outputs.keyFindings.map((finding, index) => (
              <li key={`${finding}-${index}`} className="flex items-start gap-4 border-t border-white/10 py-2.5">
                <IconCircleCheck size={19} stroke={1.6} className="mt-0.5 shrink-0 text-cre-success" aria-hidden="true" />
                <span className="text-sm leading-6 text-gray-300">{finding}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outputs.redFlags.length > 0 && (
        <section className="border-l-2 border-cre-danger py-4 pl-6" aria-labelledby={`${phaseId}-flags`}>
          <div className="flex items-baseline justify-between gap-4">
            <h4 id={`${phaseId}-flags`} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cre-danger">
              Red flags
            </h4>
            <span className="text-xs tabular-nums text-gray-500">{outputs.redFlags.length}</span>
          </div>
          <ul className="mt-2 border-b border-white/10">
            {outputs.redFlags.map((flag, index) => (
              <li key={`${redFlagText(flag)}-${index}`} className="flex items-start gap-4 border-t border-white/10 py-2.5">
                <IconAlertTriangle size={19} stroke={1.6} className="mt-0.5 shrink-0 text-cre-danger" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-gray-300">{redFlagText(flag)}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                    {[flag.severity, flag.category].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outputs.dataGaps.length > 0 && (
        <section className="border-l-2 border-cre-warning py-4 pl-6" aria-labelledby={`${phaseId}-gaps`}>
          <div className="flex items-baseline justify-between gap-4">
            <h4 id={`${phaseId}-gaps`} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cre-warning">
              Data gaps
            </h4>
            <span className="text-xs tabular-nums text-gray-500">{outputs.dataGaps.length}</span>
          </div>
          <ul className="mt-2 border-b border-white/10">
            {outputs.dataGaps.map((gap, index) => (
              <li key={`${dataGapText(gap)}-${index}`} className="flex items-start gap-4 border-t border-white/10 py-2.5">
                <IconHelpCircle size={19} stroke={1.6} className="mt-0.5 shrink-0 text-cre-warning" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-gray-300">{dataGapText(gap)}</p>
                  {(gap.severity || gap.category) && (
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                      {[gap.severity, gap.category].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-white/10 py-7" aria-labelledby={`${phaseId}-activity`}>
        <h4 id={`${phaseId}-activity`} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">
          Agent activity
        </h4>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          {activityCounts.map((count) => (
            <div key={count.label} className="flex items-baseline gap-2">
              <dd className={`text-sm font-medium tabular-nums ${count.tone}`}>{count.value}</dd>
              <dt className="text-xs text-gray-500">{count.label}</dt>
            </div>
          ))}
        </dl>

        {phaseAgents.length > 0 && (
          <ul className="mt-5 border-b border-white/10" aria-label={`${phaseName} agents`}>
            {phaseAgents.map((agent) => (
              <li key={agent.agentName} className="flex items-center gap-3 border-t border-white/10 py-3.5">
                <AgentStatusIcon status={agent.status} />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-300">{agent.agentName}</span>
                <span className="text-xs tabular-nums text-gray-500">
                  {normalizeProgress(agent.progress)}%
                </span>
                <span className="w-16 text-right text-xs text-gray-400">{formatLabel(agent.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
