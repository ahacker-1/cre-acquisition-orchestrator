import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { basename, dirname, extname, join } from 'path'
import { randomUUID } from 'crypto'
import {
  getDealRecord,
  validateDealConfig,
  type DealRecord,
} from './deal-service'
import {
  fileHash,
  isParserPendingOnly,
  isParserRunnable,
  runDocumentParser,
} from './parser-service'

type ExtractionStatus =
  | 'not-started'
  | 'extracted'
  | 'extraction-pending'
  | 'parse_failed'
  | 'parser-unavailable'
  | 'unsupported'
type SourceDocumentStatus =
  | 'uploaded'
  | 'parsed'
  | 'parse_failed'
  | 'parser-unavailable'
  | 'unsupported'
  | 'review_ready'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'waived'
  | 'extracted'
  | 'extraction-pending'
type ExtractionReviewStatus = 'candidate' | 'approved' | 'rejected' | 'applied' | 'waived'
type ExtractionValueType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null'
type PhaseReadiness = 'ready' | 'partial' | 'blocked'

export interface DealCriteria {
  investmentStrategy: string
  targetHoldPeriod: number | null
  targetIRR: number | null
  targetEquityMultiple: number | null
  targetCashOnCash: number | null
  targetLTV: number | null
  estimatedRate: number | null
  loanTerm: number | null
  amortization: number | null
  loanType: string
  riskTolerance: 'conservative' | 'balanced' | 'aggressive'
  scenario: 'core-plus' | 'value-add' | 'distressed'
  notes: string
  updatedAt: string
}

export interface SourceDocument {
  documentId: string
  fileName: string
  storedName: string
  path: string
  mime: string
  size: number
  type: string
  typeLabel: string
  phase: string
  phaseLabel: string
  status: SourceDocumentStatus
  extractionStatus: ExtractionStatus
  uploadedAt: string
  extractedAt?: string
  appliedAt?: string
  reviewedAt?: string
  parserId?: string
  parserVersion?: string
  sourceHash?: string
  lifecycleReason?: string
  summary?: string
}

