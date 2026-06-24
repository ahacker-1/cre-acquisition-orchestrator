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
  INGESTION_TEAM,
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
import {
  buildAgentPanelView,
  buildElapsedLabel,
  checkpointStatusToRunStatus,
  inferStatusFromEvents,
} from '../dashboard/src/lib/agentView.ts'
import {
  collectFailedAgents,
  recoveryRunId,
  retryFailedAgents,
} from '../dashboard/src/lib/runRecovery.ts'
import { routeIntent } from '../dashboard/src/lib/intentRouting.ts'
import { suggestionsForStage as suggestionsForStageRouting } from '../dashboard/src/lib/commandModel.ts'
import { requestAgentDispatch, DISPATCH_WORKFLOW_ID } from '../dashboard/src/hooks/useAgentDispatch.ts'

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

check('INGESTION_TEAM: Intake stage team is the 4 ingestion agents, keyed by kebab id (Fix A)', () => {
  const ids = INGESTION_TEAM.map((agent) => agent.agentId)
  assert.deepEqual(ids, [
    'document-orchestrator',
    'rent-roll-parser',
    'financials-parser',
    'offering-memo-parser',
  ])
  // Display-cased names; none critical-path; ids are kebab so they match checkpoint/story keys.
  for (const agent of INGESTION_TEAM) {
    assert.ok(typeof agent.name === 'string' && /[A-Z]/.test(agent.name), `${agent.agentId} has a display name`)
    assert.equal(agent.critical, false)
    assert.match(agent.agentId, /^[a-z]+(-[a-z]+)*$/)
  }
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

check('buildDealRecordGroups: operator-edited approved fields override stale parser rows', () => {
  const groups = buildDealRecordGroups(
    [
      preview([
        extractionField({
          path: 'property.totalUnits',
          label: 'Total Units',
          value: 7,
          confidence: 0.95,
          unit: 'count',
          reviewStatus: 'applied',
          conflict: true,
          currentValue: 184,
          source: 'rent-roll.xlsx',
        }),
      ]),
    ],
    {
      version: 1,
      dealId: 'deal-1',
      updatedAt: '2026-06-24T00:00:00.000Z',
      fields: [
        {
          fieldId: 'operator-edit:property.totalUnits',
          path: 'property.totalUnits',
          label: 'Total Units',
          value: 184,
          previousValue: 7,
          valueType: 'integer',
          unit: 'count',
          approvedAt: '2026-06-24T00:00:00.000Z',
          appliedAt: '2026-06-24T00:00:00.000Z',
          documentId: 'operator-edit',
          confidence: 1,
          provenance: 'operator-edited',
        },
      ],
    },
  )
  const units = groups.flatMap((g) => g.fields).find((f) => f.path === 'property.totalUnits')
  assert.equal(units.value, '184')
  assert.equal(units.source, 'Operator edit')
  assert.equal(units.flagged, false)
  assert.match(units.provenance, /Previous value: 7/)
  assert.equal(countNeedsEye(groups), 0)
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

console.log('agentView:')

// Minimal StoryEvent factory (only the fields the selector reads).
function storyEvent(overrides = {}) {
  return {
    runId: overrides.runId ?? 'run-1',
    dealId: overrides.dealId ?? 'parkview-2026-001',
    seq: overrides.seq ?? 1,
    ts: overrides.ts ?? `2026-05-27T00:00:0${overrides.seq ?? 1}.000Z`,
    kind: overrides.kind ?? 'agent_progress',
    agent: 'agent' in overrides ? overrides.agent : undefined,
    fromAgent: overrides.fromAgent,
    title: overrides.title,
    summary: overrides.summary,
  }
}

// Minimal AgentCheckpoint factory.
function agentCheckpoint(overrides = {}) {
  return {
    agentName: overrides.agentName ?? 'financial-model-builder',
    phase: overrides.phase ?? 'underwriting',
    dealId: 'parkview-2026-001',
    status: overrides.status ?? 'complete',
    progress: overrides.progress ?? 1,
    startedAt: null,
    completedAt: null,
    lastUpdatedAt: null,
    resumePoint: null,
    outputs: overrides.outputs ?? { summary: '', findings: [], metrics: {}, verdict: null },
    dataGaps: overrides.dataGaps ?? [],
    errors: [],
    redFlags: overrides.redFlags ?? [],
    childAgents: [],
  }
}

function documentArtifact(overrides = {}) {
  return {
    docId: overrides.docId ?? 'underwriting:financial-model-builder:workpaper-v1',
    runId: 'run-1',
    dealId: 'parkview-2026-001',
    phase: overrides.phase ?? 'underwriting',
    agent: overrides.agent ?? 'financial-model-builder',
    docType: overrides.docType ?? 'workpaper',
    title: overrides.title ?? 'financial-model-builder Workpaper',
    path: overrides.path ?? 'data/reports/parkview-2026-001/underwriting/financial-model-builder-workpaper-v1.md',
    mime: 'text/markdown',
    version: overrides.version ?? 1,
    summary: overrides.summary ?? 'Base-case model calibrated.',
  }
}

check('checkpointStatusToRunStatus maps normalized checkpoint statuses to panel run statuses', () => {
  assert.equal(checkpointStatusToRunStatus('running'), 'working')
  assert.equal(checkpointStatusToRunStatus('complete'), 'done')
  assert.equal(checkpointStatusToRunStatus('failed'), 'failed')
  assert.equal(checkpointStatusToRunStatus('pending'), 'queued')
  assert.equal(checkpointStatusToRunStatus('skipped'), 'queued')
  assert.equal(checkpointStatusToRunStatus(undefined), 'queued') // no checkpoint -> queued
})

check('buildAgentPanelView replays a completed agent: stream sorted by seq, output from workpaper', () => {
  const agentName = 'financial-model-builder'
  const checkpoints = new Map([
    [agentName, agentCheckpoint({
      status: 'complete',
      outputs: { summary: 'Base-case model calibrated and validated.', findings: ['Base-case model calibrated and validated.', 'Exit cap held at 5.5%.'], metrics: {}, verdict: 'PASS' },
    })],
  ])
  // Out-of-order seqs to prove sorting; a foreign agent's event must be excluded.
  const events = [
    storyEvent({ seq: 12, kind: 'agent_completed', agent: agentName, title: 'financial-model-builder completed' }),
    storyEvent({ seq: 7, kind: 'agent_started', agent: agentName, title: 'financial-model-builder started' }),
    storyEvent({ seq: 9, kind: 'agent_progress', agent: agentName, summary: 'Calibrating base case' }),
    storyEvent({ seq: 8, kind: 'agent_progress', agent: 'rent-roll-analyst', title: 'someone else' }),
  ]
  const artifacts = [documentArtifact({ agent: agentName })]
  let openedPath = null
  const view = buildAgentPanelView(agentName, {
    agentCheckpoints: checkpoints,
    storyEvents: events,
    documentArtifacts: artifacts,
    onOpenWorkpaper: (path) => { openedPath = path },
  })

  assert.equal(view.status, 'done')
  // Three of the four events belong to this agent, sorted by seq ascending.
  assert.equal(view.streamLines.length, 3)
  assert.deepEqual(view.streamLines.map((l) => l.text), [
    'financial-model-builder started',
    'Calibrating base case',
    'financial-model-builder completed',
  ])
  // The completion line is toned 'done'.
  assert.equal(view.streamLines[2].tone, 'done')
  // Output renders from the workpaper + checkpoint outputs.
  assert.ok(view.output)
  assert.equal(view.output.title, 'financial-model-builder Workpaper')
  const labels = view.output.rows.map((r) => r.label)
  assert.ok(labels.includes('Summary'))
  assert.ok(labels.includes('Verdict'))
  const verdictRow = view.output.rows.find((r) => r.label === 'Verdict')
  assert.equal(verdictRow.value, 'PASS')
  assert.equal(verdictRow.impact, true)
  // "open full workpaper" calls back with the workpaper path.
  assert.equal(typeof view.output.onOpenFull, 'function')
  view.output.onOpenFull()
  assert.match(openedPath, /financial-model-builder-workpaper-v1\.md$/)
})

check('buildAgentPanelView for a running agent: latest line is current, no workpaper => null output', () => {
  const agentName = 'scenario-analyst'
  const checkpoints = new Map([[agentName, agentCheckpoint({ agentName, status: 'running' })]])
  const events = [
    storyEvent({ seq: 3, kind: 'agent_started', agent: agentName, title: 'scenario-analyst started' }),
    storyEvent({ seq: 4, kind: 'agent_progress', agent: agentName, summary: 'Running downside case' }),
  ]
  const view = buildAgentPanelView(agentName, {
    agentCheckpoints: checkpoints,
    storyEvents: events,
    documentArtifacts: [], // no filed workpaper yet
  })
  assert.equal(view.status, 'working')
  assert.equal(view.streamLines.length, 2)
  assert.equal(view.streamLines[1].tone, 'current') // latest line, still working
  assert.equal(view.output, null) // no workpaper => no output card
})

check('buildElapsedLabel: event span -> compact label; <2 timestamps or <1s -> undefined', () => {
  const agentName = 'scenario-analyst'
  // Fewer than two timestamps -> no label.
  assert.equal(buildElapsedLabel(agentName, []), undefined)
  assert.equal(
    buildElapsedLabel(agentName, [storyEvent({ seq: 1, agent: agentName, ts: '2026-05-27T00:00:00.000Z' })]),
    undefined,
  )
  // Sub-second span -> no label (avoid a misleading "0s").
  assert.equal(
    buildElapsedLabel(agentName, [
      storyEvent({ seq: 1, agent: agentName, ts: '2026-05-27T00:00:00.000Z' }),
      storyEvent({ seq: 2, agent: agentName, ts: '2026-05-27T00:00:00.400Z' }),
    ]),
    undefined,
  )
  // 47-second span -> "47s".
  assert.equal(
    buildElapsedLabel(agentName, [
      storyEvent({ seq: 1, agent: agentName, ts: '2026-05-27T00:00:00.000Z' }),
      storyEvent({ seq: 2, agent: agentName, ts: '2026-05-27T00:00:47.000Z' }),
    ]),
    '47s',
  )
  // Minutes + seconds; a foreign agent's events are excluded from the span.
  assert.equal(
    buildElapsedLabel(agentName, [
      storyEvent({ seq: 1, agent: agentName, ts: '2026-05-27T00:00:00.000Z' }),
      storyEvent({ seq: 2, agent: 'someone-else', ts: '2026-05-27T09:00:00.000Z' }),
      storyEvent({ seq: 3, agent: agentName, ts: '2026-05-27T00:03:12.000Z' }),
    ]),
    '3m 12s',
  )
  // Exact minute -> "Nm" (no trailing 0s).
  assert.equal(
    buildElapsedLabel(agentName, [
      storyEvent({ seq: 1, agent: agentName, ts: '2026-05-27T00:00:00.000Z' }),
      storyEvent({ seq: 2, agent: agentName, ts: '2026-05-27T00:02:00.000Z' }),
    ]),
    '2m',
  )
  // buildAgentPanelView surfaces the label (Fix B: was previously always undefined).
  const view = buildAgentPanelView(agentName, {
    agentCheckpoints: new Map(),
    storyEvents: [
      storyEvent({ seq: 1, agent: agentName, ts: '2026-05-27T00:00:00.000Z' }),
      storyEvent({ seq: 2, kind: 'agent_completed', agent: agentName, ts: '2026-05-27T00:00:30.000Z' }),
    ],
    documentArtifacts: [],
  })
  assert.equal(view.elapsedLabel, '30s')
})

check('inferStatusFromEvents falls back to recorded events when no checkpoint is present', () => {
  const agentName = 'financial-model-builder'
  // No events at all -> undefined (caller defaults to queued).
  assert.equal(inferStatusFromEvents(agentName, []), undefined)
  // A completion event -> done.
  assert.equal(
    inferStatusFromEvents(agentName, [storyEvent({ seq: 2, kind: 'agent_completed', agent: agentName })]),
    'done',
  )
  // A document_created (workpaper filed) also reads as done.
  assert.equal(
    inferStatusFromEvents(agentName, [storyEvent({ seq: 3, kind: 'document_created', agent: agentName })]),
    'done',
  )
  // A failure event wins.
  assert.equal(
    inferStatusFromEvents(agentName, [
      storyEvent({ seq: 2, kind: 'agent_completed', agent: agentName }),
      storyEvent({ seq: 3, kind: 'agent_failed', agent: agentName }),
    ]),
    'failed',
  )
  // Only a start -> still working.
  assert.equal(
    inferStatusFromEvents(agentName, [storyEvent({ seq: 1, kind: 'agent_started', agent: agentName })]),
    'working',
  )
})

check('buildAgentPanelView replays from events alone (no checkpoint): status done + workpaper output', () => {
  // Mirrors the manually-opened-saved-deal path where the dashboard supplies story events +
  // artifacts but an EMPTY agentCheckpoints map.
  const agentName = 'financial-model-builder'
  const view = buildAgentPanelView(agentName, {
    agentCheckpoints: new Map(), // no checkpoint
    storyEvents: [
      storyEvent({ seq: 1, kind: 'agent_started', agent: agentName, title: 'started' }),
      storyEvent({ seq: 2, kind: 'agent_completed', agent: agentName, title: 'completed' }),
    ],
    documentArtifacts: [documentArtifact({ agent: agentName })],
  })
  assert.equal(view.status, 'done') // inferred from the completion event
  assert.equal(view.streamLines.length, 2)
  assert.ok(view.output) // workpaper output still renders from the artifact
  assert.equal(view.output.title, 'financial-model-builder Workpaper')
})

check('buildAgentPanelView: unknown agent yields queued status, empty stream, null output', () => {
  const view = buildAgentPanelView('nobody', {
    agentCheckpoints: new Map(),
    storyEvents: [storyEvent({ seq: 1, agent: 'someone-else' })],
    documentArtifacts: [documentArtifact({ agent: 'someone-else' })],
  })
  assert.equal(view.status, 'queued')
  assert.deepEqual(view.streamLines, [])
  assert.equal(view.output, null)
})

check('buildAgentPanelView: fromAgent handoffs are included in the stream', () => {
  const agentName = 'rent-roll-analyst'
  const view = buildAgentPanelView(agentName, {
    agentCheckpoints: new Map([[agentName, agentCheckpoint({ agentName, status: 'complete' })]]),
    storyEvents: [
      storyEvent({ seq: 2, kind: 'agent_started', agent: agentName, title: 'started' }),
      storyEvent({ seq: 5, kind: 'agent_message', fromAgent: agentName, title: 'handoff to underwriting' }),
    ],
    documentArtifacts: [],
  })
  assert.equal(view.streamLines.length, 2)
  assert.equal(view.streamLines[1].text, 'handoff to underwriting')
})

check('buildAgentPanelView: red flags + data gaps surface as an impact-weighted Caveats row', () => {
  const agentName = 'tenant-credit'
  const view = buildAgentPanelView(agentName, {
    agentCheckpoints: new Map([[agentName, agentCheckpoint({
      agentName,
      status: 'complete',
      outputs: { summary: 'Tenant base concentrated.', findings: [], metrics: {}, verdict: 'CONDITIONAL' },
      redFlags: [{ description: 'Top tenant 40% of NOI', severity: 'HIGH', category: 'concentration' }],
      dataGaps: [{ description: 'Missing two estoppels' }],
    })]],
    ),
    storyEvents: [],
    documentArtifacts: [documentArtifact({ agent: agentName, title: 'tenant-credit Workpaper', phase: 'due-diligence' })],
  })
  assert.ok(view.output)
  const caveats = view.output.rows.find((r) => r.label === 'Caveats')
  assert.ok(caveats, 'caveats row present')
  assert.match(caveats.value, /1 red flag/)
  assert.match(caveats.value, /1 data gap/)
  assert.equal(caveats.impact, true)
})

console.log('runRecovery:')

check('collectFailedAgents dedupes checkpoints, phase statuses, and story failures', () => {
  const failed = collectFailedAgents(
    {
      phases: {
        underwriting: {
          agentStatuses: {
            'scenario analyst': 'FAILED',
            'ic-memo-writer': 'failed',
          },
        },
      },
    },
    new Map([
      [
        'scenario-analyst',
        {
          agentName: 'scenario-analyst',
          phase: 'underwriting',
          status: 'failed',
          errors: [{ message: 'Timed out after retries' }],
        },
      ],
      [
        'lender-outreach',
        {
          agentName: 'lender-outreach',
          phase: 'financing',
          status: 'completed',
          errors: [],
        },
      ],
    ]),
    [
      {
        kind: 'agent_failed',
        agent: 'scenario_analyst',
        phase: 'underwriting',
        summary: 'Duplicate failure signal',
      },
      {
        kind: 'agent_failed',
        fromAgent: 'quote-comparator',
        phase: 'financing',
        title: 'Quote parser failed',
      },
    ],
  )
  assert.deepEqual(failed.map((agent) => agent.agentName).sort(), [
    'Ic Memo Writer',
    'Quote Comparator',
    'Scenario Analyst',
  ])
  assert.equal(
    failed.find((agent) => agent.agentName === 'Scenario Analyst')?.reason,
    'Timed out after retries',
    'checkpoint reason should survive duplicate story/deal signals',
  )
})

check('recoveryRunId prefers failed run id, then latest event, then checkpoint', () => {
  assert.equal(
    recoveryRunId(
      [
        { kind: 'agent_completed', runId: 'run-latest' },
        { kind: 'agent_failed', runId: 'run-failed' },
        { kind: 'agent_completed', runId: 'run-newer-success' },
      ],
      { runId: 'checkpoint-run' },
    ),
    'run-failed',
  )
  assert.equal(recoveryRunId([{ kind: 'agent_completed', runId: 'run-only' }], { runId: 'checkpoint-run' }), 'run-only')
  assert.equal(recoveryRunId([], { runId: 'checkpoint-run' }), 'checkpoint-run')
  assert.equal(recoveryRunId([], null), null)
})

await (async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return {
      ok: true,
      json: async () => ({ runId: 'rerun-1', status: 'started' }),
    }
  }
  const result = await retryFailedAgents(
    {
      dealPath: 'data/deals/test/deal.json',
      runId: 'run-prior',
      workflowId: 'quick-deal-screen',
    },
    { fetchImpl },
  )
  assert.deepEqual(result, { runId: 'rerun-1', status: 'started' })
  assert.equal(calls.length, 1)
  assert.ok(calls[0].url.endsWith('/api/run/start'))
  assert.equal(calls[0].init.method, 'POST')
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.dealPath, 'data/deals/test/deal.json')
  assert.equal(body.mode, 'live')
  assert.equal(body.runtimeProvider, 'codex')
  assert.equal(body.workflowId, 'quick-deal-screen')
  assert.equal(body.scenario, 'core-plus')
  assert.equal(body.reset, false)
  assert.equal(body.codexSearch, true)
  assert.equal(body.codexRerunFailed, true)
  assert.equal(body.codexRerunRunId, 'run-prior')
  passed += 1
  console.log('  ok - retryFailedAgents posts rerun-only Codex request with search preserved')
})()

await (async () => {
  await assert.rejects(
    retryFailedAgents(
      { dealPath: 'data/deals/test/deal.json', runId: 'run-prior' },
      {
        fetchImpl: async () => ({
          ok: false,
          json: async () => ({ error: 'No failed agents found' }),
        }),
      },
    ),
    /No failed agents found/,
  )
  passed += 1
  console.log('  ok - retryFailedAgents surfaces server error payloads')
})()

console.log('intentRouting:')

check('routeIntent resolves explicit agent: and workflow: intents directly', () => {
  assert.deepEqual(routeIntent('agent:financial-model-builder', 'underwriting'), { kind: 'agent', agentId: 'financial-model-builder' })
  assert.deepEqual(routeIntent('workflow:legal-psa-review', 'legal'), { kind: 'workflow', workflowId: 'legal-psa-review' })
  // A plain action intent (not agent/workflow) falls back to the advanced drawer.
  assert.deepEqual(routeIntent('assemble-package', 'ic'), { kind: 'advanced' })
})

check('routeIntent maps documented free-text keywords to agents/workflows', () => {
  assert.deepEqual(routeIntent('refresh the model', 'underwriting'), { kind: 'agent', agentId: 'financial-model-builder' })
  assert.deepEqual(routeIntent('build the pro forma', 'underwriting'), { kind: 'agent', agentId: 'financial-model-builder' })
  assert.deepEqual(routeIntent('draft the IC memo', 'underwriting'), { kind: 'agent', agentId: 'ic-memo-writer' })
  assert.deepEqual(routeIntent('take this to committee', 'underwriting'), { kind: 'agent', agentId: 'ic-memo-writer' })
  assert.deepEqual(routeIntent('review the PSA for blockers', 'legal'), { kind: 'workflow', workflowId: 'legal-psa-review' })
  assert.deepEqual(routeIntent('compare lender quotes', 'financing'), { kind: 'workflow', workflowId: 'financing-package' })
  assert.deepEqual(routeIntent('check tenant concentration', 'diligence'), { kind: 'agent', agentId: 'tenant-credit' })
  assert.deepEqual(routeIntent('stress-test the exit cap', 'underwriting'), { kind: 'agent', agentId: 'scenario-analyst' })
})

check('routeIntent returns advanced for unrecognized free text', () => {
  assert.deepEqual(routeIntent('do something inscrutable', 'intake'), { kind: 'advanced' })
  assert.deepEqual(routeIntent('', 'intake'), { kind: 'advanced' })
  assert.deepEqual(routeIntent('   ', 'underwriting'), { kind: 'advanced' })
})

check('routeIntent matches a stage suggestion label to its chip intent', () => {
  const underwriting = suggestionsForStageRouting('underwriting')
  // "Stress-test the exit cap" is an underwriting chip -> agent:scenario-analyst.
  const result = routeIntent('Stress-test the exit cap', 'underwriting', { suggestions: underwriting })
  assert.deepEqual(result, { kind: 'agent', agentId: 'scenario-analyst' })
  // A plain-action chip label ("Assemble the IC package" -> assemble-package) routes to advanced.
  const ic = suggestionsForStageRouting('ic')
  assert.deepEqual(routeIntent('Assemble the IC package', 'ic', { suggestions: ic }), { kind: 'advanced' })
})

check('routeIntent is deterministic — first matching keyword rule wins', () => {
  // "legal" appears before "financing" only when legal keywords match; ensure a legal phrase
  // does not accidentally resolve to financing and vice-versa.
  assert.equal(routeIntent('legal review', 'legal').kind, 'workflow')
  assert.equal(routeIntent('legal review', 'legal').workflowId, 'legal-psa-review')
  assert.equal(routeIntent('financing package', 'financing').workflowId, 'financing-package')
  // Same input -> same output, twice.
  assert.deepEqual(routeIntent('refresh the model', 'underwriting'), routeIntent('refresh the model', 'underwriting'))
})

console.log('useAgentDispatch:')

// A tiny fetch double recording the last call, returning a configurable JSON response.
function mockFetch({ ok = true, body = {} } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return {
      ok,
      json: async () => body,
    }
  }
  impl.calls = calls
  return impl
}

