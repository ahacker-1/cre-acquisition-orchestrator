import { createHash } from 'crypto'
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'fs'
import { extname, join } from 'path'
import { createRequire } from 'module'
import { spawnSync } from 'child_process'

const require = createRequire(import.meta.url)
const safePaths = require('../../scripts/lib/safe-paths') as {
  assertWithinBase: (base: string, candidate: string, label?: string) => string
}

export type ParserStatus = 'extracted' | 'extraction-pending' | 'parse_failed' | 'parser-unavailable' | 'unsupported'
export type ParserValueType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null'

export interface ParserSourceReference {
  documentId: string
  fileName: string
  fileHash?: string
  parserId: string
  parserVersion: string
  location?: {
    sheet?: string
    row?: number
    column?: string
    line?: number
    page?: number
    description?: string
  }
  raw?: string
}

export interface ParserExtractionField {
  fieldId: string
  path: string
  label: string
  value: unknown
  valueType: ParserValueType
  unit?: string
  confidence: number
  source: string
  sourceRef: ParserSourceReference
  reviewStatus: 'candidate'
}

export interface ParserExtractionPreview {
  documentId: string
  status: ParserStatus
  extractedAt: string
  fields: ParserExtractionField[]
  metrics: Record<string, unknown>
  notes: string[]
  parserId: string
  parserVersion: string
  sourceHash: string
  reviewStatus: 'candidate'
  uploadedData?: UploadedDataProfile
  error?: string
}

export type UploadedColumnValueType = 'blank' | 'boolean' | 'date' | 'mixed' | 'number' | 'string'

export interface UploadedColumnProfile {
  columnId: string
  name: string
  valueType: UploadedColumnValueType
  fillRate: number
  missingCount: number
  uniqueCount: number
  examples: string[]
}

export interface UploadedDataRow {
  rowNumber: number
  values: Record<string, string>
}

export interface UploadedDataTable {
  tableId: string
  label: string
  rowCount: number
  columnCount: number
  truncated: boolean
  columns: UploadedColumnProfile[]
  rows: UploadedDataRow[]
  source?: {
    sheet?: string
    headerRow?: number
  }
}

export interface UploadedDataProfile {
  generatedAt: string
  tableCount: number
  rowCount: number
  columnCount: number
  tables: UploadedDataTable[]
  issues: string[]
}

export interface ParserInput {
  documentId: string
  fileName: string
  filePath: string
  mime: string
  type: string
  projectRoot: string
  allowedBasePath?: string
}

const PARSER_VERSION = 'source-backed-v1'

// The native CSV/text path reads the whole file into memory and parses it
// in-process with no spawn timeout (unlike the Python parsers). Guard against
// oversized inputs that would risk heap exhaustion / unbounded latency. A file
// past EITHER cap degrades gracefully to parse_failed rather than being loaded.
const MAX_TEXT_PARSE_BYTES = 25 * 1024 * 1024 // 25 MB on-disk cap
const MAX_TEXT_PARSE_ROWS = 250_000 // parsed-row cap (sane upper bound for a rent roll / T12)
const MAX_UPLOAD_INSPECTOR_ROWS = 250
const MAX_UPLOAD_COLUMN_EXAMPLES = 5
const MAX_UNIQUE_TRACKED_VALUES = 1000
const OCR_NEXT_ACTION =
  'Run the built-in local OCR bridge or upload OCR output, then review candidates before applying any fields.'

export function isParserRunnable(fileName: string, mime: string): boolean {
  const extension = extname(fileName).toLowerCase()
  return ['.csv', '.txt', '.md', '.xlsx'].includes(extension) || mime.startsWith('text/')
}

export function isParserPendingOnly(fileName: string, mime: string): boolean {
  const extension = extname(fileName).toLowerCase()
  return extension === '.pdf' || mime === 'application/pdf'
}

