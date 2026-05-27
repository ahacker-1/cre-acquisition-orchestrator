// Unit tests for redesigned dashboard frontend logic (dashboard/src/lib/*).
// Consolidated into one file invoked from the root `test` chain so it runs in the gate
// WITHOUT adding a new `test:*` script key (which would change the README "Tests passing"
// count that validate:docs enforces). Run via: cd dashboard && npm exec tsx ../scripts/dashboard-lib.test.mjs
import assert from 'node:assert/strict'
import {
  deriveSpineStages,
  phaseStatusToStageStatus,
  normalizeProgress,
  intakeSummaryFromDocuments,
  SPINE_STAGE_IDS,
} from '../dashboard/src/lib/stageModel.ts'
import { suggestionsForStage } from '../dashboard/src/lib/commandModel.ts'
import {
  buildDealRecordGroups,
  countNeedsEye,
  groupForPath,
  confidenceTier,
  isFlagged,
  formatFieldValue,
  coerceEditValue,
} from '../dashboard/src/lib/dealRecordModel.ts'

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log('  ok -', name)
}

function makeDeal(overrides = {}) {
  return {
    dealId: 't',
    dealName: 'T',
    property: { address: '', city: '', state: '', totalUnits: 0, askingPrice: 0 },
    status: overrides.status ?? 'pending',
    overallProgress: 0,
    startedAt: '',
    lastUpdatedAt: '',
    phases: overrides.phases ?? {},
    resumeInstructions: '',
  }
}

function phase(status, progress = 0) {
  return {
    name: status,
    status,
    progress,
    startedAt: null,
    completedAt: null,
    agents: { total: 0, completed: 0, running: 0, failed: 0, pending: 0 },
    outputs: { phaseSummary: '', keyFindings: [], redFlags: [], dataGaps: [], phaseVerdict: null },
  }
}

console.log('stageModel:')

check('phaseStatusToStageStatus maps checkpoint statuses to stage statuses', () => {
  assert.equal(phaseStatusToStageStatus('complete'), 'done')
  assert.equal(phaseStatusToStageStatus('running'), 'live')
  assert.equal(phaseStatusToStageStatus('blocked'), 'blocked')
  assert.equal(phaseStatusToStageStatus('failed'), 'blocked')
  assert.equal(phaseStatusToStageStatus('pending'), 'idle')
  assert.equal(phaseStatusToStageStatus('skipped'), 'idle')
  assert.equal(phaseStatusToStageStatus(undefined), 'idle')
})

check('normalizeProgress scales fractions, clamps, and guards non-numbers', () => {
  assert.equal(normalizeProgress(0.5), 50) // fraction -> percentage
  assert.equal(normalizeProgress(50), 50) // already a percentage
  assert.equal(normalizeProgress(2), 2) // >1 is treated as a percentage, not a fraction
  assert.equal(normalizeProgress(150), 100) // clamped to 100
  assert.equal(normalizeProgress(-1), 0) // clamped to 0
  assert.equal(normalizeProgress(undefined), 0)
  assert.equal(normalizeProgress(Number.NaN), 0)
})

check('deriveSpineStages returns the 7 stages in canonical order', () => {
  const stages = deriveSpineStages(makeDeal())
  assert.equal(stages.length, 7)
  assert.deepEqual(stages.map((s) => s.id), SPINE_STAGE_IDS)
  // All idle for an empty pending deal
  assert.ok(stages.every((s) => s.status === 'idle'))
})

check('phase-backed stages reflect checkpoint phases (camelCase key)', () => {
  const stages = deriveSpineStages(
    makeDeal({ phases: { dueDiligence: phase('complete', 1), underwriting: phase('running', 0.4) } }),
  )
  const dil = stages.find((s) => s.id === 'diligence')
  const uw = stages.find((s) => s.id === 'underwriting')
  assert.equal(dil.status, 'done')
  assert.equal(dil.progress, 100)
  assert.equal(uw.status, 'live')
  assert.equal(uw.progress, 40)
})

check('phase-backed stages tolerate slug-style phase keys', () => {
  const stages = deriveSpineStages(makeDeal({ phases: { 'due-diligence': phase('blocked', 0.2) } }))
  const dil = stages.find((s) => s.id === 'diligence')
  assert.equal(dil.status, 'blocked')
})

check('intake stage derives from the intake summary', () => {
  assert.equal(deriveSpineStages(makeDeal())[0].status, 'idle')
  const live = deriveSpineStages(makeDeal(), { documentCount: 3, reviewPendingCount: 1, appliedCount: 2 })[0]
  assert.equal(live.status, 'live')
  const done = deriveSpineStages(makeDeal(), { documentCount: 3, reviewPendingCount: 0, appliedCount: 3 })[0]
  assert.equal(done.status, 'done')
  assert.equal(done.progress, 100)
  const blocked = deriveSpineStages(makeDeal(), { documentCount: 1, reviewPendingCount: 1, appliedCount: 0, blocked: true })[0]
  assert.equal(blocked.status, 'blocked')
})

