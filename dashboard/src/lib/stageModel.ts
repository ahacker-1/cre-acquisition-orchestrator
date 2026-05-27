import type { DealCheckpoint, PhaseInfo, PhaseStatus } from '../types/checkpoint'
import type { SourceDocument } from '../types/workspace'

// The seven lifecycle stages of the redesigned deal workspace. The spine renders these
// in this order; the center stage focuses one at a time.
export type StageId =
  | 'intake'
  | 'diligence'
  | 'underwriting'
  | 'financing'
  | 'legal'
  | 'closing'
  | 'ic'

// Functional status that drives the spine's color markers (see globals.css status palette).
export type StageStatus = 'done' | 'live' | 'blocked' | 'idle'

export interface SpineStage {
  id: StageId
  label: string
  status: StageStatus
  progress: number // 0-100
}

// Intake/IC are dashboard-layer stages (not orchestrated checkpoint phases), so the frame
// derives their state from source documents + package state and passes these summaries in.
export interface IntakeSummary {
  documentCount: number
  reviewPendingCount: number
  appliedCount: number
  blocked?: boolean
}

export interface IcSummary {
  complete?: boolean
  hasContent?: boolean
}

export const SPINE_STAGE_IDS: StageId[] = [
  'intake',
  'diligence',
  'underwriting',
  'financing',
  'legal',
  'closing',
  'ic',
]

const STAGE_LABELS: Record<StageId, string> = {
  intake: 'Intake',
  diligence: 'Diligence',
  underwriting: 'Underwriting',
  financing: 'Financing',
  legal: 'Legal',
  closing: 'Closing',
  ic: 'IC',
}

// The five orchestrated checkpoint phases map onto five spine stages.
const PHASE_KEY_BY_STAGE: Partial<Record<StageId, string>> = {
  diligence: 'dueDiligence',
  underwriting: 'underwriting',
  financing: 'financing',
  legal: 'legal',
  closing: 'closing',
}

export function phaseStatusToStageStatus(status: PhaseStatus | string | undefined): StageStatus {
  switch (status) {
    case 'complete':
      return 'done'
    case 'running':
      return 'live'
    case 'failed':
    case 'blocked':
      return 'blocked'
    default:
      // pending | skipped | undefined | unknown
      return 'idle'
  }
}

// Checkpoint progress is sometimes a 0-1 fraction and sometimes a 0-100 percentage; normalize.
export function normalizeProgress(progress: number | undefined | null): number {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return 0
  const pct = progress > 1 ? progress : progress * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

function resolvePhase(deal: DealCheckpoint, stageId: StageId): PhaseInfo | undefined {
  const key = PHASE_KEY_BY_STAGE[stageId]
  if (!key) return undefined
  const phases = deal.phases ?? {}
  return (
    phases[key] ??
    phases[stageId] ??
    phases[key.replace(/([A-Z])/g, '-$1').toLowerCase()] ??
    phases[key.replace(/([A-Z])/g, '_$1').toLowerCase()]
  )
}

function deriveIntakeStage(intake?: IntakeSummary): SpineStage {
  let status: StageStatus = 'idle'
  let progress = 0
  if (intake && intake.documentCount > 0) {
    const total = intake.appliedCount + intake.reviewPendingCount
    progress = total > 0 ? Math.round((intake.appliedCount / total) * 100) : 0
    if (intake.blocked) {
      status = 'blocked'
    } else if (intake.reviewPendingCount > 0) {
      status = 'live'
    } else {
      status = 'done'
      progress = 100
    }
  }
  return { id: 'intake', label: STAGE_LABELS.intake, status, progress }
}

function deriveIcStage(deal: DealCheckpoint, ic?: IcSummary): SpineStage {
  const dealComplete = /^(complete|completed)$/i.test(deal.status ?? '')
  let status: StageStatus = 'idle'
  let progress = 0
  if (ic?.complete || dealComplete) {
    status = 'done'
    progress = 100
  } else if (ic?.hasContent) {
    status = 'live'
    progress = 50
  }
  return { id: 'ic', label: STAGE_LABELS.ic, status, progress }
}

function derivePhaseStage(deal: DealCheckpoint, stageId: StageId): SpineStage {
  const phase = resolvePhase(deal, stageId)
  return {
    id: stageId,
    label: STAGE_LABELS[stageId],
    status: phaseStatusToStageStatus(phase?.status),
    progress: normalizeProgress(phase?.progress),
  }
}

// Derive the full 7-stage spine from a deal checkpoint plus the dashboard-layer intake/IC summaries.
export function deriveSpineStages(
  deal: DealCheckpoint,
  intake?: IntakeSummary,
  ic?: IcSummary,
): SpineStage[] {
  return [
    deriveIntakeStage(intake),
    derivePhaseStage(deal, 'diligence'),
    derivePhaseStage(deal, 'underwriting'),
    derivePhaseStage(deal, 'financing'),
    derivePhaseStage(deal, 'legal'),
    derivePhaseStage(deal, 'closing'),
    deriveIcStage(deal, ic),
  ]
}

// Convenience for the frame: summarize source documents into an IntakeSummary.
export function intakeSummaryFromDocuments(documents: SourceDocument[]): IntakeSummary {
  let appliedCount = 0
  let reviewPendingCount = 0
  for (const doc of documents) {
    if (doc.status === 'applied' || doc.status === 'approved') {
      appliedCount += 1
    } else if (
      doc.status === 'review_ready' ||
      doc.status === 'extracted' ||
      doc.status === 'extraction-pending' ||
      doc.status === 'parsed' ||
      doc.status === 'uploaded'
    ) {
      reviewPendingCount += 1
    }
    // parse_failed / unsupported / parser-unavailable / rejected / waived: resolved-but-not-applied
  }
  return {
    documentCount: documents.length,
    reviewPendingCount,
    appliedCount,
  }
}
