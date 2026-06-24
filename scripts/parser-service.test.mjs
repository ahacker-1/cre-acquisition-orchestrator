import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileHash, runDocumentParser } from '../dashboard/server/parser-service.ts'

// The oversized-CSV fixture is generated at test time, not committed (a ~35 MB
// file does not belong in git). Any file exceeding the parser's 25 MB cap
// exercises the same byte-size guard; we write ~27 MB of valid rent-roll rows.
export function ensureOversizedCsv(filePath) {
  if (existsSync(filePath) && statSync(filePath).size > 26 * 1024 * 1024) return
  const header = 'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status\n'
  const row = '101,1BR/1BA,720,1650,1575,Occupied\n'
  const target = 27 * 1024 * 1024
  const parts = [header]
  for (let size = header.length; size < target; size += row.length) parts.push(row)
  writeFileSync(filePath, parts.join(''))
}

function writeGeneratedFixture(filePath, contents) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents)
}

function ensureTruncatedInspectorCsv(filePath) {
  if (existsSync(filePath)) return
  const rows = ['Unit,Unit Type,SqFt,Market Rent,Current Rent,Status']
  for (let index = 1; index <= 300; index += 1) {
    rows.push(`${100 + index},1BR/1BA,700,${1700 + index},${1600 + index},Occupied`)
  }
  writeGeneratedFixture(filePath, rows.join('\n'))
}

function ensureMalformedInspectorCsv(filePath) {
  if (existsSync(filePath)) return
  writeGeneratedFixture(
    filePath,
    [
      'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status',
      '101,1BR/1BA,700,1700,1600,Occupied',
      '102,1BR/1BA,710,1710,,Occupied',
    ].join('\n'),
  )
}

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturesRoot = resolve(projectRoot, 'fixtures', 'parsers')
const generatedFixturesRoot = resolve(projectRoot, 'dashboard', 'test-results', 'parser-fixtures')
const OCR_NEXT_ACTION = 'Run the built-in local OCR bridge or upload OCR output, then review candidates before applying any fields.'

function parseXlsx(fileName, type) {
  return runDocumentParser({
    documentId: fileName.replace(/\W+/g, '-'),
    fileName,
    filePath: resolve(fixturesRoot, fileName),
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    type,
    projectRoot,
  })
}

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

const MIME_BY_EXT = {
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
}

// Parse a fixture from an arbitrary directory (used to exercise the adversarial
// real-world pile in addition to the curated fixtures/parsers set).
function parseFile(dir, fileName, type) {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  return runDocumentParser({
    documentId: fileName.replace(/\W+/g, '-'),
    fileName,
    filePath: resolve(dir, fileName),
    mime: MIME_BY_EXT[extension] || 'application/octet-stream',
    type,
    projectRoot,
    allowedBasePath: projectRoot,
  })
}

function parseCsv(fileName, type) {
  return parseFile(fixturesRoot, fileName, type)
}

function parseMarkdown(fileName, type = 'other') {
  return parseFile(fixturesRoot, fileName, type)
}

const realWorldPileRoot = resolve(projectRoot, 'fixtures', 'real-world-pile')

function unitMixByType(preview) {
  const mix = preview.fields.find((field) => field.path === 'property.unitMix.types')?.value
  assert.ok(Array.isArray(mix), `expected unit mix array in ${preview.documentId}`)
  const byType = new Map()
  for (const bucket of mix) byType.set(bucket.type, bucket)
  return byType
}

function fieldByPath(preview, path) {
  const match = preview.fields.find((field) => field.path === path)
  assert.ok(match, `expected field ${path} in ${preview.documentId}`)
  return match
}

function assertUploadedInspector(preview, columnPattern, minRows = 1) {
  assert.ok(preview.uploadedData, `expected uploadedData inspector payload in ${preview.documentId}`)
  assert.equal(preview.uploadedData.tableCount, 1)
  assert.ok(preview.uploadedData.rowCount >= minRows, `expected at least ${minRows} uploaded rows in ${preview.documentId}`)
  const table = preview.uploadedData.tables[0]
  assert.ok(table, `expected first uploaded-data table in ${preview.documentId}`)
  assert.ok(table.rows.length >= minRows, `expected preview rows in ${preview.documentId}`)
  assert.ok(
    table.columns.some((column) => columnPattern.test(column.name)),
    `expected uploaded column matching ${columnPattern} in ${preview.documentId}`,
  )
  assert.ok(
    table.columns.every((column) => typeof column.fillRate === 'number' && column.fillRate >= 0 && column.fillRate <= 1),
    `expected valid column fill rates in ${preview.documentId}`,
  )
  return table
}

function assertCandidateProvenance(preview, path, expectedSheet) {
  const match = fieldByPath(preview, path)
  assert.equal(match.reviewStatus, 'candidate')
  assert.equal(match.sourceRef.fileName, preview.documentId.replace(/-xlsx$/, '.xlsx').replace(/-/g, '-'))
  assert.ok(match.sourceRef.fileHash)
  assert.ok(match.sourceRef.location?.sheet)
  assert.equal(match.sourceRef.location.sheet, expectedSheet)
  assert.ok(match.sourceRef.location?.row)
  assert.ok(match.sourceRef.location?.column)
  assert.ok(match.confidence > 0 && match.confidence <= 1)
  return match
}

const rentRoll = parseXlsx('rent-roll-basic.xlsx', 'rent_roll')

assert.equal(
  fileHash(resolve(fixturesRoot, 'rent-roll-basic.xlsx')),
  createHash('sha256').update(readFileSync(resolve(fixturesRoot, 'rent-roll-basic.xlsx'))).digest('hex'),
  'chunked fileHash must match the canonical sha256 digest',
)

