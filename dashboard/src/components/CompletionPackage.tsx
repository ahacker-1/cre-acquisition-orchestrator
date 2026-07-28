import { useMemo, useState } from 'react'
import {
  IconAlertTriangle,
  IconChevronDown,
  IconCircleCheck,
  IconFileDescription,
} from '@tabler/icons-react'
import ProofPathStrip from './ProofPathStrip'
import { dealArtifactHref } from '../lib/artifactUrl'
import { buildPackageProofSteps, sourceReadinessPresentation } from '../lib/completionModel'
import { isCompleteDealStatus, normalizeCheckpointStatus } from '../lib/stageModel'
import type {
  DealCheckpoint,
  DocumentArtifact,
  PhaseInfo,
  RedFlag,
  StoryEvent,
} from '../types/checkpoint'

interface RedFlagDrilldownEntry {
  id: string
  phaseKey: string
  phase: string
  flag: RedFlag
  workpaper: DocumentArtifact | null
}

interface CompletionPackageProps {
  dealCheckpoint: DealCheckpoint | null
  storyEvents: StoryEvent[]
  documentArtifacts: DocumentArtifact[]
  className?: string
  onExportPackage?: (format: 'markdown' | 'json') => Promise<void>
  exportingPackage?: boolean
  exportMessage?: string | null
}

interface PhaseOutcome {
  key: string
  phase: PhaseInfo
}

function displayLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

// W62: normalize phase keys (dueDiligence / due-diligence / due_diligence) so red
// flags match their originating workpaper artifacts regardless of casing convention.
function normalizePhase(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/-/g, '_')
}

