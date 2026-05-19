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
type GuideChecklistStatus = 'blocked' | 'missing' | 'ready' | 'in_review' | 'complete' | 'waived'
type GuideChecklistPriority = 'critical' | 'important' | 'optional'
type GuideChecklistCategory =
  | 'documents'
  | 'extraction'
  | 'underwriting'
  | 'diligence'
  | 'financing'
  | 'legal'
  | 'closing'
  | 'package'
type GuideActionType = 'open_tab' | 'edit_details' | 'launch_workflow' | 'upload_documents' | 'review_package'

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
  status: GuideChecklistStatus
  priority: GuideChecklistPriority
  category: GuideChecklistCategory
  whyItMatters: string
  evidenceRequired: string
  recommendedAction: OperatorGuideAction
  unlocks: string
  source: string
  requiredDocuments: string[]
  requiredFields: string[]
  missingDocuments: string[]
  missingFields: string[]
  statusReason: string
  manualStatus: boolean
  note?: string
  updatedAt?: string
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
  workflowId?: string
  checklist: PhaseChecklistItem[]
  requiredDocuments: string[]
  uploadedDocuments: string[]
  missingDocuments: string[]
  readiness: PhaseReadiness
  agents: PhaseAgentPlaybook[]
  updatedAt: string
}

export interface OperatorGuideAction {
  type: GuideActionType
  label: string
  target?: string
  workflowId?: string
  phaseSlug?: string
}

export interface DealProgressionSection {
  phaseKey: string
  phaseSlug: string
  label: string
  summary: string
  workflowId?: string
  runtimePhase: boolean
  readiness: PhaseReadiness
  progress: number
  blockingCount: number
  warningCount: number
  requiredDocuments: string[]
  uploadedDocuments: string[]
  missingDocuments: string[]
  checklist: PhaseChecklistItem[]
  blockers: string[]
  warnings: string[]
}

export interface OperatorCommand {
  activePhaseSlug: string
  activePhaseLabel: string
  readiness: PhaseReadiness
  blockingCount: number
  warningCount: number
  completedChecklistCount: number
  totalChecklistCount: number
  recommendedAction: {
    title: string
    detail: string
    cta: string
    action: OperatorGuideAction
  }
  sourceCoverage: {
    sourceDocumentCount: number
    reviewQueueCount: number
    approvedFieldCount: number
    requiredApprovedFieldCount: number
    missingApprovedFieldCount: number
  }
}

export interface DealProgressionGuide {
  version: number
  sections: DealProgressionSection[]
}