assert.equal(rentRoll.status, 'extracted')
assert.equal(rentRoll.parserId, 'excel-rent-roll-parser')
assert.equal(rentRoll.fields.find((field) => field.path === 'property.totalUnits')?.value, 3)
assert.equal(rentRoll.fields.find((field) => field.path === 'financials.inPlaceOccupancy')?.value, 0.6667)
assert.ok(rentRoll.fields.find((field) => field.path === 'property.unitMix.types')?.sourceRef.location?.sheet)
assert.ok(rentRoll.fields.every((field) => field.reviewStatus === 'candidate'))
const rentRollInspector = assertUploadedInspector(rentRoll, /unit/i, 3)
assert.equal(rentRollInspector.rowCount, 3)
assert.ok(rentRollInspector.columns.some((column) => /market rent/i.test(column.name)))

const t12 = parseXlsx('t12-basic.xlsx', 't12')

assert.equal(t12.status, 'extracted')
assert.equal(t12.parserId, 'excel-t12-parser')
assert.equal(t12.fields.find((field) => field.path === 'financials.trailingT12Revenue')?.value, 1240000)
assert.equal(t12.fields.find((field) => field.path === 'financials.trailingT12Expenses')?.value, 510000)
assert.equal(t12.fields.find((field) => field.path === 'financials.currentNOI')?.value, 730000)
assert.ok(t12.fields.find((field) => field.path === 'financials.currentNOI')?.sourceRef.location?.row)
const t12Inspector = assertUploadedInspector(t12, /line|account|description/i, 3)
assert.ok(t12Inspector.columns.some((column) => /total|annual|t12/i.test(column.name)))

const alternateHeaders = parseXlsx('rent-roll-alternate-headers.xlsx', 'rent_roll')

assert.equal(alternateHeaders.status, 'extracted')
assert.equal(fieldByPath(alternateHeaders, 'property.totalUnits').value, 4)
assert.equal(fieldByPath(alternateHeaders, 'financials.inPlaceOccupancy').value, 0.75)
assert.equal(fieldByPath(alternateHeaders, 'financials.grossPotentialRentAnnual').value, 83400)
assertCandidateProvenance(alternateHeaders, 'property.totalUnits', 'Alt Headers')
assertCandidateProvenance(alternateHeaders, 'financials.inPlaceRentAnnual', 'Alt Headers')

const totalsAndBlanks = parseXlsx('rent-roll-totals-and-blanks.xlsx', 'rent_roll')

assert.equal(totalsAndBlanks.status, 'extracted')
assert.equal(fieldByPath(totalsAndBlanks, 'property.totalUnits').value, 4)
assert.equal(fieldByPath(totalsAndBlanks, 'financials.inPlaceOccupancy').value, 0.75)
assert.equal(fieldByPath(totalsAndBlanks, 'financials.grossPotentialRentAnnual').value, 92400)
assert.ok(totalsAndBlanks.notes.some((note) => note.includes('Skipped 1 total/subtotal/header row')))
assert.ok(totalsAndBlanks.notes.some((note) => note.includes('Skipped 1 blank row')))
assertCandidateProvenance(totalsAndBlanks, 'property.unitMix.types', 'Rent Roll')

const occupancyConventions = parseXlsx('rent-roll-occupancy-conventions.xlsx', 'rent_roll')

assert.equal(occupancyConventions.status, 'extracted')
assert.equal(fieldByPath(occupancyConventions, 'property.totalUnits').value, 4)
assert.equal(fieldByPath(occupancyConventions, 'financials.inPlaceOccupancy').value, 0.75)
assert.ok(occupancyConventions.notes.some((note) => note.includes("Ambiguous occupancy status 'Notice'")))
assert.ok(fieldByPath(occupancyConventions, 'financials.inPlaceOccupancy').confidence < 0.78)
assertCandidateProvenance(occupancyConventions, 'financials.inPlaceOccupancy', 'Occupancy')

const messyRentRoll = parseXlsx('rent-roll-messy-realistic.xlsx', 'rent_roll')

assert.equal(messyRentRoll.status, 'extracted')
assert.equal(fieldByPath(messyRentRoll, 'property.totalUnits').value, 7)
assert.equal(fieldByPath(messyRentRoll, 'financials.inPlaceOccupancy').value, 0.7143)
assert.equal(fieldByPath(messyRentRoll, 'financials.grossPotentialRentAnnual').value, 183600)
assert.equal(fieldByPath(messyRentRoll, 'financials.inPlaceRentAnnual').value, 131700)
assert.ok(messyRentRoll.notes.some((note) => note.includes("Ambiguous occupancy status 'MTM'")))
assert.ok(messyRentRoll.notes.some((note) => note.includes("Ambiguous occupancy status 'Notice'")))
assert.ok(messyRentRoll.notes.some((note) => note.includes('Skipped 1 total/subtotal/header row')))
assertCandidateProvenance(messyRentRoll, 'property.totalUnits', 'RR Export')
assertCandidateProvenance(messyRentRoll, 'financials.inPlaceOccupancy', 'RR Export')

const multiSheetT12 = parseXlsx('t12-multi-sheet.xlsx', 't12')

assert.equal(multiSheetT12.status, 'extracted')
assert.equal(fieldByPath(multiSheetT12, 'financials.trailingT12Revenue').value, 1560000)
assert.equal(fieldByPath(multiSheetT12, 'financials.trailingT12Expenses').value, 620000)
assert.equal(fieldByPath(multiSheetT12, 'financials.currentNOI').value, 940000)
assertCandidateProvenance(multiSheetT12, 'financials.trailingT12Revenue', 'Trailing 12')
assertCandidateProvenance(multiSheetT12, 'financials.currentNOI', 'Trailing 12')

