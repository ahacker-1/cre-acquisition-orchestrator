import { useState } from 'react'

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
        'grid grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-3 border-l-2 px-3 py-2.5',
        field.flagged ? 'border-l-[color:var(--cre-review)] bg-cre-warning/[0.06]' : 'border-l-white/10',
      ].join(' ')}
    >
      <span className="truncate text-[11px] uppercase tracking-[0.1em] text-gray-500">{field.label}</span>

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
          className="min-w-0 border border-cre-live/60 bg-black px-2 py-1 text-sm text-white focus:outline-none"
        />
      ) : (
        <span className="min-w-0 truncate text-sm text-white">{field.value}</span>
      )}

      <span className="flex items-center gap-2">
        <button
          type="button"
          data-testid={`record-field-source-${field.fieldId}`}
          onClick={() => setShowProvenance((open) => !open)}
          className="border border-white/12 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.1em] text-gray-500 hover:border-white/30 hover:text-gray-300"
          title="Show where this came from"
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
          className="text-cre-live transition-colors hover:text-white"
          aria-label={`Edit ${field.label}`}
        >
          ✎
        </button>
      </span>

      {field.flagged && field.flagReason && (
        <p className="col-span-3 text-[11px] leading-5 text-cre-warning" data-testid={`record-field-flag-${field.fieldId}`}>
          <span aria-hidden="true">⚠</span> {field.flagReason}
        </p>
      )}
      {showProvenance && field.provenance && (
        <p className="col-span-3 mt-1 whitespace-pre-wrap break-words border border-white/10 bg-black px-2 py-1 font-mono text-[10.5px] text-gray-400">
          {field.provenance}
        </p>
      )}
    </div>
  )
}

/**
 * The auto-filled deal record: everything was read from the dropped documents (nothing typed
 * by hand). The operator edits only what's off; flagged values (source conflicts / low-confidence
 * reads) are highlighted. One forward action advances the deal to Diligence.
 */
export default function DealRecord({
  groups,
  needsEyeCount,
  onEditField,
  onStartDiligence,
  saving,
}: DealRecordProps) {
  const hasFields = groups.some((group) => group.fields.length > 0)

  return (
    <section data-testid="deal-record" className="portal-panel">
      <p className="portal-kicker">Deal Record</p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
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
                <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-gray-600">{group.label}</p>
                <div className="space-y-1.5">
                  {group.fields.map((field) => (
                    <FieldRow key={field.fieldId} field={field} onEditField={onEditField} saving={saving} />
                  ))}
                </div>
              </div>
            ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <span
              data-testid="needs-eye-count"
              className={
                needsEyeCount > 0
                  ? 'border border-cre-warning/40 px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-cre-warning'
                  : 'text-[11px] uppercase tracking-[0.1em] text-gray-600'
              }
            >
              {needsEyeCount > 0 ? `${needsEyeCount} value${needsEyeCount === 1 ? '' : 's'} need your eye` : 'All values read cleanly'}
            </span>
            <button
              type="button"
              data-testid="start-diligence"
              onClick={onStartDiligence}
              className="portal-button portal-button-primary"
            >
              Looks right → start Diligence
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
