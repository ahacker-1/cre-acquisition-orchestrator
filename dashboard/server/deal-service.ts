import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs'
import { basename, join } from 'path'

export type DealLibraryKind = 'user' | 'sample'
export type SavedDealState = 'draft' | 'ready' | 'sample'
export type ValidationMode = 'draft' | 'launch'

export interface ValidationIssue {
  path: string
  severity: 'error' | 'warning'
  message: string
}

export interface DealValidationResult {
  valid: boolean
  launchReady: boolean
  issues: ValidationIssue[]
  blockingIssues: ValidationIssue[]
  warnings: ValidationIssue[]
}

export interface DealLibraryItem {
  dealId: string
  dealName: string
  kind: DealLibraryKind
  readOnly: boolean
  saveState: SavedDealState
  dealPath: string
  updatedAt: string
  createdAt?: string
  city?: string
  state?: string
  address?: string
  investmentStrategy?: string
  totalUnits?: number | null
  askingPrice?: number | null
  pipelineStatus?: string | null
}

export interface DealRecord {
  item: DealLibraryItem
  deal: Record<string, unknown>
  validation: DealValidationResult
}

interface DealMeta {
  dealId: string
  saveState: 'draft' | 'ready'
  createdAt: string
  updatedAt: string
  lastLaunchedAt?: string
}

interface ServiceContext {
  dataRoot: string
  projectRoot: string
  statusDir: string
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

function dealsRoot(dataRoot: string): string {
  return join(dataRoot, 'deals')
}

function samplesRoot(projectRoot: string): string {
  return join(projectRoot, 'demo', 'deals')
}

function metaPathForDeal(dataRoot: string, dealId: string): string {
  return join(dealsRoot(dataRoot), dealId, 'meta.json')
}

function dealPathForDeal(dataRoot: string, dealId: string): string {
  return join(dealsRoot(dataRoot), dealId, 'deal.json')
}

function checkpointPathForDeal(statusDir: string, dealId: string): string {
  return join(statusDir, `${dealId}.json`)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function inferType(value: unknown): 'null' | 'array' | 'object' | 'string' | 'number' | 'integer' | 'boolean' {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return 'object'
}

function normalizeTypeList(typeValue: unknown): string[] {
  if (typeof typeValue === 'string') return [typeValue]
  if (Array.isArray(typeValue)) {
    return typeValue.filter((value): value is string => typeof value === 'string')
  }
  return []
}

function matchesAllowedType(value: unknown, allowedTypes: string[]): boolean {
  if (allowedTypes.length === 0) return true
  const actualType = inferType(value)
  return allowedTypes.some((allowed) => {
    if (allowed === actualType) return true
    if (allowed === 'number' && actualType === 'integer') return true
    if (allowed === 'integer' && actualType === 'number') return Number.isInteger(value)
    return false
  })
}

function addIssue(
  issues: ValidationIssue[],
  severity: 'error' | 'warning',
  path: string,
  message: string,
): void {
  issues.push({
    path,
    severity,
    message,
  })
}

function validateAgainstSchema(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
  mode: ValidationMode,
): void {
  if (value === undefined) return

  const allowedTypes = normalizeTypeList(schema.type)
  if (!matchesAllowedType(value, allowedTypes)) {
    addIssue(
      issues,
      'error',
      path,
      `Expected ${allowedTypes.join(' or ') || 'valid type'}, received ${inferType(value)}`,
    )
    return
  }

  if (value === null) return

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    addIssue(
      issues,
      'error',
      path,
      `Must be one of: ${schema.enum.map(String).join(', ')}`,
    )
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      addIssue(issues, 'error', path, `Must be at least ${schema.minLength} characters`)
    }
    if (typeof schema.pattern === 'string') {
      try {
        const regex = new RegExp(schema.pattern)
        if (!regex.test(value)) {
          addIssue(issues, 'error', path, 'Has an invalid format')
        }
      } catch {
        // Ignore malformed schema regex.
      }
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      addIssue(issues, 'error', path, `Must be at least ${schema.minimum}`)
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      addIssue(issues, 'error', path, `Must be at most ${schema.maximum}`)
    }
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      addIssue(issues, 'error', path, `Must be greater than ${schema.exclusiveMinimum}`)
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      addIssue(issues, 'error', path, `Must include at least ${schema.minItems} item(s)`)
    }
    const itemSchema = asObject(schema.items)
    value.forEach((entry, index) => {
      validateAgainstSchema(entry, itemSchema, `${path}[${index}]`, issues, mode)
    })
    return
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    const properties = asObject(schema.properties)
    const required = Array.isArray(schema.required)
      ? schema.required.filter((entry): entry is string => typeof entry === 'string')
      : []

