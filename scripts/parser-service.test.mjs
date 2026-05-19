import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDocumentParser } from '../dashboard/server/parser-service.ts'

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

console.log('[parser-service-test] PASS')