export interface SourceReference {
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

export interface ExtractionField {
  fieldId: string
  path: string
  label: string
  value: unknown
  valueType: ExtractionValueType
  unit?: string
  confidence: number
  source: string
  sourceRef: SourceReference
  reviewStatus?: ExtractionReviewStatus
  currentValue?: unknown
  conflict?: boolean
  validationIssues?: string[]
}

export interface ExtractionPreview {
  documentId: string
  status: ExtractionStatus
  extractedAt: string
  fields: ExtractionField[]
  metrics: Record<string, unknown>
  notes: string[]
  parserId?: string
  parserVersion?: string
  sourceHash?: string
  reviewStatus?: ExtractionReviewStatus
  error?: string
}

export interface ApprovedField {
  fieldId: string
  path: string
  label: string
  value: unknown
  valueType: ExtractionValueType
  unit?: string
  approvedAt: string
  appliedAt?: string
  documentId: string
  sourceRef: SourceReference
  confidence: number
}

export interface ApprovedFieldManifest {
  version: number
  dealId: string
  updatedAt: string
  fields: ApprovedField[]
}

export interface PhaseChecklistItem {
  id: string
  label: string
  status: 'pending' | 'complete'
}

export interface PhaseAgentPlaybook {
  agentId: string
  name: string
  critical: boolean
  inputs: string[]
  outputs: string[]
}

export interface PhaseWorkspaceStatus {
  phaseKey: string
  phaseSlug: string
  label: string
  summary: string
  checklist: PhaseChecklistItem[]
  requiredDocuments: string[]
  uploadedDocuments: string[]
  missingDocuments: string[]
  readiness: PhaseReadiness
  agents: PhaseAgentPlaybook[]
  updatedAt: string
}

export interface DealWorkspace {
  deal: DealRecord
  criteria: DealCriteria
  documents: SourceDocument[]
  phases: PhaseWorkspaceStatus[]
}

export type LaunchReadinessStatus = 'ready' | 'warning' | 'blocked'

export interface LaunchReadinessResult {
  workflowId: string
  status: LaunchReadinessStatus
  blockers: string[]
  warnings: string[]
  requiredApprovedFields: string[]
  approvedFields: string[]
  missingApprovedFields: string[]
  sourceCoverage: {
    sourceDocumentCount: number
    appliedDocumentCount: number
    reviewReadyDocumentCount: number
    pendingExtractionCount: number
    approvedFieldCount: number
    requiredApprovedFieldCount: number
    missingApprovedFieldCount: number
    staleDocumentCount: number
  }
  evaluatedAt: string
}

export interface RunInputSnapshot {
  version: number
  capturedAt: string
  dealId: string
  dealName: string
  workflowId: string
  launch: Record<string, unknown>
  criteria: DealCriteria
  deal: Record<string, unknown>
  approvedFields: ApprovedFieldManifest
  documents: SourceDocument[]
  readiness: LaunchReadinessResult
}

export interface ServiceContext {
  dataRoot: string
  projectRoot: string
  statusDir: string
}

interface DocumentManifest {
  version: number
  dealId: string
  documents: SourceDocument[]
}

interface PhaseDefinition {
  phaseKey: string
  phaseSlug: string
  label: string
  summary: string
  requiredDocuments: string[]
  checklist: string[]
}

const PHASE_DEFINITIONS: PhaseDefinition[] = [
  {
    phaseKey: 'underwriting',
    phaseSlug: 'underwriting',
    label: 'Underwriting',
    summary: 'Convert source materials and criteria into an investment view.',
    requiredDocuments: ['rent_roll', 't12', 'offering_memo'],
    checklist: [
      'Approve key deal criteria',
      'Upload rent roll, T12, and offering memo',
      'Review extracted assumptions',
      'Run underwriting workflow',
    ],
  },
  {
    phaseKey: 'dueDiligence',
    phaseSlug: 'due-diligence',
    label: 'Due Diligence',
    summary: 'Verify property, operations, title, market, and tenant risk.',
    requiredDocuments: ['rent_roll', 'inspection_report', 'environmental', 'title', 'survey'],
    checklist: [
      'Confirm required diligence package',
      'Run diligence agents',
      'Resolve red flags and data gaps',
      'Update decision log',
    ],
  },
  {
    phaseKey: 'financing',
    phaseSlug: 'financing',
    label: 'Financing',
    summary: 'Package the deal for lenders and compare debt options.',
    requiredDocuments: ['offering_memo', 't12', 'loan_documents'],
    checklist: [
      'Confirm target debt assumptions',
      'Run financing package workflow',
      'Compare lender quotes',
      'Select term sheet path',
    ],
  },
  {
    phaseKey: 'legal',
    phaseSlug: 'legal',
    label: 'Legal',
    summary: 'Track PSA, title, survey, estoppels, insurance, and transfer items.',
    requiredDocuments: ['psa', 'title', 'survey', 'insurance'],
    checklist: [
      'Upload PSA and title package',
      'Run legal review agents',
      'Track exception responses',
      'Confirm closing document readiness',
    ],
  },
  {
    phaseKey: 'closing',
    phaseSlug: 'closing',
    label: 'Closing',
    summary: 'Coordinate final readiness, funds flow, and closing package.',
    requiredDocuments: ['closing_statement', 'loan_documents', 'insurance'],
    checklist: [
      'Confirm all prior phase blockers are resolved',
      'Run closing readiness workflow',
      'Review funds flow',
      'Package final closing checklist',
    ],
  },
]

const DOCUMENT_TYPES: Record<string, { label: string; phaseSlug: string }> = {
  rent_roll: { label: 'Rent Roll', phaseSlug: 'due-diligence' },
  t12: { label: 'T12 Financials', phaseSlug: 'underwriting' },
  offering_memo: { label: 'Offering Memo', phaseSlug: 'underwriting' },
  inspection_report: { label: 'Inspection Report', phaseSlug: 'due-diligence' },
  environmental: { label: 'Environmental', phaseSlug: 'due-diligence' },
  title: { label: 'Title', phaseSlug: 'legal' },
  survey: { label: 'Survey', phaseSlug: 'legal' },
  loi: { label: 'LOI', phaseSlug: 'legal' },
  psa: { label: 'PSA', phaseSlug: 'legal' },
  insurance: { label: 'Insurance', phaseSlug: 'legal' },
  loan_documents: { label: 'Loan Documents', phaseSlug: 'financing' },
  closing_statement: { label: 'Closing Statement', phaseSlug: 'closing' },
  other: { label: 'Other Source Document', phaseSlug: 'underwriting' },
}

const SOURCE_BACKED_FIELD_PATHS = new Set([
  'property.totalUnits',
  'property.unitMix.types',
  'property.yearBuilt',
  'financials.askingPrice',
  'financials.currentNOI',
  'financials.inPlaceOccupancy',
  'financials.trailingT12Revenue',
  'financials.trailingT12Expenses',
  'financials.pricePerUnit',
  'financials.goingInCapRate',
  'financials.marketOccupancy',
  'financing.targetLTV',
  'financing.estimatedRate',
  'financing.loanTerm',
  'financing.amortization',
  'financing.loanType',
  'investmentStrategy',
  'targetHoldPeriod',
  'targetIRR',
  'targetEquityMultiple',
  'targetCashOnCash',
])

const WORKFLOW_REQUIRED_SOURCE_FIELDS: Record<string, string[]> = {
  'full-acquisition-review': [
    'property.totalUnits',
    'financials.askingPrice',
    'financials.currentNOI',
    'financials.inPlaceOccupancy',
  ],
  'quick-deal-screen': [
    'property.totalUnits',
    'financials.currentNOI',
    'financials.inPlaceOccupancy',
  ],
  'underwriting-refresh': [
    'property.totalUnits',
    'financials.currentNOI',
  ],
  'financing-package': [
    'property.totalUnits',
    'financials.currentNOI',
    'financing.targetLTV',
  ],
  'legal-psa-review': [],
}

const MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120)
}

function safeId(value: string, label: string): string {
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
}

function dealWorkspaceRoot(context: ServiceContext, dealId: string): string {
  return join(context.dataRoot, 'deals', safeId(dealId, 'deal ID'))
}

function criteriaPath(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'criteria.json')
}

function manifestPath(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'document-manifest.json')
}

function documentsDir(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'documents')
}

function extractionsDir(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'extractions')
}

function extractionPath(context: ServiceContext, dealId: string, documentId: string): string {
  return join(extractionsDir(context, dealId), `${safeId(documentId, 'document ID')}.json`)
}

function approvedFieldsPath(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'approved-fields.json')
}

function rollbackDir(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'rollback')
}

function phaseStatePath(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'phase-state.json')
}

function userDealPath(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'deal.json')
}

