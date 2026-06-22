import type { ExtractionField, ExtractionPreview, SourceReference } from '../types/workspace'
import type { RecordField, RecordGroup, FieldConfidence } from '../components/workspace/stages/DealRecord'

// Phase 2 intake adapter: aggregate the source-backed ExtractionField[] across every dropped
// document into the presentational RecordGroups the DealRecord renders. Pure (no React, no
// fetch) so it is unit-testable in isolation; the IntakeStage wires the result into DealRecord
// and maps `onEditField(fieldId)` → `editField(path)` (fieldId IS the path here).

export type RecordGroupLabel = 'Property' | 'Operations' | 'Deal Terms' | 'Other'

// Confidence thresholds (shared with the flag rule below): a field is trustworthy at >= 0.7
// (matches the backend auto-apply gate). 'high' is reserved for >= 0.85.
const CONFIDENCE_HIGH = 0.85
const CONFIDENCE_MED = 0.7

// Documented path → group map. Order within a group is the canonical workspace ordering.
// `financials.*` splits between Operations (in-place performance) and Deal Terms (price/return
// metrics); `financing.*` is always Deal Terms; `property.*` is always Property; anything else
// falls through to 'Other' (see groupForPath).
const GROUP_BY_PATH: Record<string, RecordGroupLabel> = {
  // Property
  'property.totalUnits': 'Property',
  'property.unitMix.types': 'Property',
  'property.yearBuilt': 'Property',
  'property.squareFootage': 'Property',
  'property.propertyType': 'Property',
  // Operations (in-place operating performance)
  'financials.currentNOI': 'Operations',
  'financials.inPlaceOccupancy': 'Operations',
  'financials.economicOccupancy': 'Operations',
  'financials.trailingT12Revenue': 'Operations',
  'financials.trailingT12Expenses': 'Operations',
  'financials.grossPotentialRentAnnual': 'Operations',
  // Deal Terms (price, return metrics, debt)
  'financials.askingPrice': 'Deal Terms',
  'financials.capRate': 'Deal Terms',
  'financials.pricePerUnit': 'Deal Terms',
  'financing.targetLTV': 'Deal Terms',
  'financing.estimatedRate': 'Deal Terms',
  'financing.loanTerm': 'Deal Terms',
  'financing.amortization': 'Deal Terms',
  'financing.loanType': 'Deal Terms',
}

const GROUP_ORDER: RecordGroupLabel[] = ['Property', 'Operations', 'Deal Terms', 'Other']

// Map a field path to its display group. Falls back through documented prefixes so newly added
// rent/occupancy paths still group sensibly before defaulting to 'Other'.
export function groupForPath(path: string): RecordGroupLabel {
  const exact = GROUP_BY_PATH[path]
  if (exact) return exact
  if (path.startsWith('property.')) return 'Property'
  if (path.startsWith('financing.')) return 'Deal Terms'
  if (path.startsWith('financials.')) {
    // Heuristic for undocumented financials.*: rent / occupancy / income / expense reads are
    // operating performance; price / cap / value reads are deal terms.
    if (/rent|occupanc|income|expense|noi|revenue/i.test(path)) return 'Operations'
    if (/price|cap|value|ltv|debt|rate/i.test(path)) return 'Deal Terms'
    return 'Operations'
  }
  return 'Other'
}

// Confidence number → discrete dot. >= 0.85 high, >= 0.7 med, else low.
export function confidenceTier(confidence: number): FieldConfidence {
  if (confidence >= CONFIDENCE_HIGH) return 'high'
  if (confidence >= CONFIDENCE_MED) return 'med'
  return 'low'
}

// The server stamps this validation issue on extraction fields whose path is NOT an approved
// source-backed deal field (e.g. some XLSX-only rent metrics: grossPotentialRentAnnual,
// inPlaceRentAnnual, lossToLeaseAnnual). Such fields can't be applied OR edited (the field-edit
// endpoint rejects them), so surfacing them in the auto-filled record would be a permanently
// unresolvable row leaking an internal diagnostic string and inflating the needs-eye count.
// They remain visible in the detailed extraction-review panel. Exclude them from the record.
const NON_APPLYABLE_ISSUE = /not approved for source-backed apply/i

