import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveUserDeal } from '../dashboard/server/deal-service.ts'
import {
  applySourceExtraction,
  evaluateLaunchReadiness,
  exportIcStarterPackage,
  extractSourceDocument,
  getFieldDecisionHistory,
  getSourceExtraction,
  reviewSourceExtraction,
  saveSourceDocument,
} from '../dashboard/server/workspace-service.ts'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tempRoot = mkdtempSync(join(tmpdir(), 'cre-workspace-service-'))
const context = {
  dataRoot: join(tempRoot, 'data'),
  statusDir: join(tempRoot, 'data', 'status'),
  projectRoot,
}

function fixturePayload(fileName) {
  const buffer = readFileSync(join(projectRoot, 'fixtures', 'parsers', fileName))
  return {
    fileName,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentBase64: buffer.toString('base64'),
  }
}

try {
  const baseDeal = JSON.parse(readFileSync(join(projectRoot, 'config', 'deal.json'), 'utf8'))
  const dealId = 'test-source-backed-review'
  const deal = {
    ...baseDeal,
    dealId,
    dealName: 'Source Backed Review Test',
    property: {
      ...baseDeal.property,
      totalUnits: 1,
    },
    financials: {
      ...baseDeal.financials,
      currentNOI: 1,
      inPlaceOccupancy: 0.1,
      trailingT12Revenue: 1,
      trailingT12Expenses: 1,
    },
  }

  saveUserDeal(context, { deal, mode: 'draft' })

  const { document } = saveSourceDocument(context, dealId, fixturePayload('rent-roll-basic.xlsx'))
  assert.equal(document.status, 'uploaded')

  const { extraction } = extractSourceDocument(context, dealId, document.documentId)
  assert.equal(extraction.status, 'extracted')
  assert.ok(extraction.fields.some((field) => field.path === 'property.totalUnits'))

  const persisted = getSourceExtraction(context, dealId, document.documentId)
  assert.equal(persisted.documentId, document.documentId)
  assert.equal(persisted.status, 'extracted')

  const totalUnits = persisted.fields.find((field) => field.path === 'property.totalUnits')
  assert.ok(totalUnits, 'expected total units field from persisted extraction')
  assert.equal(totalUnits.reviewStatus, 'candidate')
  assert.equal(totalUnits.currentValue, 1)
  assert.equal(totalUnits.conflict, true)
  assert.equal(totalUnits.sourceRef.documentId, document.documentId)
  assert.equal(totalUnits.sourceRef.fileName, 'rent-roll-basic.xlsx')
  assert.ok(totalUnits.sourceRef.fileHash)
  assert.ok(totalUnits.sourceRef.parserId)
  assert.ok(totalUnits.sourceRef.location?.sheet)
  assert.ok(totalUnits.sourceRef.location?.row)

  const fieldIds = persisted.fields
    .filter((field) => ['property.totalUnits', 'financials.inPlaceOccupancy'].includes(field.path))
    .map((field) => field.fieldId)
  assert.ok(fieldIds.length >= 2, 'expected at least total units and occupancy fields')

  const applied = applySourceExtraction(context, dealId, document.documentId, {
    fieldIds,
    confirmConflictReview: true,
  })
  assert.equal(applied.document.status, 'applied')
  assert.equal(applied.extraction.reviewStatus, 'applied')
  assert.equal(applied.approvedFields.fields.length, fieldIds.length)
  assert.ok(applied.approvedFields.fields.every((field) => field.sourceRef.fileHash === extraction.sourceHash))
  const approvedTotalUnits = applied.approvedFields.fields.find((field) => field.path === 'property.totalUnits')
  assert.ok(approvedTotalUnits, 'expected approved total units audit entry')
  assert.equal(approvedTotalUnits.previousValue, 1)
  assert.equal(approvedTotalUnits.value, 3)
  assert.equal(applied.deal.deal.property.totalUnits, 3)

  const appliedPreview = getSourceExtraction(context, dealId, document.documentId)
  const appliedTotalUnits = appliedPreview.fields.find((field) => field.path === 'property.totalUnits')
  assert.equal(appliedTotalUnits?.reviewStatus, 'applied')
  assert.equal(appliedTotalUnits?.currentValue, 3)
  assert.equal(appliedTotalUnits?.conflict, false)

  const readiness = evaluateLaunchReadiness(context, dealId, 'quick-deal-screen', { enforceSourceBackedInputs: true })
  assert.ok(readiness.sourceCoverage.approvedFieldCount >= fieldIds.length)
  assert.ok(
    readiness.missingApprovedFields.includes('financials.currentNOI'),
    'NOI should remain missing until T12 evidence is approved',
  )

  const waivedField = appliedPreview.fields.find((field) => field.path === 'financials.grossPotentialRentAnnual')
  assert.ok(waivedField, 'expected a non-critical rent roll field to waive')
  const reviewed = reviewSourceExtraction(context, dealId, document.documentId, {
    fieldIds: [waivedField.fieldId],
    reviewStatus: 'waived',
    note: 'Use only after operator reconciles against T12 revenue.',
  })
  assert.equal(reviewed.document.status, 'applied')
  assert.equal(
    reviewed.extraction.fields.find((field) => field.fieldId === waivedField.fieldId)?.reviewStatus,
    'waived',
  )

  // W41: decision-history retrieval per field and overall.
  const totalUnitsHistory = getFieldDecisionHistory(context, dealId, 'property.totalUnits')
  assert.ok(totalUnitsHistory.length >= 1, 'expected decision history for total units')
  const appliedDecision = totalUnitsHistory.find((entry) => entry.action === 'apply')
  assert.ok(appliedDecision, 'expected an apply decision in total units history')
  assert.equal(appliedDecision.reviewStatus, 'applied')
  assert.equal(appliedDecision.path, 'property.totalUnits')
  assert.equal(appliedDecision.value, 3)
  assert.equal(appliedDecision.previousValue, 1)
  assert.ok(typeof appliedDecision.decisionId === 'string' && appliedDecision.decisionId.length > 0)
  assert.ok(typeof appliedDecision.decidedAt === 'string')

  const waiveHistory = getFieldDecisionHistory(context, dealId, 'financials.grossPotentialRentAnnual')
  assert.ok(
    waiveHistory.some((entry) => entry.action === 'waive' && entry.reviewStatus === 'waived'),
    'expected waive decision recorded for the waived field',
  )

  const fullHistory = getFieldDecisionHistory(context, dealId)
  assert.ok(fullHistory.length >= totalUnitsHistory.length + waiveHistory.length, 'full history is a superset')
  // Chronological ordering: each entry timestamp is >= the previous one.
  for (let i = 1; i < fullHistory.length; i += 1) {
    assert.ok(fullHistory[i].decidedAt >= fullHistory[i - 1].decidedAt, 'decision history is chronological')
  }

  // W41: conflict block when another document carries an unresolved candidate
  // for the same path that disagrees with the value being applied.
  const conflictDealId = 'test-source-backed-conflict'
  const conflictDeal = {
    ...baseDeal,
    dealId: conflictDealId,
    dealName: 'Conflict Test',
    property: { ...baseDeal.property, totalUnits: 1 },
    financials: {
      ...baseDeal.financials,
      currentNOI: 1,
      inPlaceOccupancy: 0.1,
      trailingT12Revenue: 1,
      trailingT12Expenses: 1,
    },
  }
  saveUserDeal(context, { deal: conflictDeal, mode: 'draft' })
  const docA = saveSourceDocument(context, conflictDealId, fixturePayload('rent-roll-basic.xlsx')).document
  extractSourceDocument(context, conflictDealId, docA.documentId)
  const docB = saveSourceDocument(context, conflictDealId, fixturePayload('rent-roll-alternate-headers.xlsx')).document
  extractSourceDocument(context, conflictDealId, docB.documentId)
  const previewA = getSourceExtraction(context, conflictDealId, docA.documentId)
  const previewB = getSourceExtraction(context, conflictDealId, docB.documentId)
  const unitsA = previewA.fields.find((field) => field.path === 'property.totalUnits')
  const unitsB = previewB.fields.find((field) => field.path === 'property.totalUnits')
  assert.ok(unitsA && unitsB, 'expected total units candidates from both documents')
  assert.notEqual(unitsA.value, unitsB.value, 'fixtures must disagree on total units to exercise conflict block')

  // Applying docA's total units is blocked while docB still has an unresolved
  // candidate for the same path with a different value.
  assert.throws(
    () =>
      applySourceExtraction(context, conflictDealId, docA.documentId, {
        fieldIds: [unitsA.fieldId],
        confirmConflictReview: true,
      }),
    /unresolved conflicting candidate/i,
    'apply should be blocked by the unresolved cross-document candidate',
  )

  // Resolving the conflicting candidate (reject) unblocks the apply.
  reviewSourceExtraction(context, conflictDealId, docB.documentId, {
    fieldIds: [unitsB.fieldId],
    reviewStatus: 'rejected',
    note: 'Superseded by rent-roll-basic source.',
  })
  const conflictApplied = applySourceExtraction(context, conflictDealId, docA.documentId, {
    fieldIds: [unitsA.fieldId],
    confirmConflictReview: true,
  })
  assert.equal(conflictApplied.document.status, 'applied')
  const conflictHistory = getFieldDecisionHistory(context, conflictDealId, 'property.totalUnits')
  assert.ok(
    conflictHistory.some((entry) => entry.action === 'reject'),
    'expected reject decision recorded in conflict deal history',
  )
  assert.ok(
    conflictHistory.some((entry) => entry.action === 'apply'),
    'expected apply decision recorded after conflict resolved',
  )

  const t12Document = saveSourceDocument(context, dealId, fixturePayload('t12-messy-realistic.xlsx')).document
  const t12Extraction = extractSourceDocument(context, dealId, t12Document.documentId).extraction
  const noiField = t12Extraction.fields.find((field) => field.path === 'financials.currentNOI')
  assert.ok(noiField, 'expected current NOI from messy T12 fixture')
  const t12Applied = applySourceExtraction(context, dealId, t12Document.documentId, {
    fieldIds: [noiField.fieldId],
    confirmConflictReview: true,
  })
  assert.equal(t12Applied.deal.deal.financials.currentNOI, 95400)

  const quickPackage = exportIcStarterPackage(context, dealId, { workflowId: 'quick-deal-screen' })
  assert.equal(quickPackage.packageJson.workflowId, 'quick-deal-screen')
  assert.ok(quickPackage.packageJson.approvedInputs.some((field) => field.path === 'financials.currentNOI'))
  assert.ok(quickPackage.markdown.includes('## Approved Inputs'))
  assert.ok(quickPackage.markdown.includes('Source Coverage'))
  assert.ok(existsSync(quickPackage.files.json))
  assert.ok(existsSync(quickPackage.files.markdown))

  // W63: richer IC export — source drilldown references for each approved input.
  assert.ok(Array.isArray(quickPackage.packageJson.sourceDrilldown))
  assert.equal(quickPackage.packageJson.sourceDrilldown.length, quickPackage.packageJson.approvedInputs.length)
  const noiDrill = quickPackage.packageJson.sourceDrilldown.find((entry) => entry.path === 'financials.currentNOI')
  assert.ok(noiDrill, 'expected a source drilldown reference for NOI')
  assert.ok(noiDrill.fileName && noiDrill.parserId && noiDrill.documentId)
  assert.ok(quickPackage.markdown.includes('## Source Drilldown'))

  // W62: every red flag links back to its originating workpaper (and source fields).
  assert.ok(Array.isArray(quickPackage.packageJson.redFlagDrilldowns))
  assert.equal(quickPackage.packageJson.redFlagDrilldowns.length, quickPackage.packageJson.redFlags.length)
  for (const drill of quickPackage.packageJson.redFlagDrilldowns) {
    assert.equal(drill.origin, 'launch-readiness')
    assert.equal(drill.workflowId, 'quick-deal-screen')
    assert.ok(drill.workpaper.includes('quick-deal-screen'), 'red flag drilldown should name its workpaper')
    assert.ok(Array.isArray(drill.relatedFields))
  }
  assert.ok(quickPackage.markdown.includes('## Red Flag Drilldowns'))

  // W60: workpaper quality gates + reviewer signoff state (warnings, not failures).
  assert.ok(quickPackage.packageJson.qualityGate)
  assert.equal(quickPackage.packageJson.qualityGate.reviewerSignoff.state, 'unsigned')
  assert.equal(quickPackage.packageJson.qualityGate.status, 'warning')
  assert.ok(
    quickPackage.packageJson.qualityGate.items.some((item) => item.id === 'reviewer-signoff' && item.status === 'missing'),
    'unsigned package should flag reviewer-signoff as a warning item',
  )
  assert.ok(quickPackage.markdown.includes('## Quality Gate'))
  assert.ok(quickPackage.markdown.includes('## Reviewer Signoff'))

  // W60: a signed reviewer signoff clears the signoff warning item.
  const signedPackage = exportIcStarterPackage(context, dealId, {
    workflowId: 'quick-deal-screen',
    reviewerSignoff: { state: 'signed', reviewer: 'Avi Hacker', note: 'Reviewed source-backed inputs.' },
  })
  assert.equal(signedPackage.packageJson.qualityGate.reviewerSignoff.state, 'signed')
  assert.equal(signedPackage.packageJson.qualityGate.reviewerSignoff.reviewer, 'Avi Hacker')
  assert.ok(typeof signedPackage.packageJson.qualityGate.reviewerSignoff.signedAt === 'string')
  assert.ok(
    signedPackage.packageJson.qualityGate.items.some((item) => item.id === 'reviewer-signoff' && item.status === 'present'),
    'signed package should clear the reviewer-signoff item',
  )

  // W61: per-phase evidence-completeness scoring is deterministic for this fixture
  // (rent_roll + t12 uploaded; property.totalUnits + financials.currentNOI approved).
  const completeness = signedPackage.packageJson.evidenceCompleteness
  assert.ok(completeness && Array.isArray(completeness.phases))
  const underwritingPhase = completeness.phases.find((phase) => phase.phaseSlug === 'underwriting')
  assert.ok(underwritingPhase, 'expected an underwriting phase score')
  assert.equal(underwritingPhase.score, 0.5)
  assert.equal(underwritingPhase.status, 'partial')
  const packagePhase = completeness.phases.find((phase) => phase.phaseSlug === 'package')
  assert.ok(packagePhase, 'expected a package phase score')
  assert.equal(packagePhase.score, 1)
  assert.equal(packagePhase.status, 'complete')
  assert.equal(completeness.overallScore, 0.2759)

  // W63: incrementing package version + version history across re-exports.
  assert.equal(quickPackage.packageJson.version, 1)
  assert.equal(signedPackage.packageJson.version, 2)
  assert.equal(signedPackage.packageJson.versionHistory.length, 2)
  assert.deepEqual(
    signedPackage.packageJson.versionHistory.map((entry) => entry.version),
    [1, 2],
  )
  assert.equal(signedPackage.packageJson.versionHistory[1].reviewerSignoffState, 'signed')
  const thirdPackage = exportIcStarterPackage(context, dealId, { workflowId: 'quick-deal-screen' })
  assert.equal(thirdPackage.packageJson.version, 3)
  assert.equal(thirdPackage.packageJson.versionHistory.length, 3)
  assert.ok(thirdPackage.markdown.includes('## Package Version History'))

  appendFileSync(document.path, '\noperator accidentally replaced source after approval')
  const staleReadiness = evaluateLaunchReadiness(context, dealId, 'quick-deal-screen')
  assert.equal(staleReadiness.sourceCoverage.staleDocumentCount, 1)
  assert.equal(staleReadiness.sourceCoverage.approvedFieldCount, 1)
  assert.equal(staleReadiness.sourceCoverage.invalidApprovedFieldCount, fieldIds.length)
  assert.ok(staleReadiness.warnings.some((warning) => warning.includes('changed after extraction')))

  const enforcedStaleReadiness = evaluateLaunchReadiness(context, dealId, 'quick-deal-screen', {
    enforceSourceBackedInputs: true,
  })
  assert.equal(enforcedStaleReadiness.status, 'blocked')
  assert.ok(enforcedStaleReadiness.blockers.some((blocker) => blocker.includes('Re-run extraction')))

  // W62: a blocked package surfaces real red flags, each carrying drilldown linkage.
  const blockedPackage = exportIcStarterPackage(context, dealId, { workflowId: 'quick-deal-screen' })
  assert.ok(blockedPackage.packageJson.redFlags.length > 0)
  assert.equal(blockedPackage.packageJson.redFlagDrilldowns.length, blockedPackage.packageJson.redFlags.length)
  assert.ok(
    blockedPackage.packageJson.redFlagDrilldowns.every((drill) => drill.origin === 'launch-readiness'),
    'blocked package red flags should originate from the launch readiness gate',
  )

  console.log('[workspace-service-test] PASS')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