const messyT12 = parseXlsx('t12-messy-realistic.xlsx', 't12')

assert.equal(messyT12.status, 'extracted')
assert.equal(fieldByPath(messyT12, 'financials.trailingT12Revenue').value, 156600)
assert.equal(fieldByPath(messyT12, 'financials.trailingT12Expenses').value, 61200)
assert.equal(fieldByPath(messyT12, 'financials.currentNOI').value, 95400)
assertCandidateProvenance(messyT12, 'financials.trailingT12Revenue', 'T12 - Owner Export')
assertCandidateProvenance(messyT12, 'financials.currentNOI', 'T12 - Owner Export')

// ---------------------------------------------------------------------------
// W10 - Merged-cell workbook handling
// ---------------------------------------------------------------------------

// A vertically merged unit-type column must forward-fill so units below the
// merged top-left value still inherit the correct unit type (instead of
// silently degrading to "Unknown").
const mergedLabelColumn = parseXlsx('rent-roll-merged-label-column.xlsx', 'rent_roll')

assert.equal(mergedLabelColumn.status, 'extracted')
assert.equal(fieldByPath(mergedLabelColumn, 'property.totalUnits').value, 4)
assert.equal(fieldByPath(mergedLabelColumn, 'financials.inPlaceOccupancy').value, 0.75)
assert.equal(fieldByPath(mergedLabelColumn, 'financials.grossPotentialRentAnnual').value, 92400)
assert.equal(fieldByPath(mergedLabelColumn, 'financials.inPlaceRentAnnual').value, 63300)
const mergedUnitMix = fieldByPath(mergedLabelColumn, 'property.unitMix.types').value
assert.ok(Array.isArray(mergedUnitMix))
// Forward-filled merged labels must yield exactly two known unit types and no
// "Unknown" bucket created by blanked merged cells.
assert.deepEqual(
  mergedUnitMix.map((bucket) => bucket.type).sort(),
  ['1BR/1BA', '2BR/2BA'],
)
assert.ok(mergedUnitMix.every((bucket) => bucket.type !== 'Unknown'))
assert.ok(mergedUnitMix.every((bucket) => bucket.count === 2))
assertCandidateProvenance(mergedLabelColumn, 'property.totalUnits', 'Merged Label')

// A header label merged across two rent columns is genuinely ambiguous after
// unmerge + forward-fill (two identically named columns). The parser must NOT
// silently mis-map; it must surface a candidate-review warning.
const mergedHeaders = parseXlsx('rent-roll-merged-headers.xlsx', 'rent_roll')

assert.equal(mergedHeaders.status, 'extracted')
assert.equal(fieldByPath(mergedHeaders, 'property.totalUnits').value, 4)
assert.ok(
  mergedHeaders.notes.some((note) => /merged|ambiguous|duplicate/i.test(note)),
  'expected a merged/ambiguous-column warning note for merged-header workbook',
)
// The ambiguity must lower confidence on the affected mapped fields (warning
// penalty applied) rather than reporting a clean high-confidence mapping.
assert.ok(fieldByPath(mergedHeaders, 'property.totalUnits').confidence < 0.9)

// ---------------------------------------------------------------------------
// W11 - Image-only workbook detection (needs OCR)
// ---------------------------------------------------------------------------

const imageOnly = parseXlsx('rent-roll-image-only.xlsx', 'rent_roll')

// Must not crash and must not silently produce empty/zero fields. It should be
// flagged unsupported with a clear needs-OCR note.
assert.equal(imageOnly.status, 'unsupported')
assert.equal(imageOnly.fields.length, 0)
assert.equal(imageOnly.metrics?.needsOcr, true)
assert.equal(imageOnly.metrics?.ocrReady, true)
assert.equal(imageOnly.metrics?.ocrBridge?.parser, 'local-ocr-optional')
assert.equal(imageOnly.metrics?.ocrBridge?.status, 'not-configured')
assert.equal(
  imageOnly.metrics?.ocrBridge?.nextAction,
  OCR_NEXT_ACTION,
)
assert.ok(
  imageOnly.notes.some((note) => /ocr/i.test(note)),
  'expected a needs-OCR note for image-only workbook',
)
assert.ok(
  imageOnly.notes.some((note) => /image/i.test(note)),
  'expected an image-detection note for image-only workbook',
)
assert.ok(!imageOnly.error || /ocr|image/i.test(imageOnly.error), 'image-only must not crash with a generic parse error')

// ---------------------------------------------------------------------------
// W40 - Expanded messy fixtures
// ---------------------------------------------------------------------------

// Trailing free-text notes rows after the table must NOT be counted as units.
const trailingNotes = parseXlsx('rent-roll-trailing-notes.xlsx', 'rent_roll')

assert.equal(trailingNotes.status, 'extracted')
assert.equal(fieldByPath(trailingNotes, 'property.totalUnits').value, 4)
assert.equal(fieldByPath(trailingNotes, 'financials.inPlaceOccupancy').value, 0.75)
assert.equal(fieldByPath(trailingNotes, 'financials.grossPotentialRentAnnual').value, 93600)
assert.equal(fieldByPath(trailingNotes, 'financials.inPlaceRentAnnual').value, 64800)
assertCandidateProvenance(trailingNotes, 'property.totalUnits', 'Trailing Notes')

// Currency symbols and thousands separators in rents/sqft must be parsed.
const currencySymbols = parseXlsx('rent-roll-currency-symbols.xlsx', 'rent_roll')

