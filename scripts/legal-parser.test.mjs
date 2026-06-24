// Legal-document parser test (PSA / title commitment / estoppel).
//
// Verifies the lean legal extraction added to parse_pdf.py and the doc-type
// routing in parser-service.ts: each fixture must yield source-backed candidate
// fields with page-level provenance, ready for the operator review gate.
//
// Run:
//   cd dashboard && npm exec tsx ../scripts/legal-parser.test.mjs
//
// Requires the local Python parser venv (scripts/requirements.txt). If it is
// missing the parser returns 'parser-unavailable' and the assertions below fail
// loudly -- that is intentional, so a broken parser environment is not silently
// treated as a pass.

import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocumentParser } from '../dashboard/server/parser-service.ts'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturesRoot = resolve(projectRoot, 'fixtures', 'parsers')

function parsePdf(fileName, type) {
  return runDocumentParser({
    documentId: fileName.replace(/\W+/g, '-'),
    fileName,
    filePath: resolve(fixturesRoot, fileName),
    mime: 'application/pdf',
    type,
    projectRoot,
  })
}

function parseText(fileName, type) {
  return runDocumentParser({
    documentId: fileName.replace(/\W+/g, '-'),
    fileName,
    filePath: resolve(fixturesRoot, fileName),
    mime: 'text/markdown',
    type,
    projectRoot,
  })
}

function fieldByPath(preview, path) {
  return preview.fields.find((entry) => entry.path === path)
}

function assertExtracted(preview, label) {
  assert.equal(
    preview.status,
    'extracted',
    `${label}: expected status "extracted" but got "${preview.status}" (${preview.error ?? 'no error'})`,
  )
}

// Every legal field must carry review provenance: a 1-based page, a file hash,
// and a candidate review status (nothing is applied to the deal without the
// operator's approval).
function assertProvenance(field, label) {
  assert.ok(field, `${label}: field is missing`)
  assert.equal(field.reviewStatus, 'candidate', `${label}: expected candidate reviewStatus`)
  assert.equal(field.sourceRef?.location?.page, 1, `${label}: expected page-1 provenance`)
  assert.ok(field.sourceRef?.fileHash, `${label}: expected a source file hash`)
  assert.ok(typeof field.confidence === 'number' && field.confidence > 0, `${label}: expected a positive confidence`)
}

const failures = []
function check(name, fn) {
  try {
    fn()
    console.log(`  PASS ${name}`)
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
    console.error(`  FAIL ${name}: ${error.message}`)
  }
}

// --- PSA -------------------------------------------------------------------
check('psa.pdf extracts headline economic + timing terms', () => {
  const preview = parsePdf('psa.pdf', 'psa')
  assertExtracted(preview, 'psa')

  const price = fieldByPath(preview, 'legal.psa.purchasePrice')
  assertProvenance(price, 'psa.purchasePrice')
  assert.equal(price.value, 42500000, 'psa.purchasePrice value')
  assert.equal(price.unit, 'usd', 'psa.purchasePrice unit')

  assert.equal(fieldByPath(preview, 'legal.psa.earnestMoneyDeposit')?.value, 1250000, 'psa.earnestMoneyDeposit')
  assert.equal(fieldByPath(preview, 'legal.psa.dueDiligencePeriodDays')?.value, 45, 'psa.dueDiligencePeriodDays')
  assert.equal(fieldByPath(preview, 'legal.psa.closingDate')?.value, 'September 30, 2026', 'psa.closingDate')
  assert.equal(fieldByPath(preview, 'legal.psa.financingContingency')?.value, 'None', 'psa.financingContingency')
})

// --- Title commitment ------------------------------------------------------
// Uses type 'title' (what classifyByFileName emits) to exercise the
// title -> title_commitment routing in parser-service.ts.
check('title-commitment.pdf extracts effective date, amount, and Schedule B', () => {
  const preview = parsePdf('title-commitment.pdf', 'title')
  assertExtracted(preview, 'title')

  assert.equal(fieldByPath(preview, 'legal.title.effectiveDate')?.value, 'June 1, 2026', 'title.effectiveDate')
  assert.equal(fieldByPath(preview, 'legal.title.commitmentAmount')?.value, 42500000, 'title.commitmentAmount')

  const exceptions = fieldByPath(preview, 'legal.title.scheduleBExceptions')
  assertProvenance(exceptions, 'title.scheduleBExceptions')
  assert.ok(Array.isArray(exceptions.value), 'title.scheduleBExceptions should be an array')
  assert.equal(exceptions.value.length, 4, 'expected 4 Schedule B exceptions')
  assert.equal(exceptions.value[0].number, 1, 'first exception number')
  assert.match(exceptions.value[2].description, /Deed of Trust/, 'third exception describes the lien')
})

