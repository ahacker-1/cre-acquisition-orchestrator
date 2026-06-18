import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveUserDeal } from '../dashboard/server/deal-service.ts'
import {
  AUTO_APPLY_MIN_CONFIDENCE,
  applyOperatorFieldEdit,
  applySourceExtraction,
  evaluateLaunchReadiness,
  exportIcStarterPackage,
  extractSourceDocument,
  getFieldDecisionHistory,
  getSourceExtraction,
  isAutoApplyTrusted,
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

  // I2b: extraction auto-applies only TRUSTED fields. This deal is the fully-populated
  // Parkview base with operator-seeded values (totalUnits=1, occupancy/NOI/revenue/
  // expenses=1), so EVERY source-backed field the rent roll reads disagrees with the
  // current value — i.e. they all `conflict`. Conflicting reads are never auto-applied
  // (the gate is preserved), so nothing auto-applies here and the operator resolves each
  // one manually below. The dedicated "fresh deal" auto-apply case is exercised in the
  // I2b block further down.
  assert.ok(Array.isArray(extraction.autoAppliedPaths), 'extraction should report auto-applied paths')
  assert.deepEqual(
    extraction.autoAppliedPaths,
    [],
    'a fully-seeded deal where every read conflicts must auto-apply nothing',
  )

  const persisted = getSourceExtraction(context, dealId, document.documentId)
  assert.equal(persisted.documentId, document.documentId)
  assert.equal(persisted.status, 'extracted')

  const totalUnits = persisted.fields.find((field) => field.path === 'property.totalUnits')
  assert.ok(totalUnits, 'expected total units field from persisted extraction')
  // Still a candidate: conflicting reads are not auto-applied — the gate is preserved.
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

  // V3: machine-readable evidence graph from source document -> approved input -> package.
  const evidenceGraph = quickPackage.packageJson.evidenceGraph
  assert.equal(evidenceGraph.version, 1)
  assert.equal(evidenceGraph.generatedAt, quickPackage.packageJson.generatedAt)
  assert.ok(
    evidenceGraph.nodes.some((node) => node.kind === 'package-section' && node.id === 'package:approved-inputs'),
    'expected package-section node for approved inputs',
  )
  const noiInput = quickPackage.packageJson.approvedInputs.find((field) => field.path === 'financials.currentNOI')
  assert.ok(noiInput?.sourceRef, 'expected NOI approved input to retain sourceRef')
  const noiFieldNodeId = `field:${noiInput.fieldId}`
  const noiDocumentNodeId = `doc:${noiInput.sourceRef.documentId}`
  assert.ok(
    evidenceGraph.nodes.some((node) => node.id === noiFieldNodeId && node.kind === 'source-field'),
    'expected source-field node for NOI',
  )
  assert.ok(
    evidenceGraph.nodes.some((node) => node.id === noiDocumentNodeId && node.kind === 'source-document'),
    'expected source-document node for NOI source',
  )
  assert.ok(
    evidenceGraph.edges.some((edge) =>
      edge.from === noiFieldNodeId &&
      edge.to === noiDocumentNodeId &&
      edge.relation === 'extracted-from'
    ),
    'expected NOI field -> source document extraction edge',
  )
  assert.ok(
    evidenceGraph.edges.some((edge) =>
      edge.from === 'package:approved-inputs' &&
      edge.to === noiFieldNodeId &&
      edge.relation === 'documents'
    ),
    'expected package approved-inputs section -> NOI field edge',
  )
  assert.ok(
    evidenceGraph.nodes.some((node) => node.kind === 'data-gap' && node.summary === 'provenance unavailable'),
    'expected explicit data-gap nodes for package gaps without provenance',
  )
  assert.ok(quickPackage.markdown.includes('## Evidence Chain'))
  assert.ok(
    quickPackage.markdown.includes(`source document -> approved input: ${noiInput.sourceRef.fileName} -> ${noiInput.label} (${noiInput.path})`),
    'expected the rendered evidence-chain row to cite the actual NOI source document and approved input',
  )

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

  // P5: content-aware classification. A file NAMED like a T12 ("operating-statement.csv")
  // whose CONTENT is a rent roll must be routed by content to rent_roll — not silently
  // dropped into the T12 parser. Genuine T12 / offering-memo content must NOT be over-ridden.
  const misnamedRentRoll = [
    'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status',
    '101,1BR/1BA,720,1650,1575,Occupied',
    '102,1BR/1BA,720,1650,0,Vacant',
    '201,2BR/2BA,1050,2150,2025,Occupied',
  ].join('\n')
  const misnamed = saveSourceDocument(context, dealId, {
    fileName: 'operating-statement.csv',
    mime: 'text/csv',
    contentBase64: Buffer.from(misnamedRentRoll, 'utf8').toString('base64'),
  })
  assert.equal(misnamed.document.type, 'rent_roll', 'rent-roll content must override a T12-ish filename')

  const realT12 = [
    'Line Item,T12 Total',
    'Effective Gross Income,2360000',
    'Total Operating Expenses,1210000',
    'Net Operating Income,1150000',
  ].join('\n')
  const t12Doc = saveSourceDocument(context, dealId, {
    fileName: 't12-2025.csv',
    mime: 'text/csv',
    contentBase64: Buffer.from(realT12, 'utf8').toString('base64'),
  })
  assert.equal(t12Doc.document.type, 't12', 'genuine T12 content must stay t12')

  const omDoc = saveSourceDocument(context, dealId, {
    fileName: 'offering-memo.md',
    mime: 'text/markdown',
    contentBase64: Buffer.from('# Offering Memorandum\nStabilized 200-unit asset. Asking price 28,000,000.', 'utf8').toString('base64'),
  })
  assert.equal(omDoc.document.type, 'offering_memo', 'offering memo must not be mis-overridden by the content sniff')

  // =====================================================================================
  // I2b: auto-apply trusted fields by default (the default flip).
  // A "fresh" deal whose source-backed fields are unset (so extracted values do NOT
  // conflict). On extraction, trusted reads (no conflict, confidence >= threshold, no
  // validation issues, valid sourceRef, source-backed path) AUTO-APPLY into the deal with
  // full provenance + an `auto-apply` audit entry. Reads with validation issues (non-
  // source-backed paths) stay candidates. A separately-seeded CONFLICTING field stays a
  // candidate too — proving the credibility gate is concentrated on flagged values, not
  // removed.
  // =====================================================================================
  const autoDealId = 'test-auto-apply'
  const autoProperty = { ...baseDeal.property }
  // Leave unitMix + occupancy unset so the rent roll's reads land cleanly (no conflict),
  // but SEED totalUnits to a different value so that one read conflicts and is held back.
  delete autoProperty.unitMix
  autoProperty.totalUnits = 7
  const autoFinancials = { ...baseDeal.financials }
  delete autoFinancials.inPlaceOccupancy
  const autoDeal = {
    ...baseDeal,
    dealId: autoDealId,
    dealName: 'Auto Apply Test',
    property: autoProperty,
    financials: autoFinancials,
  }
  saveUserDeal(context, { deal: autoDeal, mode: 'draft' })
  const autoDoc = saveSourceDocument(context, autoDealId, fixturePayload('rent-roll-basic.xlsx')).document
  const autoResult = extractSourceDocument(context, autoDealId, autoDoc.documentId)

  // Trusted, non-conflicting fields auto-applied; the seeded conflict + validation-issue
  // fields did NOT.
  assert.ok(Array.isArray(autoResult.extraction.autoAppliedPaths))
  assert.ok(
    autoResult.extraction.autoAppliedPaths.includes('property.unitMix.types'),
    'trusted unit-mix read (conf 0.84, no conflict) should auto-apply',
  )
  assert.ok(
    autoResult.extraction.autoAppliedPaths.includes('financials.inPlaceOccupancy'),
    'trusted occupancy read (conf 0.78, no conflict) should auto-apply',
  )
  assert.ok(
    !autoResult.extraction.autoAppliedPaths.includes('property.totalUnits'),
    'conflicting total-units read must NOT auto-apply (seeded 7 vs extracted 3)',
  )
  assert.ok(
    !autoResult.extraction.autoAppliedPaths.includes('financials.grossPotentialRentAnnual'),
    'a read with validation issues (non source-backed path) must NOT auto-apply',
  )
  // Document flips to applied because at least one field was auto-applied.
  assert.equal(autoResult.document.status, 'applied')

  // The auto-applied value is actually written into the deal record: getSourceExtraction
  // recomputes currentValue against the live deal, so a non-conflicting applied field means
  // the deal now holds the extracted value.
  const autoWorkspaceExtraction = getSourceExtraction(context, autoDealId, autoDoc.documentId)
  const autoOccupancy = autoWorkspaceExtraction.fields.find((field) => field.path === 'financials.inPlaceOccupancy')
  assert.equal(autoOccupancy.reviewStatus, 'applied', 'auto-applied occupancy is marked applied')
  assert.equal(autoOccupancy.currentValue, autoOccupancy.value, 'deal now holds the auto-applied value')
  // currentValue now equals the applied value (so it no longer registers as a conflict).
  assert.equal(autoOccupancy.conflict, false)

  // Conflicting field stays a resolvable candidate, and the existing manual apply path
  // still works on it (gate preserved): apply it with conflict confirmation.
  const autoTotalUnits = autoWorkspaceExtraction.fields.find((field) => field.path === 'property.totalUnits')
  assert.equal(autoTotalUnits.reviewStatus, 'candidate', 'conflicting field remains a candidate')
  assert.equal(autoTotalUnits.conflict, true)
  const autoManual = applySourceExtraction(context, autoDealId, autoDoc.documentId, {
    fieldIds: [autoTotalUnits.fieldId],
    confirmConflictReview: true,
  })
  assert.equal(autoManual.deal.deal.property.totalUnits, 3, 'manual apply still resolves the flagged conflict')

  // Provenance + audit retained for the auto-applied fields.
  const autoApproved = autoManual.approvedFields.fields
  const approvedOccupancy = autoApproved.find((field) => field.path === 'financials.inPlaceOccupancy')
  assert.ok(approvedOccupancy, 'auto-applied occupancy is persisted in the approved-fields manifest')
  assert.ok(approvedOccupancy.sourceRef, 'auto-applied field retains its parser sourceRef (provenance)')
  assert.equal(approvedOccupancy.sourceRef.documentId, autoDoc.documentId)
  assert.equal(approvedOccupancy.provenance, 'parser', 'auto-applied field is parser-originated')
  const occupancyHistory = getFieldDecisionHistory(context, autoDealId, 'financials.inPlaceOccupancy')
  const occupancyAutoDecision = occupancyHistory.find((entry) => entry.action === 'auto-apply')
  assert.ok(occupancyAutoDecision, 'auto-apply decision recorded in the audit trail')
  assert.equal(occupancyAutoDecision.reviewStatus, 'applied')
  assert.ok(typeof occupancyAutoDecision.decisionId === 'string' && occupancyAutoDecision.decisionId.length > 0)
  // The conflicting field's manual resolution recorded a separate `apply` (not auto-apply).
  const autoUnitsHistory = getFieldDecisionHistory(context, autoDealId, 'property.totalUnits')
  assert.ok(
    autoUnitsHistory.some((entry) => entry.action === 'apply'),
    'conflicting field resolved via manual apply records an apply decision',
  )
  assert.ok(
    !autoUnitsHistory.some((entry) => entry.action === 'auto-apply'),
    'conflicting field never received an auto-apply decision',
  )

  // I2b: unit-level coverage of the trust gate across every exclusion branch (deterministic,
  // no parser dependency). Build a fully-trusted base field, then flip one signal at a time.
  const trustDocId = 'doc-trust'
  const trustExtraction = {
    documentId: trustDocId,
    status: 'extracted',
    extractedAt: new Date().toISOString(),
    parserId: 'p1',
    parserVersion: 'v1',
    sourceHash: 'hash1',
    fields: [],
    metrics: {},
    notes: [],
  }
  const goodSourceRef = { documentId: trustDocId, fileName: 'f.xlsx', parserId: 'p1', parserVersion: 'v1', fileHash: 'hash1' }
  const trustedField = {
    fieldId: 'fid1',
    path: 'property.totalUnits',
    label: 'Total Units',
    value: 100,
    valueType: 'integer',
    confidence: AUTO_APPLY_MIN_CONFIDENCE,
    source: 'rent_roll',
    sourceRef: goodSourceRef,
    conflict: false,
    validationIssues: [],
  }
  assert.equal(isAutoApplyTrusted(trustedField, trustExtraction, trustDocId), true, 'clean field at the threshold is trusted')
  assert.equal(
    isAutoApplyTrusted({ ...trustedField, conflict: true }, trustExtraction, trustDocId),
    false,
    'conflicting field is not trusted',
  )
  assert.equal(
    isAutoApplyTrusted({ ...trustedField, confidence: AUTO_APPLY_MIN_CONFIDENCE - 0.01 }, trustExtraction, trustDocId),
    false,
    'below-threshold confidence is not trusted',
  )
  assert.equal(
    isAutoApplyTrusted({ ...trustedField, validationIssues: ['bad path'] }, trustExtraction, trustDocId),
    false,
    'field with validation issues is not trusted',
  )
  assert.equal(
    isAutoApplyTrusted({ ...trustedField, path: 'financials.grossPotentialRentAnnual' }, trustExtraction, trustDocId),
    false,
    'non source-backed path is not trusted',
  )
  assert.equal(
    isAutoApplyTrusted({ ...trustedField, fieldId: '' }, trustExtraction, trustDocId),
    false,
    'field without a parser fieldId is not trusted',
  )
  assert.equal(
    isAutoApplyTrusted({ ...trustedField, sourceRef: { ...goodSourceRef, fileHash: 'other' } }, trustExtraction, trustDocId),
    false,
    'mismatched sourceRef hash is not trusted',
  )

  // =====================================================================================
  // I1: inline operator override (applyOperatorFieldEdit).
  // Edits a deal field directly with full persistence: previousValue captured, value
  // written, operator-edit audit recorded, provenance marked operator-edited, deal still
  // validates. Invalid (non source-backed) paths are rejected.
  // =====================================================================================
  const editDealId = 'test-operator-edit'
  const editDeal = {
    ...baseDeal,
    dealId: editDealId,
    dealName: 'Operator Edit Test',
    property: { ...baseDeal.property, totalUnits: 200 },
  }
  saveUserDeal(context, { deal: editDeal, mode: 'draft' })

  const edit = applyOperatorFieldEdit(context, editDealId, {
    path: 'property.totalUnits',
    value: 184,
    label: 'Total Units',
  })
  // Value persisted into the deal record.
  assert.equal(edit.deal.deal.property.totalUnits, 184, 'operator edit writes the new value into the deal')
  // previousValue captured from the prior deal state.
  assert.equal(edit.field.previousValue, 200, 'operator edit captures the prior value as previousValue')
  assert.equal(edit.field.value, 184)
  assert.equal(edit.field.provenance, 'operator-edited', 'edited field is marked operator-originated')
  assert.equal(edit.field.sourceRef, undefined, 'operator edit carries no parser sourceRef')
  // Deal still validates (draft did not block).
  assert.equal(edit.validation.valid, true, 'operator edit keeps the deal valid')

  // Edit is persisted in the approved-fields manifest, keyed by path.
  const editApproved = edit.approvedFields.fields.find((field) => field.path === 'property.totalUnits')
  assert.ok(editApproved, 'operator edit is recorded in the approved-fields manifest')
  assert.equal(editApproved.value, 184)
  assert.equal(editApproved.provenance, 'operator-edited')

  // operator-edit audit entry recorded in the same decision history as parser actions.
  const editHistory = getFieldDecisionHistory(context, editDealId, 'property.totalUnits')
  const editDecision = editHistory.find((entry) => entry.action === 'operator-edit')
  assert.ok(editDecision, 'operator-edit decision recorded in the audit trail')
  assert.equal(editDecision.value, 184)
  assert.equal(editDecision.previousValue, 200)
  assert.equal(editDecision.reviewStatus, 'applied')
  assert.ok(typeof editDecision.decisionId === 'string' && editDecision.decisionId.length > 0)

  // The persisted workspace reflects the edited value (round-trips through getDealRecord).
  const reEdit = applyOperatorFieldEdit(context, editDealId, {
    path: 'property.totalUnits',
    value: 190,
  })
  assert.equal(reEdit.field.previousValue, 184, 're-edit captures the previously-edited value')
  assert.equal(reEdit.deal.deal.property.totalUnits, 190)

  // Invalid (non source-backed) path is rejected and does not mutate the deal.
  assert.throws(
    () => applyOperatorFieldEdit(context, editDealId, { path: 'property.notARealField', value: 1 }),
    /not editable/i,
    'operator edit must reject paths outside the source-backed allow-list',
  )
  const afterReject = getFieldDecisionHistory(context, editDealId, 'property.notARealField')
  assert.equal(afterReject.length, 0, 'rejected edit records no audit entry')

  // Missing value / missing path are rejected.
  assert.throws(
    () => applyOperatorFieldEdit(context, editDealId, { path: 'property.totalUnits' }),
    /Missing required field: value/i,
    'operator edit requires a value',
  )
  assert.throws(
    () => applyOperatorFieldEdit(context, editDealId, { value: 1 }),
    /Missing required field: path/i,
    'operator edit requires a path',
  )

  console.log('[workspace-service-test] PASS')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