function metaPath(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'meta.json')
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(dirname(filePath))
  writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  ensureDir(dirname(filePath))
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  writeFileSync(tempPath, JSON.stringify(value, null, 2))
  renameSync(tempPath, filePath)
}

interface StagedJsonWrite {
  filePath: string
  tempPath: string
}

function stageJsonWrite(filePath: string, value: unknown): StagedJsonWrite {
  ensureDir(dirname(filePath))
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  writeFileSync(tempPath, JSON.stringify(value, null, 2))
  return { filePath, tempPath }
}

function commitStagedWrites(writes: StagedJsonWrite[]): void {
  const committed: Array<{ filePath: string; backupPath: string | null }> = []
  try {
    for (const write of writes) {
      const backupPath = existsSync(write.filePath)
        ? `${write.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.bak`
        : null
      if (backupPath) renameSync(write.filePath, backupPath)
      committed.push({ filePath: write.filePath, backupPath })
      renameSync(write.tempPath, write.filePath)
    }
    for (const entry of committed) {
      if (entry.backupPath && existsSync(entry.backupPath)) unlinkSync(entry.backupPath)
    }
  } catch (error) {
    for (const write of writes) {
      if (existsSync(write.tempPath)) unlinkSync(write.tempPath)
    }
    for (const entry of [...committed].reverse()) {
      if (existsSync(entry.filePath)) unlinkSync(entry.filePath)
      if (entry.backupPath && existsSync(entry.backupPath)) renameSync(entry.backupPath, entry.filePath)
    }
    throw error
  }
}

function cleanupStagedWrites(writes: StagedJsonWrite[]): void {
  for (const write of writes) {
    if (existsSync(write.tempPath)) unlinkSync(write.tempPath)
  }
}

function phaseLabelForSlug(slug: string): string {
  return PHASE_DEFINITIONS.find((phase) => phase.phaseSlug === slug)?.label ?? 'Underwriting'
}

function classifyDocument(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.includes('rent') && lower.includes('roll')) return 'rent_roll'
  if (lower.includes('t12') || lower.includes('operating') || lower.includes('financial')) return 't12'
  if (lower.includes('offering') || lower.includes('memo') || lower.includes('-om') || lower.endsWith('.md')) return 'offering_memo'
  if (lower.includes('inspection') || lower.includes('pca')) return 'inspection_report'
  if (lower.includes('environmental') || lower.includes('phase-i') || lower.includes('phase 1') || lower.includes('esa')) return 'environmental'
  if (lower.includes('title')) return 'title'
  if (lower.includes('survey')) return 'survey'
  if (lower.includes('loi') || lower.includes('letter-of-intent') || lower.includes('letter of intent')) return 'loi'
  if (lower.includes('psa') || lower.includes('purchase')) return 'psa'
  if (lower.includes('insurance')) return 'insurance'
  if (lower.includes('loan') || lower.includes('debt')) return 'loan_documents'
  if (lower.includes('closing') || lower.includes('settlement')) return 'closing_statement'
  return 'other'
}

function extractBase64(payload: Record<string, unknown>): Buffer {
  let content: Buffer
  if (typeof payload.contentBase64 === 'string') {
    const value = payload.contentBase64.includes(',')
      ? payload.contentBase64.split(',').pop() || ''
      : payload.contentBase64
    const normalized = value.replace(/\s/g, '')
    if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
      throw new Error('Invalid base64 document content')
    }
    content = Buffer.from(normalized, 'base64')
  } else if (typeof payload.content === 'string') {
    content = Buffer.from(payload.content, 'utf8')
  } else {
    throw new Error('Missing document content')
  }
  if (content.length === 0) {
    throw new Error('Document content is empty')
  }
  if (content.length > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error(`Document exceeds the ${Math.round(MAX_DOCUMENT_UPLOAD_BYTES / 1024 / 1024)} MB local upload limit.`)
  }
  return content
}

function inferMime(fileName: string, provided: unknown): string {
  if (typeof provided === 'string' && provided.trim()) return provided
  const extension = extname(fileName).toLowerCase()
  if (extension === '.csv') return 'text/csv'
  if (extension === '.md') return 'text/markdown'
  if (extension === '.txt') return 'text/plain'
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return 'application/octet-stream'
}

function initialExtractionStatus(fileName: string, mime: string): ExtractionStatus {
  if (isParserPendingOnly(fileName, mime)) return 'extraction-pending'
  return isParserRunnable(fileName, mime) ? 'not-started' : 'unsupported'
}

function defaultScenario(strategy: string): DealCriteria['scenario'] {
  if (strategy === 'value-add') return 'value-add'
  if (strategy === 'opportunistic') return 'distressed'
  return 'core-plus'
}

function defaultCriteriaFromDeal(deal: Record<string, unknown>): DealCriteria {
  const financing = asObject(deal.financing)
  return {
    investmentStrategy: asString(deal.investmentStrategy, 'core-plus'),
    targetHoldPeriod: asNumber(deal.targetHoldPeriod),
    targetIRR: asNumber(deal.targetIRR),
    targetEquityMultiple: asNumber(deal.targetEquityMultiple),
    targetCashOnCash: asNumber(deal.targetCashOnCash),
    targetLTV: asNumber(financing.targetLTV),
    estimatedRate: asNumber(financing.estimatedRate),
    loanTerm: asNumber(financing.loanTerm),
    amortization: asNumber(financing.amortization),
    loanType: asString(financing.loanType, 'Agency'),
    riskTolerance: 'balanced',
    scenario: defaultScenario(asString(deal.investmentStrategy, 'core-plus')),
    notes: asString(deal.notes),
    updatedAt: new Date().toISOString(),
  }
}

