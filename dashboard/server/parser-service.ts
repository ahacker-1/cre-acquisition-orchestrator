import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
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
  error?: string
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
  const normalized = value.replace(/^'/, '').replace(/[$,%]/g, '').replace(/,/g, '').trim()
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function numberFieldValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function pythonCandidates(): Array<{ command: string; args: string[] }> {
  const candidates: Array<{ command: string | null; args: string[] }> = []
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

function runExcelPythonParser(input: ParserInput, documentType: string): { parsed?: Record<string, unknown>; error?: string } {
  const scriptPath = safePaths.assertWithinBase(input.projectRoot, join(input.projectRoot, 'scripts', 'parse_excel.py'), 'Excel parser script path')
  const errors: string[] = []
  for (const candidate of pythonCandidates()) {
    const result = spawnSync(candidate.command, [...candidate.args, scriptPath, input.filePath, '--type', documentType], {
      cwd: input.projectRoot,
      encoding: 'utf8',
      timeout: 15000,
    })
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    if (!result.error && result.status === 0) {
      try {
        return { parsed: JSON.parse(result.stdout || '{}') as Record<string, unknown> }
      } catch {
        return { error: output || 'Excel parser returned invalid JSON.' }
      }
    }
    errors.push(`${candidate.command}: ${result.error?.message || output || `exit ${result.status ?? 'unknown'}`}`)
  }
  return { error: errors.join(' | ') }
}

function runPdfPythonParser(input: ParserInput, documentType: string): { parsed?: Record<string, unknown>; error?: string } {
  const scriptPath = safePaths.assertWithinBase(input.projectRoot, join(input.projectRoot, 'scripts', 'parse_pdf.py'), 'PDF parser script path')
  const errors: string[] = []
  for (const candidate of pythonCandidates()) {
    const result = spawnSync(candidate.command, [...candidate.args, scriptPath, input.filePath, '--type', documentType], {
      cwd: input.projectRoot,
      encoding: 'utf8',
      timeout: 15000,
    })
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    if (!result.error && result.status === 0) {
      try {
        return { parsed: JSON.parse(result.stdout || '{}') as Record<string, unknown> }
      } catch {
        return { error: output || 'PDF parser returned invalid JSON.' }
      }
    }
    errors.push(`${candidate.command}: ${result.error?.message || output || `exit ${result.status ?? 'unknown'}`}`)
  }
  return { error: errors.join(' | ') }
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
  }
}

function mapExcelT12(input: ParserInput, hash: string, parsed: Record<string, unknown>): ParserExtractionPreview {
  const parserId = 'excel-t12-parser'
  const summary = asRecord(parsed.summary)
  const fields: ParserExtractionField[] = []
  const warnings = parsedWarnings(parsed)
  const confidencePenalty = warnings.length > 0 ? 0.04 : 0
  const revenue = numberFieldValue(summary.effectiveGrossIncome)
  const expenses = numberFieldValue(summary.totalExpenses)
  const noi = numberFieldValue(summary.netOperatingIncome)

  if (revenue !== null) fields.push(field(input, hash, parserId, 'financials.trailingT12Revenue', 'Trailing T12 Revenue', revenue, 0.82 - confidencePenalty, 'usd', parsedExcelLocation(parsed, 'effectiveGrossIncome', 2, 'Effective gross income / total revenue row'), String(revenue)))
  if (expenses !== null) fields.push(field(input, hash, parserId, 'financials.trailingT12Expenses', 'Trailing T12 Expenses', expenses, 0.88 - confidencePenalty, 'usd', parsedExcelLocation(parsed, 'totalExpenses', 3, 'Total operating expenses row'), String(expenses)))
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
  }
}

function parseExcelIfAvailable(input: ParserInput, hash: string): ParserExtractionPreview {
  const scriptPath = join(input.projectRoot, 'scripts', 'parse_excel.py')
  const parserId = 'excel-python-parser'
  if (!existsSync(scriptPath)) {
    return unavailable(input, hash, parserId, 'Excel parser script is not available.')
  }
  const documentType = input.type === 'rent_roll' ? 'rent_roll' : input.type === 't12' ? 't12' : 'auto'
  const { parsed, error } = runExcelPythonParser(input, documentType)
  if (!parsed) return unavailable(input, hash, parserId, error || 'Excel parser failed.')
  if (parsed.success === false) {
    return unavailable(input, hash, parserId, typeof parsed.error === 'string' ? parsed.error : 'Excel parser unavailable.')
  }
  if (parsed.needsOcr === true) {
    const warnings = parsedWarnings(parsed)
    return {
      documentId: input.documentId,
      status: 'unsupported',
      extractedAt: new Date().toISOString(),
      fields: [],
      metrics: { excelSummary: parsed, needsOcr: true },
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

function parsePdfIfAvailable(input: ParserInput, hash: string): ParserExtractionPreview {
  const scriptPath = join(input.projectRoot, 'scripts', 'parse_pdf.py')
  const parserId = 'pdf-text-parser'
  if (!existsSync(scriptPath)) {
    return unavailable(input, hash, parserId, 'PDF parser script is not available.')
  }
  const documentType =
    input.type === 'rent_roll' ? 'rent_roll' : input.type === 't12' ? 't12' : input.type === 'offering_memo' ? 'offering_memo' : 'auto'
  const { parsed, error } = runPdfPythonParser(input, documentType)
  if (!parsed) return unavailable(input, hash, parserId, error || 'PDF parser failed.')
  if (parsed.success === false) {
    return unavailable(input, hash, parserId, typeof parsed.error === 'string' ? parsed.error : 'PDF parser unavailable.')
  }
  const warnings = parsedWarnings(parsed)

  // W21: Scanned / image-only PDF with no extractable text layer. Degrade
  // gracefully to an explicit needs-OCR status rather than a silent empty
  // result or a crash. Mirrors the Excel image-only path.
  if (parsed.needsOcr === true) {
    return {
      documentId: input.documentId,
      status: 'unsupported',
      extractedAt: new Date().toISOString(),
      fields: [],
      metrics: { needsOcr: true, pdfProvenance: asRecord(parsed.provenance) },
      notes: [
        'PDF appears to be scanned/image-only and needs OCR; no text-layer fields could be extracted.',
        ...warnings.map((warning) => `Parser warning: ${warning}`),
      ],
      parserId: 'pdf-image-ocr-parser',
      parserVersion: PARSER_VERSION,
      sourceHash: hash,
      reviewStatus: 'candidate',
      error: 'Image-only/scanned PDF requires OCR.',
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
    raw = readFileSync(safeFilePath, 'utf8')
    if (safeInput.type === 'offering_memo') return parseOfferingMemo(safeInput, raw, hash)
    const rows = parseCsvRows(raw)
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
  }
}