check('IC stage is done when the deal is complete', () => {
  assert.equal(deriveSpineStages(makeDeal({ status: 'complete' }))[6].status, 'done')
  assert.equal(deriveSpineStages(makeDeal(), undefined, { hasContent: true })[6].status, 'live')
  assert.equal(deriveSpineStages(makeDeal())[6].status, 'idle')
})

check('intakeSummaryFromDocuments tallies applied vs pending', () => {
  const summary = intakeSummaryFromDocuments([
    { status: 'applied' },
    { status: 'approved' },
    { status: 'review_ready' },
    { status: 'uploaded' },
    { status: 'parse_failed' },
  ])
  assert.equal(summary.documentCount, 5)
  assert.equal(summary.appliedCount, 2)
  assert.equal(summary.reviewPendingCount, 2)
})

console.log('commandModel:')

check('suggestionsForStage returns well-formed suggestions for every stage', () => {
  for (const id of SPINE_STAGE_IDS) {
    const items = suggestionsForStage(id)
    assert.ok(Array.isArray(items) && items.length > 0, `stage ${id} should have suggestions`)
    for (const item of items) {
      assert.ok(typeof item.label === 'string' && item.label.length > 0, `${id} label`)
      assert.ok(typeof item.intent === 'string' && item.intent.length > 0, `${id} intent`)
    }
  }
})

console.log('dealRecordModel:')

// Minimal ExtractionField factory (only the fields the model reads).
function extractionField(overrides = {}) {
  return {
    fieldId: overrides.fieldId ?? `fid-${overrides.path ?? 'x'}`,
    path: overrides.path ?? 'property.totalUnits',
    label: overrides.label ?? 'Total Units',
    value: 'value' in overrides ? overrides.value : 7,
    valueType: overrides.valueType ?? 'integer',
    unit: overrides.unit,
    confidence: overrides.confidence ?? 0.92,
    source: overrides.source ?? 'rent-roll.xlsx',
    sourceRef: overrides.sourceRef ?? {
      documentId: 'doc-1',
      fileName: overrides.source ?? 'rent-roll.xlsx',
      parserId: 'rent-roll',
      parserVersion: '1',
      location: overrides.location,
      raw: overrides.raw,
    },
    reviewStatus: overrides.reviewStatus,
    currentValue: overrides.currentValue,
    conflict: overrides.conflict,
    validationIssues: overrides.validationIssues,
  }
}

function preview(fields, overrides = {}) {
  return {
    documentId: overrides.documentId ?? 'doc-1',
    status: overrides.status ?? 'extracted',
    extractedAt: '2026-05-27T00:00:00.000Z',
    fields,
    metrics: {},
    notes: [],
  }
}

check('groupForPath maps documented paths and falls back by prefix', () => {
  assert.equal(groupForPath('property.totalUnits'), 'Property')
  assert.equal(groupForPath('property.yearBuilt'), 'Property')
  assert.equal(groupForPath('financials.currentNOI'), 'Operations')
  assert.equal(groupForPath('financials.inPlaceOccupancy'), 'Operations')
  assert.equal(groupForPath('financials.trailingT12Revenue'), 'Operations')
  assert.equal(groupForPath('financials.askingPrice'), 'Deal Terms')
  assert.equal(groupForPath('financials.pricePerUnit'), 'Deal Terms')
  assert.equal(groupForPath('financing.targetLTV'), 'Deal Terms')
  assert.equal(groupForPath('financing.loanType'), 'Deal Terms')
  // Undocumented prefixes still group sensibly.
  assert.equal(groupForPath('property.somethingNew'), 'Property')
  assert.equal(groupForPath('financials.effectiveRent'), 'Operations')
  assert.equal(groupForPath('financials.exitCapRate'), 'Deal Terms')
  assert.equal(groupForPath('weird.unknown'), 'Other')
})

check('confidenceTier applies 0.85 / 0.7 thresholds', () => {
  assert.equal(confidenceTier(0.9), 'high')
  assert.equal(confidenceTier(0.85), 'high')
  assert.equal(confidenceTier(0.84), 'med')
  assert.equal(confidenceTier(0.7), 'med')
  assert.equal(confidenceTier(0.69), 'low')
  assert.equal(confidenceTier(0), 'low')
})