function normalizeCriteria(input: Record<string, unknown>, fallback: DealCriteria): DealCriteria {
  const riskTolerance =
    input.riskTolerance === 'conservative' || input.riskTolerance === 'aggressive' || input.riskTolerance === 'balanced'
      ? input.riskTolerance
      : fallback.riskTolerance
  const scenario =
    input.scenario === 'value-add' || input.scenario === 'distressed' || input.scenario === 'core-plus'
      ? input.scenario
      : fallback.scenario
  return {
    investmentStrategy: asString(input.investmentStrategy, fallback.investmentStrategy),
    targetHoldPeriod: asNumber(input.targetHoldPeriod) ?? fallback.targetHoldPeriod,
    targetIRR: asNumber(input.targetIRR) ?? fallback.targetIRR,
    targetEquityMultiple: asNumber(input.targetEquityMultiple) ?? fallback.targetEquityMultiple,
    targetCashOnCash: asNumber(input.targetCashOnCash) ?? fallback.targetCashOnCash,
    targetLTV: asNumber(input.targetLTV) ?? fallback.targetLTV,
    estimatedRate: asNumber(input.estimatedRate) ?? fallback.estimatedRate,
    loanTerm: asNumber(input.loanTerm) ?? fallback.loanTerm,
    amortization: asNumber(input.amortization) ?? fallback.amortization,
    loanType: asString(input.loanType, fallback.loanType),
    riskTolerance,
    scenario,
    notes: asString(input.notes, fallback.notes),
    updatedAt: new Date().toISOString(),
  }
}

function readCriteria(context: ServiceContext, record: DealRecord): DealCriteria {
  const fallback = defaultCriteriaFromDeal(record.deal)
  const saved = readJson<Record<string, unknown> | null>(criteriaPath(context, record.item.dealId), null)
  return saved ? normalizeCriteria(saved, fallback) : fallback
}

function readManifest(context: ServiceContext, dealId: string): DocumentManifest {
  const fallback: DocumentManifest = { version: 1, dealId, documents: [] }
  const manifest = readJson<DocumentManifest>(manifestPath(context, dealId), fallback)
  return {
    version: 1,
    dealId,
    documents: Array.isArray(manifest.documents) ? manifest.documents : [],
  }
}

function writeManifest(context: ServiceContext, dealId: string, documents: SourceDocument[]): void {
  writeJsonAtomic(manifestPath(context, dealId), { version: 1, dealId, documents })
}

function readAgentRegistry(context: ServiceContext): Record<string, unknown> {
  return readJson<Record<string, unknown>>(join(context.projectRoot, 'config', 'agent-registry.json'), {})
}

function buildAgentPlaybooks(context: ServiceContext, phaseSlug: string): PhaseAgentPlaybook[] {
  const registry = readAgentRegistry(context)
  const agentsByPhase = asObject(asObject(registry.agents)[phaseSlug])
  return Object.entries(agentsByPhase).map(([agentId, value]) => {
    const agent = asObject(value)
    return {
      agentId,
      name: agentId.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      critical: Boolean(agent.critical),
      inputs: Array.isArray(agent.inputs) ? agent.inputs.map(String) : [],
      outputs: Array.isArray(agent.outputs) ? agent.outputs.map(String) : [],
    }
  })
}

function readPhaseState(context: ServiceContext, dealId: string): Record<string, Record<string, string>> {
  return readJson<Record<string, Record<string, string>>>(phaseStatePath(context, dealId), {})
}

function buildPhaseWorkspaces(
  context: ServiceContext,
  dealId: string,
  documents: SourceDocument[],
): PhaseWorkspaceStatus[] {
  const savedState = readPhaseState(context, dealId)
  const uploadedTypes = new Set(documents.map((doc) => doc.type))
  const now = new Date().toISOString()

  return PHASE_DEFINITIONS.map((phase) => {
    const missingDocuments = phase.requiredDocuments.filter((type) => !uploadedTypes.has(type))
    const uploadedDocuments = phase.requiredDocuments.filter((type) => uploadedTypes.has(type))
    const savedChecklist = savedState[phase.phaseSlug] ?? {}
    const documentCoverageComplete = missingDocuments.length === 0
    const checklist = phase.checklist.map((label, index) => {
      const id = `${phase.phaseSlug}-${index + 1}`
      const status: PhaseChecklistItem['status'] = savedChecklist[id] === 'complete' || (index === 1 && documentCoverageComplete)
        ? 'complete'
        : 'pending'
      return { id, label, status }
    })
    const completed = checklist.filter((item) => item.status === 'complete').length
    const readiness: PhaseReadiness =
      missingDocuments.length === 0 ? 'ready' : completed > 0 || uploadedDocuments.length > 0 ? 'partial' : 'blocked'
    return {
      phaseKey: phase.phaseKey,
      phaseSlug: phase.phaseSlug,
      label: phase.label,
      summary: phase.summary,
      checklist,
      requiredDocuments: phase.requiredDocuments,
      uploadedDocuments,
      missingDocuments,
      readiness,
      agents: buildAgentPlaybooks(context, phase.phaseSlug),
      updatedAt: now,
    }
  })
}

