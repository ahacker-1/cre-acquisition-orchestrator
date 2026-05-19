import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveUserDeal } from '../dashboard/server/deal-service.ts'
import {
  applySourceExtraction,
  evaluateLaunchReadiness,
  extractSourceDocument,
  getSourceExtraction,
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

  console.log('[workspace-service-test] PASS')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