check('isFlagged flags conflict, low-confidence, and validation issues only', () => {
  assert.equal(isFlagged(extractionField({ confidence: 0.92 })), false)
  assert.equal(isFlagged(extractionField({ confidence: 0.7 })), false) // exactly the trust floor
  assert.equal(isFlagged(extractionField({ confidence: 0.69 })), true)
  assert.equal(isFlagged(extractionField({ confidence: 0.95, conflict: true })), true)
  assert.equal(isFlagged(extractionField({ confidence: 0.95, validationIssues: ['NOI exceeds revenue'] })), true)
  assert.equal(isFlagged(extractionField({ confidence: 0.95, validationIssues: [] })), false)
})

check('formatFieldValue humanizes currency, percent, integers, and unit-mix arrays', () => {
  assert.equal(formatFieldValue(extractionField({ path: 'financials.askingPrice', unit: 'usd', value: 24_500_000 })), '$24.50M')
  assert.equal(formatFieldValue(extractionField({ path: 'financials.currentNOI', unit: 'usd', value: 95_400 })), '$95,400')
  assert.equal(formatFieldValue(extractionField({ path: 'financials.inPlaceOccupancy', unit: 'decimal', value: 0.935 })), '93.5%')
  assert.equal(formatFieldValue(extractionField({ path: 'financing.targetLTV', unit: 'decimal', value: 0.7 })), '70%')
  assert.equal(formatFieldValue(extractionField({ path: 'property.totalUnits', unit: 'count', value: 1200 })), '1,200')
  assert.equal(
    formatFieldValue(extractionField({ path: 'property.unitMix.types', valueType: 'array', value: [{ type: '1BR' }, { type: '2BR' }] })),
    '2 types',
  )
  assert.equal(formatFieldValue(extractionField({ path: 'property.totalUnits', value: null })), '--')
})

check('buildDealRecordGroups: clean field is not flagged and lands in the right group', () => {
  const groups = buildDealRecordGroups([
    preview([
      extractionField({ path: 'property.totalUnits', label: 'Total Units', value: 7, confidence: 0.92, unit: 'count' }),
      extractionField({ path: 'financials.askingPrice', label: 'Asking Price', value: 2_450_000, confidence: 0.9, unit: 'usd' }),
    ]),
  ])
  const property = groups.find((g) => g.label === 'Property')
  const dealTerms = groups.find((g) => g.label === 'Deal Terms')
  assert.ok(property, 'Property group exists')
  assert.ok(dealTerms, 'Deal Terms group exists')
  const units = property.fields.find((f) => f.path === 'property.totalUnits')
  assert.equal(units.flagged, false)
  assert.equal(units.value, '7')
  assert.equal(units.fieldId, 'property.totalUnits') // fieldId === path
  assert.equal(units.confidence, 'high')
  assert.equal(dealTerms.fields[0].value, '$2.45M')
  // Property group sorts before Deal Terms.
  assert.ok(groups.findIndex((g) => g.label === 'Property') < groups.findIndex((g) => g.label === 'Deal Terms'))
  assert.equal(countNeedsEye(groups), 0)
})

check('buildDealRecordGroups: conflicting field is flagged with a source-naming reason', () => {
  const groups = buildDealRecordGroups([
    preview([
      extractionField({
        path: 'financials.currentNOI',
        label: 'Current NOI',
        value: 95_400,
        unit: 'usd',
        confidence: 0.92,
        conflict: true,
        currentValue: 90_000,
        source: 'offering-memo.md',
      }),
    ]),
  ])
  const noi = groups.flatMap((g) => g.fields).find((f) => f.path === 'financials.currentNOI')
  assert.equal(noi.flagged, true)
  assert.match(noi.flagReason, /disagree/i)
  assert.match(noi.flagReason, /90,000/) // the previously-applied value is named
  assert.equal(countNeedsEye(groups), 1)
})

check('buildDealRecordGroups: low-confidence field is flagged with the confirm reason', () => {
  const groups = buildDealRecordGroups([
    preview([
      extractionField({ path: 'financials.inPlaceOccupancy', label: 'In-Place Occupancy', value: 0.78, unit: 'decimal', confidence: 0.6 }),
    ]),
  ])
  const occ = groups.flatMap((g) => g.fields).find((f) => f.path === 'financials.inPlaceOccupancy')
  assert.equal(occ.flagged, true)
  assert.equal(occ.confidence, 'low')
  assert.match(occ.flagReason, /low-confidence/i)
})

check('buildDealRecordGroups: validation issue surfaces as the flag reason', () => {
  const groups = buildDealRecordGroups([
    preview([
      extractionField({ path: 'financials.currentNOI', value: 95_400, confidence: 0.95, validationIssues: ['NOI exceeds T12 revenue'] }),
    ]),
  ])
  const noi = groups.flatMap((g) => g.fields).find((f) => f.path === 'financials.currentNOI')
  assert.equal(noi.flagged, true)
  assert.equal(noi.flagReason, 'NOI exceeds T12 revenue')
})