function ensureLocalDeal(context: ServiceContext, record: DealRecord): Record<string, unknown> {
  const dealId = record.item.dealId
  ensureDir(dealWorkspaceRoot(context, dealId))
  const target = userDealPath(context, dealId)
  const deal = existsSync(target) ? readJson<Record<string, unknown>>(target, record.deal) : record.deal
  const now = new Date().toISOString()
  const validation = validateDealConfig(deal, {
    projectRoot: context.projectRoot,
    mode: 'launch',
    existingIds: [],
    currentDealId: dealId,
  })
  writeJson(target, deal)
  writeJson(metaPath(context, dealId), {
    dealId,
    saveState: validation.launchReady ? 'ready' : 'draft',
    createdAt: now,
    updatedAt: now,
  })
  return deal
}

function setDeepValue(target: Record<string, unknown>, pathValue: string, value: unknown): void {
  const parts = pathValue.split('.').filter(Boolean)
  let cursor: Record<string, unknown> = target
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    const next = asObject(cursor[part])
    cursor[part] = next
    cursor = next
  }
  cursor[parts[parts.length - 1]] = value
}

function getDeepValue(target: Record<string, unknown>, pathValue: string): unknown {
  const parts = pathValue.split('.').filter(Boolean)
  let cursor: unknown = target
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return cursor
}

function valuesDiffer(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right)
}

function extractionFieldId(field: Partial<ExtractionField>): string {
  if (typeof field.fieldId === 'string' && field.fieldId.length > 0) return field.fieldId
  return ''
}

function enrichExtractionFields(
  extraction: ExtractionPreview,
  deal: Record<string, unknown>,
): ExtractionPreview {
  return {
    ...extraction,
    fields: extraction.fields.map((field) => {
      const currentValue = getDeepValue(deal, field.path)
      const conflict = currentValue !== undefined && valuesDiffer(currentValue, field.value)
      return {
        ...field,
        fieldId: extractionFieldId(field),
        currentValue,
        conflict,
        validationIssues: SOURCE_BACKED_FIELD_PATHS.has(field.path) ? [] : ['Field path is not approved for source-backed apply.'],
      }
    }),
  }
}

function readApprovedFields(context: ServiceContext, dealId: string): ApprovedFieldManifest {
  const fallback: ApprovedFieldManifest = {
    version: 1,
    dealId,
    updatedAt: new Date().toISOString(),
    fields: [],
  }
  const manifest = readJson<ApprovedFieldManifest>(approvedFieldsPath(context, dealId), fallback)
  return {
    ...fallback,
    ...manifest,
    fields: Array.isArray(manifest.fields) ? manifest.fields : [],
  }
}

function upsertApprovedFields(
  current: ApprovedField[],
  nextFields: ApprovedField[],
): ApprovedField[] {
  const byPath = new Map(current.map((field) => [field.path, field]))
  nextFields.forEach((field) => byPath.set(field.path, field))
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

function validationMessages(validation: ReturnType<typeof validateDealConfig>): { errors: string[]; warnings: string[] } {
  return {
    errors: validation.blockingIssues.map((issue) => `${issue.path}: ${issue.message}`),
    warnings: validation.warnings.map((issue) => `${issue.path}: ${issue.message}`),
  }
}

function requiredSourceFieldsForWorkflow(workflowId: string): string[] {
  return WORKFLOW_REQUIRED_SOURCE_FIELDS[workflowId] ?? WORKFLOW_REQUIRED_SOURCE_FIELDS['full-acquisition-review']
}

function documentHashIsStale(document: SourceDocument): boolean {
  if (!document.sourceHash || !existsSync(document.path)) return false
  try {
    return fileHash(document.path) !== document.sourceHash
  } catch {
    return true
  }
}

function sourceCoverageWarnings(
  documents: SourceDocument[],
  missingApprovedFields: string[],
  staleDocumentCount: number,
): string[] {
  const warnings: string[] = []
  if (missingApprovedFields.length > 0) {
    warnings.push(`Missing approved source-backed fields: ${missingApprovedFields.join(', ')}`)
  }
  const reviewReadyCount = documents.filter((doc) => doc.status === 'review_ready').length
  if (reviewReadyCount > 0) {
    warnings.push(`${reviewReadyCount} extracted document(s) still need operator review before their fields are source-backed.`)
  }
  const pendingCount = documents.filter((doc) =>
    doc.extractionStatus === 'not-started' ||
    doc.extractionStatus === 'extraction-pending' ||
    doc.extractionStatus === 'parser-unavailable' ||
    doc.extractionStatus === 'parse_failed'
  ).length
  if (pendingCount > 0) {
    warnings.push(`${pendingCount} uploaded document(s) are not yet applied to deal inputs.`)
  }
  if (staleDocumentCount > 0) {
    warnings.push(`${staleDocumentCount} source document(s) changed after extraction and should be re-extracted.`)
  }
  return warnings
}

function applyCriteriaToDeal(deal: Record<string, unknown>, criteria: DealCriteria): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(deal)) as Record<string, unknown>
  next.investmentStrategy = criteria.investmentStrategy
  next.targetHoldPeriod = criteria.targetHoldPeriod
  next.targetIRR = criteria.targetIRR
  next.targetEquityMultiple = criteria.targetEquityMultiple
  next.targetCashOnCash = criteria.targetCashOnCash
  next.notes = criteria.notes
  next.financing = {
    ...asObject(next.financing),
    targetLTV: criteria.targetLTV,
    estimatedRate: criteria.estimatedRate,
    loanTerm: criteria.loanTerm,
    amortization: criteria.amortization,
    loanType: criteria.loanType,
  }
  return next
}