assert.equal(currencySymbols.status, 'extracted')
assert.equal(fieldByPath(currencySymbols, 'property.totalUnits').value, 4)
assert.equal(fieldByPath(currencySymbols, 'financials.inPlaceOccupancy').value, 0.75)
assert.equal(fieldByPath(currencySymbols, 'financials.grossPotentialRentAnnual').value, 93600)
assert.equal(fieldByPath(currencySymbols, 'financials.inPlaceRentAnnual').value, 71700)
assertCandidateProvenance(currencySymbols, 'financials.inPlaceRentAnnual', 'Currency')

// Per-building Subtotal rows AND a Grand Total row must all be excluded.
const subtotalRows = parseXlsx('rent-roll-subtotal-rows.xlsx', 'rent_roll')

assert.equal(subtotalRows.status, 'extracted')
assert.equal(fieldByPath(subtotalRows, 'property.totalUnits').value, 4)
assert.equal(fieldByPath(subtotalRows, 'financials.inPlaceOccupancy').value, 0.75)
assert.equal(fieldByPath(subtotalRows, 'financials.grossPotentialRentAnnual').value, 92400)
assert.ok(subtotalRows.notes.some((note) => /Skipped 3 total\/subtotal\/header row/.test(note)))
assertCandidateProvenance(subtotalRows, 'property.unitMix.types', 'Subtotals')

// T12 with alternate header synonyms (Description / Total OpEx / Trailing 12).
const t12Synonyms = parseXlsx('t12-synonym-headers.xlsx', 't12')

assert.equal(t12Synonyms.status, 'extracted')
assert.equal(fieldByPath(t12Synonyms, 'financials.trailingT12Revenue').value, 624000)
assert.equal(fieldByPath(t12Synonyms, 'financials.trailingT12Expenses').value, 252000)
assert.equal(fieldByPath(t12Synonyms, 'financials.currentNOI').value, 372000)
assertCandidateProvenance(t12Synonyms, 'financials.currentNOI', 'T12 Synonyms')

// T12 with currency-formatted text totals and a leading title banner row.
const t12Currency = parseXlsx('t12-currency-symbols.xlsx', 't12')

assert.equal(t12Currency.status, 'extracted')
assert.equal(fieldByPath(t12Currency, 'financials.trailingT12Revenue').value, 1248000)
assert.equal(fieldByPath(t12Currency, 'financials.trailingT12Expenses').value, 510000)
assert.equal(fieldByPath(t12Currency, 'financials.currentNOI').value, 738000)
assertCandidateProvenance(t12Currency, 'financials.trailingT12Revenue', 'T12 Currency')

// ---------------------------------------------------------------------------
// W20 - Text-based PDF extraction (real text layer -> candidate fields with
// page-level provenance)
// ---------------------------------------------------------------------------

const textPdf = parsePdf('offering-memo-text.pdf', 'offering_memo')

// A text-based PDF must produce real candidate fields, not the old blanket
// 'extraction-pending' stub.
assert.equal(textPdf.status, 'extracted')
assert.notEqual(textPdf.parserId, 'pdf-pending-parser')
assert.ok(textPdf.fields.length > 0, 'expected candidate fields from a text-based PDF')

// Headline metrics extracted from the text layer.
assert.equal(fieldByPath(textPdf, 'financials.askingPrice').value, 12500000)
assert.equal(fieldByPath(textPdf, 'property.totalUnits').value, 120)
assert.equal(fieldByPath(textPdf, 'property.yearBuilt').value, 1998)
assert.equal(fieldByPath(textPdf, 'financials.inPlaceOccupancy').value, 0.94)
assert.equal(fieldByPath(textPdf, 'financials.currentNOI').value, 845000)

// Every field is a candidate with per-field confidence in (0, 1].
assert.ok(textPdf.fields.every((field) => field.reviewStatus === 'candidate'))
assert.ok(textPdf.fields.every((field) => field.confidence > 0 && field.confidence <= 1))

// Page-level provenance: location.page must be populated, file hash preserved.
const askingPrice = fieldByPath(textPdf, 'financials.askingPrice')
assert.equal(askingPrice.sourceRef.location?.page, 1)
assert.ok(askingPrice.sourceRef.fileHash, 'expected file hash provenance on PDF field')
assert.equal(askingPrice.sourceRef.fileName, 'offering-memo-text.pdf')
assert.ok(askingPrice.sourceRef.raw, 'expected raw source snippet provenance on PDF field')
assert.ok(
  textPdf.fields.every((field) => typeof field.sourceRef.location?.page === 'number' && field.sourceRef.location.page >= 1),
  'expected every PDF candidate field to carry a 1-based page number',
)

// ---------------------------------------------------------------------------
// W21 - Scanned / image-only PDF OCR bridge.
// ---------------------------------------------------------------------------

const scannedPdf = parsePdf('scanned-rent-roll.pdf', 'rent_roll')

// Must not crash and must not silently produce empty/zero fields with an
// 'extracted' status. If OCR runs but cannot read supported fields, it degrades
// gracefully with explicit completed-no-fields OCR metadata.
assert.equal(scannedPdf.status, 'unsupported')
assert.equal(scannedPdf.fields.length, 0)
assert.equal(scannedPdf.metrics?.needsOcr, true)
assert.equal(scannedPdf.metrics?.ocrReady, true)
assert.equal(scannedPdf.metrics?.ocrBridge?.parser, 'local-ocr-optional')
assert.equal(scannedPdf.metrics?.ocrBridge?.status, 'completed-no-fields')
assert.equal(scannedPdf.metrics?.ocrBridge?.nextAction, OCR_NEXT_ACTION)
assert.equal(scannedPdf.metrics?.ocrProvenance?.ocrEngine, 'tesseract.js')
assert.ok(
  scannedPdf.notes.some((note) => /ocr/i.test(note)),
  'expected a needs-OCR note for image-only PDF',
)
assert.ok(
  !scannedPdf.error || /ocr|scan|image|supported fields/i.test(scannedPdf.error),
  'image-only PDF must not crash with a generic parse error',
)

