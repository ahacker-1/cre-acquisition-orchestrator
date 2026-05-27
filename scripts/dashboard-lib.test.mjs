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

console.log(`stageModel: ${passed} checks passed`)
