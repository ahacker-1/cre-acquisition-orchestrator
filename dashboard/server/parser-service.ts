import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { extname, join } from 'path'
import { spawnSync } from 'child_process'

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
  error?: string
}

export interface ParserInput {
  documentId: string
  fileName: string
  filePath: string
  mime: string
  type: string
  projectRoot: string
}

const PARSER_VERSION = 'source-backed-v1'

export function isParserRunnable(fileName: string, mime: string): boolean {
  const extension = extname(fileName).toLowerCase()
  return ['.csv', '.txt', '.md', '.xlsx'].includes(extension) || mime.startsWith('text/')
}

export function isParserPendingOnly(fileName: string, mime: string): boolean {
  const extension = extname(fileName).toLowerCase()
  return extension === '.pdf' || mime === 'application/pdf'
}

export function fileHash(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
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
      row.push(cell.trim())
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell.trim())
      if (row.some((entry) => entry.length > 0)) rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  row.push(cell.trim())
  if (row.some((entry) => entry.length > 0)) rows.push(row)
  if (inQuotes) {
    throw new Error('Malformed CSV: unclosed quoted field.')
  }
  return rows
}

function numberFromCell(value: string): number | null {
  const normalized = value.replace(/[$,%]/g, '').replace(/,/g, '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function average(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

function parseRentRoll(input: ParserInput, rows: string[][], hash: string): ParserExtractionPreview {
  const parserId = 'rent-roll-csv-parser'
  const header = rows[0] ?? []
  const records = rows.slice(1)
  const unitTypeIndex = header.findIndex((cell) => /unit type|bed\/bath|floorplan/i.test(cell))
  const sqftIndex = header.findIndex((cell) => /sqft|square/i.test(cell))
  const marketRentIndex = header.findIndex((cell) => /market rent|asking rent/i.test(cell))
  const currentRentIndex = header.findIndex((cell) => /current rent|contract rent|in-place/i.test(cell))
  const statusIndex = header.findIndex((cell) => /status|occupancy/i.test(cell))
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
    if (market !== null) bucket.market.push(market)
    if (current !== null) bucket.current.push(current)
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
    metrics: { rows: records.length, columns: header, occupied },
    notes: [`Parsed ${records.length} rent roll rows`],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
  }
}

function parseT12(input: ParserInput, rows: string[][], hash: string): ParserExtractionPreview {
  const parserId = 't12-csv-parser'
  const headerIndex = rows.findIndex((row) => row.some((cell) => /^line item$/i.test(cell)))
  const header = headerIndex >= 0 ? rows[headerIndex] : rows[0] ?? []
  const totalIndex = header.findIndex((cell) => /t12 total|total|annual/i.test(cell))
  const lineItemIndex = header.findIndex((cell) => /line item|account/i.test(cell))
  const records = rows.slice(headerIndex >= 0 ? headerIndex + 1 : 1)
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
  if (expenses) fields.push(field(input, hash, parserId, 'financials.trailingT12Expenses', 'Trailing T12 Expenses', expenses.value, 0.88, 'usd', { row: expenses.rowNumber, column: header[totalIndex] }, expenses.raw))
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
  }
}

function parseOfferingMemo(input: ParserInput, raw: string, hash: string): ParserExtractionPreview {
  const parserId = 'offering-memo-text-parser'
  const fields: ParserExtractionField[] = []
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
    metrics: { characterCount: raw.length },
    notes: fields.length > 0 ? ['Extracted offering memo headline metrics'] : ['No headline metrics found in memo text'],
    parserId,
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
  }
}

function parseExcelIfAvailable(input: ParserInput, hash: string): ParserExtractionPreview {
  const scriptPath = join(input.projectRoot, 'scripts', 'parse_excel.py')
  const parserId = 'excel-python-parser'
  if (!existsSync(scriptPath)) {
    return unavailable(input, hash, parserId, 'Excel parser script is not available.')
  }
  const documentType = input.type === 'rent_roll' ? 'rent_roll' : input.type === 't12' ? 't12' : 'auto'
  const result = spawnSync('py', ['-3', scriptPath, input.filePath, '--type', documentType], {
    cwd: input.projectRoot,
    encoding: 'utf8',
    timeout: 15000,
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
  if (result.error || result.status !== 0) {
    return unavailable(input, hash, parserId, output || result.error?.message || 'Excel parser failed.')
  }
  try {
    const parsed = JSON.parse(result.stdout || '{}') as Record<string, unknown>
    if (parsed.success === false) {
      return unavailable(input, hash, parserId, typeof parsed.error === 'string' ? parsed.error : 'Excel parser unavailable.')
    }
    return {
      documentId: input.documentId,
      status: 'unsupported',
      extractedAt: new Date().toISOString(),
      fields: [],
      metrics: { excelSummary: parsed },
      notes: ['Excel parsed successfully, but source-backed field mapping for XLSX is not enabled in this milestone.'],
      parserId,
      parserVersion: PARSER_VERSION,
      sourceHash: hash,
      reviewStatus: 'candidate',
    }
  } catch {
    return parseFailed(input, hash, parserId, output || 'Excel parser returned invalid JSON.')
  }
}

function parseFailed(input: ParserInput, hash: string, parserId: string, error: string): ParserExtractionPreview {
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
  const hash = fileHash(input.filePath)

  if (isParserPendingOnly(input.fileName, input.mime)) {
    return {
      documentId: input.documentId,
      status: 'extraction-pending',
      extractedAt: new Date().toISOString(),
      fields: [],
      metrics: {},
      notes: ['PDF was stored and classified. PDF text extraction is not included in this local milestone.'],
      parserId: 'pdf-pending-parser',
      parserVersion: PARSER_VERSION,
      sourceHash: hash,
      reviewStatus: 'candidate',
    }
  }

  if (extension === '.xlsx') return parseExcelIfAvailable(input, hash)
  if (!isParserRunnable(input.fileName, input.mime)) {
    return {
      documentId: input.documentId,
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
    raw = readFileSync(input.filePath, 'utf8')
    if (input.type === 'offering_memo') return parseOfferingMemo(input, raw, hash)
    const rows = parseCsvRows(raw)
    if (input.type === 'rent_roll') return parseRentRoll(input, rows, hash)
    if (input.type === 't12') return parseT12(input, rows, hash)
  } catch (error) {
    return parseFailed(input, hash, 'text-parser', error instanceof Error ? error.message : String(error))
  }

  return {
    documentId: input.documentId,
    status: 'unsupported',
    extractedAt: new Date().toISOString(),
    fields: [],
    metrics: { characterCount: raw.length },
    notes: ['Document text was readable, but no extraction template exists for this type yet.'],
    parserId: 'unsupported-text-parser',
    parserVersion: PARSER_VERSION,
    sourceHash: hash,
    reviewStatus: 'candidate',
  }
}