const scannedOcrPdf = parsePdf('scanned-offering-memo-ocr.pdf', 'offering_memo')

// A true image-only PDF with readable text must run through local OCR and return
// normal source-backed review candidates with page provenance.
assert.equal(scannedOcrPdf.status, 'extracted')
assert.equal(scannedOcrPdf.parserId, 'pdf-local-ocr-parser')
assert.equal(scannedOcrPdf.metrics?.needsOcr, true)
assert.equal(scannedOcrPdf.metrics?.ocrBridge?.status, 'completed')
assert.equal(scannedOcrPdf.metrics?.ocrProvenance?.ocrEngine, 'tesseract.js')
assert.ok(scannedOcrPdf.metrics?.ocrProvenance?.averageConfidence >= 80)
assert.equal(fieldByPath(scannedOcrPdf, 'financials.askingPrice').value, 12500000)
assert.equal(fieldByPath(scannedOcrPdf, 'property.totalUnits').value, 120)
assert.equal(fieldByPath(scannedOcrPdf, 'financials.inPlaceOccupancy').value, 0.94)
assert.equal(fieldByPath(scannedOcrPdf, 'financials.currentNOI').value, 845000)
assert.ok(scannedOcrPdf.fields.every((field) => field.reviewStatus === 'candidate'))
assert.ok(scannedOcrPdf.fields.every((field) => field.sourceRef.location?.page === 1))
assert.ok(scannedOcrPdf.fields.every((field) => /OCR text/.test(field.sourceRef.location?.description || '')))
assert.ok(fieldByPath(scannedOcrPdf, 'financials.askingPrice').sourceRef.raw?.includes('Asking Price'))

// ---------------------------------------------------------------------------
// V3 - Legal diligence checklist text extraction.
// Checklist items are review-only candidates below the auto-apply confidence
// threshold and carry line-level provenance.
// ---------------------------------------------------------------------------

const legalChecklist = parseMarkdown('legal-diligence-checklist.md', 'legal')
assert.equal(legalChecklist.status, 'extracted')
assert.equal(legalChecklist.parserId, 'legal-diligence-checklist-parser')
assert.ok(legalChecklist.fields.length >= 3, 'expected at least 3 checklist item candidates')
assert.equal(legalChecklist.metrics?.checklistCandidateCount, legalChecklist.fields.length)
assert.equal(legalChecklist.metrics?.reviewOnly, true)
assert.ok(
  legalChecklist.fields.every((field) => field.path === 'diligence.checklistItems'),
  'all checklist candidates must use the review-only diligence.checklistItems path',
)
assert.ok(
  legalChecklist.fields.every((field) => field.reviewStatus === 'candidate' && field.confidence === 0.64),
  'checklist candidates must stay low-confidence review candidates',
)
const titleCommitment = legalChecklist.fields.find((field) => field.value?.item === 'Title commitment and exception documents')
assert.ok(titleCommitment, 'expected title commitment checklist candidate')
assert.equal(titleCommitment.value.status, 'missing')
assert.equal(titleCommitment.value.category, 'title')
assert.equal(titleCommitment.value.dueDate, '2026-07-03')
assert.equal(titleCommitment.value.responsibleParty, 'Title company')
assert.equal(titleCommitment.sourceRef.location?.line, 4)
assert.ok(titleCommitment.sourceRef.raw?.includes('Title commitment'))
const surveyUpdate = legalChecklist.fields.find((field) => field.value?.item === 'ALTA survey update')
assert.ok(surveyUpdate, 'expected ALTA survey checklist candidate')
assert.equal(surveyUpdate.value.status, 'open')
assert.equal(surveyUpdate.value.category, 'survey')

const t12TextWithInsurance = parseFile(realWorldPileRoot, 'operating-statement.csv', 't12')
assert.notEqual(
  t12TextWithInsurance.parserId,
  'legal-diligence-checklist-parser',
  'typed T12/rent-roll text must not be intercepted by checklist parsing',
)

// ---------------------------------------------------------------------------
// P1 - Excel per-unit-type in-place rent must average over OCCUPIED units only.
// A vacant unit with $0 contract rent must NOT deflate the in-place average for
// its unit type (numerator and denominator must be consistent). Market rent
// stays averaged over ALL units of the type.
// ---------------------------------------------------------------------------

const excelVacant = parseXlsx('rent-roll-merged-headers.xlsx', 'rent_roll')
assert.equal(excelVacant.status, 'extracted')
const excelMix = unitMixByType(excelVacant)
// 1BR/1BA: one occupied @ $1575, one vacant @ $0. In-place rent must be 1575
// (occupied-only), NOT 788 (the buggy $1575 / 2 deflation).
const excel1br = excelMix.get('1BR/1BA')
assert.ok(excel1br, 'expected a 1BR/1BA bucket')
assert.equal(excel1br.count, 2)
assert.equal(excel1br.occupiedCount, 1)
assert.equal(excel1br.inPlaceRent, 1575)
// Market rent stays averaged over all units of the type (asked regardless of
// occupancy): (1650 + 1650) / 2 = 1650.
assert.equal(excel1br.marketRent, 1650)
// 2BR/2BA: both occupied; average unchanged.
const excel2br = excelMix.get('2BR/2BA')
assert.equal(excel2br.inPlaceRent, 2188)

// ---------------------------------------------------------------------------
// P2 - Native CSV rent-roll path: same occupied-only in-place rent semantics.
// numberFromCell("0") returns 0; that 0 must be excluded from BOTH numerator and
// denominator of the in-place average. All-vacant types must report null.
// ---------------------------------------------------------------------------