export function isRecordEligible(field: ExtractionField): boolean {
  return !(field.validationIssues ?? []).some((issue) => NON_APPLYABLE_ISSUE.test(issue))
}

// A field needs the operator's eye when sources disagree, the read is low-confidence, or it
// failed validation. Mirrors the backend's "trusted" inverse (no conflict, conf >= 0.7, no
// validationIssues) so auto-applied fields render clean.
export function isFlagged(field: ExtractionField): boolean {
  return (
    field.conflict === true ||
    field.confidence < CONFIDENCE_MED ||
    (field.validationIssues?.length ?? 0) > 0
  )
}

// Short label for a single source document: "fileName · pg 3" / "fileName · Sheet1 r12".
function shortSourceLabel(ref: SourceReference | undefined, fallback: string): string {
  if (!ref) return fallback
  const name = ref.fileName || fallback
  const loc = ref.location
  if (loc?.page) return `${name} · pg ${loc.page}`
  if (loc?.sheet && typeof loc.row === 'number') return `${name} · ${loc.sheet} r${loc.row}`
  if (loc?.sheet) return `${name} · ${loc.sheet}`
  if (typeof loc?.row === 'number') return `${name} · r${loc.row}`
  if (typeof loc?.line === 'number') return `${name} · ln ${loc.line}`
  return name
}

// Strip path/extension noise so combined conflict labels stay short (e.g. "RR / OM").
function abbreviateSource(ref: SourceReference | undefined, fallback: string): string {
  const name = (ref?.fileName || fallback || 'source').replace(/\.[a-z0-9]+$/i, '')
  // Acronym from word boundaries when multi-word ("rent-roll" -> "RR"), else first 6 chars.
  const words = name.split(/[\s_-]+/).filter(Boolean)
  if (words.length >= 2) return words.map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 4)
  return name.slice(0, 6)
}

// Structured provenance string shown on drill-down (file + location + raw snippet).
function provenanceText(ref: SourceReference | undefined): string | undefined {
  if (!ref) return undefined
  const parts: string[] = [ref.fileName]
  const loc = ref.location
  const locBits: string[] = []
  if (loc?.sheet) locBits.push(`Sheet ${loc.sheet}`)
  if (typeof loc?.row === 'number') locBits.push(`Row ${loc.row}`)
  if (loc?.column) locBits.push(`Col ${loc.column}`)
  if (typeof loc?.line === 'number') locBits.push(`Line ${loc.line}`)
  if (typeof loc?.page === 'number') locBits.push(`Page ${loc.page}`)
  if (locBits.length > 0) parts.push(locBits.join(' / '))
  if (ref.raw) parts.push(ref.raw)
  return parts.join('\n')
}

// Paths whose decimal value is a ratio displayed as a percent.
const PERCENT_PATHS = new Set([
  'financials.inPlaceOccupancy',
  'financials.economicOccupancy',
  'financials.capRate',
  'financing.targetLTV',
  'financing.estimatedRate',
])

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '--'
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--'
  // Ratios (<= 1) are fractions to scale; an already-scaled percent (e.g. 93.5) passes through.
  const pct = value <= 1 && value >= -1 ? value * 100 : value
  return `${Number(pct.toFixed(1))}%`
}