export interface DealWorkspace {
  deal: DealRecord
  criteria: DealCriteria
  documents: SourceDocument[]
  phases: PhaseWorkspaceStatus[]
  launchReadiness: LaunchReadinessResult[]
  progressionGuide: DealProgressionGuide
  operatorCommand: OperatorCommand
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
    invalidApprovedFieldCount: number
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

interface OperatorGuideChecklistDefinition {
  id: string
  label: string
  priority: GuideChecklistPriority
  category: GuideChecklistCategory
  whyItMatters: string
  evidenceRequired: string
  recommendedAction: OperatorGuideAction
  unlocks: string
  source: string
  requiredDocuments: string[]
  requiredFields: string[]
}

interface PhaseDefinition {
  phaseKey: string
  phaseSlug: string
  label: string
  summary: string
  workflowId?: string
  runtimePhase: boolean
  requiredDocuments: string[]
  checklist: OperatorGuideChecklistDefinition[]
}

interface OperatorGuideConfig {
  version: number
  sections: PhaseDefinition[]
}

interface ChecklistStateValue {
  status: GuideChecklistStatus
  note?: string
  updatedAt?: string
}

const FALLBACK_PHASE_DEFINITIONS: PhaseDefinition[] = ([
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
] as Array<Omit<PhaseDefinition, 'runtimePhase' | 'checklist'> & { checklist: string[] }>).map((phase) => ({
  ...phase,
  runtimePhase: true,
  checklist: phase.checklist.map((label, index) => ({
    id: `${phase.phaseSlug}-${index + 1}`,
    label,
    priority: index <= 1 ? 'critical' : 'important',
    category: index === 1 ? 'documents' : phase.phaseSlug === 'due-diligence' ? 'diligence' : phase.phaseSlug as GuideChecklistCategory,
    whyItMatters: `${phase.label} needs this step before the operator can rely on the phase output.`,
    evidenceRequired: 'Operator review or source document evidence is present in the workspace.',
    recommendedAction: {
      type: index === 1 ? 'open_tab' : 'launch_workflow',
      label: index === 1 ? 'Open documents' : `Open ${phase.label}`,
      target: index === 1 ? 'documents' : phase.phaseSlug,
      phaseSlug: phase.phaseSlug,
    },
    unlocks: phase.summary,
    source: 'fallback-phase-definition',
    requiredDocuments: index === 1 ? phase.requiredDocuments : [],
    requiredFields: [],
  })),
}))

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

function workflowCatalogWorkflows(context: ServiceContext): Record<string, unknown>[] {
  const catalog = readJson<Record<string, unknown>>(join(context.projectRoot, 'config', 'workflows.json'), {})
  const workflows = Array.isArray(catalog.workflows) ? catalog.workflows : []
  return workflows
    .map((workflow) => asObject(workflow))
    .filter((workflow) => asString(workflow.id).length > 0)
}

function workflowIdsForReadiness(context: ServiceContext): string[] {
  const workflows = workflowCatalogWorkflows(context)
  const workflowIds = workflows
    .map((workflow) => asString(workflow.id))
    .filter((workflowId) => workflowId.length > 0)
  return workflowIds.length > 0 ? workflowIds : Object.keys(WORKFLOW_REQUIRED_SOURCE_FIELDS)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function asChecklistPriority(value: unknown): GuideChecklistPriority {
  return value === 'critical' || value === 'important' || value === 'optional' ? value : 'important'
}

function asChecklistCategory(value: unknown): GuideChecklistCategory {
  const allowed = new Set<string>([
    'documents',
    'extraction',
    'underwriting',
    'diligence',
    'financing',
    'legal',
    'closing',
    'package',
  ])
  return typeof value === 'string' && allowed.has(value) ? value as GuideChecklistCategory : 'documents'
}

function asChecklistStatus(value: unknown): GuideChecklistStatus | null {
  return value === 'blocked' ||
    value === 'missing' ||
    value === 'ready' ||
    value === 'in_review' ||
    value === 'complete' ||
    value === 'waived'
    ? value
    : null
}

function asGuideAction(value: unknown, fallback: OperatorGuideAction): OperatorGuideAction {
  const action = asObject(value)
  const type = asString(action.type)
  const allowed = new Set<string>(['open_tab', 'edit_details', 'launch_workflow', 'upload_documents', 'review_package'])
  return {
    type: allowed.has(type) ? type as GuideActionType : fallback.type,
    label: asString(action.label, fallback.label),
    target: asString(action.target, fallback.target),
    workflowId: asString(action.workflowId, fallback.workflowId),
    phaseSlug: asString(action.phaseSlug, fallback.phaseSlug),
  }
}

function normalizeChecklistDefinition(
  value: unknown,
  phase: Pick<PhaseDefinition, 'phaseSlug' | 'label' | 'summary' | 'requiredDocuments' | 'workflowId'>,
  index: number,
): OperatorGuideChecklistDefinition {
  const item = asObject(value)
  const id = asString(item.id, `${phase.phaseSlug}-${index + 1}`)
  const label = asString(item.label, asString(item.description, `Checklist item ${index + 1}`))
  const requiredDocuments = asStringArray(item.requiredDocuments)
  const defaultAction: OperatorGuideAction = {
    type: requiredDocuments.length > 0 ? 'open_tab' : phase.workflowId ? 'launch_workflow' : 'open_tab',
    label: requiredDocuments.length > 0 ? 'Open documents' : phase.workflowId ? `Run ${phase.label}` : `Open ${phase.label}`,
    target: requiredDocuments.length > 0 ? 'documents' : phase.phaseSlug,
    workflowId: phase.workflowId,
    phaseSlug: phase.phaseSlug,
  }
  return {
    id,
    label,
    priority: asChecklistPriority(item.priority),
    category: asChecklistCategory(item.category),
    whyItMatters: asString(item.whyItMatters, `${phase.label} needs this step before the operator can rely on the output.`),
    evidenceRequired: asString(item.evidenceRequired, 'Operator review or source document evidence is present in the workspace.'),
    recommendedAction: asGuideAction(item.recommendedAction, defaultAction),
    unlocks: asString(item.unlocks, phase.summary),
    source: asString(item.source, 'operator-guide'),
    requiredDocuments,
    requiredFields: asStringArray(item.requiredFields),
  }
}

function normalizePhaseDefinition(value: unknown, index: number): PhaseDefinition | null {
  const phase = asObject(value)
  const phaseSlug = asString(phase.phaseSlug)
  const phaseKey = asString(phase.phaseKey, phaseSlug.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase()))
  const label = asString(phase.label)
  if (!phaseSlug || !label) return null
  const summary = asString(phase.summary, `${label} operator guide`)
  const requiredDocuments = asStringArray(phase.requiredDocuments)
  const workflowId = asString(phase.workflowId) || undefined
  const base: PhaseDefinition = {
    phaseKey,
    phaseSlug,
    label,
    summary,
    workflowId,
    runtimePhase: phase.runtimePhase !== false,
    requiredDocuments,
    checklist: [],
  }
  const checklist = Array.isArray(phase.checklist)
    ? phase.checklist.map((item, itemIndex) => normalizeChecklistDefinition(item, base, itemIndex))
    : []
  return {
    ...base,
    checklist: checklist.length > 0
      ? checklist
      : [normalizeChecklistDefinition({
        id: `${phaseSlug}-review`,
        label: `Review ${label}`,
        priority: index === 0 ? 'critical' : 'important',
        category: 'documents',
      }, base, 0)],
  }
}

function readOperatorGuideConfig(context: ServiceContext): OperatorGuideConfig {
  const fallback: OperatorGuideConfig = { version: 1, sections: FALLBACK_PHASE_DEFINITIONS }
  const raw = readJson<Record<string, unknown>>(join(context.projectRoot, 'config', 'operator-guides.json'), {})
  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .map((section, index) => normalizePhaseDefinition(section, index))
        .filter((section): section is PhaseDefinition => Boolean(section))
    : []
  return {
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : fallback.version,
    sections: sections.length > 0 ? sections : fallback.sections,
  }
}

function operatorGuideSections(context: ServiceContext): PhaseDefinition[] {
  return readOperatorGuideConfig(context).sections
}

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

function phaseLabelForSlug(context: ServiceContext, slug: string): string {
  return operatorGuideSections(context).find((phase) => phase.phaseSlug === slug)?.label ?? 'Underwriting'
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

function readPhaseState(context: ServiceContext, dealId: string): Record<string, Record<string, ChecklistStateValue | string>> {
  return readJson<Record<string, Record<string, ChecklistStateValue | string>>>(phaseStatePath(context, dealId), {})
}

function normalizeChecklistState(value: ChecklistStateValue | string | undefined): Partial<ChecklistStateValue> {
  if (typeof value === 'string') {
    const status = value === 'pending' ? 'missing' : asChecklistStatus(value)
    return status ? { status } : {}
  }
  if (!value || typeof value !== 'object') return {}
  const status = asChecklistStatus(value.status)
  return {
    ...(status ? { status } : {}),
    note: asString(value.note),
    updatedAt: asString(value.updatedAt),
  }
}

function checklistStatusReason(
  item: OperatorGuideChecklistDefinition,
  status: GuideChecklistStatus,
  missingDocuments: string[],
  missingFields: string[],
): string {
  if (status === 'waived') return 'Operator waived or deferred this item.'
  if (status === 'complete') return 'Evidence or operator review is complete.'
  if (missingDocuments.length > 0) return `Missing documents: ${missingDocuments.join(', ')}.`
  if (missingFields.length > 0) return `Missing source or deal fields: ${missingFields.join(', ')}.`
  if (status === 'in_review') return 'Uploaded source documents still need extraction or operator review.'
  if (status === 'ready') return `${item.recommendedAction.label} is available.`
  return item.evidenceRequired
}

function deriveChecklistItem(
  item: OperatorGuideChecklistDefinition,
  saved: Partial<ChecklistStateValue>,
  documents: SourceDocument[],
  deal: Record<string, unknown>,
  launchReadiness: LaunchReadinessResult[],
): PhaseChecklistItem {
  const uploadedTypes = new Set(documents.map((doc) => doc.type))
  const sourceFieldMissingSet = new Set(launchReadiness.flatMap((entry) => entry.missingApprovedFields))
  const missingDocuments = item.requiredDocuments.filter((type) => !uploadedTypes.has(type))
  const missingFields = item.requiredFields.filter((fieldPath) => {
    const value = getDeepValue(deal, fieldPath)
    return value === undefined || value === null || value === '' || sourceFieldMissingSet.has(fieldPath)
  })
  const reviewQueueCount = documents.filter((doc) =>
    doc.status === 'review_ready' ||
    doc.extractionStatus === 'not-started' ||
    doc.extractionStatus === 'extraction-pending' ||
    doc.extractionStatus === 'parse_failed' ||
    doc.extractionStatus === 'parser-unavailable'
  ).length
  const workflowReadiness = item.recommendedAction.workflowId
    ? launchReadiness.find((entry) => entry.workflowId === item.recommendedAction.workflowId)
    : null

  let status: GuideChecklistStatus = 'missing'
  if (saved.status === 'complete' || saved.status === 'waived') {
    status = saved.status
  } else if (missingDocuments.length > 0 || missingFields.length > 0) {
    status = item.priority === 'critical' ? 'blocked' : 'missing'
  } else if (item.category === 'extraction' && reviewQueueCount > 0) {
    status = 'in_review'
  } else if (workflowReadiness?.status === 'blocked') {
    status = 'blocked'
  } else if (item.recommendedAction.type === 'launch_workflow') {
    status = 'ready'
  } else if (item.requiredDocuments.length > 0 || item.requiredFields.length > 0) {
    status = 'complete'
  } else {
    status = saved.status ?? 'ready'
  }

  return {
    ...item,
    status,
    missingDocuments,
    missingFields,
    statusReason: checklistStatusReason(item, status, missingDocuments, missingFields),
    manualStatus: saved.status === 'complete' || saved.status === 'waived',
    note: saved.note || undefined,
    updatedAt: saved.updatedAt || undefined,
  }
}

function phaseReadinessFromChecklist(checklist: PhaseChecklistItem[]): PhaseReadiness {
  const criticalOpen = checklist.some((item) =>
    item.priority === 'critical' && (item.status === 'blocked' || item.status === 'missing' || item.status === 'in_review')
  )
  if (criticalOpen) return 'blocked'
  const allActionableDone = checklist.every((item) =>
    item.priority === 'optional' || item.status === 'complete' || item.status === 'waived' || item.status === 'ready'
  )
  return allActionableDone ? 'ready' : 'partial'
}

function sectionFromDefinition(
  context: ServiceContext,
  definition: PhaseDefinition,
  dealId: string,
  documents: SourceDocument[],
  deal: Record<string, unknown>,
  launchReadiness: LaunchReadinessResult[],
): DealProgressionSection {
  const savedState = readPhaseState(context, dealId)
  const uploadedTypes = new Set(documents.map((doc) => doc.type))
  const missingDocuments = definition.requiredDocuments.filter((type) => !uploadedTypes.has(type))
  const uploadedDocuments = definition.requiredDocuments.filter((type) => uploadedTypes.has(type))
  const savedChecklist = savedState[definition.phaseSlug] ?? {}
  const checklist = definition.checklist.map((item) =>
    deriveChecklistItem(item, normalizeChecklistState(savedChecklist[item.id]), documents, deal, launchReadiness)
  )
  const readiness = phaseReadinessFromChecklist(checklist)
  const blockingItems = checklist.filter((item) => item.status === 'blocked' || item.status === 'missing')
  const warningItems = checklist.filter((item) => item.status === 'in_review')
  const completed = checklist.filter((item) => item.status === 'complete' || item.status === 'waived').length
  const progress = checklist.length === 0 ? 0 : Math.round((completed / checklist.length) * 100)

  return {
    phaseKey: definition.phaseKey,
    phaseSlug: definition.phaseSlug,
    label: definition.label,
    summary: definition.summary,
    workflowId: definition.workflowId,
    runtimePhase: definition.runtimePhase,
    readiness,
    progress,
    blockingCount: blockingItems.length,
    warningCount: warningItems.length,
    requiredDocuments: definition.requiredDocuments,
    uploadedDocuments,
    missingDocuments,
    checklist,
    blockers: blockingItems.map((item) => `${item.label}: ${item.statusReason}`),
    warnings: warningItems.map((item) => `${item.label}: ${item.statusReason}`),
  }
}

function buildProgressionSections(
  context: ServiceContext,
  dealId: string,
  documents: SourceDocument[],
  deal: Record<string, unknown>,
  launchReadiness: LaunchReadinessResult[],
): DealProgressionSection[] {
  return operatorGuideSections(context).map((definition) =>
    sectionFromDefinition(context, definition, dealId, documents, deal, launchReadiness)
  )
}

function buildPhaseWorkspaces(
  context: ServiceContext,
  dealId: string,
  documents: SourceDocument[],
  deal: Record<string, unknown>,
  launchReadiness: LaunchReadinessResult[],
): PhaseWorkspaceStatus[] {
  const sections = buildProgressionSections(context, dealId, documents, deal, launchReadiness)
  const now = new Date().toISOString()
  return sections
    .filter((section) => section.runtimePhase)
    .map((section) => ({
      phaseKey: section.phaseKey,
      phaseSlug: section.phaseSlug,
      label: section.label,
      summary: section.summary,
      workflowId: section.workflowId,
      checklist: section.checklist,
      requiredDocuments: section.requiredDocuments,
      uploadedDocuments: section.uploadedDocuments,
      missingDocuments: section.missingDocuments,
      readiness: section.readiness,
      agents: buildAgentPlaybooks(context, section.phaseSlug),
      updatedAt: now,
    }))
}

function bestChecklistAction(sections: DealProgressionSection[]): PhaseChecklistItem | null {
  const orderedStatuses: GuideChecklistStatus[] = ['blocked', 'missing', 'in_review', 'ready']
  for (const status of orderedStatuses) {
    const candidate = sections
      .flatMap((section) => section.checklist.map((item) => ({ item, section })))
      .find(({ item }) => item.priority !== 'optional' && item.status === status)
    if (candidate) {
      return {
        ...candidate.item,
        recommendedAction: {
          ...candidate.item.recommendedAction,
          phaseSlug: candidate.item.recommendedAction.phaseSlug ?? candidate.section.phaseSlug,
        },
      }
    }
  }
  return null
}

function buildOperatorCommand(
  sections: DealProgressionSection[],
  launchReadiness: LaunchReadinessResult[],
  documents: SourceDocument[],
): OperatorCommand {
  const activeSection =
    sections.find((section) => section.blockingCount > 0) ??
    sections.find((section) => section.warningCount > 0) ??
    sections.find((section) => section.readiness === 'ready' && section.runtimePhase) ??
    sections[0]
  const blockingCount = sections.reduce((sum, section) => sum + section.blockingCount, 0)
  const warningCount = sections.reduce((sum, section) => sum + section.warningCount, 0)
  const completedChecklistCount = sections.reduce(
    (sum, section) => sum + section.checklist.filter((item) => item.status === 'complete' || item.status === 'waived').length,
    0,
  )
  const totalChecklistCount = sections.reduce((sum, section) => sum + section.checklist.length, 0)
  const actionItem = bestChecklistAction(sections)
  const fullReadiness = launchReadiness.find((entry) => entry.workflowId === 'full-acquisition-review') ?? launchReadiness[0]
  const reviewQueueCount = documents.filter((doc) =>
    doc.status === 'review_ready' ||
    doc.extractionStatus === 'not-started' ||
    doc.extractionStatus === 'extraction-pending' ||
    doc.extractionStatus === 'parse_failed' ||
    doc.extractionStatus === 'parser-unavailable'
  ).length
  const sourceCoverage = fullReadiness?.sourceCoverage

  return {
    activePhaseSlug: activeSection?.phaseSlug ?? 'guide',
    activePhaseLabel: activeSection?.label ?? 'Guide',
    readiness: blockingCount > 0 ? 'blocked' : warningCount > 0 ? 'partial' : 'ready',
    blockingCount,
    warningCount,
    completedChecklistCount,
    totalChecklistCount,
    recommendedAction: {
      title: actionItem ? actionItem.label : 'Review the acquisition package',
      detail: actionItem
        ? `${actionItem.whyItMatters} ${actionItem.statusReason}`
        : 'The deal guide has no open critical checklist items. Review the package and lock the next decision.',
      cta: actionItem?.recommendedAction.label ?? 'Review package',
      action: actionItem?.recommendedAction ?? {
        type: 'review_package',
        label: 'Review package',
        target: 'package',
      },
    },
    sourceCoverage: {
      sourceDocumentCount: sourceCoverage?.sourceDocumentCount ?? documents.length,
      reviewQueueCount,
      approvedFieldCount: sourceCoverage?.approvedFieldCount ?? 0,
      requiredApprovedFieldCount: sourceCoverage?.requiredApprovedFieldCount ?? 0,
      missingApprovedFieldCount: sourceCoverage?.missingApprovedFieldCount ?? 0,
    },
  }
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

function requiredSourceFieldsForWorkflow(context: ServiceContext, workflowId: string): string[] {
  const workflow = workflowCatalogWorkflows(context).find((entry) => asString(entry.id) === workflowId)
  if (workflow && Array.isArray(workflow.requiredSourceFields)) {
    return workflow.requiredSourceFields.filter((field): field is string => typeof field === 'string')
  }
  return WORKFLOW_REQUIRED_SOURCE_FIELDS[workflowId] ?? []
}

function documentHashIsStale(document: SourceDocument): boolean {
  if (!document.sourceHash) {
    return document.status === 'applied' || document.status === 'approved' || document.status === 'review_ready'
  }
  if (!existsSync(document.path)) return true
  try {
    return fileHash(document.path) !== document.sourceHash
  } catch {
    return true
  }
}

function approvedFieldEvidenceIsCurrent(
  field: ApprovedField,
  documentsById: Map<string, SourceDocument>,
): boolean {
  const sourceRef = field.sourceRef
  const document = documentsById.get(field.documentId) ?? documentsById.get(sourceRef.documentId)
  if (!document) return false
  if (sourceRef.documentId !== document.documentId) return false
  if (!document.sourceHash || !sourceRef.fileHash || sourceRef.fileHash !== document.sourceHash) return false
  if (!existsSync(document.path)) return false
  if (document.parserId && sourceRef.parserId !== document.parserId) return false
  if (document.parserVersion && sourceRef.parserVersion !== document.parserVersion) return false
  if (document.status !== 'applied' && document.status !== 'approved') return false
  try {
    return fileHash(document.path) === document.sourceHash
  } catch {
    return false
  }
}

function approvedFieldManifestWithCurrentEvidence(
  manifest: ApprovedFieldManifest,
  documents: SourceDocument[],
): ApprovedFieldManifest {
  const documentsById = new Map(documents.map((document) => [document.documentId, document]))
  return {
    ...manifest,
    fields: manifest.fields.filter((field) => approvedFieldEvidenceIsCurrent(field, documentsById)),
  }
}

function sourceCoverageWarnings(
  documents: SourceDocument[],
  missingApprovedFields: string[],
  staleDocumentCount: number,
  invalidApprovedFieldCount: number,
): string[] {
  const warnings: string[] = []
  if (missingApprovedFields.length > 0) {
    warnings.push(`Missing approved source-backed fields: ${missingApprovedFields.join(', ')}`)
  }
  if (invalidApprovedFieldCount > 0) {
    warnings.push(`${invalidApprovedFieldCount} approved source field(s) have missing or stale evidence and were excluded from launch readiness.`)
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
  const launchReadiness = workflowIdsForReadiness(context).map((workflowId) =>
    evaluateLaunchReadiness(context, dealId, workflowId),
  )
  const guideConfig = readOperatorGuideConfig(context)
  const progressionSections = guideConfig.sections.map((definition) =>
    sectionFromDefinition(context, definition, dealId, documents, deal.deal, launchReadiness)
  )
  return {
    deal,
    criteria: readCriteria(context, deal),
    documents,
    phases: buildPhaseWorkspaces(context, dealId, documents, deal.deal, launchReadiness),
    launchReadiness,
    progressionGuide: {
      version: guideConfig.version,
      sections: progressionSections,
    },
    operatorCommand: buildOperatorCommand(progressionSections, launchReadiness, documents),
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
  const currentApproved = approvedFieldManifestWithCurrentEvidence(approved, documents)
  const validApprovedFields = currentApproved.fields
  const invalidApprovedFieldCount = Math.max(0, approved.fields.length - validApprovedFields.length)
  const approvedPathSet = new Set(validApprovedFields.map((field) => field.path))
  const requiredApprovedFields = requiredSourceFieldsForWorkflow(context, workflowId)
  const missingApprovedFields = requiredApprovedFields.filter((pathValue) => !approvedPathSet.has(pathValue))
  const staleDocumentCount = documents.filter(documentHashIsStale).length
  const warnings = [
    ...sourceCoverageWarnings(documents, missingApprovedFields, staleDocumentCount, invalidApprovedFieldCount),
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
    approvedFields: validApprovedFields.map((field) => field.path).sort(),
    missingApprovedFields,
    sourceCoverage: {
      sourceDocumentCount: documents.length,
      appliedDocumentCount: documents.filter((doc) => doc.status === 'applied').length,
      reviewReadyDocumentCount: documents.filter((doc) => doc.status === 'review_ready').length,
      pendingExtractionCount: documents.filter((doc) => doc.status !== 'applied').length,
      approvedFieldCount: validApprovedFields.length,
      requiredApprovedFieldCount: requiredApprovedFields.length,
      missingApprovedFieldCount: missingApprovedFields.length,
      staleDocumentCount,
      invalidApprovedFieldCount,
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
  const currentApprovedFields = approvedFieldManifestWithCurrentEvidence(approvedFields, documents)
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    dealId,
    dealName: record.item.dealName,
    workflowId,
    launch,
    criteria: readCriteria(context, record),
    deal: record.deal,
    approvedFields: currentApprovedFields,
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
    phaseLabel: phaseLabelForSlug(context, docType.phaseSlug),
    status: extractionStatus === 'not-started' ? 'uploaded' : extractionStatus,
    extractionStatus,
    uploadedAt: now,
    sourceHash: fileHash(targetPath),
    summary: `${docType.label} uploaded for ${phaseLabelForSlug(context, docType.phaseSlug)}`,
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

export function getSourceExtraction(
  context: ServiceContext,
  dealId: string,
  documentId: string,
): ExtractionPreview {
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const manifest = readManifest(context, dealId)
  const document = manifest.documents.find((doc) => doc.documentId === documentId)
  if (!document) throw new Error(`Document not found: ${documentId}`)
  const extraction = readJson<ExtractionPreview | null>(extractionPath(context, dealId, documentId), null)
  if (!extraction) throw new Error(`Extraction not found for document: ${documentId}`)
  return enrichExtractionFields(extraction, record.deal)
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
  const draftValidation = validateDealConfig(nextDeal, {
    projectRoot: context.projectRoot,
    mode: 'draft',
    existingIds: [],
    currentDealId: dealId,
  })
  const launchValidation = validateDealConfig(nextDeal, {
    projectRoot: context.projectRoot,
    mode: 'launch',
    existingIds: [],
    currentDealId: dealId,
  })
  const draftMessages = validationMessages(draftValidation)
  const launchMessages = validationMessages(launchValidation)
  if (draftValidation.blockingIssues.length > 0) {
    throw new Error(`Applied extraction would make the deal invalid: ${draftMessages.errors.join('; ')}`)
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
    saveState: launchValidation.launchReady ? 'ready' : 'draft',
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
      valid: draftValidation.valid,
      launchReady: launchValidation.launchReady,
      errors: launchMessages.errors,
      warnings: [...draftMessages.warnings, ...launchMessages.warnings],
    },
  }
}

export function savePhaseState(
  context: ServiceContext,
  dealId: string,
  payload: Record<string, unknown>,
): { phases: PhaseWorkspaceStatus[] } {
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const current = readPhaseState(context, dealId)
  const phaseSlug = asString(payload.phaseSlug)
  if (!operatorGuideSections(context).some((phase) => phase.phaseSlug === phaseSlug)) {
    throw new Error(`Unknown phase: ${phaseSlug || 'missing phaseSlug'}`)
  }
  const updates = asObject(payload.checklist)
  const noteUpdates = asObject(payload.notes)
  const checklistUpdates: Record<string, ChecklistStateValue> = {}
  const now = new Date().toISOString()
  for (const [key, value] of Object.entries(updates)) {
    const status = value === 'pending' ? 'missing' : asChecklistStatus(value)
    if (status) {
      checklistUpdates[key] = {
        status,
        note: asString(noteUpdates[key]),
        updatedAt: now,
      }
    }
  }
  current[phaseSlug] = {
    ...(current[phaseSlug] ?? {}),
    ...checklistUpdates,
  }
  writeJson(phaseStatePath(context, dealId), current)
  const docs = readManifest(context, dealId).documents
  const launchReadiness = workflowIdsForReadiness(context).map((workflowId) =>
    evaluateLaunchReadiness(context, dealId, workflowId),
  )
  return { phases: buildPhaseWorkspaces(context, dealId, docs, record.deal, launchReadiness) }
}