const csvVacant = parseCsv('rent-roll-vacant-units.csv', 'rent_roll')
assert.equal(csvVacant.status, 'extracted')
const csvMix = unitMixByType(csvVacant)
// 1BR/1BA: occupied @ $1575 + vacant @ $0 -> 1575 (not 788).
const csv1br = csvMix.get('1BR/1BA')
assert.equal(csv1br.count, 2)
assert.equal(csv1br.inPlaceRent, 1575)
assert.equal(csv1br.marketRent, 1650)
// 2BR/2BA: occupied @ $2025 + vacant @ $0 -> 2025 (not the buggy 1013).
const csv2br = csvMix.get('2BR/2BA')
assert.equal(csv2br.count, 2)
assert.equal(csv2br.inPlaceRent, 2025)
assert.equal(csv2br.marketRent, 2250)
// 3BR/2BA: ALL units vacant -> in-place rent is null, NOT 0. Market rent
// (asked) is still reported.
const csv3br = csvMix.get('3BR/2BA')
assert.equal(csv3br.count, 2)
assert.equal(csv3br.inPlaceRent, null)
assert.equal(csv3br.marketRent, 2900)

// ---------------------------------------------------------------------------
// P3 - Native CSV path must guard against oversized in-process parsing. A file
// past the documented byte cap must degrade to parse_failed with a clear,
// non-leaking message instead of being loaded fully into memory.
// ---------------------------------------------------------------------------

ensureOversizedCsv(resolve(realWorldPileRoot, 'huge-rent-roll.csv'))
const hugeCsv = parseFile(realWorldPileRoot, 'huge-rent-roll.csv', 'rent_roll')
assert.equal(hugeCsv.status, 'parse_failed', 'oversized CSV must degrade to parse_failed, not extract')
assert.equal(hugeCsv.fields.length, 0)
assert.ok(
  hugeCsv.error && /too large|split|pre-process/i.test(hugeCsv.error),
  'expected an oversized-file message guiding the operator to split/pre-process',
)
// A normal small CSV is unaffected by the guard.
const smallCsv = parseCsv('rent-roll-vacant-units.csv', 'rent_roll')
assert.equal(smallCsv.status, 'extracted')

ensureTruncatedInspectorCsv(resolve(generatedFixturesRoot, 'inspector-truncated-rent-roll.csv'))
const truncatedInspectorCsv = parseFile(generatedFixturesRoot, 'inspector-truncated-rent-roll.csv', 'rent_roll')
assert.equal(truncatedInspectorCsv.status, 'extracted')
const truncatedInspectorTable = assertUploadedInspector(truncatedInspectorCsv, /market rent/i, 250)
assert.equal(truncatedInspectorTable.rowCount, 300)
assert.equal(truncatedInspectorTable.rows.length, 250)
assert.equal(truncatedInspectorTable.truncated, true)
assert.ok(
  truncatedInspectorCsv.uploadedData.issues.some((issue) => /shows 250 of 300/i.test(issue)),
  'expected uploaded-data truncation issue for large inspector previews',
)

ensureMalformedInspectorCsv(resolve(generatedFixturesRoot, 'inspector-malformed-rent-roll.csv'))
const malformedInspectorCsv = parseFile(generatedFixturesRoot, 'inspector-malformed-rent-roll.csv', 'rent_roll')
assert.equal(malformedInspectorCsv.status, 'parse_failed')
const malformedInspectorTable = assertUploadedInspector(malformedInspectorCsv, /current rent/i, 2)
assert.equal(malformedInspectorTable.rows.length, 2)
assert.equal(malformedInspectorTable.rows[1].values['Current Rent'], '')

// ---------------------------------------------------------------------------
// P4 - A genuinely corrupt .xlsx is a FILE problem, not an environment problem.
// It must surface as parse_failed (the file is bad), distinct from
// parser-unavailable (no interpreter/deps). No absolute local filesystem paths
// may leak in the error/notes.
// ---------------------------------------------------------------------------

const corrupt = parseFile(realWorldPileRoot, 'corrupt.xlsx', 'rent_roll')
assert.equal(corrupt.status, 'parse_failed', 'corrupt .xlsx must be parse_failed, not parser-unavailable')
assert.equal(corrupt.fields.length, 0)
const corruptText = `${corrupt.error || ''} ${(corrupt.notes || []).join(' ')}`
// No leaked absolute paths (drive-letter Windows paths, UNC, or interpreter exe).
assert.ok(!/[A-Za-z]:\\/.test(corruptText), `corrupt error must not leak a Windows path: ${corruptText}`)
assert.ok(!/\\\\[^\s]+\\/.test(corruptText), `corrupt error must not leak a UNC path: ${corruptText}`)
assert.ok(!/python(3|313)?\.exe/i.test(corruptText), `corrupt error must not leak an interpreter exe path: ${corruptText}`)
assert.ok(!/[/]usr[/]|[/]home[/]/.test(corruptText), `corrupt error must not leak a POSIX path: ${corruptText}`)
// The message should still describe a real file/parse problem.
assert.ok(corrupt.error && corrupt.error.trim().length > 0, 'corrupt parse_failed must carry an error message')

// ---------------------------------------------------------------------------
// W50 - Messy real-world fixtures for the in-process CSV/text parsers. Each
// asserts EITHER correct extraction OR a correctly-flagged review-gated result.
// The failure these prevent is a SILENT WRONG VALUE, so every expected number
// below was read from the actual parser output, never assumed.
//
// These fixtures are GENERATED at test time into the gitignored generated dir
// (the same pattern as the oversized / inspector CSVs above) so they do not add
// to the committed fixture count tracked by scripts/verify-doc-counts.js.
// ---------------------------------------------------------------------------