function percent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value > 1 ? value : value * 100)}%`
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'complete' || normalized === 'completed' || normalized === 'ready') return 'status-complete'
  if (normalized === 'running' || normalized === 'warning') return 'status-running'
  if (normalized === 'failed') return 'status-failed'
  if (normalized === 'blocked') return 'status-blocked'
  return 'status-pending'
}

function prettyTime(value?: string | null): string {
  if (!value) return '--'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return new Date(parsed).toLocaleString()
}

function eventTitle(event: StoryEvent): string {
  if (typeof event.title === 'string' && event.title.length > 0) return event.title
  if (typeof event.summary === 'string' && event.summary.length > 0) return event.summary
  return displayLabel(event.kind)
}

function documentTone(docType: string): string {
  const normalized = docType.toLowerCase()
  if (normalized.includes('memo') || normalized.includes('decision')) return 'border-cre-warning/30 text-cre-warning'
  if (normalized.includes('model') || normalized.includes('underwriting')) return 'border-white/15 text-gray-300'
  if (normalized.includes('report') || normalized.includes('package')) return 'border-cre-success/30 text-cre-success'
  return 'border-white/10 text-gray-400'
}

function finalRecommendation(
  dealCheckpoint: DealCheckpoint | null,
  decisionEvents: StoryEvent[],
): string {
  const explicitEvent = [...decisionEvents]
    .reverse()
    .find((event) => typeof event.verdict === 'string' && event.verdict.length > 0)
  if (explicitEvent?.verdict) return explicitEvent.verdict

  const phases = dealCheckpoint ? Object.values(dealCheckpoint.phases) : []
  const failed = phases.some((phase) => {
    const status = normalizeCheckpointStatus(phase.status)
    return status === 'failed' || status === 'blocked'
  })
  if (failed) return 'Needs review before proceeding'
  const hasSkipped = phases.some((phase) => normalizeCheckpointStatus(phase.status) === 'skipped')
  if (hasSkipped && isCompleteDealStatus(dealCheckpoint?.status)) {
    return 'Scoped workflow completed. Review the package outputs before expanding to a full closing run.'
  }
  const allComplete = phases.length > 0 && phases.every((phase) => isCompleteDealStatus(phase.status))
  if (allComplete) return 'Proceed with committee package review'
  if (isCompleteDealStatus(dealCheckpoint?.status)) return 'Completed package ready for operator review'
  return 'Package in progress'
}

function issueText(issue: { description?: string; message?: string; category?: string }): string {
  return issue.description || issue.message || issue.category || 'Review item'
}

// W62: Red-flag drilldown. Each flag links back to its originating specialist
// workpaper (the phase that raised it) and, where one exists, the workpaper artifact
// + its stored source path. Expanding reveals the origin so an operator can trace
// the flag without leaving the IC package view.
function RedFlagDrilldown({
  entry,
  packageComplete,
  dealId,
}: {
  entry: RedFlagDrilldownEntry
  packageComplete: boolean
  dealId: string
}) {
  const [open, setOpen] = useState(false)
  const { flag, phase, workpaper } = entry

  return (
    <div className="border-t border-white/10 py-4 first:border-t-0" data-testid={`red-flag-drilldown-${entry.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-4">
          <IconAlertTriangle size={19} stroke={1.6} className="mt-0.5 shrink-0 text-cre-danger" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cre-danger">{phase}</p>
            <p className="mt-1 text-sm leading-6 text-gray-300">{issueText(flag)}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.12em] text-gray-500">
            {flag.severity && (
                <span className="text-cre-danger">{flag.severity}</span>
            )}
            {flag.category && (
                <span>{flag.category}</span>
            )}
            </div>
          </div>
        </div>
        <button
          type="button"
          data-testid={`red-flag-drilldown-toggle-${entry.id}`}
          aria-expanded={open}
          className="group inline-flex min-h-11 shrink-0 items-center gap-2 border-b border-white/20 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 transition-colors hover:border-cre-accent hover:text-white"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? 'Hide origin' : 'Drill to origin'}
          <IconChevronDown
            size={15}
            stroke={1.6}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {open && (
        <div
          className="ml-9 mt-4 border-l border-white/15 pl-4 text-xs"
          data-testid={`red-flag-origin-${entry.id}`}
        >
          <p className="font-semibold uppercase tracking-[0.16em] text-gray-500">Originating workpaper</p>
          <p className="mt-2 font-serif text-lg text-gray-200" data-testid={`red-flag-origin-workpaper-${entry.id}`}>
            {workpaper ? workpaper.title : `${phase} specialist workpaper`}
          </p>
          <p className="mt-2 max-w-2xl leading-5 text-gray-500">
            {workpaper
              ? `${displayLabel(workpaper.docType)} filed by ${displayLabel(workpaper.agent)} in ${displayLabel(workpaper.phase)}.`
              : packageComplete
                ? `Raised by the ${phase} specialist agents. This completed scope did not file a separate originating workpaper.`
                : `Raised by the ${phase} specialist agents. No filed workpaper artifact is available yet.`}
          </p>
          {flag.owner && (
            <p className="mt-3 text-gray-400">
              <span className="font-semibold text-gray-300">Owner:</span> {flag.owner}
            </p>
          )}
          {flag.impact && (
            <p className="mt-2 text-gray-400">
              <span className="font-semibold text-gray-300">Impact:</span> {flag.impact}
            </p>
          )}
          {workpaper?.path && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="break-all font-mono text-[11px] text-gray-600" data-testid={`red-flag-origin-source-${entry.id}`}>
                {workpaper.path}
              </p>
              <a
                data-testid={`red-flag-origin-open-${entry.id}`}
                href={dealArtifactHref(dealId, workpaper.path)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-9 items-center border-b border-cre-accent/60 text-[10px] font-semibold uppercase tracking-[0.12em] text-cre-accent hover:border-white hover:text-white"
              >
                Open originating workpaper
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CompletionPackage({
  dealCheckpoint,
  storyEvents,
  documentArtifacts,
  className = '',
  onExportPackage,
  exportingPackage = false,
  exportMessage = null,
}: CompletionPackageProps) {
  const phaseOutcomes = useMemo<PhaseOutcome[]>(() => {
    if (!dealCheckpoint) return []
    return Object.entries(dealCheckpoint.phases).map(([key, phase]) => ({ key, phase }))
  }, [dealCheckpoint])

  const decisionEvents = useMemo(() => {
    return storyEvents
      .filter((event) => event.kind.includes('decision') || event.kind.includes('recommendation'))
      .sort((a, b) => a.seq - b.seq)
  }, [storyEvents])

  const packageArtifacts = useMemo(() => {
    return [...documentArtifacts].sort((a, b) => {
      return Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '')
    })
  }, [documentArtifacts])

  const aggregateFindings = useMemo(() => {
    const findings: string[] = []
    for (const outcome of phaseOutcomes) {
      findings.push(...outcome.phase.outputs.keyFindings)
    }
    for (const event of storyEvents) {
      if (typeof event.summary === 'string' && event.kind.includes('finding')) {
        findings.push(event.summary)
      }
    }
    return [...new Set(findings)].slice(0, 12)
  }, [phaseOutcomes, storyEvents])

  // W62: each red flag links back to its originating specialist workpaper (the phase
  // that raised it) and, where one exists, the originating workpaper artifact + source.
  const redFlagDrilldowns = useMemo(() => {
    return phaseOutcomes.flatMap((outcome) =>
      outcome.phase.outputs.redFlags.map((flag, index) => {
        const phaseKey = outcome.key
        const phaseLabel = outcome.phase.name || displayLabel(phaseKey)
        const phaseArtifacts = packageArtifacts.filter(
          (artifact) => normalizePhase(artifact.phase) === normalizePhase(phaseKey),
        )
        const owner = flag.owner ? normalizePhase(flag.owner) : null
        const workpaper = (owner
          ? phaseArtifacts.find((artifact) =>
              normalizePhase(artifact.agent) === owner && normalizePhase(artifact.docType) === 'workpaper')
            ?? phaseArtifacts.find((artifact) => normalizePhase(artifact.agent) === owner)
          : undefined)
          ?? phaseArtifacts.find((artifact) => normalizePhase(artifact.docType) === 'workpaper')
          ?? phaseArtifacts[0]
        return {
          id: `${phaseKey}-${index}`,
          phaseKey,
          phase: phaseLabel,
          flag,
          workpaper: workpaper ?? null,
        }
      }),
    )
  }, [phaseOutcomes, packageArtifacts])

  const topRedFlags = useMemo(() => redFlagDrilldowns.slice(0, 5), [redFlagDrilldowns])

  const topDataGaps = useMemo(() => {
    return phaseOutcomes.flatMap((outcome) =>
      outcome.phase.outputs.dataGaps.map((gap) => ({
        phase: outcome.phase.name || displayLabel(outcome.key),
        gap,
      })),
    ).slice(0, 5)
  }, [phaseOutcomes])

  const redFlagCount = phaseOutcomes.reduce(
    (sum, outcome) => sum + outcome.phase.outputs.redFlags.length,
    0,
  )
  const dataGapCount = phaseOutcomes.reduce(
    (sum, outcome) => sum + outcome.phase.outputs.dataGaps.length,
    0,
  )
  const recommendation = finalRecommendation(dealCheckpoint, decisionEvents)
  const sourceCoverage = dealCheckpoint?.inputSnapshot?.sourceCoverage
  const sourceReadiness = dealCheckpoint?.inputSnapshot?.readiness
  const sourceReadinessView = sourceReadinessPresentation(sourceReadiness)
  const packageComplete = isCompleteDealStatus(dealCheckpoint?.status)
  const nextDecision = (() => {
    if (!dealCheckpoint) return 'Run a workflow to assemble the first package.'
    if (sourceReadiness?.blockers?.length) return 'Resolve source-backed launch blockers before relying on this package.'
    if (redFlagCount > 0) return 'Assign ownership for red flags before advancing the acquisition.'
    if (dataGapCount > 0) return 'Close open data gaps, then refresh the affected workflow.'
    if (isCompleteDealStatus(dealCheckpoint.status)) return 'Review with IC or expand the workflow scope as needed.'
    return 'Let the active workflow finish, then review phase outcomes.'
  })()

  if (!dealCheckpoint) {
    return (
      <div
        data-testid="completion-package-view"
        className={`space-y-0 ${className}`}
      >
        <ProofPathStrip />
        <div className="flex min-h-56 items-center justify-center border-y border-white/10 px-6 text-center">
          <div>
            <p className="font-serif text-2xl text-gray-300">Completion package will appear after a workflow run starts.</p>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-gray-600">
              Phase outcomes, workpapers, findings, decision log, document manifest, and final recommendation will be assembled here.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const proofPathSteps = buildPackageProofSteps(sourceCoverage, documentArtifacts, dealCheckpoint)

  return (
    <div data-testid="completion-package-view" className={`space-y-0 ${className}`}>
      <ProofPathStrip steps={proofPathSteps} />
      <header className="border-b border-white/10 py-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:items-end">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cre-accent">Completion Package</p>
            <h2 className="mt-3 font-serif text-4xl leading-none text-cre-primary md:text-5xl">
              {dealCheckpoint.dealName}
            </h2>
            <p className="mt-3 font-mono text-xs text-gray-600">{dealCheckpoint.dealId}</p>
          </div>
          <div className="border-l border-white/10 pl-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Recommendation</p>
              <span className={`status-badge ${statusClass(dealCheckpoint.status)}`}>
                {displayLabel(dealCheckpoint.status)}
              </span>
            </div>
            <p className="mt-3 font-serif text-2xl leading-tight text-white">{recommendation}</p>
          </div>
        </div>
        {onExportPackage && (
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
            <button
              type="button"
              data-testid="package-export-markdown"
              className="portal-button portal-button-primary"
              disabled={exportingPackage}
              onClick={() => void onExportPackage('markdown')}
            >
              Export Markdown
            </button>
            <button
              type="button"
              data-testid="package-export-json"
              className="portal-button portal-button-secondary"
              disabled={exportingPackage}
              onClick={() => void onExportPackage('json')}
            >
              Export JSON
            </button>
            {exportMessage && (
              <span className="text-xs uppercase tracking-[0.16em] text-gray-500" data-testid="package-export-status">
                {exportMessage}
              </span>
            )}
          </div>
        )}
        <div className="mt-8 grid border-y border-white/10 sm:grid-cols-2 md:grid-cols-4">
          <div className="py-4 pr-4">
            <div className="font-serif text-3xl text-white">{percent(dealCheckpoint.overallProgress)}</div>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Progress</div>
          </div>
          <div className="border-t border-white/10 py-4 sm:border-l sm:border-t-0 sm:px-4">
            <div className="font-serif text-3xl text-white">{phaseOutcomes.length}</div>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Phases</div>
          </div>
          <div className="border-t border-white/10 py-4 sm:pr-4 md:border-l md:border-t-0 md:px-4">
            <div className={`font-serif text-3xl ${redFlagCount > 0 ? 'text-cre-danger' : 'text-white'}`}>{redFlagCount}</div>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Red Flags</div>
          </div>
          <div className="border-t border-white/10 py-4 sm:border-l sm:px-4 md:border-t-0">
            <div className={`font-serif text-3xl ${dataGapCount > 0 ? 'text-cre-warning' : 'text-white'}`}>{dataGapCount}</div>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Data Gaps</div>
          </div>
        </div>
      </header>

      {sourceCoverage && (
        <section className="border-b border-white/10 py-8" data-testid="source-backed-input-summary">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h3 className="font-serif text-2xl text-white">
                Source-Backed Inputs
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                Run snapshot, approved extraction fields, and source document coverage captured before launch.
              </p>
            </div>
            <span className={`status-badge ${statusClass(sourceReadinessView.status)}`}>
              {displayLabel(sourceReadinessView.label)}
            </span>
          </div>
          <div className="mt-6 grid border-y border-white/10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="py-4 pr-4">
              <div className="font-serif text-2xl text-white">{sourceCoverage.sourceDocumentCount ?? 0}</div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Source Docs</div>
            </div>
            <div className="border-t border-white/10 py-4 sm:border-l sm:border-t-0 sm:px-4">
              <div className="font-serif text-2xl text-white">{sourceCoverage.appliedDocumentCount ?? 0}</div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Applied Docs</div>
            </div>
            <div className="border-t border-white/10 py-4 sm:pr-4 lg:border-l lg:border-t-0 lg:px-4">
              <div className="font-serif text-2xl text-cre-success">{sourceCoverage.approvedFieldCount ?? 0}</div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Approved Fields</div>
            </div>
            <div className="border-t border-white/10 py-4 sm:border-l sm:px-4 lg:border-t-0">
              <div className={`font-serif text-2xl ${(sourceCoverage.missingApprovedFieldCount ?? 0) > 0 ? 'text-cre-warning' : 'text-white'}`}>
                {sourceCoverage.missingApprovedFieldCount ?? 0}
              </div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                {packageComplete ? 'Unresolved At Completion' : 'Missing Fields'}
              </div>
            </div>
          </div>
          {dealCheckpoint.inputSnapshot?.path && (
            <p className="mt-4 break-all font-mono text-[11px] text-gray-600">{dealCheckpoint.inputSnapshot.path}</p>
          )}
        </section>
      )}

      <section className="border-b border-white/10 py-8" data-testid="ic-review-brief">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h3 className="font-serif text-2xl text-white">
              IC Review Brief
            </h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Operator handoff for the next investment committee or diligence standup.
            </p>
          </div>
          <span className={`status-badge ${statusClass(dealCheckpoint.status)}`}>
            {displayLabel(dealCheckpoint.status)}
          </span>
        </div>
        <div className="mt-6 grid gap-8 border-y border-white/10 py-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cre-accent">Recommended next decision</p>
            <p className="mt-3 max-w-3xl font-serif text-2xl leading-snug text-cre-primary">{nextDecision}</p>
            <p className="mt-3 text-sm text-gray-500">{recommendation}</p>
          </div>
          <div className="grid grid-cols-3 border-l border-white/10 pl-5">
            <div>
              <div className="font-serif text-2xl text-cre-danger">{topRedFlags.length}</div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Priority Flags</div>
            </div>
            <div className="border-l border-white/10 pl-4">
              <div className="font-serif text-2xl text-cre-warning">{topDataGaps.length}</div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Priority Gaps</div>
            </div>
            <div className="border-l border-white/10 pl-4">
              <div className="font-serif text-2xl text-white">{sourceReadiness?.warnings?.length ?? 0}</div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Source Warnings</div>
            </div>
          </div>
        </div>
        {(topRedFlags.length > 0 || topDataGaps.length > 0 || sourceReadiness?.warnings?.length) && (
          <div className="mt-6 grid gap-x-8 gap-y-3 lg:grid-cols-3">
            {topRedFlags.slice(0, 2).map(({ phase, flag }) => (
              <div key={`${phase}-${issueText(flag)}`} className="border-l-2 border-cre-danger py-2 pl-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cre-danger">{phase}</p>
                <p className="mt-1 text-sm leading-6 text-gray-300">{issueText(flag)}</p>
              </div>
            ))}
            {topDataGaps.slice(0, 2).map(({ phase, gap }) => (
              <div key={`${phase}-${issueText(gap)}`} className="border-l-2 border-cre-warning py-2 pl-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cre-warning">{phase}</p>
                <p className="mt-1 text-sm leading-6 text-gray-300">{issueText(gap)}</p>
              </div>
            ))}
            {(sourceReadiness?.warnings ?? []).slice(0, 2).map((warning) => (
              <div key={warning} className="border-l border-white/20 py-2 pl-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Source Readiness</p>
                <p className="mt-1 text-sm leading-6 text-gray-300">{warning}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {redFlagDrilldowns.length > 0 && (
        <section className="border-b border-white/10 py-8" data-testid="red-flag-drilldowns">
          <h3 className="font-serif text-2xl text-white">
            Red Flag Drilldowns
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Each priority flag links back to the specialist workpaper that raised it and its source.
          </p>
          <div className="mt-5 border-y border-white/10">
            {redFlagDrilldowns.map((entry) => (
              <RedFlagDrilldown
                key={entry.id}
                entry={entry}
                packageComplete={packageComplete}
                dealId={dealCheckpoint.dealId}
              />
            ))}
          </div>
        </section>
      )}

      <section className="border-b border-white/10 py-8">
        <h3 className="font-serif text-2xl text-white">
          Phase Outcomes
        </h3>
        <div className="mt-5 divide-y divide-white/10 border-y border-white/10">
          {phaseOutcomes.map(({ key, phase }) => (
            <div key={key} className="grid gap-5 py-5 lg:grid-cols-[minmax(180px,0.55fr)_minmax(0,1.45fr)]">
              <div>
                <div className="flex items-center justify-between gap-3 lg:block">
                  <h4 className="font-serif text-lg text-white">{phase.name || displayLabel(key)}</h4>
                  <span className={`status-badge mt-0 lg:mt-3 ${statusClass(phase.status)}`}>
                    {displayLabel(phase.status)}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <div
                  className="h-px w-full bg-white/10"
                  role="progressbar"
                  aria-label={`${phase.name || displayLabel(key)} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Number.isFinite(phase.progress)
                    ? Math.round(phase.progress > 1 ? phase.progress : phase.progress * 100)
                    : 0}
                >
                  <div className="h-px bg-cre-accent" style={{ width: percent(phase.progress) }} />
                </div>
                {phase.outputs.phaseSummary && (
                  <p className="mt-3 text-sm leading-6 text-gray-400">{phase.outputs.phaseSummary}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
                  <span className="text-cre-success">{phase.outputs.keyFindings.length} findings</span>
                  <span className="text-cre-danger">{phase.outputs.redFlags.length} red flags</span>
                  <span className="text-cre-warning">{phase.outputs.dataGaps.length} gaps</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid border-b border-white/10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="py-8 lg:pr-8">
          <h3 className="font-serif text-2xl text-white">
            Findings
          </h3>
          {aggregateFindings.length === 0 ? (
            <p className="mt-5 text-sm text-gray-500">
              {packageComplete ? 'This completed scope did not publish separate findings.' : 'No findings have been published yet.'}
            </p>
          ) : (
            <ul className="mt-5 border-y border-white/10">
              {aggregateFindings.map((finding) => (
                <li key={finding} className="flex items-start gap-4 border-t border-white/10 py-3 first:border-t-0">
                  <IconCircleCheck size={19} stroke={1.6} className="mt-0.5 shrink-0 text-cre-success" aria-hidden="true" />
                  <p className="text-sm leading-6 text-gray-300">{finding}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-white/10 py-8 lg:border-l lg:border-t-0 lg:pl-8">
          <h3 className="font-serif text-2xl text-white">
            Workpapers
          </h3>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Document Manifest
          </p>
          {packageArtifacts.length === 0 ? (
            <p className="mt-5 text-sm text-gray-500">
              {packageComplete ? 'This completed scope did not file separate workpapers.' : 'No workpapers have been generated yet.'}
            </p>
          ) : (
            <div className="mt-5 divide-y divide-white/10 border-y border-white/10">
              {packageArtifacts.map((artifact) => (
                <div key={artifact.docId} className="flex gap-4 py-4">
                  <IconFileDescription size={20} stroke={1.5} className="mt-0.5 shrink-0 text-cre-accent" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`status-badge ${documentTone(artifact.docType)}`}>
                        {artifact.docType}
                      </span>
                      <span className="text-gray-500">{displayLabel(artifact.phase)}</span>
                      <span className="ml-auto text-gray-600">{prettyTime(artifact.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-gray-200">{artifact.title}</p>
                    {artifact.summary && (
                      <p className="mt-1 text-xs leading-5 text-gray-500">{artifact.summary}</p>
                    )}
                    {artifact.path && (
                      <div className="mt-2">
                        <p className="break-all font-mono text-[11px] text-gray-600">{artifact.path}</p>
                        <a
                          data-testid={`package-workpaper-open-${artifact.docId}`}
                          href={dealArtifactHref(dealCheckpoint.dealId, artifact.path)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex min-h-8 items-center border-b border-cre-accent/60 text-[10px] font-semibold uppercase tracking-[0.12em] text-cre-accent hover:border-white hover:text-white"
                        >
                          {normalizePhase(artifact.docType) === 'input_snapshot' ? 'Open run snapshot' : 'Open workpaper'}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid border-b border-white/10 lg:grid-cols-2">
        <div className="py-8 lg:pr-8">
          <h3 className="font-serif text-2xl text-white">
            Decision Log
          </h3>
          {decisionEvents.length === 0 ? (
            <p className="mt-5 text-sm text-gray-500">
              {packageComplete ? 'This completed scope did not emit separate decision events.' : 'No decision events have been emitted yet.'}
            </p>
          ) : (
            <div className="mt-5 divide-y divide-white/10 border-y border-white/10">
              {decisionEvents.map((event) => (
                <div key={`${event.runId}-${event.seq}`} className="py-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{prettyTime(event.ts)}</span>
                    {event.phaseLabel && <span>{event.phaseLabel}</span>}
                    {event.verdict && (
                      <span className="status-badge ml-auto border-cre-warning/30 text-cre-warning">
                        {event.verdict}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-serif text-lg text-gray-200">{eventTitle(event)}</p>
                  {event.rationale && (
                    <p className="mt-2 text-xs leading-5 text-gray-500">{event.rationale}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 py-8 lg:border-l lg:border-t-0 lg:pl-8">
          <h3 className="font-serif text-2xl text-white">
            Final Recommendation Package
          </h3>
          <div className="mt-5 border-y border-white/10 py-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cre-accent">
              Recommendation
            </div>
            <p className="mt-3 font-serif text-2xl leading-snug text-white">{recommendation}</p>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Assembled from {phaseOutcomes.length} phase outcomes, {packageArtifacts.length} workpapers, {aggregateFindings.length} findings, and {decisionEvents.length} decision events.
            </p>
          </div>
          <div className="border-b border-white/10 py-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              Resume Instructions
            </div>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              {dealCheckpoint.resumeInstructions || (packageComplete
                ? 'No additional resume instruction was included for this completed scope.'
                : 'No resume instructions published.')}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export { CompletionPackage }
export default CompletionPackage