export function fileHash(filePath: string): string {
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  const fd = openSync(filePath, 'r')
  try {
    let bytesRead = 0
    do {
      bytesRead = readSync(fd, buffer, 0, buffer.length, null)
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

export function sanitizeCsvCell(value: string): string {
  const trimmed = value.trim()
  return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed
}

function valueType(value: unknown): ParserValueType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') return 'string'
  return 'object'
}

function makeSourceRef(
  input: ParserInput,
  parserId: string,
  hash: string,
  location?: ParserSourceReference['location'],
  raw?: string,
): ParserSourceReference {
  return {
    documentId: input.documentId,
    fileName: input.fileName,
    fileHash: hash,
    parserId,
    parserVersion: PARSER_VERSION,
    location,
    raw,
  }
}

function field(
  input: ParserInput,
  hash: string,
  parserId: string,
  path: string,
  label: string,
  value: unknown,
  confidence: number,
  unit: string | undefined,
  location: ParserSourceReference['location'],
  raw?: string,
): ParserExtractionField {
  const fieldId = createHash('sha256')
    .update(`${input.documentId}|${path}|${JSON.stringify(location ?? {})}|${raw ?? ''}`)
    .digest('hex')
    .slice(0, 16)
  return {
    fieldId,
    path,
    label,
    value,
    valueType: valueType(value),
    unit,
    confidence,
    source: input.fileName,
    sourceRef: makeSourceRef(input, parserId, hash, location, raw),
    reviewStatus: 'candidate',
  }
}

function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    const next = raw[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(sanitizeCsvCell(cell))
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(sanitizeCsvCell(cell))
      if (row.some((entry) => entry.length > 0)) rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  row.push(sanitizeCsvCell(cell))
  if (row.some((entry) => entry.length > 0)) rows.push(row)
  if (inQuotes) {
    throw new Error('Malformed CSV: unclosed quoted field.')
  }
  return rows
}

function numberFromCell(value: string): number | null {
  let normalized = value.replace(/^'/, '').replace(/[$,%]/g, '').replace(/,/g, '').trim()
  if (!normalized) return null
  // Accounting-style parenthesized negatives, e.g. "(525,000)" -> -525000. T12s
  // and operating statements routinely report expenses this way; without this
  // the surrounding "$,%" strip leaves a "(525000)" token that Number() rejects,
  // and the line is SILENTLY dropped instead of extracted.
  let negative = false
  if (/^\(.*\)$/.test(normalized)) {
    negative = true
    normalized = normalized.slice(1, -1).trim()
  }
  if (!normalized) return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return negative ? -parsed : parsed
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'table'
}

function stringifyUploadedValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function inferUploadedValueType(value: string): UploadedColumnValueType {
  const trimmed = value.trim()
  if (!trimmed) return 'blank'
  if (/^(true|false|yes|no)$/i.test(trimmed)) return 'boolean'
  if (numberFromCell(trimmed) !== null) return 'number'
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(trimmed) && Number.isFinite(Date.parse(trimmed))) return 'date'
  return 'string'
}

function mergeUploadedValueTypes(types: Set<UploadedColumnValueType>): UploadedColumnValueType {
  const nonBlank = [...types].filter((type) => type !== 'blank')
  if (nonBlank.length === 0) return 'blank'
  const unique = new Set(nonBlank)
  return unique.size === 1 ? [...unique][0] : 'mixed'
}

function uniqueColumnNames(header: string[], records: string[][]): string[] {
  const width = Math.max(header.length, ...records.map((row) => row.length), 0)
  const seen = new Map<string, number>()
  return Array.from({ length: width }, (_, index) => {
    const raw = (header[index] || `Column ${index + 1}`).trim() || `Column ${index + 1}`
    const count = seen.get(raw) ?? 0
    seen.set(raw, count + 1)
    return count === 0 ? raw : `${raw} (${count + 1})`
  })
}

function profileUploadedColumns(columns: string[], rows: UploadedDataRow[], totalRowCount: number): UploadedColumnProfile[] {
  return columns.map((name) => {
    const types = new Set<UploadedColumnValueType>()
    const examples: string[] = []
    const uniqueValues = new Set<string>()
    let missingCount = 0

    for (const row of rows) {
      const value = row.values[name] ?? ''
      const trimmed = value.trim()
      types.add(inferUploadedValueType(value))
      if (!trimmed) {
        missingCount += 1
        continue
      }
      if (examples.length < MAX_UPLOAD_COLUMN_EXAMPLES && !examples.includes(trimmed)) {
        examples.push(trimmed)
      }
      if (uniqueValues.size < MAX_UNIQUE_TRACKED_VALUES) uniqueValues.add(trimmed)
    }

    const sampledCount = rows.length
    const estimatedMissing = sampledCount > 0 && totalRowCount > sampledCount
      ? Math.round((missingCount / sampledCount) * totalRowCount)
      : missingCount
    const denominator = totalRowCount > 0 ? totalRowCount : sampledCount
    const filled = Math.max(0, denominator - estimatedMissing)

    return {
      columnId: slug(name),
      name,
      valueType: mergeUploadedValueTypes(types),
      fillRate: denominator > 0 ? Number((filled / denominator).toFixed(4)) : 0,
      missingCount: estimatedMissing,
      uniqueCount: uniqueValues.size,
      examples,
    }
  })
}

function buildUploadedDataProfile(
  input: ParserInput,
  label: string,
  header: string[],
  records: string[][],
  options: { sheet?: string; headerRow?: number; firstDataRow?: number } = {},
): UploadedDataProfile {
  const columns = uniqueColumnNames(header, records)
  const rows: UploadedDataRow[] = records.slice(0, MAX_UPLOAD_INSPECTOR_ROWS).map((row, index) => ({
    rowNumber: (options.firstDataRow ?? 2) + index,
    values: Object.fromEntries(columns.map((column, columnIndex) => [column, stringifyUploadedValue(row[columnIndex])])),
  }))
  const truncated = records.length > rows.length
  const table: UploadedDataTable = {
    tableId: `${input.documentId}-${slug(label)}`,
    label,
    rowCount: records.length,
    columnCount: columns.length,
    truncated,
    columns: profileUploadedColumns(columns, rows, records.length),
    rows,
    source: {
      sheet: options.sheet,
      headerRow: options.headerRow,
    },
  }
  const issues = truncated
    ? [`Inspector preview shows ${rows.length} of ${records.length} uploaded rows.`]
    : []
  return {
    generatedAt: new Date().toISOString(),
    tableCount: 1,
    rowCount: table.rowCount,
    columnCount: table.columnCount,
    tables: [table],
    issues,
  }
}

function buildTextUploadedDataProfile(input: ParserInput, raw: string, label = 'Document Text'): UploadedDataProfile {
  const lines = raw.split(/\r?\n/)
  return buildUploadedDataProfile(
    input,
    label,
    ['Line', 'Text'],
    lines.map((line, index) => [String(index + 1), line]),
    { firstDataRow: 1 },
  )
}

function uploadedDataFromExcelParsed(
  input: ParserInput,
  parsed: Record<string, unknown>,
  fallbackLabel: string,
): UploadedDataProfile | undefined {
  const tablePreview = asRecord(parsed.tablePreview)
  const columns = Array.isArray(tablePreview.columns)
    ? tablePreview.columns.map((column) => stringifyUploadedValue(column)).filter((column) => column.trim().length > 0)
    : []
  const rawRows = Array.isArray(tablePreview.rows) ? tablePreview.rows : []
  if (columns.length === 0 || rawRows.length === 0) return undefined

  const rows: UploadedDataRow[] = rawRows.map((entry, index) => {
    const record = asRecord(entry)
    const values = asRecord(record.values)
    return {
      rowNumber: typeof record.rowNumber === 'number' && Number.isFinite(record.rowNumber)
        ? record.rowNumber
        : index + 1,
      values: Object.fromEntries(columns.map((column) => [column, stringifyUploadedValue(values[column])])),
    }
  })
  const rowCount = typeof tablePreview.rowCount === 'number' && Number.isFinite(tablePreview.rowCount)
    ? tablePreview.rowCount
    : rows.length
  const truncated = Boolean(tablePreview.truncated)
  const source = asRecord(tablePreview.source)
  const table: UploadedDataTable = {
    tableId: `${input.documentId}-${slug(fallbackLabel)}`,
    label: typeof tablePreview.label === 'string' && tablePreview.label.trim().length > 0
      ? tablePreview.label
      : fallbackLabel,
    rowCount,
    columnCount: columns.length,
    truncated,
    columns: profileUploadedColumns(columns, rows, rowCount),
    rows,
    source: {
      sheet: typeof source.sheet === 'string' ? source.sheet : undefined,
      headerRow: typeof source.headerRow === 'number' ? source.headerRow : undefined,
    },
  }
  return {
    generatedAt: new Date().toISOString(),
    tableCount: 1,
    rowCount,
    columnCount: columns.length,
    tables: [table],
    issues: truncated ? [`Inspector preview shows ${rows.length} of ${rowCount} uploaded rows.`] : [],
  }
}

function average(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

// Locate the real rent-roll header row. Exported rent rolls frequently carry a
// banner / "AS OF <date>" title line or a merged grouping row ABOVE the column
// labels, so the header is not guaranteed to be row 0. Scans the first rows for
// the first one that looks like a rent-roll header (a unit-type column plus at
// least one rent/sqft/status column); falls back to row 0 when none is found so
// the existing "no recognizable header" path still reports cleanly. Mirrors the
// header scan parseT12 already performs.
function findRentRollHeaderIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 15)
  for (let index = 0; index < limit; index += 1) {
    const row = rows[index]
    const hasUnitType = row.some((cell) => /unit type|bed\/bath|floorplan/i.test(cell))
    const hasData = row.some((cell) =>
      /sqft|square|market rent|asking rent|current rent|contract rent|in-place|status|occupancy/i.test(cell),
    )
    if (hasUnitType && hasData) return index
  }
  return 0
}

// A totals / subtotals / averages footer row holds an aggregate label instead of
// a real unit in its unit-id (column 0) or unit-type cell. These sit at the
// bottom of many exported rent rolls and must NOT be mistaken for malformed unit
// rows that fail the whole file. Kept narrow (start-anchored, word-bounded
// keywords) so a numeric unit id or a "1BR/1BA" unit type is never matched; any
// excluded row is also surfaced in the parser notes, so the exclusion is never
// silent.
function isRentRollFooterRow(row: string[], unitTypeIndex: number): boolean {
  const cells = [row[0] ?? '', unitTypeIndex >= 0 ? row[unitTypeIndex] ?? '' : '']
  return cells.some((cell) =>
    /^(grand\s+total|portfolio\s+total|sub-?total|totals?|averages?|avg|summary)\b/i.test(cell.trim()),
  )
}

function parseRentRoll(input: ParserInput, rows: string[][], hash: string): ParserExtractionPreview {
  const parserId = 'rent-roll-csv-parser'
  const headerIndex = findRentRollHeaderIndex(rows)
  const header = rows[headerIndex] ?? []
  const unitTypeIndex = header.findIndex((cell) => /unit type|bed\/bath|floorplan/i.test(cell))
  const sqftIndex = header.findIndex((cell) => /sqft|square/i.test(cell))
  const marketRentIndex = header.findIndex((cell) => /market rent|asking rent/i.test(cell))
  const currentRentIndex = header.findIndex((cell) => /current rent|contract rent|in-place/i.test(cell))
  const statusIndex = header.findIndex((cell) => /status|occupancy/i.test(cell))
  // Everything after the detected header. Footer/aggregate rows are partitioned
  // out of the unit records (but still shown in the uploaded-data inspector).
  const rawRecords = rows.slice(headerIndex + 1)
  const footerRows = rawRecords.filter((row) => isRentRollFooterRow(row, unitTypeIndex))
  const records = rawRecords.filter((row) => !isRentRollFooterRow(row, unitTypeIndex))
  const footerNote = footerRows.length > 0
    ? `Excluded ${footerRows.length} totals/footer row(s) from unit aggregation.`
    : null
  const uploadedData = buildUploadedDataProfile(input, 'Rent Roll Rows', header, rawRecords, {
    headerRow: headerIndex + 1,
    firstDataRow: headerIndex + 2,
  })
  const hasRentRollHeader =
    unitTypeIndex >= 0 &&
    [sqftIndex, marketRentIndex, currentRentIndex, statusIndex].some((index) => index >= 0)
  if (!hasRentRollHeader) {
    return {
      documentId: input.documentId,
      status: 'unsupported',
      extractedAt: new Date().toISOString(),
      fields: [],
      metrics: { rows: records.length, columns: header },
      notes: ['No recognizable rent roll header found.'],
      parserId,
      parserVersion: PARSER_VERSION,
      sourceHash: hash,
      reviewStatus: 'candidate',
      uploadedData,
    }
  }
  const occupied = statusIndex >= 0
    ? records.filter((row) => {
        const status = (row[statusIndex] || '').trim().toLowerCase()
        if (/vacant|unoccupied|not occupied|down|offline|model/.test(status)) return false
        return /^occupied\b|^occ\b/.test(status)
      }).length
    : null
  const dataIndices = [sqftIndex, marketRentIndex, currentRentIndex, statusIndex].filter((index) => index >= 0)
  const requiredMaxIndex = Math.max(unitTypeIndex, ...dataIndices)
  const malformedRows = records.filter((row) => {
    const hasRequiredShape = row.length === header.length && row.length > requiredMaxIndex
    const hasUnitType = Boolean((row[unitTypeIndex] || '').trim())
    const hasAllRecognizedData = dataIndices.every((index) => Boolean((row[index] || '').trim()))
    return !hasRequiredShape || !hasUnitType || !hasAllRecognizedData
  })
  if (malformedRows.length > 0) {
    return parseFailed(
      input,
      hash,
      parserId,
      `Malformed rent roll row(s): ${malformedRows.length} row(s) are missing unit type or required rent roll values.`,
      uploadedData,
    )
  }
  const unitMix = new Map<string, { count: number; sqft: number[]; market: number[]; current: number[] }>()

  records.forEach((row) => {
    const type = unitTypeIndex >= 0 ? row[unitTypeIndex] || 'Unspecified' : 'Unspecified'
    if (!unitMix.has(type)) unitMix.set(type, { count: 0, sqft: [], market: [], current: [] })
    const bucket = unitMix.get(type)!
    bucket.count += 1
    const sqft = sqftIndex >= 0 ? numberFromCell(row[sqftIndex] || '') : null
    const market = marketRentIndex >= 0 ? numberFromCell(row[marketRentIndex] || '') : null
    const current = currentRentIndex >= 0 ? numberFromCell(row[currentRentIndex] || '') : null
    if (sqft !== null) bucket.sqft.push(sqft)
    // Market rent (asking) is averaged over ALL units of the type, regardless
    // of occupancy.
    if (market !== null) bucket.market.push(market)
    // In-place rent (contract/current) is averaged over OCCUPIED units only:
    // units with a positive contract rent. A vacant unit reports 0, and
    // numberFromCell('0') returns 0 (not null); pushing that 0 would deflate
    // both the numerator and denominator inconsistently (e.g. a $2025 occupied
    // unit + a $0 vacant unit averaging to 1013 instead of 2025). Exclude
    // non-positive rents so average() over the surviving values is consistent;
    // an all-vacant type yields an empty array and average() returns null.
    if (current !== null && current > 0) bucket.current.push(current)
  })

  const unitMixTypes = [...unitMix.entries()].map(([type, bucket]) => ({
    type,
    count: bucket.count,
    avgSqFt: average(bucket.sqft),
    marketRent: average(bucket.market),
    inPlaceRent: average(bucket.current),
  }))
  if (records.length === 0 || unitMixTypes.length === 0) {
    return {
      documentId: input.documentId,
      status: 'unsupported',
      extractedAt: new Date().toISOString(),
      fields: [],
      metrics: { rows: records.length, columns: header, occupied },
      notes: ['No rent roll unit records found.'],
      parserId,
      parserVersion: PARSER_VERSION,
      sourceHash: hash,
      reviewStatus: 'candidate',
      uploadedData,
    }
  }
  const occupancy = records.length > 0 && occupied !== null ? Number((occupied / records.length).toFixed(4)) : null
  const fields: ParserExtractionField[] = [
    field(input, hash, parserId, 'property.totalUnits', 'Total Units', records.length, 0.92, 'count', { row: 1, description: 'Count of rent roll records' }, header.join(',')),
    field(input, hash, parserId, 'property.unitMix.types', 'Unit Mix', unitMixTypes, 0.84, undefined, { row: 1, description: 'Aggregated by unit type' }, header.join(',')),
  ]
  if (occupancy !== null) {
    fields.push(field(input, hash, parserId, 'financials.inPlaceOccupancy', 'In-Place Occupancy', occupancy, 0.78, 'decimal', { description: 'Occupied rows divided by total units' }))
  }

  return {
    documentId: input.documentId,
    status: fields.length > 0 ? 'extracted' : 'unsupported',
    extractedAt: new Date().toISOString(),
    fields,
    metrics: { rows: records.length, columns: header, occupied, footerRowsExcluded: footerRows.length },
    notes: [`Parsed ${records.length} rent roll rows`, ...(footerNote ? [footerNote] : [])],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    uploadedData,
  }
}

function parseT12(input: ParserInput, rows: string[][], hash: string): ParserExtractionPreview {
  const parserId = 't12-csv-parser'
  const headerIndex = rows.findIndex((row) => row.some((cell) => /^line item$/i.test(cell)))
  const header = headerIndex >= 0 ? rows[headerIndex] : rows[0] ?? []
  const totalIndex = header.findIndex((cell) => /t12 total|total|annual/i.test(cell))
  const lineItemIndex = header.findIndex((cell) => /line item|account/i.test(cell))
  const records = rows.slice(headerIndex >= 0 ? headerIndex + 1 : 1)
  const uploadedData = buildUploadedDataProfile(input, 'T12 Rows', header, records, {
    headerRow: headerIndex >= 0 ? headerIndex + 1 : 1,
    firstDataRow: headerIndex >= 0 ? headerIndex + 2 : 2,
  })
  const findAmount = (pattern: RegExp): { value: number; rowNumber: number; raw: string } | null => {
    const rowIndex = records.findIndex((entry) => pattern.test(entry[lineItemIndex] || entry[0] || ''))
    if (rowIndex < 0 || totalIndex < 0) return null
    const row = records[rowIndex]
    const value = numberFromCell(row[totalIndex] || '')
    return value === null ? null : { value, rowNumber: rowIndex + (headerIndex >= 0 ? headerIndex + 2 : 2), raw: row.join(',') }
  }
  const revenue = findAmount(/effective gross income|total revenue|gross potential rent/i)
  const expenses = findAmount(/total operating expenses/i)
  const noi = findAmount(/net operating income|noi/i)
  const fields: ParserExtractionField[] = []
  if (revenue) fields.push(field(input, hash, parserId, 'financials.trailingT12Revenue', 'Trailing T12 Revenue', revenue.value, 0.82, 'usd', { row: revenue.rowNumber, column: header[totalIndex] }, revenue.raw))
  if (expenses) fields.push(field(input, hash, parserId, 'financials.trailingT12Expenses', 'Trailing T12 Expenses', Math.abs(expenses.value), 0.88, 'usd', { row: expenses.rowNumber, column: header[totalIndex] }, expenses.raw))
  if (noi) fields.push(field(input, hash, parserId, 'financials.currentNOI', 'Current NOI', noi.value, 0.92, 'usd', { row: noi.rowNumber, column: header[totalIndex] }, noi.raw))

  return {
    documentId: input.documentId,
    status: fields.length > 0 ? 'extracted' : 'unsupported',
    extractedAt: new Date().toISOString(),
    fields,
    metrics: { rows: records.length, totalColumn: totalIndex >= 0 ? header[totalIndex] : null },
    notes: [`Parsed ${records.length} T12 rows`],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    uploadedData,
  }
}

// A numeric headline match whose source token runs INTO digit-confusable
// letters (O->0, l/I->1, S->5, B->8, Z->2, G->6) is almost certainly OCR
// garbage, e.g. "$2,815,OOO" would otherwise be truncated at the comma and yield
// 2815 — a silently WRONG number presented as a plausible candidate. Such tokens
// are suppressed (no field emitted) and surfaced as a review note instead, so
// OCR noise can never quietly feed a bad value into the deal.
function numericTokenLooksOcrCorrupted(raw: string, tokenStart: number): boolean {
  if (tokenStart < 0) return false
  let sawDigit = false
  let sawLetter = false
  for (let index = tokenStart; index < raw.length; index += 1) {
    const ch = raw[index]
    if (/[0-9]/.test(ch)) { sawDigit = true; continue }
    if (/[OoIilSsBbZzGg]/.test(ch)) { sawLetter = true; continue }
    if (ch === ',' || ch === '.') continue // separators inside the number token
    break // any other character ends the contiguous numeric run
  }
  return sawDigit && sawLetter
}

function parseOfferingMemo(input: ParserInput, raw: string, hash: string): ParserExtractionPreview {
  const parserId = 'offering-memo-text-parser'
  const fields: ParserExtractionField[] = []
  const suppressed: string[] = []
  const uploadedData = buildTextUploadedDataProfile(input, raw, 'Offering Memo Lines')
  const addMatch = (
    regex: RegExp,
    path: string,
    label: string,
    confidence: number,
    unit?: string,
    transform: (value: string) => unknown = (value) => Number(value.replace(/,/g, '')),
  ): void => {
    const match = raw.match(regex)
    if (!match) return
    const offset = match.index ?? 0
    const line = raw.slice(0, offset).split(/\r?\n/).length
    const tokenStart = raw.indexOf(match[1], offset)
    if (numericTokenLooksOcrCorrupted(raw, tokenStart)) {
      const snippet = raw.slice(tokenStart, tokenStart + 24).split(/\r?\n/)[0]
      suppressed.push(`Skipped a likely OCR-corrupted "${label}" value ("${snippet}") — re-OCR or review the source before relying on it.`)
      return
    }
    fields.push(field(input, hash, parserId, path, label, transform(match[1]), confidence, unit, { line }, match[0]))
  }
  addMatch(/(?:offering price|asking price)[:\s#*$]+([\d,]+)/i, 'financials.askingPrice', 'Asking Price', 0.86, 'usd')
  addMatch(/(?:total units\s*\|?\s*|^|\s)(\d{2,5})\s*[- ]?unit/i, 'property.totalUnits', 'Total Units', 0.8, 'count')
  addMatch(/(\d{1,3}(?:\.\d+)?)%\s+occupancy/i, 'financials.inPlaceOccupancy', 'In-Place Occupancy', 0.76, 'decimal', (value) => Number(value) / 100)
  addMatch(/(?:noi|net operating income)[:\s*$]+([\d,]+)/i, 'financials.currentNOI', 'Current NOI', 0.75, 'usd')
  addMatch(/year built\s*\|?\s*(\d{4})/i, 'property.yearBuilt', 'Year Built', 0.8)

  return {
    documentId: input.documentId,
    status: fields.length > 0 ? 'extracted' : 'unsupported',
    extractedAt: new Date().toISOString(),
    fields,
    metrics: { characterCount: raw.length, ...(suppressed.length > 0 ? { ocrSuppressedFields: suppressed.length } : {}) },
    notes: (fields.length > 0 ? ['Extracted offering memo headline metrics'] : ['No headline metrics found in memo text']).concat(suppressed),
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    uploadedData,
  }
}

type ChecklistStatus = 'open' | 'received' | 'missing' | 'waived' | 'complete' | 'unknown'
type ChecklistCategory = 'legal' | 'environmental' | 'title' | 'survey' | 'insurance' | 'financing' | 'closing' | 'general'

interface ChecklistCandidate {
  item: string
  status: ChecklistStatus
  dueDate?: string
  responsibleParty?: string
  category: ChecklistCategory
  notes?: string
  line: number
  raw: string
}

function checklistStatusFromText(text: string): ChecklistStatus {
  const normalized = text.toLowerCase()
  if (/\b(status\s*[:=-]\s*)?open\b/.test(normalized)) return 'open'
  if (/\b(received|delivered|provided|uploaded|complete|completed)\b/.test(normalized)) {
    return /\bcomplete|completed\b/.test(normalized) ? 'complete' : 'received'
  }
  if (/\bmissing|not received|outstanding|needed|required\b/.test(normalized)) return 'missing'
  if (/\bwaived|n\/a|not applicable\b/.test(normalized)) return 'waived'
  return 'open'
}

function checklistCategoryFromText(text: string): ChecklistCategory {
  const normalized = text.toLowerCase()
  if (/\b(environmental|phase i|phase one|esa|remediation)\b/.test(normalized)) return 'environmental'
  if (/\b(title|commitment|endorsement|lien)\b/.test(normalized)) return 'title'
  if (/\b(survey|alta|boundary|zoning)\b/.test(normalized)) return 'survey'
  if (/\b(insurance|binder|policy|coverage)\b/.test(normalized)) return 'insurance'
  if (/\b(loan|lender|financing|debt|term sheet)\b/.test(normalized)) return 'financing'
  if (/\b(closing|escrow|settlement|funds flow)\b/.test(normalized)) return 'closing'
  if (/\b(psa|legal|contract|lease|estoppel|snda|counsel|entity|opinion)\b/.test(normalized)) return 'legal'
  return 'general'
}

function extractChecklistDueDate(text: string): string | undefined {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  const slash = text.match(/\b(1[0-2]|0?[1-9])\/([0-3]?\d)\/(20\d{2})\b/)
  if (!slash) return undefined
  const month = slash[1].padStart(2, '0')
  const day = slash[2].padStart(2, '0')
  return `${slash[3]}-${month}-${day}`
}

function extractResponsibleParty(text: string): string | undefined {
  const match = text.match(/\b(?:owner|responsible|party|assigned to|from)\s*[:=-]\s*([^;|]+?)(?:\s{2,}|$|;|\|)/i)
  return match ? match[1].trim() : undefined
}

export function checklistItemFromLine(line: string, lineNumber: number): ChecklistCandidate | null {
  const raw = line.trim()
  if (!raw) return null
  const normalized = raw.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim()
  const hasChecklistSignal =
    /\b(checklist|deliverable|required|missing|received|waived|due|title|survey|environmental|insurance|closing|psa|estoppel|snda)\b/i.test(normalized) ||
    /^\[[ xX-]\]/.test(normalized)
  if (!hasChecklistSignal) return null
  const withoutCheckbox = normalized.replace(/^\[[ xX-]\]\s*/, '').trim()
  const pieces = withoutCheckbox.split(/\s+[|;]\s+/).map((piece) => piece.trim()).filter(Boolean)
  const item = pieces[0]
    .replace(/\b(status|due|owner|responsible|party)\s*[:=-].*$/i, '')
    .replace(/\s{2,}.*/, '')
    .trim()
  if (item.length < 6) return null
  return {
    item,
    status: checklistStatusFromText(withoutCheckbox),
    dueDate: extractChecklistDueDate(withoutCheckbox),
    responsibleParty: extractResponsibleParty(withoutCheckbox),
    category: checklistCategoryFromText(withoutCheckbox),
    notes: pieces.length > 1 ? pieces.slice(1).join('; ') : undefined,
    line: lineNumber,
    raw,
  }
}

export function parseChecklistText(raw: string): ChecklistCandidate[] {
  return raw
    .split(/\r?\n/)
    .map((line, index) => checklistItemFromLine(line, index + 1))
    .filter((candidate): candidate is ChecklistCandidate => Boolean(candidate))
}

export function mapChecklistCandidates(
  input: ParserInput,
  raw: string,
  hash: string,
): ParserExtractionPreview {
  const parserId = 'legal-diligence-checklist-parser'
  const candidates = parseChecklistText(raw)
  const uploadedData = buildTextUploadedDataProfile(input, raw, 'Checklist Lines')
  const fields = candidates.map((candidate) =>
    field(
      input,
      hash,
      parserId,
      'diligence.checklistItems',
      'Diligence Checklist Item',
      {
        item: candidate.item,
        status: candidate.status,
        dueDate: candidate.dueDate,
        responsibleParty: candidate.responsibleParty,
        category: candidate.category,
        notes: candidate.notes,
      },
      0.64,
      undefined,
      { line: candidate.line, description: 'Legal diligence checklist candidate' },
      candidate.raw,
    ),
  )

  return {
    documentId: input.documentId,
    status: fields.length > 0 ? 'extracted' : 'unsupported',
    extractedAt: new Date().toISOString(),
    fields,
    metrics: {
      characterCount: raw.length,
      checklistCandidateCount: fields.length,
      reviewOnly: true,
    },
    notes: fields.length > 0
      ? [`Mapped ${fields.length} legal diligence checklist candidate(s) for operator review.`]
      : ['Document text was readable, but no checklist candidates were found.'],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    uploadedData,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function ocrBridgeMetrics(extra: Record<string, unknown> = {}, status = 'not-configured'): Record<string, unknown> {
  return {
    ...extra,
    needsOcr: true,
    ocrReady: true,
    ocrBridge: {
      parser: 'local-ocr-optional',
      status,
      nextAction: OCR_NEXT_ACTION,
    },
  }
}

// Redact absolute local filesystem paths (and interpreter executables) from any
// error/notes string surfaced to the caller, so we never leak machine layout
// such as C:\Users\...\Python313\python.exe or the input file's full path.
function redactPaths(text: string): string {
  if (!text) return text
  return text
    // Windows drive-letter paths (greedy across path separators, stopping at
    // quotes/whitespace) -> [path].
    .replace(/[A-Za-z]:\\[^"'\s|]*/g, '[path]')
    // UNC paths (\\server\share\...).
    .replace(/\\\\[^"'\s|]+/g, '[path]')
    // POSIX absolute paths that look like real filesystem locations.
    .replace(/\/(?:usr|home|opt|var|tmp|etc|bin|Users|Library|Applications)\/[^"'\s|]*/g, '[path]')
    // Any residual bare interpreter executable reference.
    .replace(/python(?:3|313)?\.exe/gi, '[python]')
    .trim()
}

// Markers that indicate the Python interpreter ran but is missing the parsing
// dependencies (openpyxl / pdfplumber / pandas). These candidates should be
// SKIPPED in favor of the next interpreter rather than treated as the
// controlling failure.
const DEPS_MISSING_MARKERS = [/missing dependenc/i, /no module named/i, /modulenotfounderror/i]

function isDepsMissing(text: string): boolean {
  return DEPS_MISSING_MARKERS.some((marker) => marker.test(text))
}

// A Python parser candidate that printed a structured {"success": false, ...}
// failure that is NOT a deps-missing message represents a real FILE/parse
// failure (e.g. openpyxl's "File is not a zip file" for a corrupt .xlsx). Detect
// it from stdout even when the script exited non-zero.
function structuredFileFailure(stdout: string): string | null {
  const trimmed = (stdout || '').trim()
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  const record = asRecord(parsed)
  if (record.success !== false) return null
  const error = typeof record.error === 'string' ? record.error : ''
  if (isDepsMissing(error)) return null
  return error || 'The file could not be parsed.'
}

function numberFieldValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function pythonCandidates(projectRoot?: string): Array<{ command: string; args: string[] }> {
  const candidates: Array<{ command: string | null; args: string[] }> = []
  if (projectRoot) {
    candidates.push({
      command: process.platform === 'win32'
        ? join(projectRoot, '.venv', 'Scripts', 'python.exe')
        : join(projectRoot, '.venv', 'bin', 'python'),
      args: [],
    })
  }
  if (process.platform === 'win32') {
    const localPython = process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python313', 'python.exe')
      : null
    candidates.push(
      { command: localPython, args: [] },
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] },
    )
  } else {
    candidates.push({ command: 'python3', args: [] }, { command: 'python', args: [] })
  }
  return candidates.filter((candidate): candidate is { command: string; args: string[] } => Boolean(candidate.command))
}

// Discriminated result of trying the ordered Python interpreter candidates:
// - parsed:            a candidate succeeded; parsed JSON payload.
// - parseFailedError:  a candidate ran but the FILE is bad (real parse failure).
// - unavailableError:  no interpreter could run / all lack dependencies.
// All error strings are path-redacted before being surfaced.
interface PythonRunResult {
  parsed?: Record<string, unknown>
  parseFailedError?: string
  unavailableError?: string
}

function runPythonParser(input: ParserInput, scriptName: string, parserLabel: string, documentType: string): PythonRunResult {
  const scriptPath = safePaths.assertWithinBase(
    input.projectRoot,
    join(input.projectRoot, 'scripts', scriptName),
    `${parserLabel} parser script path`,
  )
  // Non-controlling failures (interpreter absent or dependencies missing) are
  // tracked separately so they never become the surfaced error when a later
  // candidate could succeed -- and so an all-deps-missing environment reports a
  // clear, actionable message instead of a noisy spawn-error chain.
  let sawDepsMissing = false
  let sawInterpreter = false
  const otherErrors: string[] = []

  for (const candidate of pythonCandidates(input.projectRoot)) {
    const result = spawnSync(candidate.command, [...candidate.args, scriptPath, input.filePath, '--type', documentType], {
      cwd: input.projectRoot,
      encoding: 'utf8',
      timeout: 15000,
    })
    const stdout = result.stdout || ''
    const stderr = result.stderr || ''
    const combined = `${stdout}${stderr}`.trim()

    // Interpreter not present on this machine (ENOENT etc.): skip silently.
    if (result.error) {
      continue
    }
    sawInterpreter = true

    if (result.status === 0) {
      try {
        return { parsed: JSON.parse(stdout || '{}') as Record<string, unknown> }
      } catch {
        return { parseFailedError: redactPaths(combined) || `${parserLabel} parser returned invalid JSON.` }
      }
    }

    // Non-zero exit. Distinguish "interpreter lacks the parsing dependencies"
    // (skip, try the next interpreter) from a real structured FILE failure
    // (surface immediately as parse_failed).
    if (isDepsMissing(combined)) {
      sawDepsMissing = true
      continue
    }
    const fileFailure = structuredFileFailure(stdout)
    if (fileFailure) {
      return { parseFailedError: redactPaths(fileFailure) }
    }
    otherErrors.push(redactPaths(combined) || `exit ${result.status ?? 'unknown'}`)
  }

  if (sawDepsMissing && otherErrors.length === 0) {
    return {
      unavailableError:
        'Python parser dependencies (pandas/openpyxl/pdfplumber) not installed for any available interpreter.',
    }
  }
  if (otherErrors.length > 0) {
    return { unavailableError: otherErrors.join(' | ') }
  }
  if (!sawInterpreter) {
    return { unavailableError: `No Python interpreter is available to run the ${parserLabel} parser.` }
  }
  return { unavailableError: `${parserLabel} parser failed.` }
}

function runExcelPythonParser(input: ParserInput, documentType: string): PythonRunResult {
  return runPythonParser(input, 'parse_excel.py', 'Excel', documentType)
}

function runPdfPythonParser(input: ParserInput, documentType: string): PythonRunResult {
  return runPythonParser(input, 'parse_pdf.py', 'PDF', documentType)
}

function runPdfOcrBridge(input: ParserInput, documentType: string): PythonRunResult {
  const scriptPath = safePaths.assertWithinBase(
    input.projectRoot,
    join(input.projectRoot, 'scripts', 'ocr_pdf.mjs'),
    'PDF OCR bridge script path',
  )
  const result = spawnSync(process.execPath, [scriptPath, input.filePath, '--type', documentType], {
    cwd: input.projectRoot,
    encoding: 'utf8',
    timeout: 45_000,
    maxBuffer: 2 * 1024 * 1024,
  })
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
  if (result.status === 0 && result.stdout) {
    try {
      return { parsed: JSON.parse(result.stdout || '{}') as Record<string, unknown> }
    } catch {
      return { parseFailedError: redactPaths(combined) || 'PDF OCR bridge returned invalid JSON.' }
    }
  }
  return {
    unavailableError: redactPaths(result.error?.message || combined || 'PDF OCR bridge failed.'),
  }
}

function parsedWarnings(parsed: Record<string, unknown>): string[] {
  return Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
    : []
}

function parsedExcelLocation(
  parsed: Record<string, unknown>,
  key: string,
  fallbackRow: number,
  fallbackDescription: string,
): ParserSourceReference['location'] {
  const provenance = asRecord(parsed.provenance)
  const summary = asRecord(provenance.summary)
  const candidate = asRecord(summary[key])
  const source = Object.keys(candidate).length > 0 ? candidate : {}
  const row = typeof source.row === 'number' && Number.isFinite(source.row) ? source.row : fallbackRow
  const column = typeof source.column === 'string' && source.column.trim().length > 0 ? source.column : undefined
  const sheet = typeof source.sheet === 'string' && source.sheet.trim().length > 0
    ? source.sheet
    : typeof provenance.sheetName === 'string' && provenance.sheetName.trim().length > 0
      ? provenance.sheetName
      : 'Source Data'
  const description = typeof source.description === 'string' && source.description.trim().length > 0
    ? source.description
    : fallbackDescription
  return { sheet, row, column, description }
}

function mapExcelRentRoll(input: ParserInput, hash: string, parsed: Record<string, unknown>): ParserExtractionPreview {
  const parserId = 'excel-rent-roll-parser'
  const summary = asRecord(parsed.summary)
  const unitMix = Array.isArray(parsed.unitMix) ? parsed.unitMix : []
  const fields: ParserExtractionField[] = []
  const warnings = parsedWarnings(parsed)
  const uploadedData = uploadedDataFromExcelParsed(input, parsed, 'Rent Roll Worksheet')
  const confidencePenalty = warnings.length > 0 ? 0.06 : 0
  const totalUnits = numberFieldValue(summary.totalUnits)
  const occupancy = numberFieldValue(summary.occupancyRate)
  const grossPotentialRentAnnual = numberFieldValue(summary.grossPotentialRentAnnual)
  const inPlaceRentAnnual = numberFieldValue(summary.inPlaceRentAnnual)
  const lossToLeaseAnnual = numberFieldValue(summary.lossToLeaseAnnual)

  if (totalUnits !== null) fields.push(field(input, hash, parserId, 'property.totalUnits', 'Total Units', totalUnits, 0.9 - confidencePenalty, 'count', parsedExcelLocation(parsed, 'totalUnits', 1, 'Excel rent roll unit count'), String(totalUnits)))
  if (unitMix.length > 0) fields.push(field(input, hash, parserId, 'property.unitMix.types', 'Unit Mix', unitMix, 0.84 - confidencePenalty, undefined, parsedExcelLocation(parsed, 'unitMix', 1, 'Excel rent roll unit mix aggregation'), JSON.stringify(unitMix)))
  if (occupancy !== null) fields.push(field(input, hash, parserId, 'financials.inPlaceOccupancy', 'In-Place Occupancy', occupancy, 0.78 - confidencePenalty, 'decimal', parsedExcelLocation(parsed, 'occupancyRate', 1, 'Occupied units divided by total units'), String(occupancy)))
  if (grossPotentialRentAnnual !== null) fields.push(field(input, hash, parserId, 'financials.grossPotentialRentAnnual', 'Gross Potential Rent Annual', grossPotentialRentAnnual, 0.78 - confidencePenalty, 'usd', parsedExcelLocation(parsed, 'grossPotentialRentAnnual', 1, 'Annualized market rent from rent roll'), String(grossPotentialRentAnnual)))
  if (inPlaceRentAnnual !== null) fields.push(field(input, hash, parserId, 'financials.inPlaceRentAnnual', 'In-Place Rent Annual', inPlaceRentAnnual, 0.78 - confidencePenalty, 'usd', parsedExcelLocation(parsed, 'inPlaceRentAnnual', 1, 'Annualized current rent from rent roll'), String(inPlaceRentAnnual)))
  if (lossToLeaseAnnual !== null) fields.push(field(input, hash, parserId, 'financials.lossToLeaseAnnual', 'Loss to Lease Annual', lossToLeaseAnnual, 0.72 - confidencePenalty, 'usd', parsedExcelLocation(parsed, 'lossToLeaseAnnual', 1, 'Annual market rent less annual in-place rent'), String(lossToLeaseAnnual)))

  return {
    documentId: input.documentId,
    status: fields.length > 0 ? 'extracted' : 'unsupported',
    extractedAt: new Date().toISOString(),
    fields,
    metrics: { excelSummary: parsed },
    notes: fields.length > 0
      ? [`Mapped ${fields.length} source-backed fields from Excel rent roll.`, ...warnings.map((warning) => `Parser warning: ${warning}`)]
      : ['Excel rent roll parsed, but no supported fields were found.', ...warnings.map((warning) => `Parser warning: ${warning}`)],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    uploadedData,
  }
}

function mapExcelT12(input: ParserInput, hash: string, parsed: Record<string, unknown>): ParserExtractionPreview {
  const parserId = 'excel-t12-parser'
  const summary = asRecord(parsed.summary)
  const fields: ParserExtractionField[] = []
  const warnings = parsedWarnings(parsed)
  const uploadedData = uploadedDataFromExcelParsed(input, parsed, 'T12 Worksheet')
  const confidencePenalty = warnings.length > 0 ? 0.04 : 0
  const revenue = numberFieldValue(summary.effectiveGrossIncome)
  const expenses = numberFieldValue(summary.totalExpenses)
  const noi = numberFieldValue(summary.netOperatingIncome)

  if (revenue !== null) fields.push(field(input, hash, parserId, 'financials.trailingT12Revenue', 'Trailing T12 Revenue', revenue, 0.82 - confidencePenalty, 'usd', parsedExcelLocation(parsed, 'effectiveGrossIncome', 2, 'Effective gross income / total revenue row'), String(revenue)))
  if (expenses !== null) fields.push(field(input, hash, parserId, 'financials.trailingT12Expenses', 'Trailing T12 Expenses', Math.abs(expenses), 0.88 - confidencePenalty, 'usd', parsedExcelLocation(parsed, 'totalExpenses', 3, 'Total operating expenses row'), String(expenses)))
  if (noi !== null) fields.push(field(input, hash, parserId, 'financials.currentNOI', 'Current NOI', noi, 0.92 - confidencePenalty, 'usd', parsedExcelLocation(parsed, 'netOperatingIncome', 4, 'Net operating income row'), String(noi)))

  return {
    documentId: input.documentId,
    status: fields.length > 0 ? 'extracted' : 'unsupported',
    extractedAt: new Date().toISOString(),
    fields,
    metrics: { excelSummary: parsed },
    notes: fields.length > 0
      ? [`Mapped ${fields.length} source-backed fields from Excel T12.`, ...warnings.map((warning) => `Parser warning: ${warning}`)]
      : ['Excel T12 parsed, but no supported fields were found.', ...warnings.map((warning) => `Parser warning: ${warning}`)],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    uploadedData,
  }
}

function parseExcelIfAvailable(input: ParserInput, hash: string): ParserExtractionPreview {
  const scriptPath = join(input.projectRoot, 'scripts', 'parse_excel.py')
  const parserId = 'excel-python-parser'
  if (!existsSync(scriptPath)) {
    return unavailable(input, hash, parserId, 'Excel parser script is not available.')
  }
  const documentType = input.type === 'rent_roll' ? 'rent_roll' : input.type === 't12' ? 't12' : 'auto'
  const { parsed, parseFailedError, unavailableError } = runExcelPythonParser(input, documentType)
  // The FILE is bad (e.g. corrupt/non-zip .xlsx): distinct from a missing
  // interpreter/dependency. Surface as parse_failed, not parser-unavailable.
  if (parseFailedError) return parseFailed(input, hash, parserId, redactPaths(parseFailedError))
  if (!parsed) return unavailable(input, hash, parserId, redactPaths(unavailableError || 'Excel parser failed.'))
  if (parsed.success === false) {
    const failureError = typeof parsed.error === 'string' ? parsed.error : 'The file could not be parsed.'
    // A structured failure from a successful (exit 0) run is still a file
    // problem unless it is a deps-missing message.
    if (isDepsMissing(failureError)) {
      return unavailable(input, hash, parserId, redactPaths(failureError))
    }
    return parseFailed(input, hash, parserId, redactPaths(failureError))
  }
  if (parsed.needsOcr === true) {
    const warnings = parsedWarnings(parsed)
    return {
      documentId: input.documentId,
      status: 'unsupported',
      extractedAt: new Date().toISOString(),
      fields: [],
      metrics: ocrBridgeMetrics({ excelSummary: parsed }),
      notes: [
        'Excel sheet appears to be image-only/scanned and needs OCR; no tabular fields could be extracted.',
        ...warnings.map((warning) => `Parser warning: ${warning}`),
      ],
      parserId: 'excel-image-ocr-parser',
      parserVersion: PARSER_VERSION,
      sourceHash: hash,
      reviewStatus: 'candidate',
      error: 'Image-only Excel sheet requires OCR.',
    }
  }
  if (documentType === 'rent_roll') return mapExcelRentRoll(input, hash, parsed)
  if (documentType === 't12') return mapExcelT12(input, hash, parsed)
  return {
    documentId: input.documentId,
    status: 'unsupported',
    extractedAt: new Date().toISOString(),
    fields: [],
    metrics: { excelSummary: parsed },
    notes: ['Excel parsed successfully, but no source-backed field mapping exists for this document type yet.'],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    uploadedData: uploadedDataFromExcelParsed(input, parsed, 'Excel Worksheet'),
  }
}

interface PdfBridgeField {
  path: string
  label: string
  value: unknown
  confidence: number
  page: number
  raw?: string
  unit?: string
}

function asPdfBridgeFields(parsed: Record<string, unknown>): PdfBridgeField[] {
  if (!Array.isArray(parsed.fields)) return []
  const fields: PdfBridgeField[] = []
  for (const entry of parsed.fields) {
    const record = asRecord(entry)
    const path = typeof record.path === 'string' ? record.path : ''
    const label = typeof record.label === 'string' ? record.label : path
    const confidence = numberFieldValue(record.confidence)
    const page = numberFieldValue(record.page)
    if (!path || confidence === null) continue
    fields.push({
      path,
      label,
      value: record.value ?? null,
      confidence,
      page: page !== null && page >= 1 ? Math.trunc(page) : 1,
      raw: typeof record.raw === 'string' ? record.raw : undefined,
      unit: typeof record.unit === 'string' ? record.unit : undefined,
    })
  }
  return fields
}

// Map a document's classified type to the --type value parse_pdf.py dispatches
// on. Legal documents (psa / title / estoppel) get their own lean matcher sets;
// anything unrecognized falls back to 'auto' (headline acquisition matchers).
const PDF_DOC_TYPE_BY_INPUT: Record<string, string> = {
  rent_roll: 'rent_roll',
  t12: 't12',
  offering_memo: 'offering_memo',
  psa: 'psa',
  title: 'title_commitment',
  title_commitment: 'title_commitment',
  estoppel: 'estoppel',
}

function pdfDocumentType(inputType: string): string {
  return PDF_DOC_TYPE_BY_INPUT[inputType] ?? 'auto'
}

function parsePdfIfAvailable(input: ParserInput, hash: string): ParserExtractionPreview {
  const scriptPath = join(input.projectRoot, 'scripts', 'parse_pdf.py')
  const parserId = 'pdf-text-parser'
  if (!existsSync(scriptPath)) {
    return unavailable(input, hash, parserId, 'PDF parser script is not available.')
  }
  const documentType = pdfDocumentType(input.type)
  const { parsed, parseFailedError, unavailableError } = runPdfPythonParser(input, documentType)
  // The FILE is bad (e.g. an unreadable/corrupt PDF): distinct from a missing
  // interpreter/dependency. Surface as parse_failed, not parser-unavailable.
  if (parseFailedError) return parseFailed(input, hash, parserId, redactPaths(parseFailedError))
  if (!parsed) return unavailable(input, hash, parserId, redactPaths(unavailableError || 'PDF parser failed.'))
  if (parsed.success === false) {
    const failureError = typeof parsed.error === 'string' ? parsed.error : 'The file could not be parsed.'
    if (isDepsMissing(failureError)) {
      return unavailable(input, hash, parserId, redactPaths(failureError))
    }
    return parseFailed(input, hash, parserId, redactPaths(failureError))
  }
  const warnings = parsedWarnings(parsed)

  // W21: Scanned / image-only PDF with no extractable text layer. Degrade
  // gracefully to an explicit needs-OCR status rather than a silent empty
  // result or a crash. Mirrors the Excel image-only path.
  if (parsed.needsOcr === true) {
    const ocrResult = runPdfOcrBridge(input, documentType)
    if (ocrResult.parsed?.success === true) {
      const ocrWarnings = parsedWarnings(ocrResult.parsed)
      const bridgeFields = asPdfBridgeFields(ocrResult.parsed)
      const fields: ParserExtractionField[] = bridgeFields.map((bridgeField) =>
        field(
          input,
          hash,
          'pdf-local-ocr-parser',
          bridgeField.path,
          bridgeField.label,
          bridgeField.value,
          Math.min(bridgeField.confidence, 0.78),
          bridgeField.unit,
          { page: bridgeField.page, description: `OCR text from PDF page ${bridgeField.page}` },
          bridgeField.raw,
        ),
      )
      const ocrProvenance = asRecord(ocrResult.parsed.provenance)
      return {
        documentId: input.documentId,
        status: fields.length > 0 ? 'extracted' : 'unsupported',
        extractedAt: new Date().toISOString(),
        fields,
        metrics: ocrBridgeMetrics({
          pdfProvenance: asRecord(parsed.provenance),
          ocrProvenance,
        }, fields.length > 0 ? 'completed' : 'completed-no-fields'),
        notes: fields.length > 0
          ? [
              `OCR extracted ${fields.length} source-backed field(s) from the scanned PDF; review before applying.`,
              ...ocrWarnings.map((warning) => `OCR warning: ${warning}`),
              ...warnings.map((warning) => `Parser warning: ${warning}`),
            ]
          : [
              'OCR completed, but no supported headline fields were found.',
              ...ocrWarnings.map((warning) => `OCR warning: ${warning}`),
              ...warnings.map((warning) => `Parser warning: ${warning}`),
            ],
        parserId: 'pdf-local-ocr-parser',
        parserVersion: PARSER_VERSION,
        sourceHash: hash,
        reviewStatus: 'candidate',
        ...(fields.length > 0 ? {} : { error: 'OCR completed but no supported fields were found.' }),
      }
    }

    return {
      documentId: input.documentId,
      status: 'unsupported',
      extractedAt: new Date().toISOString(),
      fields: [],
      metrics: ocrBridgeMetrics({
        pdfProvenance: asRecord(parsed.provenance),
        ocrError: ocrResult.unavailableError || ocrResult.parseFailedError || 'OCR bridge failed.',
      }, 'unavailable'),
      notes: [
        'PDF appears to be scanned/image-only and the local OCR bridge could not run.',
        ...warnings.map((warning) => `Parser warning: ${warning}`),
      ],
      parserId: 'pdf-image-ocr-parser',
      parserVersion: PARSER_VERSION,
      sourceHash: hash,
      reviewStatus: 'candidate',
      error: ocrResult.unavailableError || ocrResult.parseFailedError || 'Image-only/scanned PDF requires OCR.',
    }
  }

  // W20: Text-based PDF. Map each bridge field into a source-backed candidate
  // field with page-level provenance (location.page).
  const bridgeFields = asPdfBridgeFields(parsed)
  const fields: ParserExtractionField[] = bridgeFields.map((bridgeField) =>
    field(
      input,
      hash,
      parserId,
      bridgeField.path,
      bridgeField.label,
      bridgeField.value,
      bridgeField.confidence,
      bridgeField.unit,
      { page: bridgeField.page, description: `Extracted from PDF page ${bridgeField.page}` },
      bridgeField.raw,
    ),
  )

  return {
    documentId: input.documentId,
    status: fields.length > 0 ? 'extracted' : 'unsupported',
    extractedAt: new Date().toISOString(),
    fields,
    metrics: { needsOcr: false, pdfProvenance: asRecord(parsed.provenance) },
    notes: fields.length > 0
      ? [`Mapped ${fields.length} source-backed field(s) from the PDF text layer.`, ...warnings.map((warning) => `Parser warning: ${warning}`)]
      : ['PDF text layer was readable, but no headline metrics were found.', ...warnings.map((warning) => `Parser warning: ${warning}`)],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
  }
}

function parseFailed(
  input: ParserInput,
  hash: string,
  parserId: string,
  error: string,
  uploadedData?: UploadedDataProfile,
): ParserExtractionPreview {
  return {
    documentId: input.documentId,
    status: 'parse_failed',
    extractedAt: new Date().toISOString(),
    fields: [],
    metrics: {},
    notes: ['The local parser could not safely interpret this document. Store it as a source file and fix or replace it before applying fields.'],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    uploadedData,
    error,
  }
}

function unavailable(input: ParserInput, hash: string, parserId: string, error: string): ParserExtractionPreview {
  return {
    documentId: input.documentId,
    status: 'parser-unavailable',
    extractedAt: new Date().toISOString(),
    fields: [],
    metrics: {},
    notes: ['File was stored and classified, but this parser is unavailable in the local environment.'],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    error,
  }
}

export function runDocumentParser(input: ParserInput): ParserExtractionPreview {
  const extension = extname(input.fileName).toLowerCase()
  const candidateBases = [input.allowedBasePath, input.projectRoot].filter((base): base is string => typeof base === 'string' && base.length > 0)
  let safeFilePath = ''
  let safePathError: Error | null = null
  for (const base of candidateBases) {
    try {
      safeFilePath = safePaths.assertWithinBase(base, input.filePath, 'parser input file path')
      safePathError = null
      break
    } catch (error) {
      safePathError = error instanceof Error ? error : new Error(String(error))
    }
  }
  if (!safeFilePath) {
    throw safePathError ?? new Error('Parser input file path is not within an allowed base')
  }
  const safeInput: ParserInput = { ...input, filePath: safeFilePath }
  const hash = fileHash(safeFilePath)

  if (isParserPendingOnly(safeInput.fileName, safeInput.mime)) {
    return parsePdfIfAvailable(safeInput, hash)
  }

  if (extension === '.xlsx') return parseExcelIfAvailable(safeInput, hash)
  if (!isParserRunnable(safeInput.fileName, safeInput.mime)) {
    return {
      documentId: safeInput.documentId,
      status: 'unsupported',
      extractedAt: new Date().toISOString(),
      fields: [],
      metrics: {},
      notes: ['Document was stored and classified, but no local parser exists for this file type yet.'],
      parserId: 'unsupported-parser',
      parserVersion: PARSER_VERSION,
      sourceHash: hash,
      reviewStatus: 'candidate',
    }
  }

  let raw = ''
  try {
    // Size guard (P3): the native text path parses fully in-process with no
    // spawn timeout, so cap on-disk bytes before reading the whole file into
    // memory. A file past the cap degrades to parse_failed instead of risking
    // heap exhaustion / unbounded latency.
    const byteSize = statSync(safeFilePath).size
    if (byteSize > MAX_TEXT_PARSE_BYTES) {
      const sizeMb = (byteSize / 1024 / 1024).toFixed(1)
      const capMb = (MAX_TEXT_PARSE_BYTES / 1024 / 1024).toFixed(0)
      return parseFailed(
        safeInput,
        hash,
        'text-parser',
        `File too large for in-process parsing (${sizeMb} MB exceeds the ${capMb} MB cap); split or pre-process the file before parsing.`,
      )
    }
    raw = readFileSync(safeFilePath, 'utf8')
    if (safeInput.type === 'offering_memo') return parseOfferingMemo(safeInput, raw, hash)
    if (['other', 'legal', 'closing'].includes(safeInput.type)) {
      const checklistCandidatePreview = mapChecklistCandidates(safeInput, raw, hash)
      if (checklistCandidatePreview.fields.length > 0) return checklistCandidatePreview
    }
    const rows = parseCsvRows(raw)
    // Row guard (P3): a file under the byte cap can still carry an unreasonable
    // number of rows; cap the parsed-row count as a second graceful backstop.
    if (rows.length > MAX_TEXT_PARSE_ROWS) {
      return parseFailed(
        safeInput,
        hash,
        'text-parser',
        `File too large for in-process parsing (${rows.length} rows exceeds the ${MAX_TEXT_PARSE_ROWS} row cap); split or pre-process the file before parsing.`,
      )
    }
    if (safeInput.type === 'rent_roll') return parseRentRoll(safeInput, rows, hash)
    if (safeInput.type === 't12') return parseT12(safeInput, rows, hash)
  } catch (error) {
    return parseFailed(safeInput, hash, 'text-parser', error instanceof Error ? error.message : String(error))
  }

  return {
    documentId: safeInput.documentId,
    status: 'unsupported',
    extractedAt: new Date().toISOString(),
    fields: [],
    metrics: { characterCount: raw.length },
    notes: ['Document text was readable, but no extraction template exists for this type yet.'],
    parserId: 'unsupported-text-parser',
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
    uploadedData: buildTextUploadedDataProfile(safeInput, raw),
  }
}