    required.forEach((key) => {
      if (objectValue[key] === undefined) {
        addIssue(
          issues,
          mode === 'launch' ? 'error' : 'warning',
          path ? `${path}.${key}` : key,
          'Required field is missing',
        )
      }
    })

    Object.entries(properties).forEach(([key, propSchema]) => {
      if (objectValue[key] !== undefined) {
        validateAgainstSchema(
          objectValue[key],
          asObject(propSchema),
          path ? `${path}.${key}` : key,
          issues,
          mode,
        )
      }
    })
  }
}

function validateBusinessRules(
  deal: Record<string, unknown>,
  issues: ValidationIssue[],
  mode: ValidationMode,
): void {
  const property = asObject(deal.property)
  const unitMix = asObject(property.unitMix)
  const unitTypes = asArray(unitMix.types)
  const totalUnits = asNumber(property.totalUnits)

  if (totalUnits !== null && unitTypes.length > 0) {
    const unitMixTotal = unitTypes.reduce<number>((sum, entry) => {
      const row = asObject(entry)
      return sum + (asNumber(row.count) ?? 0)
    }, 0)
    if (unitMixTotal !== totalUnits) {
      addIssue(
        issues,
        mode === 'launch' ? 'error' : 'warning',
        'property.unitMix.types',
        `Unit mix count (${unitMixTotal}) does not match total units (${totalUnits})`,
      )
    }
  }

  const timeline = asObject(deal.timeline)
  const psaExecutionDate = asString(timeline.psaExecutionDate)
  const ddStartDate = asString(timeline.ddStartDate)
  const ddExpirationDate = asString(timeline.ddExpirationDate)
  const closingDate = asString(timeline.closingDate)

  const parsedPsa = psaExecutionDate ? Date.parse(psaExecutionDate) : Number.NaN
  const parsedDdStart = ddStartDate ? Date.parse(ddStartDate) : Number.NaN
  const parsedDdExpiration = ddExpirationDate ? Date.parse(ddExpirationDate) : Number.NaN
  const parsedClosing = closingDate ? Date.parse(closingDate) : Number.NaN
  const severity = mode === 'launch' ? 'error' : 'warning'

  if (Number.isFinite(parsedPsa) && Number.isFinite(parsedDdStart) && parsedDdStart < parsedPsa) {
    addIssue(issues, severity, 'timeline.ddStartDate', 'Due diligence start date must be on or after PSA execution')
  }
  if (
    Number.isFinite(parsedDdStart) &&
    Number.isFinite(parsedDdExpiration) &&
    parsedDdExpiration < parsedDdStart
  ) {
    addIssue(issues, severity, 'timeline.ddExpirationDate', 'Due diligence expiration must be on or after due diligence start')
  }
  if (
    Number.isFinite(parsedDdExpiration) &&
    Number.isFinite(parsedClosing) &&
    parsedClosing < parsedDdExpiration
  ) {
    addIssue(issues, severity, 'timeline.closingDate', 'Closing date must be on or after due diligence expiration')
  }
}

function validateDealIdConflict(
  deal: Record<string, unknown>,
  issues: ValidationIssue[],
  existingIds: string[],
  currentDealId?: string,
): void {
  const dealId = asString(deal.dealId)
  if (!dealId) return
  const conflict = existingIds.some((existing) => existing === dealId && existing !== currentDealId)
  if (conflict) {
    addIssue(issues, 'error', 'dealId', 'A deal with this ID already exists')
  }
}

function loadDealSchema(projectRoot: string): Record<string, unknown> {
  const schemaPath = join(projectRoot, 'config', 'deal-schema.json')
  return readJsonSafe(schemaPath) ?? {}
}

export function validateDealConfig(
  deal: Record<string, unknown>,
  context: { projectRoot: string; mode: ValidationMode; existingIds?: string[]; currentDealId?: string },
): DealValidationResult {
  const schema = loadDealSchema(context.projectRoot)
  const issues: ValidationIssue[] = []

  validateAgainstSchema(deal, schema, '', issues, context.mode)
  validateBusinessRules(deal, issues, context.mode)
  validateDealIdConflict(deal, issues, context.existingIds ?? [], context.currentDealId)

  const blockingIssues = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')

  return {
    valid: blockingIssues.length === 0,
    launchReady: blockingIssues.length === 0 && context.mode === 'launch',
    issues,
    blockingIssues,
    warnings,
  }
}

