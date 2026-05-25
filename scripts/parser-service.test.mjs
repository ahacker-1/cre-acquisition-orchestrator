import assert from 'node:assert/strict'
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocumentParser } from '../dashboard/server/parser-service.ts'

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

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturesRoot = resolve(projectRoot, 'fixtures', 'parsers')

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

assert.equal(rentRoll.status, 'extracted')
assert.equal(rentRoll.parserId, 'excel-rent-roll-parser')
assert.equal(rentRoll.fields.find((field) => field.path === 'property.totalUnits')?.value, 3)
assert.equal(rentRoll.fields.find((field) => field.path === 'financials.inPlaceOccupancy')?.value, 0.6667)
assert.ok(rentRoll.fields.find((field) => field.path === 'property.unitMix.types')?.sourceRef.location?.sheet)
assert.ok(rentRoll.fields.every((field) => field.reviewStatus === 'candidate'))

const t12 = parseXlsx('t12-basic.xlsx', 't12')

assert.equal(t12.status, 'extracted')
assert.equal(t12.parserId, 'excel-t12-parser')
assert.equal(t12.fields.find((field) => field.path === 'financials.trailingT12Revenue')?.value, 1240000)
assert.equal(t12.fields.find((field) => field.path === 'financials.trailingT12Expenses')?.value, 510000)
assert.equal(t12.fields.find((field) => field.path === 'financials.currentNOI')?.value, 730000)
assert.ok(t12.fields.find((field) => field.path === 'financials.currentNOI')?.sourceRef.location?.row)

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
// W21 - Scanned / image-only PDF detection (graceful degradation, needs OCR)
// ---------------------------------------------------------------------------

const scannedPdf = parsePdf('scanned-rent-roll.pdf', 'rent_roll')

// Must not crash and must not silently produce empty/zero fields with an
// 'extracted' status. It must be flagged unsupported with an explicit
// needs-OCR signal.
assert.equal(scannedPdf.status, 'unsupported')
assert.equal(scannedPdf.fields.length, 0)
assert.equal(scannedPdf.metrics?.needsOcr, true)
assert.ok(
  scannedPdf.notes.some((note) => /ocr/i.test(note)),
  'expected a needs-OCR note for image-only PDF',
)
assert.ok(
  scannedPdf.notes.some((note) => /scan|image/i.test(note)),
  'expected a scan/image-detection note for image-only PDF',
)
assert.ok(
  !scannedPdf.error || /ocr|scan|image/i.test(scannedPdf.error),
  'image-only PDF must not crash with a generic parse error',
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

console.log('[parser-service-test] PASS')
