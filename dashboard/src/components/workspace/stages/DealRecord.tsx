import { useState } from 'react'
import { IconAlertTriangle, IconArrowRight, IconPencil } from '@tabler/icons-react'

// One field of the auto-filled deal record. Presentational: the IntakeStage adapter maps
// workspace extraction/approved data into these and wires `onEditField` to the backend's
// inline-override endpoint. `flagged` means the operator needs to look (a source conflict
// or a low-confidence read); everything else was auto-applied the moment it was read.
export type FieldConfidence = 'high' | 'med' | 'low'

export interface RecordField {
  fieldId: string
  path: string
  label: string
  value: string // formatted for display
  source: string // e.g. "OM · pg 1" or "RR / OM"
  confidence: FieldConfidence
  flagged: boolean
  flagReason?: string
  provenance?: string // raw snippet / location, shown on drill-down
}

export interface RecordGroup {
  label: string
  fields: RecordField[]
}

interface DealRecordProps {
  groups: RecordGroup[]
  needsEyeCount: number
  onEditField: (fieldId: string, value: string) => void
  onStartDiligence: () => void
  saving?: boolean
}

const CONFIDENCE_DOT: Record<FieldConfidence, string> = {
  high: 'cre-dot cre-dot-done',
  med: 'cre-dot cre-dot-review',
  low: 'cre-dot cre-dot-review',
}

function FieldRow({
  field,
  onEditField,
  saving,
}: {
  field: RecordField
  onEditField: (fieldId: string, value: string) => void
  saving?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field.value)
  const [showProvenance, setShowProvenance] = useState(false)

  function commit(): void {
    setEditing(false)
    const next = draft.trim()
    if (next !== field.value) onEditField(field.fieldId, next)
  }

  return (
    <div
      data-testid={`record-field-${field.fieldId}`}
      data-flagged={field.flagged ? 'true' : 'false'}
      className={[
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-white/[0.08] border-l-2 px-3 py-3 sm:grid-cols-[132px_minmax(0,1fr)_auto]',
        field.flagged ? 'border-l-cre-warning bg-cre-warning/[0.035]' : 'border-l-transparent',
      ].join(' ')}
    >
      <span className="col-span-2 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 sm:col-span-1">
        {field.label}
      </span>

      {editing ? (
        <input
          autoFocus
          data-testid={`record-field-input-${field.fieldId}`}
          aria-label={`Edit ${field.label}`}
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') {
              setDraft(field.value)
              setEditing(false)
            }
          }}
          className="min-w-0 border-0 border-b border-cre-accent/70 bg-transparent px-0 py-1 text-sm text-cre-primary focus:outline-none"
        />
      ) : (
        <span className="min-w-0 truncate text-sm text-cre-primary">{field.value}</span>
      )}

      <span className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          data-testid={`record-field-source-${field.fieldId}`}
          onClick={() => setShowProvenance((open) => !open)}
          className="border-b border-white/15 px-1 py-1 text-[9px] uppercase tracking-[0.1em] text-gray-500 transition-colors hover:border-cre-accent/70 hover:text-gray-300"
          title="Show where this came from"
          aria-expanded={showProvenance}
          aria-controls={field.provenance ? `record-field-provenance-${field.fieldId}` : undefined}
        >
          {field.source}
        </button>
        {!field.flagged && <span className={CONFIDENCE_DOT[field.confidence]} aria-hidden="true" />}
        <button
          type="button"
          data-testid={`record-field-edit-${field.fieldId}`}
          onClick={() => {
            setDraft(field.value)
            setEditing(true)
          }}
          className="grid h-8 w-8 place-items-center text-gray-500 transition-colors hover:text-cre-accent"
          aria-label={`Edit ${field.label}`}
        >
          <IconPencil size={15} stroke={1.5} aria-hidden="true" />
        </button>
      </span>

      {field.flagged && field.flagReason && (
        <p
          className="col-span-2 flex items-start gap-2 text-[11px] leading-5 text-cre-warning sm:col-span-3"
          data-testid={`record-field-flag-${field.fieldId}`}
        >
          <IconAlertTriangle size={14} stroke={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{field.flagReason}</span>
        </p>
      )}
      {showProvenance && field.provenance && (
        <p
          id={`record-field-provenance-${field.fieldId}`}
          className="col-span-2 mt-1 whitespace-pre-wrap break-words border-l border-white/15 pl-3 font-mono text-[10.5px] leading-5 text-gray-400 sm:col-span-3"
        >
          {field.provenance}
        </p>
      )}
    </div>
  )
}

/**
 * The auto-filled deal record: everything was read from the dropped documents (nothing typed
 * by hand). The operator edits only what's off; flagged values (source conflicts / low-confidence
 * reads) are highlighted. Once those flagged values are resolved, one forward
 * action advances the deal to Diligence.
 */
export default function DealRecord({
  groups,
  needsEyeCount,
  onEditField,
  onStartDiligence,
  saving,
}: DealRecordProps) {
  const hasFields = groups.some((group) => group.fields.length > 0)
  const reviewRequired = needsEyeCount > 0
  const actionDisabled = saving === true

  return (
    <section data-testid="deal-record" className="border-y border-white/10 py-6">
      <h3 className="font-serif text-2xl font-medium tracking-[-0.02em] text-cre-primary">Deal Record</h3>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
        Everything below was <span className="text-gray-200">read from your documents</span> — nothing was
        typed by hand. Edit any value that's off; tap a source tag to see where it came from.
      </p>

      {!hasFields ? (
        <p className="mt-4 text-sm text-gray-600">
          Drop a rent roll, T12, or offering memo above and the record fills itself in.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {groups
            .filter((group) => group.fields.length > 0)
            .map((group) => (
              <div key={group.label}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                  {group.label}
                </p>
                <div className="border-b border-white/[0.08]">
                  {group.fields.map((field) => (
                    <FieldRow key={field.fieldId} field={field} onEditField={onEditField} saving={saving} />
                  ))}
                </div>
              </div>
            ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <span
              data-testid="needs-eye-count"
              className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                needsEyeCount > 0 ? 'text-cre-warning' : 'text-gray-600'
              }`}
            >
              <span
                className={`cre-dot ${needsEyeCount > 0 ? 'cre-dot-review' : 'cre-dot-done'}`}
                aria-hidden="true"
              />
              {needsEyeCount > 0 ? `${needsEyeCount} value${needsEyeCount === 1 ? '' : 's'} need your eye` : 'All values read cleanly'}
            </span>
            <button
              type="button"
              data-testid="start-diligence"
              data-action={reviewRequired ? 'review-flagged-values' : 'start-diligence'}
              disabled={actionDisabled}
              onClick={onStartDiligence}
              className="portal-button portal-button-primary"
              aria-label={reviewRequired
                ? `Review ${needsEyeCount} flagged value${needsEyeCount === 1 ? '' : 's'}`
                : 'Looks right, start Diligence'}
            >
              <span>{reviewRequired ? 'Review flagged values' : 'Looks right'}</span>
              <IconArrowRight size={15} stroke={1.5} aria-hidden="true" />
              {!reviewRequired && <span>start Diligence</span>}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