function summarizeDeal(
  kind: DealLibraryKind,
  dealPath: string,
  deal: Record<string, unknown>,
  meta: DealMeta | null,
  pipelineStatus: string | null,
): DealLibraryItem {
  const property = asObject(deal.property)
  const financials = asObject(deal.financials)
  const updatedAt =
    meta?.updatedAt ??
    (existsSync(dealPath) ? statSync(dealPath).mtime.toISOString() : new Date().toISOString())

  return {
    dealId: asString(deal.dealId) ?? basename(dealPath, '.json'),
    dealName: asString(deal.dealName) ?? asString(deal.dealId) ?? 'Untitled Deal',
    kind,
    readOnly: kind === 'sample',
    saveState: kind === 'sample' ? 'sample' : meta?.saveState ?? 'draft',
    dealPath,
    updatedAt,
    createdAt: meta?.createdAt,
    city: asString(property.city),
    state: asString(property.state),
    address: asString(property.address),
    investmentStrategy: asString(deal.investmentStrategy),
    totalUnits: asNumber(property.totalUnits),
    askingPrice: asNumber(financials.askingPrice),
    pipelineStatus,
  }
}

function readPipelineStatus(statusDir: string, dealId: string): string | null {
  const checkpoint = readJsonSafe(checkpointPathForDeal(statusDir, dealId))
  return checkpoint && typeof checkpoint.status === 'string' ? checkpoint.status : null
}

