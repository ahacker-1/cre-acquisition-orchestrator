import type { ReactNode } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import DealRecord, { type RecordGroup } from './DealRecord'
import ProofPathStrip, { type ProofPathStep } from '../../ProofPathStrip'

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
  proofPathSteps?: ProofPathStep[]
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
  proofPathSteps,
}: IntakeStageProps) {
  // Controlled when the parent owns the open-state (so it survives stage-body remounts on
  // workspace refresh); otherwise the native <details> manages itself.
  const controlled = detailedReviewOpen !== undefined
  return (
    <div className="space-y-7" data-testid="intake-stage">
      <section className="border-b border-white/10 pb-7 pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cre-accent">Intake</p>
        <h2 className="mt-3 max-w-3xl font-serif text-3xl font-medium leading-tight tracking-[-0.025em] text-cre-primary md:text-[2rem]">
          Drop the package. The team reads it.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
          Drop the rent roll, T12, offering memo, and inspection. Your ingestion agents read every
          document and fill the deal record below — you only touch what they flag.
        </p>
        <p
          className="mt-5 flex max-w-4xl items-start gap-2.5 border-t border-white/[0.07] pt-4 text-[11px] leading-5 text-gray-500"
          data-testid="intake-agents-line"
        >
          <span className="cre-dot cre-dot-live cre-dot-pulse mt-1.5" aria-hidden="true" />
          <span>{agentsLine && agentsLine.trim().length > 0 ? agentsLine : DEFAULT_AGENTS_LINE}</span>
        </p>
      </section>

      <div className="space-y-3">
        <ProofPathStrip steps={proofPathSteps} testId="proof-path-strip-intake" />
        <DealRecord
          groups={groups}
          needsEyeCount={needsEyeCount}
          onEditField={onEditField}
          onStartDiligence={onStartDiligence}
          saving={saving}
        />
      </div>

      <details
        className="group border-y border-white/10"
        data-testid="intake-detailed-review"
        {...(controlled ? { open: detailedReviewOpen } : {})}
        onToggle={(event) => onDetailedReviewToggle?.((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer list-none py-5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-300">
                Source documents &amp; detailed review
              </span>
              <span className="mt-2 block max-w-3xl text-sm leading-6 text-gray-500">
                Upload more files, or review every extracted field with full approve / reject /
                waive control and source provenance.
              </span>
            </span>
            <span
              className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-gray-500"
              aria-hidden="true"
            >
              Open
              <IconChevronDown
                size={15}
                stroke={1.5}
                className="transition-transform duration-200 group-open:rotate-180"
              />
            </span>
          </span>
        </summary>
        <div className="border-t border-white/[0.08] py-5">{children}</div>
      </details>
    </div>
  )
}