// --- Estoppel --------------------------------------------------------------
check('estoppel.pdf extracts per-tenant lease terms', () => {
  const preview = parsePdf('estoppel.pdf', 'estoppel')
  assertExtracted(preview, 'estoppel')

  const tenant = fieldByPath(preview, 'legal.estoppel.tenant')
  assertProvenance(tenant, 'estoppel.tenant')
  assert.equal(tenant.value, 'Jane Doe', 'estoppel.tenant')
  assert.equal(fieldByPath(preview, 'legal.estoppel.unit')?.value, '204', 'estoppel.unit')
  assert.equal(fieldByPath(preview, 'legal.estoppel.monthlyRent')?.value, 1850, 'estoppel.monthlyRent')
  assert.equal(fieldByPath(preview, 'legal.estoppel.leaseStartDate')?.value, 'March 1, 2025', 'estoppel.leaseStartDate')
  assert.equal(fieldByPath(preview, 'legal.estoppel.leaseEndDate')?.value, 'February 28, 2026', 'estoppel.leaseEndDate')
  assert.equal(fieldByPath(preview, 'legal.estoppel.securityDeposit')?.value, 1850, 'estoppel.securityDeposit')
})

// --- Legal diligence checklist -------------------------------------------
check('legal-diligence-checklist.md extracts reviewable checklist rows without headings', () => {
  const preview = parseText('legal-diligence-checklist.md', 'legal')
  assertExtracted(preview, 'legal checklist')
  assert.equal(preview.metrics?.reviewOnly, true, 'checklist candidates must be review-only')
  assert.equal(preview.metrics?.checklistCandidateCount, 6, 'expected 6 checklist rows')
  assert.equal(preview.fields.length, 6, 'markdown heading must not become a checklist item')

  const items = preview.fields.map((field) => field.value)
  assert.deepEqual(
    items.map((item) => item.item),
    [
      'PSA amendment package',
      'Title commitment and exception documents',
      'ALTA survey update',
      'Phase I ESA reliance letter',
      'Insurance binder review',
      'SNDA package',
    ],
  )
  assert.deepEqual(items.map((item) => item.status), ['received', 'missing', 'open', 'received', 'open', 'missing'])

  const titleCommitment = preview.fields[1]
  assert.equal(titleCommitment.path, 'diligence.checklistItems')
  assert.equal(titleCommitment.reviewStatus, 'candidate')
  assert.equal(titleCommitment.value.category, 'title')
  assert.equal(titleCommitment.value.dueDate, '2026-07-03')
  assert.equal(titleCommitment.value.responsibleParty, 'Title company')
  assert.equal(titleCommitment.sourceRef?.location?.line, 4, 'checklist row keeps line provenance')
  assert.ok(titleCommitment.sourceRef?.fileHash, 'checklist row keeps file hash provenance')
  assert.match(titleCommitment.sourceRef?.raw ?? '', /Title commitment/)

  const sndaPackage = preview.fields[5]
  assert.equal(sndaPackage.value.status, 'missing', '"not received" must map to missing, not received')
  assert.equal(sndaPackage.value.category, 'legal')
  assert.equal(sndaPackage.value.dueDate, '2026-07-12')
  assert.equal(sndaPackage.value.responsibleParty, 'Lender counsel')
})

// --- Regression: a non-legal type still uses the headline matchers ----------
check('offering-memo-text.pdf still extracts headline acquisition metrics', () => {
  const preview = parsePdf('offering-memo-text.pdf', 'offering_memo')
  assertExtracted(preview, 'offering_memo')
  assert.ok(fieldByPath(preview, 'financials.askingPrice'), 'offering_memo should still extract askingPrice')
  assert.equal(fieldByPath(preview, 'legal.psa.purchasePrice'), undefined, 'offering_memo must not emit legal fields')
})

if (failures.length > 0) {
  console.error(`\n[legal-parser-test] FAIL — ${failures.length} issue(s).`)
  process.exit(1)
}
console.log('\n[legal-parser-test] PASS — psa / title / estoppel source-backed extraction with provenance.')