function listUserDeals(context: ServiceContext): DealLibraryItem[] {
  const root = dealsRoot(context.dataRoot)
  ensureDir(root)

  return readdirSync(root)
    .map((entry) => join(root, entry))
    .filter((entryPath) => existsSync(entryPath) && statSync(entryPath).isDirectory())
    .map((entryPath) => {
      const dealFilePath = join(entryPath, 'deal.json')
      const metaFilePath = join(entryPath, 'meta.json')
      const deal = readJsonSafe(dealFilePath)
      if (!deal) return null
      const meta = readJsonSafe(metaFilePath) as DealMeta | null
      const dealId = asString(deal.dealId) ?? basename(entryPath)
      return summarizeDeal(
        'user',
        dealFilePath,
        deal,
        meta,
        readPipelineStatus(context.statusDir, dealId),
      )
    })
    .filter((entry): entry is DealLibraryItem => entry !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function listSampleDeals(context: ServiceContext): DealLibraryItem[] {
  const root = samplesRoot(context.projectRoot)
  if (!existsSync(root)) return []

  return readdirSync(root)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => {
      const dealFilePath = join(root, entry)
      const deal = readJsonSafe(dealFilePath)
      if (!deal) return null
      const dealId = asString(deal.dealId) ?? basename(entry, '.json')
      return summarizeDeal(
        'sample',
        dealFilePath,
        deal,
        null,
        readPipelineStatus(context.statusDir, dealId),
      )
    })
    .filter((entry): entry is DealLibraryItem => entry !== null)
    .sort((a, b) => a.dealName.localeCompare(b.dealName))
}

export function suggestNextDealId(existingIds: string[], referenceDate = new Date()): string {
  const year = referenceDate.getFullYear()
  const prefix = `DEAL-${year}-`
  let maxSuffix = 0

  existingIds.forEach((dealId) => {
    if (!dealId.startsWith(prefix)) return
    const suffix = Number.parseInt(dealId.slice(prefix.length), 10)
    if (Number.isFinite(suffix)) {
      maxSuffix = Math.max(maxSuffix, suffix)
    }
  })

  return `${prefix}${String(maxSuffix + 1).padStart(3, '0')}`
}

export function listDealLibrary(context: ServiceContext): {
  deals: DealLibraryItem[]
  suggestedDealId: string
} {
  const userDeals = listUserDeals(context)
  const sampleDeals = listSampleDeals(context)
  const allIds = [...userDeals, ...sampleDeals].map((item) => item.dealId)

  return {
    deals: [...userDeals, ...sampleDeals],
    suggestedDealId: suggestNextDealId(allIds),
  }
}

export function getDealRecord(
  context: ServiceContext,
  dealId: string,
): DealRecord | null {
  const userDealPath = dealPathForDeal(context.dataRoot, dealId)
  if (existsSync(userDealPath)) {
    const deal = readJsonSafe(userDealPath)
    if (!deal) return null
    const meta = readJsonSafe(metaPathForDeal(context.dataRoot, dealId)) as DealMeta | null
    const libraryIds = listDealLibrary(context).deals.map((entry) => entry.dealId)
    const validation = validateDealConfig(deal, {
      projectRoot: context.projectRoot,
      mode: 'launch',
      existingIds: libraryIds,
      currentDealId: dealId,
    })
    return {
      item: summarizeDeal('user', userDealPath, deal, meta, readPipelineStatus(context.statusDir, dealId)),
      deal,
      validation,
    }
  }

  const samplePath = join(samplesRoot(context.projectRoot), `${dealId}.json`)
  const sampleByFileName = existsSync(samplePath) ? samplePath : null

  if (sampleByFileName) {
    const deal = readJsonSafe(sampleByFileName)
    if (!deal) return null
    return {
      item: summarizeDeal('sample', sampleByFileName, deal, null, readPipelineStatus(context.statusDir, dealId)),
      deal,
      validation: {
        valid: true,
        launchReady: true,
        issues: [],
        blockingIssues: [],
        warnings: [],
      },
    }
  }

  const sampleFiles = listSampleDeals(context)
  const match = sampleFiles.find((entry) => entry.dealId === dealId)
  if (match) {
    const deal = readJsonSafe(match.dealPath)
    if (!deal) return null
    return {
      item: match,
      deal,
      validation: {
        valid: true,
        launchReady: true,
        issues: [],
        blockingIssues: [],
        warnings: [],
      },
    }
  }

  const configDealPath = join(context.projectRoot, 'config', 'deal.json')
  const configDeal = readJsonSafe(configDealPath)
  if (configDeal && asString(configDeal.dealId) === dealId) {
    const validation = validateDealConfig(configDeal, {
      projectRoot: context.projectRoot,
      mode: 'launch',
      existingIds: listDealLibrary(context).deals.map((entry) => entry.dealId),
      currentDealId: dealId,
    })
    return {
      item: summarizeDeal('sample', configDealPath, configDeal, null, readPipelineStatus(context.statusDir, dealId)),
      deal: configDeal,
      validation,
    }
  }

  return null
}

export function saveUserDeal(
  context: ServiceContext,
  request: {
    deal: Record<string, unknown>
    mode: ValidationMode
    currentDealId?: string
  },
): DealRecord {
  const dealId = asString(request.deal.dealId)
  if (!dealId) {
    throw new Error('Missing required field: dealId')
  }

  const library = listDealLibrary(context)
  const validation = validateDealConfig(request.deal, {
    projectRoot: context.projectRoot,
    mode: request.mode,
    existingIds: library.deals.map((entry) => entry.dealId),
    currentDealId: request.currentDealId,
  })

  if (validation.blockingIssues.length > 0) {
    const error = new Error('Validation failed')
    ;(error as Error & { validation?: DealValidationResult }).validation = validation
    throw error
  }

  const root = dealsRoot(context.dataRoot)
  ensureDir(root)

  if (request.currentDealId && request.currentDealId !== dealId) {
    const currentDir = join(root, request.currentDealId)
    const targetDir = join(root, dealId)
    if (existsSync(currentDir) && !existsSync(targetDir)) {
      renameSync(currentDir, targetDir)
    }
  }

  const targetDir = join(root, dealId)
  ensureDir(targetDir)

  const now = new Date().toISOString()
  const previousMeta = readJsonSafe(metaPathForDeal(context.dataRoot, dealId)) as DealMeta | null
  const launchValidation =
    request.mode === 'launch'
      ? validation
      : validateDealConfig(request.deal, {
          projectRoot: context.projectRoot,
          mode: 'launch',
          existingIds: library.deals.map((entry) => entry.dealId),
          currentDealId: request.currentDealId ?? dealId,
        })
  const meta: DealMeta = {
    dealId,
    saveState: launchValidation.launchReady ? 'ready' : 'draft',
    createdAt: previousMeta?.createdAt ?? now,
    updatedAt: now,
    lastLaunchedAt: previousMeta?.lastLaunchedAt,
  }

  writeFileSync(dealPathForDeal(context.dataRoot, dealId), JSON.stringify(request.deal, null, 2))
  writeFileSync(metaPathForDeal(context.dataRoot, dealId), JSON.stringify(meta, null, 2))

  const item = summarizeDeal(
    'user',
    dealPathForDeal(context.dataRoot, dealId),
    request.deal,
    meta,
    readPipelineStatus(context.statusDir, dealId),
  )

  return {
    item,
    deal: request.deal,
    validation,
  }
}

export function markDealLaunched(context: ServiceContext, dealId: string): void {
  const metaPath = metaPathForDeal(context.dataRoot, dealId)
  const current = readJsonSafe(metaPath) as DealMeta | null
  if (!current) return
  current.lastLaunchedAt = new Date().toISOString()
  current.updatedAt = current.lastLaunchedAt
  writeFileSync(metaPath, JSON.stringify(current, null, 2))
}
