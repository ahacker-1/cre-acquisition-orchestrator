import type { ReactNode } from 'react'
import DealRecord, { type RecordGroup } from './DealRecord'

interface IntakeStageProps {
  groups: RecordGroup[]
  needsEyeCount: number
  // The IntakeStage edits by PATH: buildDealRecordGroups sets RecordField.fieldId = path, so
  // DealRecord's onEditField(fieldId, value) hands us the path directly.
  onEditField: (path: string, value: string) => void
  onStartDiligence: () => void
  saving?: boolean
  // A one-line status of the ingestion agents (Document Orchestrator + parsers), derived by
  // the parent from document extraction status / story events. Optional; a default is shown.
  agentsLine?: string
  // The detailed-review disclosure open-state is lifted to the parent (DealWorkspace) so it
  // survives the stage body re-mounting on every workspace refresh (extract/apply/edit). Left
  // uncontrolled if omitted.
  detailedReviewOpen?: boolean
  onDetailedReviewToggle?: (open: boolean) => void
  // The detailed-review body (DealWorkspace passes the existing DocumentIntakePanel here):
  // upload (incl. multi-file/batch) + the deep approve/reject/waive + provenance flow, now
  // tucked behind a disclosure so the auto-filled record leads.
  children?: ReactNode
}

const DEFAULT_AGENTS_LINE = 'Document Orchestrator routes each file to its parser — Rent Roll, Financials, and Offering Memo readers fill the record as they go.'

/**
 * The Intake stage body (§5 of the redesign): "drop docs → auto-populated → edit only what's
 * flagged." Leads with a short intro + an ingestion-agent activity line, then the auto-filled
 * DealRecord (inline edit, source tags, flags), and finally a collapsible "Source documents &
 * detailed review" disclosure that preserves the full extraction approve/reject/waive +
 * provenance flow for anyone who wants to drill in.
 */
export default function IntakeStage({
  groups,
  needsEyeCount,
  onEditField,
  onStartDiligence,
  saving,
  agentsLine,
  detailedReviewOpen,
  onDetailedReviewToggle,
  children,
}: IntakeStageProps) {
  // Controlled when the parent owns the open-state (so it survives stage-body remounts on
  // workspace refresh); otherwise the native <details> manages itself.
  const controlled = detailedReviewOpen !== undefined
  return (
    <div className="space-y-4" data-testid="intake-stage">
      <section className="portal-panel">
        <p className="portal-kicker">Intake</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.01em] text-white">
          Drop the package. The team reads it.
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
          Drop the rent roll, T12, offering memo, and inspection. Your ingestion agents read every
          document and fill the deal record below — you only touch what they flag.
        </p>
        <p
          className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-gray-500"
          data-testid="intake-agents-line"
        >
          <span className="cre-dot cre-dot-live cre-dot-pulse mt-1" aria-hidden="true" />
          <span>{agentsLine && agentsLine.trim().length > 0 ? agentsLine : DEFAULT_AGENTS_LINE}</span>
        </p>
      </section>

      <DealRecord
        groups={groups}
        needsEyeCount={needsEyeCount}
        onEditField={onEditField}
        onStartDiligence={onStartDiligence}
        saving={saving}
      />

      <details
        className="portal-panel"
        data-testid="intake-detailed-review"
        {...(controlled ? { open: detailedReviewOpen } : {})}
        onToggle={(event) => onDetailedReviewToggle?.((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer list-none">
          <span className="flex items-center justify-between gap-3">
            <span>
              <span className="portal-kicker">Source documents &amp; detailed review</span>
              <span className="mt-1 block text-sm text-gray-400">
                Upload more files, or review every extracted field with full approve / reject /
                waive control and source provenance.
              </span>
            </span>
            <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-gray-500" aria-hidden="true">
              Open
            </span>
          </span>
        </summary>
        <div className="mt-4 border-t border-white/10 pt-4">{children}</div>
      </details>
    </div>
  )
}