const MESSY_FIXTURES = {
  // Multi-row header: a banner / "AS OF" title line and a merged-style grouping
  // row ABOVE the real column header.
  'rent-roll-multirow-header.csv': [
    'RENT ROLL — AS OF 06/01/2026,,,,,',
    'Property,,Rent,Rent,,',
    'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status',
    '101,1BR/1BA,720,1650,1575,Occupied',
    '102,1BR/1BA,720,1650,0,Vacant',
    '201,2BR/2BA,1050,2250,2025,Occupied',
    '202,2BR/2BA,1050,2250,2025,Occupied',
  ].join('\n'),
  // Totals / footer rows at the bottom.
  'rent-roll-totals-footer.csv': [
    'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status',
    '101,1BR/1BA,720,1650,1575,Occupied',
    '102,1BR/1BA,720,1650,0,Vacant',
    '201,2BR/2BA,1050,2250,2025,Occupied',
    'Total,,2490,5550,3600,',
    'Average/Unit,,830,1850,1800,',
  ].join('\n'),
  // SAFETY: a footer row plus a genuinely incomplete unit row (missing rents).
  'rent-roll-footer-plus-bad-row.csv': [
    'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status',
    '101,1BR/1BA,720,1650,1575,Occupied',
    '102,1BR/1BA,720,,,Occupied',
    'Total,,1440,1650,1575,',
  ].join('\n'),
  // Inconsistent currency/units formatting in the same columns.
  'rent-roll-currency-units-mixed.csv': [
    'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status',
    '101,1BR/1BA,720,"$1,650.00","$1,575.00",Occupied',
    '102,1BR/1BA,720,1650,0,Vacant',
    '201,2BR/2BA,"1,050","$2,250.00","2,025.00",Occupied',
  ].join('\n'),
  // T12 with accounting-style parenthesized negatives + a banner preamble.
  't12-parentheses-negatives.csv': [
    'TRAILING 12-MONTH OPERATING STATEMENT — Maple Grove',
    '',
    'Line Item,T12 Total',
    'Effective Gross Income,"$1,250,000"',
    'Total Operating Expenses,"($525,000)"',
    'Net Operating Income,"$725,000"',
  ].join('\n'),
  // Offering memo with OCR noise: the letter "O" misread for the digit "0"
  // inside the Asking Price and NOI numbers.
  'offering-memo-ocr-noise.txt': [
    'OFFERING MEMORANDUM — Maple Grove Apartments',
    '',
    'Offering Price: $42,5OO,OOO',
    'The property is a 240-unit garden-style community.',
    '94.5% occupancy as of June 2026.',
    'Net Operating Income: $2,815,OOO',
    'Year Built 1998',
  ].join('\n'),
  // Tricky legal diligence checklist (PSA / title / estoppel / SNDA) with
  // inconsistent delimiters and an em-dash.
  'legal-diligence-checklist-messy.md': [
    'DUE DILIGENCE CHECKLIST — Project Maple',
    '',
    '[x] Purchase & Sale Agreement (PSA), fully executed | status: received | owner: Seller counsel',
    '[ ] Title commitment and exception documents | status: missing | due 07/15/2026 | owner: Title company',
    '- Estoppel certificates from all tenants — outstanding, due 2026-08-01; responsible: Property manager',
    '* SNDA agreements for anchor tenants  (waived per lender)',
    '[ ] ALTA survey update — needed before closing',
    'Phase I Environmental Site Assessment ....... received',
  ].join('\n'),
}
for (const [name, contents] of Object.entries(MESSY_FIXTURES)) {
  writeGeneratedFixture(resolve(generatedFixturesRoot, name), contents)
}
const parseMessy = (name, type) => parseFile(generatedFixturesRoot, name, type)

// W50.1 - Multi-row header: a banner / "AS OF" title line and a merged-style
// grouping row sit ABOVE the real column header. Before the header scan this
// returned 'unsupported' (header assumed to be row 0); now the real header is
// located and the four units extract.
const multiRowHeader = parseMessy('rent-roll-multirow-header.csv', 'rent_roll')
assert.equal(multiRowHeader.status, 'extracted', 'multi-row-header rent roll must extract once the real header is located')
assert.equal(multiRowHeader.parserId, 'rent-roll-csv-parser')
assert.equal(fieldByPath(multiRowHeader, 'property.totalUnits').value, 4)
assert.equal(fieldByPath(multiRowHeader, 'financials.inPlaceOccupancy').value, 0.75)
const multiRowMix = unitMixByType(multiRowHeader)
assert.equal(multiRowMix.get('1BR/1BA').inPlaceRent, 1575, '1BR in-place rent averages occupied-only')
assert.equal(multiRowMix.get('1BR/1BA').marketRent, 1650)
assert.equal(multiRowMix.get('2BR/2BA').count, 2)
assert.equal(multiRowMix.get('2BR/2BA').inPlaceRent, 2025)

// W50.2 - Totals/footer rows at the bottom. Before this fix a single non-unit
// "Total" row made the WHOLE document parse_failed; now footer rows are set
// aside (and surfaced in a note), the genuine units extract, and the footer is
// NOT counted as a unit.
const totalsFooter = parseMessy('rent-roll-totals-footer.csv', 'rent_roll')
assert.equal(totalsFooter.status, 'extracted', 'a totals/footer row must not fail the whole rent roll')
assert.equal(fieldByPath(totalsFooter, 'property.totalUnits').value, 3, 'footer rows must not be counted as units')
assert.equal(totalsFooter.metrics?.footerRowsExcluded, 2)
assert.ok(
  totalsFooter.notes.some((note) => /excluded 2 totals\/footer row/i.test(note)),
  'footer exclusion must be surfaced in the notes (never a silent drop)',
)
assert.equal(unitMixByType(totalsFooter).get('1BR/1BA').count, 2)
assert.equal(fieldByPath(totalsFooter, 'financials.inPlaceOccupancy').value, 0.6667)

