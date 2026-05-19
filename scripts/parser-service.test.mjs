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

console.log('[parser-service-test] PASS')