// Human-format a field value using its semantic unit and path. Currency -> $1.42M / $24,500;
// percent ratios -> 93.5%; integers -> comma-grouped; arrays (unit mix) -> "N types".
export function formatFieldValue(field: ExtractionField): string {
  const { value, unit, path, valueType } = field
  if (value === null || value === undefined) return '--'

  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? 'type' : 'types'}`
  }

  if (typeof value === 'number') {
    if (unit === 'usd' || /price|noi|revenue|expense|income|rent/i.test(path)) {
      // Rent paths can be ratios? No — rent paths from parsers are dollar amounts.
      if (!PERCENT_PATHS.has(path)) return formatCurrency(value)
    }
    if (unit === 'decimal' || PERCENT_PATHS.has(path)) return formatPercent(value)
    if (unit === 'count' || valueType === 'integer' || Number.isInteger(value)) {
      return value.toLocaleString('en-US')
    }
    // Generic non-integer number.
    return Number(value.toFixed(2)).toLocaleString('en-US')
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return value
  // Object (e.g. nested) — compact JSON as a last resort.
  return JSON.stringify(value)
}

// First human-readable reason this field is flagged: conflict (name the disagreeing
// sources/values), then validation issue, then low-confidence.
function flagReasonFor(field: ExtractionField, conflictWith?: ExtractionField): string | undefined {
  if (!isFlagged(field)) return undefined
  if (field.conflict === true) {
    // Name the read that actually disagrees and its value. After dedupe the displayed field can be
    // the already-applied read (whose value equals currentValue); the real conflict lives on another
    // read for the same path, so prefer that read's source/value over re-showing the applied value.
    const conflictingField = conflictWith ?? field
    const incoming = abbreviateSource(conflictingField.sourceRef, conflictingField.source)
    const current = field.currentValue
    if (current !== undefined && current !== null) {
      return `Sources disagree: applied "${formatRawValue(current)}" vs ${incoming} "${formatRawValue(conflictingField.value)}" — confirm`
    }
    return `Sources disagree on this value (${incoming}) — confirm`
  }
  if ((field.validationIssues?.length ?? 0) > 0) {
    return field.validationIssues![0]
  }
  return 'Low-confidence read — confirm'
}

// Minimal stringify for a previously-applied currentValue inside a conflict message.
function formatRawValue(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString('en-US')
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `${value.length} rows`
  return String(value)
}

// Pick the winning field when the same path appears across multiple documents/extractions:
// prefer an already-applied read, then the highest confidence, then (stable) the first seen.
function preferField(a: ExtractionField, b: ExtractionField): ExtractionField {
  const aApplied = a.reviewStatus === 'applied'
  const bApplied = b.reviewStatus === 'applied'
  if (aApplied !== bApplied) return aApplied ? a : b
  if (a.confidence !== b.confidence) return a.confidence >= b.confidence ? a : b
  return a
}

function toRecordField(field: ExtractionField, conflictWith?: ExtractionField): RecordField {
  const value = formatFieldValue(field)
  const flagged = isFlagged(field)
  return {
    fieldId: field.path, // fieldId === path so the IntakeStage edits by path directly
    path: field.path,
    label: field.label,
    value,
    source: shortSourceLabel(field.sourceRef, field.source),
    confidence: confidenceTier(field.confidence),
    flagged,
    flagReason: flagReasonFor(field, conflictWith),
    provenance: provenanceText(field.sourceRef),
  }
}

/**
 * Aggregate ExtractionField[] across all provided document extractions into the grouped,
 * display-formatted RecordGroups the DealRecord renders. Dedupes by path (prefers an applied
 * read, else highest confidence), groups via the documented path→group map, and orders groups
 * Property → Operations → Deal Terms → Other. Empty groups are omitted.
 */
export function buildDealRecordGroups(extractions: ExtractionPreview[], _deal?: unknown): RecordGroup[] {
  const byPath = new Map<string, ExtractionField>()
  // Capture a conflict that disappears after dedupe: if any read of a path conflicts, the
  // surviving field should still surface the conflict flag.
  const conflictPaths = new Set<string>()
  // The read that actually disagrees per path (highest-confidence conflicting candidate). Its
  // value/source feed the "Sources disagree" message so it names the value that truly conflicts
  // rather than re-showing the applied value when the surviving read is the already-applied one.
  const conflictFieldByPath = new Map<string, ExtractionField>()

  for (const extraction of extractions) {
    for (const field of extraction.fields ?? []) {
      if (!field || typeof field.path !== 'string') continue
      // Skip fields the operator can't act on (not an approved source-backed deal field).
      if (!isRecordEligible(field)) continue
      if (field.conflict === true) {
        conflictPaths.add(field.path)
        const existingConflict = conflictFieldByPath.get(field.path)
        if (!existingConflict || field.confidence > existingConflict.confidence) {
          conflictFieldByPath.set(field.path, field)
        }
      }
      const existing = byPath.get(field.path)
      byPath.set(field.path, existing ? preferField(existing, field) : field)
    }
  }

  const grouped = new Map<RecordGroupLabel, RecordField[]>()
  for (const field of byPath.values()) {
    const effective: ExtractionField =
      conflictPaths.has(field.path) && field.conflict !== true ? { ...field, conflict: true } : field
    const groupLabel = groupForPath(effective.path)
    const list = grouped.get(groupLabel) ?? []
    list.push(toRecordField(effective, conflictFieldByPath.get(field.path)))
    grouped.set(groupLabel, list)
  }

  const groups: RecordGroup[] = []
  for (const label of GROUP_ORDER) {
    const fields = grouped.get(label)
    if (fields && fields.length > 0) groups.push({ label, fields })
  }
  return groups
}

// Paths whose stored value is an integer (the deal schema rejects floats/strings here).
const INTEGER_PATHS = new Set([
  'property.totalUnits',
  'property.yearBuilt',
  'financing.loanTerm',
  'financing.amortization',
])

// Paths whose stored value is a free-text string (no numeric coercion).
const STRING_PATHS = new Set(['financing.loanType', 'property.propertyType'])

/**
 * Coerce the value a user typed into a DealRecord field (a display-formatted STRING — e.g. "8",
 * "$2.45M", "93.5%") back into the typed value the field-edit endpoint requires. The deal schema
 * rejects strings for numeric fields ("Expected integer, received string"), so this is mandatory
 * before calling editField: the adapter cannot pass the raw input through.
 *
 * - String-typed paths (loanType / propertyType) pass through untouched.
 * - Percent-ratio paths (occupancy / cap rate / LTV / rate) → a 0–1 fraction: "93.5%" / "93.5" →
 *   0.935; "0.935" → 0.935.
 * - Currency / count / integer / number paths → a number with $ , and M/K suffixes resolved.
 * - Anything that does not parse to a finite number falls back to the trimmed string (lets the
 *   server surface its own validation error rather than silently corrupting the value).
 */
export function coerceEditValue(path: string, raw: string): string | number {
  const trimmed = raw.trim()
  if (STRING_PATHS.has(path)) return trimmed
  if (trimmed === '') return trimmed

  let text = trimmed.replace(/[$,\s]/g, '')
  let multiplier = 1
  const suffix = text.slice(-1).toLowerCase()
  if (suffix === 'm') {
    multiplier = 1_000_000
    text = text.slice(0, -1)
  } else if (suffix === 'k') {
    multiplier = 1_000
    text = text.slice(0, -1)
  }

  const hadPercentSign = /%/.test(text)
  text = text.replace(/%/g, '')

  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return trimmed // let the server reject it honestly

  if (PERCENT_PATHS.has(path)) {
    // Ratios are stored as 0–1 fractions. Treat an explicit "%" or any magnitude > 1 as a
    // whole-percent the user typed (93.5 -> 0.935); a bare <= 1 value is already a fraction.
    if (hadPercentSign || Math.abs(parsed) > 1) return parsed / 100
    return parsed
  }

  const value = parsed * multiplier
  if (INTEGER_PATHS.has(path)) return Math.round(value)
  return value
}

// Count the flagged fields across all groups (the "N values need your eye" badge).
export function countNeedsEye(groups: RecordGroup[]): number {
  let count = 0
  for (const group of groups) {
    for (const field of group.fields) {
      if (field.flagged) count += 1
    }
  }
  return count
}