function updateDocument(
  context: ServiceContext,
  dealId: string,
  documentId: string,
  updater: (document: SourceDocument) => SourceDocument,
): SourceDocument {
  const manifest = readManifest(context, dealId)
  const index = manifest.documents.findIndex((doc) => doc.documentId === documentId)
  if (index === -1) throw new Error(`Document not found: ${documentId}`)
  const updated = updater(manifest.documents[index])
  manifest.documents[index] = updated
  writeManifest(context, dealId, manifest.documents)
  return updated
}

export function getDealWorkspace(context: ServiceContext, dealId: string): DealWorkspace {
  const deal = getDealRecord(context, dealId)
  if (!deal) throw new Error(`Deal not found: ${dealId}`)
  const documents = readManifest(context, dealId).documents
  return {
    deal,
    criteria: readCriteria(context, deal),
    documents,
    phases: buildPhaseWorkspaces(context, dealId, documents),
  }
}

export function evaluateLaunchReadiness(
  context: ServiceContext,
  dealId: string,
  workflowId: string,
  options: { enforceSourceBackedInputs?: boolean } = {},
): LaunchReadinessResult {
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const documents = readManifest(context, dealId).documents
  const approved = readApprovedFields(context, dealId)
  const approvedPathSet = new Set(approved.fields.map((field) => field.path))
  const requiredApprovedFields = requiredSourceFieldsForWorkflow(workflowId)
  const missingApprovedFields = requiredApprovedFields.filter((pathValue) => !approvedPathSet.has(pathValue))
  const staleDocumentCount = documents.filter(documentHashIsStale).length
  const warnings = [
    ...sourceCoverageWarnings(documents, missingApprovedFields, staleDocumentCount),
    ...validationMessages(record.validation).warnings,
  ]
  const blockers = validationMessages(record.validation).errors
  if (options.enforceSourceBackedInputs && missingApprovedFields.length > 0) {
    blockers.push(`Workflow requires approved source-backed fields before launch: ${missingApprovedFields.join(', ')}`)
  }
  if (options.enforceSourceBackedInputs && staleDocumentCount > 0) {
    blockers.push('One or more source documents changed after extraction. Re-run extraction before launch.')
  }

  return {
    workflowId,
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready',
    blockers,
    warnings,
    requiredApprovedFields,
    approvedFields: approved.fields.map((field) => field.path).sort(),
    missingApprovedFields,
    sourceCoverage: {
      sourceDocumentCount: documents.length,
      appliedDocumentCount: documents.filter((doc) => doc.status === 'applied').length,
      reviewReadyDocumentCount: documents.filter((doc) => doc.status === 'review_ready').length,
      pendingExtractionCount: documents.filter((doc) => doc.status !== 'applied').length,
      approvedFieldCount: approved.fields.length,
      requiredApprovedFieldCount: requiredApprovedFields.length,
      missingApprovedFieldCount: missingApprovedFields.length,
      staleDocumentCount,
    },
    evaluatedAt: new Date().toISOString(),
  }
}

export function buildRunInputSnapshot(
  context: ServiceContext,
  dealId: string,
  workflowId: string,
  launch: Record<string, unknown>,
): RunInputSnapshot {
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const documents = readManifest(context, dealId).documents
  const approvedFields = readApprovedFields(context, dealId)
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    dealId,
    dealName: record.item.dealName,
    workflowId,
    launch,
    criteria: readCriteria(context, record),
    deal: record.deal,
    approvedFields,
    documents,
    readiness: evaluateLaunchReadiness(context, dealId, workflowId, {
      enforceSourceBackedInputs: launch.requireSourceBackedInputs === true,
    }),
  }
}

export function listDealDocuments(context: ServiceContext, dealId: string): { documents: SourceDocument[] } {
  if (!getDealRecord(context, dealId)) throw new Error(`Deal not found: ${dealId}`)
  return { documents: readManifest(context, dealId).documents }
}

export function saveDealCriteria(
  context: ServiceContext,
  dealId: string,
  payload: Record<string, unknown>,
): { criteria: DealCriteria; deal: DealRecord } {
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const criteria = normalizeCriteria(payload, defaultCriteriaFromDeal(record.deal))
  ensureDir(dealWorkspaceRoot(context, dealId))
  writeJson(criteriaPath(context, dealId), criteria)
  const localDeal = applyCriteriaToDeal(ensureLocalDeal(context, record), criteria)
  writeJson(userDealPath(context, dealId), localDeal)
  const refreshed = getDealRecord(context, dealId)
  if (!refreshed) throw new Error(`Deal not found after criteria save: ${dealId}`)
  return { criteria, deal: refreshed }
}