check('buildDealRecordGroups: dedupes by path, preferring an applied read over higher confidence', () => {
  const groups = buildDealRecordGroups([
    preview([extractionField({ path: 'property.totalUnits', value: 99, confidence: 0.99, reviewStatus: 'candidate' })], { documentId: 'doc-a' }),
    preview([extractionField({ path: 'property.totalUnits', value: 7, confidence: 0.8, reviewStatus: 'applied' })], { documentId: 'doc-b' }),
  ])
  const units = groups.flatMap((g) => g.fields).filter((f) => f.path === 'property.totalUnits')
  assert.equal(units.length, 1) // deduped
  assert.equal(units[0].value, '7') // the applied read won despite lower confidence
})

check('buildDealRecordGroups: a conflict on any read survives dedupe', () => {
  const groups = buildDealRecordGroups([
    preview([extractionField({ path: 'financials.askingPrice', value: 2_450_000, confidence: 0.86, conflict: true, currentValue: 2_400_000 })], { documentId: 'doc-a' }),
    preview([extractionField({ path: 'financials.askingPrice', value: 2_450_000, confidence: 0.95, reviewStatus: 'applied' })], { documentId: 'doc-b' }),
  ])
  const price = groups.flatMap((g) => g.fields).find((f) => f.path === 'financials.askingPrice')
  // The applied higher-confidence read wins the value, but the conflict flag is preserved.
  assert.equal(price.flagged, true)
  assert.match(price.flagReason, /disagree/i)
})

check('buildDealRecordGroups: empty input yields no groups', () => {
  assert.deepEqual(buildDealRecordGroups([]), [])
  assert.equal(countNeedsEye([]), 0)
})

check('coerceEditValue turns display strings into the typed values the deal schema requires', () => {
  // Integers (schema rejects strings/floats here).
  assert.equal(coerceEditValue('property.totalUnits', '8'), 8)
  assert.strictEqual(typeof coerceEditValue('property.totalUnits', '8'), 'number')
  assert.equal(coerceEditValue('property.yearBuilt', '1998'), 1998)
  assert.equal(coerceEditValue('property.totalUnits', '8.6'), 9) // rounded to integer
  // Currency with $, commas, and M/K suffixes.
  assert.equal(coerceEditValue('financials.askingPrice', '$2,450,000'), 2_450_000)
  assert.equal(coerceEditValue('financials.askingPrice', '$2.45M'), 2_450_000)
  assert.equal(coerceEditValue('financials.currentNOI', '95K'), 95_000)
  // Percent-ratio paths normalize to a 0-1 fraction whether typed as 93.5, 93.5%, or 0.935.
  assert.equal(coerceEditValue('financials.inPlaceOccupancy', '93.5%'), 0.935)
  assert.equal(coerceEditValue('financials.inPlaceOccupancy', '93.5'), 0.935)
  assert.equal(coerceEditValue('financials.inPlaceOccupancy', '0.935'), 0.935)
  assert.equal(coerceEditValue('financing.targetLTV', '70%'), 0.7)
  // String-typed paths pass through untouched.
  assert.equal(coerceEditValue('financing.loanType', 'Agency'), 'Agency')
  // Unparseable input falls back to the trimmed string so the server can reject it honestly.
  assert.equal(coerceEditValue('financials.askingPrice', 'n/a'), 'n/a')
  assert.equal(coerceEditValue('property.totalUnits', '  '), '')
})

check('buildDealRecordGroups excludes non-applyable (not source-backed) fields — no dev string leak', () => {
  const groups = buildDealRecordGroups([
    preview([
      extractionField({ path: 'financials.currentNOI', label: 'In-place NOI', value: 95400, confidence: 0.95 }),
      extractionField({
        path: 'financials.grossPotentialRentAnnual',
        label: 'Gross Potential Rent',
        value: 120000,
        confidence: 0.95,
        validationIssues: ['Field path is not approved for source-backed apply.'],
      }),
    ]),
  ])
  const fields = groups.flatMap((g) => g.fields)
  const paths = fields.map((f) => f.path)
  assert.ok(paths.includes('financials.currentNOI'), 'applyable field is shown')
  assert.ok(!paths.includes('financials.grossPotentialRentAnnual'), 'non-applyable field is excluded')
  assert.ok(!fields.some((f) => /not approved for source-backed apply/i.test(f.flagReason ?? '')), 'no internal string leaks')
  assert.equal(countNeedsEye(groups), 0)
})

console.log(`dashboard-lib: ${passed} checks passed`)