// W50.2b - SAFETY: footer exclusion must NOT mask a genuinely incomplete unit
// row. A real unit missing its rent values still gates to parse_failed even
// though a totals footer is present.
const footerPlusBadRow = parseMessy('rent-roll-footer-plus-bad-row.csv', 'rent_roll')
assert.equal(
  footerPlusBadRow.status,
  'parse_failed',
  'an incomplete unit row must still gate to parse_failed even when a footer row is present',
)
assert.ok(/1 row\(s\)/.test(footerPlusBadRow.error || ''), 'only the real unit row counts as malformed, not the footer')

// W50.3 - Inconsistent currency/units formatting ($, commas, quoted decimals)
// across cells of the same column must still parse to clean numbers.
const currencyMixed = parseMessy('rent-roll-currency-units-mixed.csv', 'rent_roll')
assert.equal(currencyMixed.status, 'extracted')
const currencyMix = unitMixByType(currencyMixed)
assert.equal(currencyMix.get('1BR/1BA').inPlaceRent, 1575, '"$1,575.00" must parse to 1575')
assert.equal(currencyMix.get('1BR/1BA').marketRent, 1650)
assert.equal(currencyMix.get('2BR/2BA').avgSqFt, 1050, '"1,050" must parse to 1050')
assert.equal(currencyMix.get('2BR/2BA').inPlaceRent, 2025, '"2,025.00" must parse to 2025')

// W50.4 - T12 expenses in accounting-style parentheses, "($525,000)". Before
// this fix the parenthesized token was silently dropped (Number() rejected it)
// and the Trailing T12 Expenses field never appeared; now it extracts (the T12
// mapper takes the absolute value).
const parenT12 = parseMessy('t12-parentheses-negatives.csv', 't12')
assert.equal(parenT12.status, 'extracted')
assert.equal(fieldByPath(parenT12, 'financials.trailingT12Revenue').value, 1250000)
assert.equal(fieldByPath(parenT12, 'financials.trailingT12Expenses').value, 525000, 'parenthesized expenses must extract, not be silently dropped')
assert.equal(fieldByPath(parenT12, 'financials.currentNOI').value, 725000)

// W50.5 - OCR-noise offering memo (letter "O" misread for "0" inside numbers).
// The corrupt Asking Price and NOI tokens must be SUPPRESSED (no silent wrong
// value like NOI=2815) and surfaced as review notes, while clean fields still
// extract. This is the review-gate: OCR noise never quietly feeds a bad number.
const ocrMemo = parseMessy('offering-memo-ocr-noise.txt', 'offering_memo')
assert.equal(ocrMemo.status, 'extracted')
assert.equal(ocrMemo.fields.find((field) => field.path === 'financials.askingPrice'), undefined, 'OCR-corrupted asking price must NOT be emitted')
assert.equal(ocrMemo.fields.find((field) => field.path === 'financials.currentNOI'), undefined, 'OCR-corrupted NOI must NOT be emitted as 2815')
assert.equal(ocrMemo.metrics?.ocrSuppressedFields, 2, 'both OCR-corrupted numbers must be counted as suppressed')
assert.ok(
  ocrMemo.notes.some((note) => /OCR-corrupted "Current NOI"/i.test(note)),
  'a review note must explain the suppressed NOI',
)
// Clean fields in the same memo still extract normally.
assert.equal(fieldByPath(ocrMemo, 'property.totalUnits').value, 240)
assert.equal(fieldByPath(ocrMemo, 'financials.inPlaceOccupancy').value, 0.945)
assert.equal(fieldByPath(ocrMemo, 'property.yearBuilt').value, 1998)

// W50.6 - Tricky legal diligence checklist (PSA / title / estoppel / SNDA) with
// inconsistent delimiters and an em-dash. Every candidate must stay review-only
// (confidence 0.64, reviewStatus 'candidate'); nothing here auto-applies to a
// deal. Categories, statuses, and dates extract correctly.
const messyChecklist = parseMessy('legal-diligence-checklist-messy.md', 'legal')
assert.equal(messyChecklist.status, 'extracted')
assert.equal(messyChecklist.parserId, 'legal-diligence-checklist-parser')
assert.equal(messyChecklist.metrics?.reviewOnly, true)
assert.ok(
  messyChecklist.fields.every((field) => field.path === 'diligence.checklistItems' && field.reviewStatus === 'candidate' && field.confidence === 0.64),
  'every legal checklist candidate must stay a low-confidence review-only candidate',
)
const psaItem = messyChecklist.fields.find((field) => /Purchase & Sale Agreement/.test(field.value?.item))
assert.ok(psaItem, 'expected the PSA checklist candidate')
assert.equal(psaItem.value.category, 'legal')
assert.equal(psaItem.value.status, 'received')
const titleItem = messyChecklist.fields.find((field) => /Title commitment/.test(field.value?.item))
assert.equal(titleItem.value.category, 'title')
assert.equal(titleItem.value.status, 'missing')
assert.equal(titleItem.value.dueDate, '2026-07-15')
const estoppelItem = messyChecklist.fields.find((field) => /Estoppel certificates/.test(field.value?.item))
assert.equal(estoppelItem.value.status, 'missing')
assert.equal(estoppelItem.value.dueDate, '2026-08-01')

console.log('[parser-service-test] PASS')