export function saveSourceDocument(
  context: ServiceContext,
  dealId: string,
  payload: Record<string, unknown>,
): { document: SourceDocument; documents: SourceDocument[] } {
  if (!getDealRecord(context, dealId)) throw new Error(`Deal not found: ${dealId}`)
  const fileName = asString(payload.fileName)
  if (!fileName) throw new Error('Missing required field: fileName')
  const content = extractBase64(payload)
  const mime = inferMime(fileName, payload.mime)
  const type = classifyDocument(fileName)
  const docType = DOCUMENT_TYPES[type] ?? DOCUMENT_TYPES.other
  const now = new Date().toISOString()
  const baseName = basename(fileName)
  const safeBaseName = safeSegment(baseName).replace(/\.[^.]+$/, '').toLowerCase() || 'source-document'
  const documentId = `doc_${Date.now()}_${randomUUID().slice(0, 8)}_${safeBaseName}`
  const storedName = `${documentId}${extname(baseName) || '.bin'}`
  const targetDir = documentsDir(context, dealId)
  ensureDir(targetDir)
  const targetPath = join(targetDir, storedName)
  writeFileSync(targetPath, content)

  const extractionStatus = initialExtractionStatus(fileName, mime)
  const document: SourceDocument = {
    documentId,
    fileName: baseName,
    storedName,
    path: targetPath,
    mime,
    size: content.length,
    type,
    typeLabel: docType.label,
    phase: docType.phaseSlug,
    phaseLabel: phaseLabelForSlug(docType.phaseSlug),
    status: extractionStatus === 'not-started' ? 'uploaded' : extractionStatus,
    extractionStatus,
    uploadedAt: now,
    sourceHash: fileHash(targetPath),
    summary: `${docType.label} uploaded for ${phaseLabelForSlug(docType.phaseSlug)}`,
  }

  const manifest = readManifest(context, dealId)
  const documents = [document, ...manifest.documents]
  try {
    writeManifest(context, dealId, documents)
  } catch (error) {
    if (existsSync(targetPath)) unlinkSync(targetPath)
    throw error
  }
  return { document, documents }
}

export function extractSourceDocument(
  context: ServiceContext,
  dealId: string,
  documentId: string,
): { document: SourceDocument; extraction: ExtractionPreview } {
  const manifest = readManifest(context, dealId)
  const document = manifest.documents.find((doc) => doc.documentId === documentId)
  if (!document) throw new Error(`Document not found: ${documentId}`)
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const extraction = enrichExtractionFields(runDocumentParser({
    documentId: document.documentId,
    fileName: document.fileName,
    filePath: document.path,
    mime: document.mime,
    type: document.type,
    projectRoot: context.projectRoot,
  }), record.deal)
  ensureDir(extractionsDir(context, dealId))
  writeJson(extractionPath(context, dealId, documentId), extraction)
  const updated = updateDocument(context, dealId, documentId, (current) => ({
    ...current,
    status: extraction.status === 'extracted'
      ? 'review_ready'
      : extraction.status === 'extraction-pending'
        ? 'extraction-pending'
        : extraction.status === 'parser-unavailable'
          ? 'parser-unavailable'
        : extraction.status === 'parse_failed'
          ? 'parse_failed'
          : 'unsupported',
    extractionStatus: extraction.status,
    extractedAt: extraction.extractedAt,
    parserId: extraction.parserId,
    parserVersion: extraction.parserVersion,
    sourceHash: extraction.sourceHash,
    lifecycleReason: extraction.error,
    summary: extraction.notes[0] || current.summary,
  }))
  return { document: updated, extraction }
}