await (async () => {
  // Offline (simulation) dispatch is a no-op that never calls fetch, returns the switch-to-Codex notice.
  await (async function offlineNoop() {
    const fetchImpl = mockFetch()
    const result = await requestAgentDispatch('financial-model-builder', undefined, {
      dealId: 'parkview-2026-001',
      runtimeProvider: 'simulation',
      fetchImpl,
    })
    assert.equal(result.status, 'offline-noop')
    assert.match(result.notice, /Codex/i)
    assert.equal(fetchImpl.calls.length, 0, 'simulation must not start a run')
    passed += 1
    console.log('  ok - simulation dispatch is a no-op (no run started) with a switch-to-Codex notice')
  })()

  // Codex dispatch POSTs a one-agent launch with the right shape.
  await (async function codexDispatch() {
    const fetchImpl = mockFetch({ ok: true, body: { runId: 'run_codex_1', status: 'started' } })
    const result = await requestAgentDispatch('ic-memo-writer', 'Draft the recommendation', {
      dealId: 'parkview-2026-001',
      runtimeProvider: 'codex',
      fetchImpl,
    })
    assert.equal(result.status, 'dispatched')
    assert.equal(result.runId, 'run_codex_1')
    assert.equal(fetchImpl.calls.length, 1)
    const { url, init } = fetchImpl.calls[0]
    assert.ok(url.endsWith(`/api/workflows/${DISPATCH_WORKFLOW_ID}/launch`), `launch url: ${url}`)
    assert.equal(init.method, 'POST')
    const sent = JSON.parse(init.body)
    assert.equal(sent.runtimeProvider, 'codex')
    assert.deepEqual(sent.codexAgents, ['ic-memo-writer'])
    assert.equal(sent.codexMaxAgents, 1)
    assert.equal(sent.reset, false)
    assert.equal(sent.notes, 'Draft the recommendation')
    passed += 1
    console.log('  ok - codex dispatch POSTs a one-agent launch (codexAgents:[name], codexMaxAgents:1, reset:false)')
  })()

  // A failed codex launch surfaces the server error as a notice (no throw).
  await (async function codexError() {
    const fetchImpl = mockFetch({ ok: false, body: { error: 'A run is already active' } })
    const result = await requestAgentDispatch('scenario-analyst', undefined, {
      dealId: 'parkview-2026-001',
      runtimeProvider: 'codex',
      fetchImpl,
    })
    assert.equal(result.status, 'error')
    assert.match(result.notice, /already active/)
    passed += 1
    console.log('  ok - codex dispatch surfaces a server error as a notice')
  })()
})()

console.log(`dashboard-lib: ${passed} checks passed`)
