import { useMemo } from 'react'
import type {
  DealCheckpoint,
  DocumentArtifact,
  PhaseInfo,
  StoryEvent,
} from '../types/checkpoint'

interface CompletionPackageProps {
  dealCheckpoint: DealCheckpoint | null
  storyEvents: StoryEvent[]
  documentArtifacts: DocumentArtifact[]
  className?: string
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

function percent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value > 1 ? value : value * 100)}%`
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === 'complete' || normalized === 'completed') return 'status-complete'
  if (normalized === 'running') return 'status-running'
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
  if (normalized.includes('memo') || normalized.includes('decision')) return 'bg-cre-warning/20 text-cre-warning'
  if (normalized.includes('model') || normalized.includes('underwriting')) return 'bg-cre-info/20 text-cre-info'
  if (normalized.includes('report') || normalized.includes('package')) return 'bg-cre-success/20 text-cre-success'
  return 'bg-white/10 text-gray-300'
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
  const failed = phases.some((phase) => phase.status === 'failed' || phase.status === 'blocked')
  if (failed) return 'Needs review before proceeding'
  const hasSkipped = phases.some((phase) => phase.status === 'skipped')
  if (hasSkipped && dealCheckpoint?.status === 'complete') {
    return 'Scoped workflow completed. Review the package outputs before expanding to a full closing run.'
  }
  const allComplete = phases.length > 0 && phases.every((phase) => phase.status === 'complete')
  if (allComplete) return 'Proceed with committee package review'
  return 'Package in progress'
}

function CompletionPackage({
  dealCheckpoint,
  storyEvents,
  documentArtifacts,
  className = '',
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

  if (!dealCheckpoint) {
    return (
      <div
        data-testid="completion-package-view"
        className={`card flex items-center justify-center h-64 text-center ${className}`}
      >
        <div>
          <p className="text-gray-400">Completion package will appear after a workflow run starts.</p>
          <p className="text-xs text-gray-600 mt-1">
            Phase outcomes, workpapers, findings, decision log, document manifest, and final recommendation will be assembled here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="completion-package-view" className={`space-y-6 ${className}`}>
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Completion Package
            </h2>
            <p className="text-lg font-semibold text-white mt-1">{dealCheckpoint.dealName}</p>
            <p className="text-xs text-gray-500 mt-1 font-mono">{dealCheckpoint.dealId}</p>
          </div>
          <span className={`status-badge ${statusClass(dealCheckpoint.status)}`}>
            {displayLabel(dealCheckpoint.status)}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-4 mt-5">
          <div className="rounded-lg bg-black/20 px-4 py-3">
            <div className="text-lg font-semibold text-white">{percent(dealCheckpoint.overallProgress)}</div>
            <div className="text-xs uppercase tracking-wider text-gray-500">Progress</div>
          </div>
          <div className="rounded-lg bg-black/20 px-4 py-3">
            <div className="text-lg font-semibold text-white">{phaseOutcomes.length}</div>
            <div className="text-xs uppercase tracking-wider text-gray-500">Phases</div>
          </div>
          <div className="rounded-lg bg-black/20 px-4 py-3">
            <div className="text-lg font-semibold text-white">{redFlagCount}</div>
            <div className="text-xs uppercase tracking-wider text-gray-500">Red Flags</div>
          </div>
          <div className="rounded-lg bg-black/20 px-4 py-3">
            <div className="text-lg font-semibold text-white">{dataGapCount}</div>
            <div className="text-xs uppercase tracking-wider text-gray-500">Data Gaps</div>
          </div>
        </div>
      </div>

      {sourceCoverage && (
        <section className="card" data-testid="source-backed-input-summary">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Source-Backed Inputs
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Run snapshot, approved extraction fields, and source document coverage captured before launch.
              </p>
            </div>
            <span className={`status-badge ${statusClass(sourceReadiness?.status || 'pending')}`}>
              {displayLabel(sourceReadiness?.status || 'warning')}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-4 mt-5">
            <div className="rounded-lg bg-black/20 px-4 py-3">
              <div className="text-lg font-semibold text-white">{sourceCoverage.sourceDocumentCount ?? 0}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500">Source Docs</div>
            </div>
            <div className="rounded-lg bg-black/20 px-4 py-3">
              <div className="text-lg font-semibold text-white">{sourceCoverage.appliedDocumentCount ?? 0}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500">Applied Docs</div>
            </div>
            <div className="rounded-lg bg-black/20 px-4 py-3">
              <div className="text-lg font-semibold text-white">{sourceCoverage.approvedFieldCount ?? 0}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500">Approved Fields</div>
            </div>
            <div className="rounded-lg bg-black/20 px-4 py-3">
              <div className="text-lg font-semibold text-white">{sourceCoverage.missingApprovedFieldCount ?? 0}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500">Missing Fields</div>
            </div>
          </div>
          {dealCheckpoint.inputSnapshot?.path && (
            <p className="mt-4 break-all font-mono text-xs text-gray-600">{dealCheckpoint.inputSnapshot.path}</p>
          )}
        </section>
      )}

      <section className="card">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
          Phase Outcomes
        </h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {phaseOutcomes.map(({ key, phase }) => (
            <div key={key} className="rounded-lg border border-cre-border bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-white">{phase.name || displayLabel(key)}</h4>
                <span className={`status-badge ${statusClass(phase.status)}`}>
                  {displayLabel(phase.status)}
                </span>
              </div>
              <div className="mt-3 progress-bar">
                <div
                  className="progress-fill bg-cre-accent"
                  style={{ width: percent(phase.progress) }}
                />
              </div>
              {phase.outputs.phaseSummary && (
                <p className="text-sm text-gray-400 mt-3">{phase.outputs.phaseSummary}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-cre-success/15 px-2 py-1 text-cre-success">
                  {phase.outputs.keyFindings.length} findings
                </span>
                <span className="rounded bg-cre-danger/15 px-2 py-1 text-cre-danger">
                  {phase.outputs.redFlags.length} red flags
                </span>
                <span className="rounded bg-cre-warning/15 px-2 py-1 text-cre-warning">
                  {phase.outputs.dataGaps.length} gaps
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            Findings
          </h3>
          {aggregateFindings.length === 0 ? (
            <p className="text-sm text-gray-500">No findings have been published yet.</p>
          ) : (
            <ul className="space-y-2">
              {aggregateFindings.map((finding) => (
                <li key={finding} className="finding">
                  <p className="text-sm text-gray-300">{finding}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
            Workpapers
          </h3>
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-4">
            Document Manifest
          </p>
          {packageArtifacts.length === 0 ? (
            <p className="text-sm text-gray-500">No workpapers have been generated yet.</p>
          ) : (
            <div className="space-y-2">
              {packageArtifacts.map((artifact) => (
                <div key={artifact.docId} className="rounded-lg border border-cre-border bg-black/20 p-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`status-badge ${documentTone(artifact.docType)}`}>
                      {artifact.docType}
                    </span>
                    <span className="text-gray-500">{displayLabel(artifact.phase)}</span>
                    <span className="text-gray-600 ml-auto">{prettyTime(artifact.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-200 mt-2">{artifact.title}</p>
                  {artifact.summary && (
                    <p className="text-xs text-gray-500 mt-1">{artifact.summary}</p>
                  )}
                  {artifact.path && (
                    <p className="text-xs text-gray-600 mt-2 font-mono break-all">{artifact.path}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            Decision Log
          </h3>
          {decisionEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No decision events have been emitted yet.</p>
          ) : (
            <div className="space-y-2">
              {decisionEvents.map((event) => (
                <div key={`${event.runId}-${event.seq}`} className="rounded-lg bg-black/20 p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{prettyTime(event.ts)}</span>
                    {event.phaseLabel && <span>{event.phaseLabel}</span>}
                    {event.verdict && (
                      <span className="ml-auto status-badge bg-cre-warning/20 text-cre-warning">
                        {event.verdict}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-200 mt-2">{eventTitle(event)}</p>
                  {event.rationale && (
                    <p className="text-xs text-gray-500 mt-1">{event.rationale}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card bg-cre-surface/60">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            Final Recommendation Package
          </h3>
          <div className="rounded-lg border border-cre-border bg-black/20 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500">
              Recommendation
            </div>
            <p className="text-lg font-semibold text-white mt-2">{recommendation}</p>
            <p className="text-sm text-gray-400 mt-3">
              Assembled from {phaseOutcomes.length} phase outcomes, {packageArtifacts.length} workpapers, {aggregateFindings.length} findings, and {decisionEvents.length} decision events.
            </p>
          </div>
          <div className="mt-4 rounded-lg border border-cre-border bg-black/20 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500">
              Resume Instructions
            </div>
            <p className="text-sm text-gray-300 mt-2">
              {dealCheckpoint.resumeInstructions || 'No resume instructions published.'}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export { CompletionPackage }
export default CompletionPackage