export function applySourceExtraction(
  context: ServiceContext,
  dealId: string,
  documentId: string,
  payload: Record<string, unknown>,
): {
  document: SourceDocument
  extraction: ExtractionPreview
  deal: DealRecord
  approvedFields: ApprovedFieldManifest
  validation: { valid: boolean; launchReady: boolean; errors: string[]; warnings: string[] }
} {
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const extraction = readJson<ExtractionPreview | null>(extractionPath(context, dealId, documentId), null)
  if (!extraction) throw new Error(`Extraction not found for document: ${documentId}`)
  if (extraction.status !== 'extracted' || extraction.fields.length === 0) {
    throw new Error('Only extracted documents with apply-ready fields can be applied.')
  }
  const manifest = readManifest(context, dealId)
  const sourceDocument = manifest.documents.find((doc) => doc.documentId === documentId)
  if (!sourceDocument) throw new Error(`Document not found: ${documentId}`)
  const currentHash = fileHash(sourceDocument.path)
  if (
    !extraction.sourceHash ||
    extraction.sourceHash !== currentHash ||
    !sourceDocument.sourceHash ||
    sourceDocument.sourceHash !== currentHash
  ) {
    throw new Error('Source document changed or lacks a source hash. Re-run extraction before applying fields.')
  }
  const selectedFieldIds = Array.isArray(payload.fieldIds)
    ? new Set(payload.fieldIds.filter((entry): entry is string => typeof entry === 'string'))
    : new Set<string>()
  const localDeal = JSON.parse(JSON.stringify(record.deal)) as Record<string, unknown>
  const enrichedExtraction = enrichExtractionFields(extraction, localDeal)
  const availableFieldIds = new Set(enrichedExtraction.fields.map((field) => field.fieldId))
  if (enrichedExtraction.fields.some((field) => !field.fieldId)) {
    throw new Error('Extraction contains fields without parser-issued field IDs. Re-run extraction before applying fields.')
  }
  const unknownSelectedFieldId = [...selectedFieldIds].find((fieldId) => !availableFieldIds.has(fieldId))
  if (unknownSelectedFieldId) {
    throw new Error(`Selected extraction field is no longer available: ${unknownSelectedFieldId}`)
  }
  const selectedFields = enrichedExtraction.fields.filter((field) => selectedFieldIds.has(field.fieldId))
  if (selectedFields.length === 0) {
    throw new Error('No extraction fields were selected for apply.')
  }
  const invalidField = selectedFields.find((field) => !SOURCE_BACKED_FIELD_PATHS.has(field.path))
  if (invalidField) {
    throw new Error(`Field is not approved for source-backed apply: ${invalidField.path}`)
  }
  const missingSourceRef = selectedFields.find((field) => {
    const sourceRef = (field as Partial<ExtractionField>).sourceRef
    return (
      !sourceRef ||
      sourceRef.documentId !== documentId ||
      sourceRef.parserId !== extraction.parserId ||
      sourceRef.parserVersion !== extraction.parserVersion ||
      sourceRef.fileHash !== extraction.sourceHash
    )
  })
  if (missingSourceRef) {
    throw new Error(`Field is missing a valid source reference: ${missingSourceRef.label}`)
  }
  const conflictField = selectedFields.find((field) => field.conflict && payload.confirmConflictReview !== true)
  if (conflictField) {
    throw new Error(`Field requires conflict review before apply: ${conflictField.label}`)
  }
  const nextDeal = JSON.parse(JSON.stringify(localDeal)) as Record<string, unknown>
  for (const field of selectedFields) {
    setDeepValue(nextDeal, field.path, field.value)
  }
  const validation = validateDealConfig(nextDeal, {
    projectRoot: context.projectRoot,
    mode: 'launch',
    existingIds: [],
    currentDealId: dealId,
  })
  const messages = validationMessages(validation)
  if (validation.blockingIssues.length > 0) {
    throw new Error(`Applied extraction would make the deal invalid: ${messages.errors.join('; ')}`)
  }
  const now = new Date().toISOString()
  const rollbackPath = join(rollbackDir(context, dealId), `${safeSegment(documentId)}-${Date.now()}.json`)
  const approved = selectedFields.map<ApprovedField>((field) => ({
    fieldId: field.fieldId,
    path: field.path,
    label: field.label,
    value: field.value,
    valueType: field.valueType,
    unit: field.unit,
    approvedAt: now,
    appliedAt: now,
    documentId,
    sourceRef: field.sourceRef,
    confidence: field.confidence,
  }))
  const currentApproved = readApprovedFields(context, dealId)
  const nextApprovedFields = upsertApprovedFields(currentApproved.fields, approved)
  const approvedFields: ApprovedFieldManifest = {
    version: 1,
    dealId,
    updatedAt: now,
    fields: nextApprovedFields,
  }
  const updatedExtraction: ExtractionPreview = {
    ...enrichedExtraction,
    reviewStatus: 'applied',
    fields: enrichedExtraction.fields.map((field) => ({
      ...field,
      reviewStatus: selectedFields.some((selected) => selected.fieldId === field.fieldId) ? 'applied' : field.reviewStatus ?? 'candidate',
    })),
  }
  const nextDocument: SourceDocument = {
    ...sourceDocument,
    status: 'applied',
    reviewedAt: now,
    appliedAt: now,
  }
  const nextDocuments = manifest.documents.map((doc) => (doc.documentId === documentId ? nextDocument : doc))
  const previousMeta = asObject(readJson<Record<string, unknown>>(metaPath(context, dealId), {}))
  const nextMeta = {
    dealId,
    saveState: validation.launchReady ? 'ready' : 'draft',
    createdAt: asString(previousMeta.createdAt, now),
    updatedAt: now,
  }

  writeJsonAtomic(rollbackPath, {
    createdAt: now,
    reason: 'pre-extraction-apply',
    documentId,
    deal: localDeal,
    extraction: enrichedExtraction,
  })
  const stagedWrites: StagedJsonWrite[] = []
  try {
    stagedWrites.push(stageJsonWrite(userDealPath(context, dealId), nextDeal))
    stagedWrites.push(stageJsonWrite(extractionPath(context, dealId, documentId), updatedExtraction))
    stagedWrites.push(stageJsonWrite(approvedFieldsPath(context, dealId), approvedFields))
    stagedWrites.push(stageJsonWrite(manifestPath(context, dealId), { version: 1, dealId, documents: nextDocuments }))
    stagedWrites.push(stageJsonWrite(metaPath(context, dealId), nextMeta))
    commitStagedWrites(stagedWrites)
  } catch (error) {
    cleanupStagedWrites(stagedWrites)
    throw error
  }
  const refreshed = getDealRecord(context, dealId)
  if (!refreshed) throw new Error(`Deal not found after extraction apply: ${dealId}`)
  return {
    document: nextDocument,
    extraction: updatedExtraction,
    deal: refreshed,
    approvedFields,
    validation: {
      valid: validation.valid,
      launchReady: validation.launchReady,
      ...messages,
    },
  }
}

export function savePhaseState(
  context: ServiceContext,
  dealId: string,
  payload: Record<string, unknown>,
): { phases: PhaseWorkspaceStatus[] } {
  if (!getDealRecord(context, dealId)) throw new Error(`Deal not found: ${dealId}`)
  const current = readPhaseState(context, dealId)
  const phaseSlug = asString(payload.phaseSlug)
  if (!PHASE_DEFINITIONS.some((phase) => phase.phaseSlug === phaseSlug)) {
    throw new Error(`Unknown phase: ${phaseSlug || 'missing phaseSlug'}`)
  }
  const updates = asObject(payload.checklist)
  const checklistUpdates: Record<string, string> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value === 'pending' || value === 'complete') {
      checklistUpdates[key] = value
    }
  }
  current[phaseSlug] = {
    ...(current[phaseSlug] ?? {}),
    ...checklistUpdates,
  }
  writeJson(phaseStatePath(context, dealId), current)
  const docs = readManifest(context, dealId).documents
  return { phases: buildPhaseWorkspaces(context, dealId, docs) }
}
