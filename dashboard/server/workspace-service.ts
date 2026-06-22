import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { basename, dirname, extname, join } from 'path'
import { createHash, randomUUID } from 'crypto'
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
  reviewNote?: string
  reviewedAt?: string
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
  uploadedData?: UploadedDataProfile
  // I2b: paths auto-applied into the deal during this extraction (trusted fields). Present on
  // the extractSourceDocument response so the UI can show "applied automatically" vs flagged.
  autoAppliedPaths?: string[]
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

// I1: how an approved field's value got into the deal record.
//  - 'parser'         : extracted from a source document (manual apply or I2b auto-apply);
//                       always carries a full parser sourceRef.
//  - 'operator-edited': an operator's direct inline override (applyOperatorFieldEdit);
//                       no parser sourceRef — provenance is the operator action + audit entry.
export type ApprovedFieldProvenance = 'parser' | 'operator-edited'

export interface ApprovedField {
  fieldId: string
  path: string
  label: string
  value: unknown
  previousValue?: unknown
  valueType: ExtractionValueType
  unit?: string
  approvedAt: string
  appliedAt?: string
  documentId: string
  // Parser provenance — present for parser-sourced fields, absent for operator edits.
  sourceRef?: SourceReference
  confidence: number
  // Defaults to 'parser' when omitted (back-compat with pre-I1 manifests).
  provenance?: ApprovedFieldProvenance
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

export interface IcStarterPackageApprovedInput {
  fieldId: string
  path: string
  label: string
  value: unknown
  valueType: ExtractionValueType
  unit?: string
  confidence: number
  approvedAt: string
  appliedAt?: string
  // Optional: absent for operator-edited inputs (no parser sourceRef). I1.
  sourceRef?: SourceReference
}

export interface IcStarterPackageSourceDocument {
  documentId: string
  fileName: string
  typeLabel: string
  status: SourceDocumentStatus
  extractionStatus: ExtractionStatus
  uploadedAt: string
  extractedAt?: string
  reviewedAt?: string
  appliedAt?: string
  parserId?: string
  parserVersion?: string
  sourceHash?: string
}

export interface IcStarterPackage {
  version: number
  generatedAt: string
  dealId: string
  dealName: string
  workflowId: string
  criteria: DealCriteria
  deal: Record<string, unknown>
  sourceCoverage: LaunchReadinessResult['sourceCoverage']
  readiness: Pick<LaunchReadinessResult, 'status' | 'blockers' | 'warnings' | 'requiredApprovedFields' | 'approvedFields' | 'missingApprovedFields'>
  approvedInputs: IcStarterPackageApprovedInput[]
  sourceDocuments: IcStarterPackageSourceDocument[]
  assumptions: string[]
  openQuestions: string[]
  redFlags: string[]
  // W62: per-red-flag drilldown back to the originating workpaper + source snippet.
  redFlagDrilldowns: IcStarterPackageRedFlagDrilldown[]
  nextAction: OperatorCommand['recommendedAction']
  // W63: source drilldown references for each approved input.
  sourceDrilldown: IcStarterPackageSourceDrilldown[]
  // W60: quality gate + reviewer signoff state.
  qualityGate: PackageQualityGate
  // W61: per-phase evidence completeness scoring.
  evidenceCompleteness: PackageEvidenceCompleteness
  // W63: incrementing package version history.
  versionHistory: PackageVersionHistoryEntry[]
  // V3: machine-readable evidence lineage from source documents to IC sections.
  evidenceGraph: EvidenceGraph
}

export interface IcStarterPackageExport {
  packageJson: IcStarterPackage
  markdown: string
  files: {
    json: string
    markdown: string
  }
}

// W41: Source-field decision audit trail.
// I2b adds `auto-apply` (a trusted parser field promoted into the deal automatically on
// extraction); I1 adds `operator-edit` (an operator's direct inline override of a value).
export type FieldDecisionAction =
  | 'approve'
  | 'reject'
  | 'waive'
  | 'needs-review'
  | 'apply'
  | 'auto-apply'
  | 'operator-edit'

export interface FieldDecisionEntry {
  decisionId: string
  fieldId: string
  path: string
  label: string
  action: FieldDecisionAction
  reviewStatus: ExtractionReviewStatus
  documentId: string
  decidedAt: string
  note?: string
  previousValue?: unknown
  value?: unknown
  conflict?: boolean
}

export interface FieldDecisionHistory {
  version: number
  dealId: string
  updatedAt: string
  entries: FieldDecisionEntry[]
}

// W60: Workpaper / package quality gates + reviewer signoff.
export type QualityGateItemStatus = 'present' | 'missing'

export interface QualityGateItem {
  id: string
  label: string
  status: QualityGateItemStatus
  detail: string
}

export type ReviewerSignoffState = 'unsigned' | 'pending' | 'signed'

export interface ReviewerSignoff {
  state: ReviewerSignoffState
  reviewer?: string
  signedAt?: string
  note?: string
}

export interface PackageQualityGate {
  status: 'pass' | 'warning'
  items: QualityGateItem[]
  warnings: string[]
  reviewerSignoff: ReviewerSignoff
}

// W61: Per-phase evidence completeness scoring.
export interface PhaseEvidenceCompleteness {
  phaseSlug: string
  label: string
  requiredDocuments: string[]
  presentDocuments: string[]
  missingDocuments: string[]
  requiredFields: string[]
  presentFields: string[]
  missingFields: string[]
  score: number
  status: 'complete' | 'partial' | 'missing'
}

export interface PackageEvidenceCompleteness {
  overallScore: number
  phases: PhaseEvidenceCompleteness[]
}

export type EvidenceRefKind =
  | 'source-field'
  | 'source-document'
  | 'agent-workpaper'
  | 'red-flag'
  | 'data-gap'
  | 'package-section'

export type EvidenceRelation =
  | 'extracted-from'
  | 'approved-as'
  | 'supports'
  | 'flags'
  | 'documents'
  | 'summarizes'
  | 'missing-evidence-for'

export interface EvidenceRef {
  refId: string
  kind: EvidenceRefKind
  fieldId?: string
  path?: string
  documentId?: string
  fileName?: string
  sourceRef?: SourceReference
  workpaper?: string
  workflowId?: string
  phaseSlug?: string
  raw?: string
  location?: SourceReference['location']
  derivedFrom?: string[]
}

export interface EvidenceGraphNode {
  id: string
  kind: EvidenceRefKind
  label: string
  summary?: string
  ref?: EvidenceRef
}

export interface EvidenceGraphEdge {
  from: string
  to: string
  relation: EvidenceRelation
}

export interface EvidenceGraph {
  version: 1
  generatedAt: string
  nodes: EvidenceGraphNode[]
  edges: EvidenceGraphEdge[]
}

// W63: Source drilldown reference + package version history.
export interface IcStarterPackageSourceDrilldown {
  fieldId: string
  path: string
  label: string
  documentId: string
  fileName: string
  fileHash?: string
  parserId: string
  parserVersion: string
  location?: SourceReference['location']
  raw?: string
}

// W62: Red-flag drilldown linkage. Each red flag links back to its originating
// specialist workpaper (the readiness/launch gate that raised it) and, where the
// flag references a specific approved input, the originating source document/snippet.
export interface IcStarterPackageRedFlagDrilldown {
  flag: string
  origin: 'launch-readiness'
  workpaper: string
  workflowId: string
  relatedFields: Array<{
    fieldId: string
    path: string
    label: string
    documentId: string
    fileName: string
    location?: SourceReference['location']
    raw?: string
  }>
}

export interface PackageVersionHistoryEntry {
  version: number
  generatedAt: string
  workflowId: string
  readinessStatus: LaunchReadinessStatus
  approvedFieldCount: number
  evidenceScore: number
  reviewerSignoffState: ReviewerSignoffState
}

export interface PackageVersionHistory {
  version: number
  dealId: string
  updatedAt: string
  entries: PackageVersionHistoryEntry[]
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

// I2b: minimum parser confidence for a field to AUTO-APPLY on extraction. config/thresholds.json
// holds only investment-decision thresholds (DSCR, cap rate, etc.) — there is no extraction-
// confidence key there — so this is a named local constant. A field auto-applies only when it is
// fully TRUSTED: confidence >= this value AND no source conflict AND no validation issues AND a
// valid parser sourceRef. Conflicting / low-confidence / invalid reads stay candidates for the
// operator to resolve (the credibility gate is concentrated on those, not removed).
export const AUTO_APPLY_MIN_CONFIDENCE = 0.7

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

const MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024

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

// I1: classify an operator-supplied value into the ExtractionValueType vocabulary (mirrors the
// parser's own value-type derivation so operator-edited fields are typed consistently).
function extractionValueType(value: unknown): ExtractionValueType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') return 'string'
  return 'object'
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

function decisionHistoryPath(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'decision-history.json')
}

function packageVersionHistoryPath(context: ServiceContext, dealId: string, workflowId: string): string {
  return join(packagesDir(context, dealId), `${safeSegment(workflowId)}-version-history.json`)
}

function packagesDir(context: ServiceContext, dealId: string): string {
  return join(dealWorkspaceRoot(context, dealId), 'packages')
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
  try {
    writeFileSync(tempPath, JSON.stringify(value, null, 2))
    replaceFileWithTemp(tempPath, filePath)
  } finally {
    if (existsSync(tempPath)) unlinkSync(tempPath)
  }
}

function replaceFileWithTemp(tempPath: string, filePath: string): void {
  try {
    renameSync(tempPath, filePath)
  } catch (error) {
    const code = typeof (error as NodeJS.ErrnoException).code === 'string'
      ? (error as NodeJS.ErrnoException).code
      : ''
    if (process.platform !== 'win32' || (code !== 'EPERM' && code !== 'EEXIST')) throw error
    // OneDrive-backed Windows workspaces can reject rename-over-existing even after a serialized write.
    copyFileSync(tempPath, filePath)
    unlinkSync(tempPath)
  }
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

function classifyByFileName(fileName: string): string {
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

// P5: a text content sample (rent rolls / T12s are tabular text or CSV). Returns
// 'rent_roll' | 't12' | null when the content unambiguously matches one of the two
// tabular financial document types. Binary formats (xlsx/pdf) decode to noise here
// and simply return null, so the filename guess stands.
function sniffTabularType(contentSample?: string): 'rent_roll' | 't12' | null {
  if (!contentSample) return null
  const sample = contentSample.slice(0, 8192)
  const looksRentRoll =
    /unit\s*type|floor\s*plan|bed\s*\/\s*bath|bed\/bath/i.test(sample) &&
    /market\s*rent|asking\s*rent|in-?place|current\s*rent|contract\s*rent|sq\s*ft|square/i.test(sample)
  const looksT12 =
    /line\s*item/i.test(sample) &&
    /effective\s*gross\s*income|total\s*operating\s*expenses|net\s*operating\s*income|\bnoi\b|gross\s*potential\s*rent/i.test(
      sample,
    )
  if (looksRentRoll && !looksT12) return 'rent_roll'
  if (looksT12 && !looksRentRoll) return 't12'
  return null
}

// P5: classify a document. Filename is the primary signal, but for the two tabular
// financial types (rent roll / T12) a clear content signal OVERRIDES an ambiguous or
// wrong filename guess — otherwise a file like "operating-statement.csv" (rent-roll
// content) is routed to the T12 parser, finds nothing, and the data is silently
// dropped. Content only overrides routing between rent_roll/t12/other; it never
// overrides an explicit narrative type (offering memo, legal docs, etc.).
function classifyDocument(fileName: string, contentSample?: string): string {
  const byName = classifyByFileName(fileName)
  const byContent = sniffTabularType(contentSample)
  if (byContent && byContent !== byName && (byName === 'rent_roll' || byName === 't12' || byName === 'other')) {
    return byContent
  }
  return byName
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

// W41: Source-field decision audit trail persistence.
function readDecisionHistory(context: ServiceContext, dealId: string): FieldDecisionHistory {
  const fallback: FieldDecisionHistory = {
    version: 1,
    dealId,
    updatedAt: new Date().toISOString(),
    entries: [],
  }
  const history = readJson<FieldDecisionHistory>(decisionHistoryPath(context, dealId), fallback)
  return {
    version: 1,
    dealId,
    updatedAt: asString(history.updatedAt, fallback.updatedAt),
    entries: Array.isArray(history.entries) ? history.entries : [],
  }
}

function decisionStatusToAction(status: ExtractionReviewStatus): FieldDecisionAction {
  switch (status) {
    case 'approved':
      return 'approve'
    case 'rejected':
      return 'reject'
    case 'waived':
      return 'waive'
    case 'applied':
      return 'apply'
    case 'candidate':
    default:
      return 'needs-review'
  }
}

function appendDecisionEntries(
  context: ServiceContext,
  dealId: string,
  entries: Array<Omit<FieldDecisionEntry, 'decisionId'>>,
): FieldDecisionHistory {
  if (entries.length === 0) return readDecisionHistory(context, dealId)
  const current = readDecisionHistory(context, dealId)
  const stamped = entries.map<FieldDecisionEntry>((entry) => ({
    decisionId: randomUUID(),
    ...entry,
  }))
  const next: FieldDecisionHistory = {
    version: 1,
    dealId,
    updatedAt: entries[entries.length - 1].decidedAt,
    entries: [...current.entries, ...stamped],
  }
  writeJsonAtomic(decisionHistoryPath(context, dealId), next)
  return next
}

/**
 * W41: Detect another document that still carries an unresolved candidate field
 * for one of the paths being applied, with a value that disagrees with the value
 * being applied. Returns the first such conflict, or null when none exist.
 */
function findUnresolvedCandidateConflict(
  context: ServiceContext,
  dealId: string,
  applyingDocumentId: string,
  selectedFields: ExtractionField[],
): { fileName: string; label: string; path: string } | null {
  const selectedByPath = new Map(selectedFields.map((field) => [field.path, field]))
  const manifest = readManifest(context, dealId)
  for (const document of manifest.documents) {
    if (document.documentId === applyingDocumentId) continue
    const otherExtraction = readJson<ExtractionPreview | null>(
      extractionPath(context, dealId, document.documentId),
      null,
    )
    if (!otherExtraction || !Array.isArray(otherExtraction.fields)) continue
    for (const field of otherExtraction.fields) {
      const target = selectedByPath.get(field.path)
      if (!target) continue
      const status = field.reviewStatus ?? 'candidate'
      // Only unresolved candidates block; rejected/waived/applied are resolved.
      if (status !== 'candidate') continue
      if (!valuesDiffer(field.value, target.value)) continue
      return { fileName: document.fileName, label: field.label, path: field.path }
    }
  }
  return null
}

/**
 * W41: Retrieve the full decision history for a deal, optionally filtered to a
 * single field path. Entries are returned in chronological order.
 */
export function getFieldDecisionHistory(
  context: ServiceContext,
  dealId: string,
  fieldPath?: string,
): FieldDecisionEntry[] {
  const history = readDecisionHistory(context, dealId)
  const entries = typeof fieldPath === 'string' && fieldPath.length > 0
    ? history.entries.filter((entry) => entry.path === fieldPath)
    : history.entries
  return [...entries].sort((a, b) => {
    const byTime = a.decidedAt.localeCompare(b.decidedAt)
    return byTime !== 0 ? byTime : a.decisionId.localeCompare(b.decisionId)
  })
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
  // I1: operator-edited fields carry no parser sourceRef — the operator's direct override
  // is its own authority, so there is no source document whose hash could go stale. Treat
  // these as always-current (they were never excluded from launch readiness on staleness).
  if (!sourceRef) return field.provenance === 'operator-edited'
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

function normalizeReviewStatus(value: unknown): Extract<ExtractionReviewStatus, 'candidate' | 'rejected' | 'waived'> {
  return value === 'rejected' || value === 'waived' ? value : 'candidate'
}

function extractionDocumentStatus(fields: ExtractionField[]): SourceDocumentStatus {
  const statuses = fields.map((field) => field.reviewStatus ?? 'candidate')
  if (statuses.length === 0) return 'review_ready'
  if (statuses.some((status) => status === 'applied')) return 'applied'
  if (statuses.every((status) => status === 'rejected')) return 'rejected'
  if (statuses.every((status) => status === 'waived')) return 'waived'
  if (statuses.some((status) => status === 'approved')) return 'approved'
  return 'review_ready'
}

function normalizePackageWorkflowId(context: ServiceContext, workflowId: unknown): string {
  const requested = asString(workflowId)
  const workflowIds = workflowIdsForReadiness(context)
  if (requested && workflowIds.includes(requested)) return requested
  if (workflowIds.includes('full-acquisition-review')) return 'full-acquisition-review'
  return workflowIds[0] ?? 'full-acquisition-review'
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function markdownCell(value: unknown): string {
  return displayValue(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
}

function sourceLocationLabel(sourceRef: SourceReference | undefined): string {
  if (!sourceRef) return 'Operator edit'
  const location = sourceRef.location
  if (!location) return sourceRef.fileName
  const parts = [
    location.sheet ? `sheet ${location.sheet}` : '',
    location.row ? `row ${location.row}` : '',
    location.column ? `column ${location.column}` : '',
    location.line ? `line ${location.line}` : '',
    location.page ? `page ${location.page}` : '',
    location.description ?? '',
  ].filter(Boolean)
  return parts.length > 0 ? `${sourceRef.fileName} (${parts.join(', ')})` : sourceRef.fileName
}

function packageOpenQuestions(workspace: DealWorkspace, readiness: LaunchReadinessResult): string[] {
  const missingFieldQuestions = readiness.missingApprovedFields.map((field) =>
    `Approve source evidence for ${field}.`
  )
  const checklistQuestions = workspace.progressionGuide.sections.flatMap((section) =>
    section.checklist
      .filter((item) => item.status !== 'complete' && item.status !== 'waived')
      .map((item) => `${section.label}: ${item.label}`)
  )
  return [...new Set([...missingFieldQuestions, ...checklistQuestions])].slice(0, 12)
}

function packageAssumptions(criteria: DealCriteria, readiness: LaunchReadinessResult, documents: SourceDocument[]): string[] {
  const assumptions = [
    criteria.notes ? `Operator criteria notes remain in force: ${criteria.notes}` : '',
    readiness.requiredApprovedFields.length > 0
      ? `Critical launch fields are limited to ${readiness.requiredApprovedFields.join(', ')} for this workflow.`
      : 'This workflow does not declare critical source-backed launch fields.',
    documents.some((document) => document.status === 'waived')
      ? 'At least one source document or extracted field was waived by the operator.'
      : '',
    documents.some((document) => document.status === 'rejected')
      ? 'At least one source document or extracted field was rejected by the operator.'
      : '',
  ].filter(Boolean)
  return assumptions.length > 0 ? assumptions : ['No additional operator assumptions were recorded in the workspace.']
}

function packageRedFlags(readiness: LaunchReadinessResult): string[] {
  const urgentWarnings = readiness.warnings.filter((warning) =>
    /missing|stale|review|not yet applied|parse|invalid/i.test(warning)
  )
  const redFlags = [...readiness.blockers, ...urgentWarnings]
  return redFlags.length > 0 ? [...new Set(redFlags)] : ['No source-backed package red flags were detected by the local readiness checks.']
}

// W62: Link each package red flag back to its originating specialist workpaper and,
// where the flag references a specific source-backed field, the originating source
// document + stored snippet. Readiness-derived flags originate from the launch
// readiness workpaper for the package workflow.
function buildRedFlagDrilldowns(
  redFlags: string[],
  workflowId: string,
  sourceDrilldown: IcStarterPackageSourceDrilldown[],
): IcStarterPackageRedFlagDrilldown[] {
  const workpaper = `Launch Readiness Gate (${workflowId})`
  return redFlags.map((flag) => {
    const normalizedFlag = flag.toLowerCase()
    // A flag references a field when its label or dotted path appears in the flag text.
    const relatedFields = sourceDrilldown
      .filter((entry) => {
        const label = entry.label.toLowerCase()
        const path = entry.path.toLowerCase()
        return (
          (label.length > 0 && normalizedFlag.includes(label)) ||
          (path.length > 0 && normalizedFlag.includes(path))
        )
      })
      .map((entry) => ({
        fieldId: entry.fieldId,
        path: entry.path,
        label: entry.label,
        documentId: entry.documentId,
        fileName: entry.fileName,
        location: entry.location,
        raw: entry.raw,
      }))
    return {
      flag,
      origin: 'launch-readiness' as const,
      workpaper,
      workflowId,
      relatedFields,
    }
  })
}

// W60: Build the workpaper/package quality gate. Missing items surface as
// WARNINGS (not hard failures) so existing packages still export.
function buildPackageQualityGate(
  packageJson: Pick<
    IcStarterPackage,
    'approvedInputs' | 'assumptions' | 'openQuestions' | 'redFlags' | 'sourceDrilldown'
  >,
  reviewerSignoff: ReviewerSignoff,
): PackageQualityGate {
  const items: QualityGateItem[] = [
    {
      id: 'cited-inputs',
      label: 'Cited inputs',
      status: packageJson.approvedInputs.length > 0 ? 'present' : 'missing',
      detail: `${packageJson.approvedInputs.length} approved source-backed input(s) with citations.`,
    },
    {
      id: 'source-drilldown',
      label: 'Source drilldown references',
      status: packageJson.sourceDrilldown.length > 0 ? 'present' : 'missing',
      detail: `${packageJson.sourceDrilldown.length} field-level source reference(s).`,
    },
    {
      id: 'assumptions',
      label: 'Stated assumptions',
      status:
        packageJson.assumptions.length > 0 &&
        !(packageJson.assumptions.length === 1 &&
          packageJson.assumptions[0].startsWith('No additional operator assumptions'))
          ? 'present'
          : 'missing',
      detail: `${packageJson.assumptions.length} assumption(s) recorded.`,
    },
    {
      id: 'calculations',
      label: 'Calculation coverage',
      status: packageJson.approvedInputs.length > 0 ? 'present' : 'missing',
      detail: 'Underwriting calculations are derived from approved source-backed inputs.',
    },
    {
      id: 'caveats',
      label: 'Caveats and red flags',
      status: packageJson.redFlags.length > 0 || packageJson.openQuestions.length > 0 ? 'present' : 'missing',
      detail: `${packageJson.redFlags.length} red flag(s) and ${packageJson.openQuestions.length} open question(s).`,
    },
    {
      id: 'reviewer-signoff',
      label: 'Reviewer signoff',
      status: reviewerSignoff.state === 'signed' ? 'present' : 'missing',
      detail:
        reviewerSignoff.state === 'signed'
          ? `Signed by ${reviewerSignoff.reviewer || 'reviewer'}${reviewerSignoff.signedAt ? ` at ${reviewerSignoff.signedAt}` : ''}.`
          : `Reviewer signoff is ${reviewerSignoff.state}.`,
    },
  ]
  const warnings = items
    .filter((item) => item.status === 'missing')
    .map((item) => `Quality gate item incomplete: ${item.label} — ${item.detail}`)
  return {
    status: warnings.length > 0 ? 'warning' : 'pass',
    items,
    warnings,
    reviewerSignoff,
  }
}

function normalizeReviewerSignoff(value: unknown, generatedAt: string): ReviewerSignoff {
  const raw = asObject(value)
  const reviewer = asString(raw.reviewer)
  const note = asString(raw.note)
  const requestedState = asString(raw.state)
  let state: ReviewerSignoffState =
    requestedState === 'signed' || requestedState === 'pending' ? requestedState : 'unsigned'
  // A signoff is only "signed" when a reviewer is named.
  if (state === 'signed' && !reviewer) state = 'pending'
  const signoff: ReviewerSignoff = { state }
  if (reviewer) signoff.reviewer = reviewer
  if (note) signoff.note = note
  if (state === 'signed') signoff.signedAt = asString(raw.signedAt, generatedAt)
  return signoff
}

// W61: Score evidence completeness per phase from required-vs-present documents
// and source-backed fields. Deterministic for a fixed workspace.
function buildEvidenceCompleteness(
  phases: PhaseDefinition[],
  documents: SourceDocument[],
  approvedPaths: Set<string>,
): PackageEvidenceCompleteness {
  const uploadedTypes = new Set(documents.map((doc) => doc.type))
  const phaseScores = phases.map<PhaseEvidenceCompleteness>((phase) => {
    const requiredDocuments = [...new Set(phase.requiredDocuments)].sort()
    const requiredFields = [
      ...new Set(
        phase.checklist.flatMap((item) => item.requiredFields).filter((field) => field.length > 0),
      ),
    ].sort()
    const presentDocuments = requiredDocuments.filter((type) => uploadedTypes.has(type))
    const missingDocuments = requiredDocuments.filter((type) => !uploadedTypes.has(type))
    const presentFields = requiredFields.filter((field) => approvedPaths.has(field))
    const missingFields = requiredFields.filter((field) => !approvedPaths.has(field))
    const requiredCount = requiredDocuments.length + requiredFields.length
    const presentCount = presentDocuments.length + presentFields.length
    const score = requiredCount === 0 ? 1 : Number((presentCount / requiredCount).toFixed(4))
    const status: PhaseEvidenceCompleteness['status'] =
      score >= 1 ? 'complete' : score > 0 ? 'partial' : 'missing'
    return {
      phaseSlug: phase.phaseSlug,
      label: phase.label,
      requiredDocuments,
      presentDocuments,
      missingDocuments,
      requiredFields,
      presentFields,
      missingFields,
      score,
      status,
    }
  })
  const totalRequired = phaseScores.reduce(
    (sum, phase) => sum + phase.requiredDocuments.length + phase.requiredFields.length,
    0,
  )
  const totalPresent = phaseScores.reduce(
    (sum, phase) => sum + phase.presentDocuments.length + phase.presentFields.length,
    0,
  )
  const overallScore = totalRequired === 0 ? 1 : Number((totalPresent / totalRequired).toFixed(4))
  return { overallScore, phases: phaseScores }
}

function sha16(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export function evidenceNodeId(ref: EvidenceRef): string {
  if (ref.kind === 'source-document' && ref.documentId) return `doc:${ref.documentId}`
  if (ref.kind === 'source-field' && ref.fieldId) return `field:${ref.fieldId}`
  if (ref.kind === 'red-flag') return ref.refId.startsWith('red-flag:') ? ref.refId : `red-flag:${sha16(ref.raw ?? ref.refId)}`
  if (ref.kind === 'data-gap') return ref.refId.startsWith('data-gap:') ? ref.refId : `data-gap:${sha16(ref.raw ?? ref.refId)}`
  if (ref.kind === 'package-section') return ref.refId.startsWith('package:') ? ref.refId : `package:${safeSegment(ref.path ?? ref.refId)}`
  if (ref.kind === 'agent-workpaper') {
    const phaseSlug = safeSegment(ref.phaseSlug ?? 'workpaper')
    const agentSlug = safeSegment(ref.workflowId ?? ref.workpaper ?? ref.refId)
    return `workpaper:${phaseSlug}:${agentSlug}`
  }
  return ref.refId
}

export function evidenceGraphHash(graph: EvidenceGraph): string {
  return createHash('sha256').update(JSON.stringify(graph)).digest('hex').slice(0, 16)
}

function shortSummary(value: unknown): string {
  const text = displayValue(value)
  return text.length > 220 ? `${text.slice(0, 217)}...` : text
}

function addEvidenceNode(
  nodes: Map<string, EvidenceGraphNode>,
  ref: EvidenceRef,
  label: string,
  summary?: string,
): string {
  const id = evidenceNodeId(ref)
  const normalizedRef: EvidenceRef = { ...ref, refId: id }
  const existing = nodes.get(id)
  if (existing) {
    if (!existing.summary && summary) existing.summary = summary
    if (!existing.ref) existing.ref = normalizedRef
    return id
  }
  nodes.set(id, {
    id,
    kind: ref.kind,
    label,
    summary,
    ref: normalizedRef,
  })
  return id
}

function addEvidenceEdge(
  edges: Map<string, EvidenceGraphEdge>,
  from: string,
  to: string,
  relation: EvidenceRelation,
): void {
  edges.set(`${from}|${to}|${relation}`, { from, to, relation })
}

function sourceDocumentRef(documentId: string, fileName: string, sourceRef?: SourceReference): EvidenceRef {
  return {
    refId: `doc:${documentId}`,
    kind: 'source-document',
    documentId,
    fileName,
    sourceRef,
    raw: sourceRef?.raw,
    location: sourceRef?.location,
  }
}

function packageSectionRef(sectionSlug: string): EvidenceRef {
  return {
    refId: `package:${sectionSlug}`,
    kind: 'package-section',
    path: sectionSlug,
  }
}

function addDataGapNode(
  nodes: Map<string, EvidenceGraphNode>,
  edges: Map<string, EvidenceGraphEdge>,
  dataGapsSectionId: string,
  gap: string,
  derivedFrom?: string[],
): void {
  const dataGapId = addEvidenceNode(
    nodes,
    {
      refId: `data-gap:${sha16(gap)}`,
      kind: 'data-gap',
      raw: gap,
      derivedFrom,
    },
    gap,
    'provenance unavailable',
  )
  addEvidenceEdge(edges, dataGapId, dataGapsSectionId, 'missing-evidence-for')
}

export function buildEvidenceGraph(packageJson: Omit<IcStarterPackage, 'evidenceGraph'>): EvidenceGraph {
  const nodes = new Map<string, EvidenceGraphNode>()
  const edges = new Map<string, EvidenceGraphEdge>()

  const approvedInputsSectionId = addEvidenceNode(nodes, packageSectionRef('approved-inputs'), 'Approved Inputs')
  const sourceDocumentsSectionId = addEvidenceNode(nodes, packageSectionRef('source-documents'), 'Source Documents')
  const redFlagsSectionId = addEvidenceNode(nodes, packageSectionRef('red-flags'), 'Red Flags')
  const dataGapsSectionId = addEvidenceNode(nodes, packageSectionRef('data-gaps'), 'Data Gaps')
  const launchGateSectionId = addEvidenceNode(nodes, packageSectionRef('launch-gate'), 'Launch Gate')

  const ensureDocumentNode = (documentId: string, fileName: string, sourceRef?: SourceReference): string => {
    const documentIdValue = addEvidenceNode(
      nodes,
      sourceDocumentRef(documentId, fileName, sourceRef),
      fileName,
      sourceRef?.fileHash ? `source hash ${sourceRef.fileHash}` : undefined,
    )
    addEvidenceEdge(edges, sourceDocumentsSectionId, documentIdValue, 'documents')
    return documentIdValue
  }

  for (const document of packageJson.sourceDocuments) {
    ensureDocumentNode(document.documentId, document.fileName)
  }

  for (const input of packageJson.approvedInputs) {
    const sourceRef = input.sourceRef
    const fieldId = addEvidenceNode(
      nodes,
      {
        refId: `field:${input.fieldId}`,
        kind: 'source-field',
        fieldId: input.fieldId,
        path: input.path,
        documentId: sourceRef?.documentId,
        fileName: sourceRef?.fileName,
        sourceRef,
        raw: sourceRef?.raw,
        location: sourceRef?.location,
      },
      input.label,
      `${input.path}: ${shortSummary(input.value)}`,
    )
    addEvidenceEdge(edges, approvedInputsSectionId, fieldId, 'documents')
    addEvidenceEdge(edges, fieldId, approvedInputsSectionId, 'approved-as')
    if (sourceRef) {
      const documentId = ensureDocumentNode(sourceRef.documentId, sourceRef.fileName, sourceRef)
      addEvidenceEdge(edges, fieldId, documentId, 'extracted-from')
    } else {
      addDataGapNode(
        nodes,
        edges,
        dataGapsSectionId,
        `Missing parser provenance for approved input ${input.label} (${input.path}).`,
        [fieldId],
      )
    }
  }

  for (const drilldown of packageJson.sourceDrilldown) {
    if (drilldown.parserId === 'operator') continue
    const fieldId = addEvidenceNode(
      nodes,
      {
        refId: `field:${drilldown.fieldId}`,
        kind: 'source-field',
        fieldId: drilldown.fieldId,
        path: drilldown.path,
        documentId: drilldown.documentId,
        fileName: drilldown.fileName,
        raw: drilldown.raw,
        location: drilldown.location,
      },
      drilldown.label,
      drilldown.path,
    )
    const documentId = ensureDocumentNode(drilldown.documentId, drilldown.fileName)
    addEvidenceEdge(edges, fieldId, documentId, 'extracted-from')
  }

  for (const drilldown of packageJson.redFlagDrilldowns) {
    const redFlagId = addEvidenceNode(
      nodes,
      {
        refId: `red-flag:${sha16(drilldown.flag)}`,
        kind: 'red-flag',
        raw: drilldown.flag,
        workpaper: drilldown.workpaper,
        workflowId: drilldown.workflowId,
        phaseSlug: 'launch-readiness',
      },
      drilldown.flag,
      drilldown.relatedFields.length > 0 ? `${drilldown.relatedFields.length} related source field(s)` : 'provenance unavailable',
    )
    addEvidenceEdge(edges, redFlagsSectionId, redFlagId, 'documents')
    const workpaperId = addEvidenceNode(
      nodes,
      {
        refId: `workpaper:launch-readiness:${safeSegment(drilldown.workflowId)}`,
        kind: 'agent-workpaper',
        workpaper: drilldown.workpaper,
        workflowId: drilldown.workflowId,
        phaseSlug: 'launch-readiness',
      },
      drilldown.workpaper,
      `Launch readiness workpaper for ${drilldown.workflowId}`,
    )
    addEvidenceEdge(edges, workpaperId, redFlagId, 'documents')
    addEvidenceEdge(edges, workpaperId, launchGateSectionId, 'summarizes')
    for (const related of drilldown.relatedFields) {
      const fieldId = addEvidenceNode(
        nodes,
        {
          refId: `field:${related.fieldId}`,
          kind: 'source-field',
          fieldId: related.fieldId,
          path: related.path,
          documentId: related.documentId,
          fileName: related.fileName,
          raw: related.raw,
          location: related.location,
        },
        related.label,
        related.path,
      )
      const documentId = ensureDocumentNode(related.documentId, related.fileName)
      addEvidenceEdge(edges, fieldId, documentId, 'extracted-from')
      addEvidenceEdge(edges, redFlagId, fieldId, 'flags')
    }
  }

  for (const missingField of packageJson.readiness.missingApprovedFields) {
    addDataGapNode(
      nodes,
      edges,
      dataGapsSectionId,
      `Missing approved source evidence for ${missingField}.`,
    )
  }
  for (const question of packageJson.openQuestions) {
    addDataGapNode(nodes, edges, dataGapsSectionId, question)
  }

  return {
    version: 1,
    generatedAt: packageJson.generatedAt,
    nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...edges.values()].sort((left, right) =>
      `${left.from}|${left.to}|${left.relation}`.localeCompare(`${right.from}|${right.to}|${right.relation}`),
    ),
  }
}

function renderIcStarterPackageMarkdown(packageJson: IcStarterPackage): string {
  const approvedRows = packageJson.approvedInputs.length > 0
    ? packageJson.approvedInputs.map((field) =>
        `| ${markdownCell(field.label)} | ${markdownCell(field.value)} | ${(field.confidence * 100).toFixed(0)}% | ${markdownCell(sourceLocationLabel(field.sourceRef))} |`
      )
    : ['| No approved source-backed fields yet |  |  |  |']
  const documentRows = packageJson.sourceDocuments.length > 0
    ? packageJson.sourceDocuments.map((document) =>
        `| ${markdownCell(document.fileName)} | ${markdownCell(document.typeLabel)} | ${markdownCell(document.status)} | ${markdownCell(document.extractionStatus)} |`
      )
    : ['| No source documents uploaded yet |  |  |  |']
  // W63: source drilldown rows.
  const drilldownRows = packageJson.sourceDrilldown.length > 0
    ? packageJson.sourceDrilldown.map((entry) =>
        `| ${markdownCell(entry.label)} | ${markdownCell(entry.fileName)} | ${markdownCell(sourceLocationLabel({ ...entry, fileName: entry.fileName } as SourceReference))} | ${markdownCell(entry.parserId)} | ${markdownCell(entry.fileHash ?? '')} |`
      )
    : ['| No source drilldown references yet |  |  |  |  |']
  const evidenceChainRows = packageJson.approvedInputs
    .filter((field) => Boolean(field.sourceRef))
    .map((field) =>
      `- source document -> approved input: ${markdownCell(field.sourceRef?.fileName)} -> ${markdownCell(field.label)} (${markdownCell(field.path)})`
    )
  const evidenceGapRows = packageJson.evidenceGraph.nodes
    .filter((node) => node.kind === 'data-gap')
    .slice(0, 12)
    .map((node) => `- data gap -> package section: ${markdownCell(node.label)}`)
  // W61: per-phase evidence completeness rows.
  const evidenceRows = packageJson.evidenceCompleteness.phases.map((phase) =>
    `| ${markdownCell(phase.label)} | ${(phase.score * 100).toFixed(0)}% | ${markdownCell(phase.status)} | ${phase.presentDocuments.length}/${phase.requiredDocuments.length} | ${phase.presentFields.length}/${phase.requiredFields.length} |`
  )
  // W60: quality gate rows.
  const qualityRows = packageJson.qualityGate.items.map((item) =>
    `| ${markdownCell(item.label)} | ${item.status === 'present' ? 'PASS' : 'WARNING'} | ${markdownCell(item.detail)} |`
  )
  return [
    `# IC Starter Package: ${packageJson.dealName}`,
    '',
    `Generated: ${packageJson.generatedAt}`,
    `Package version: ${packageJson.version}`,
    `Workflow: ${packageJson.workflowId}`,
    `Readiness: ${packageJson.readiness.status}`,
    `Reviewer signoff: ${packageJson.qualityGate.reviewerSignoff.state}`,
    '',
    '## One Best Next Action',
    `**${packageJson.nextAction.title}**`,
    packageJson.nextAction.detail,
    `Action: ${packageJson.nextAction.cta}`,
    '',
    '## Source Coverage',
    `Approved fields: ${packageJson.sourceCoverage.approvedFieldCount}/${packageJson.sourceCoverage.requiredApprovedFieldCount} required`,
    `Documents uploaded: ${packageJson.sourceCoverage.sourceDocumentCount}`,
    `Documents waiting for review: ${packageJson.sourceCoverage.reviewReadyDocumentCount}`,
    '',
    '## Evidence Completeness by Phase',
    `Overall evidence score: ${(packageJson.evidenceCompleteness.overallScore * 100).toFixed(0)}%`,
    '| Phase | Score | Status | Documents | Fields |',
    '| --- | --- | --- | --- | --- |',
    ...evidenceRows,
    '',
    '## Approved Inputs',
    '| Field | Approved Value | Confidence | Source |',
    '| --- | --- | --- | --- |',
    ...approvedRows,
    '',
    '## Source Drilldown',
    '| Field | File | Location | Parser | Source Hash |',
    '| --- | --- | --- | --- | --- |',
    ...drilldownRows,
    '',
    '## Evidence Chain',
    `Evidence graph hash: ${evidenceGraphHash(packageJson.evidenceGraph)}`,
    ...(evidenceChainRows.length > 0
      ? evidenceChainRows
      : ['- Pending: no source document -> approved input links yet.']),
    ...evidenceGapRows,
    '',
    '## Source Documents',
    '| File | Type | Review Status | Extraction Status |',
    '| --- | --- | --- | --- |',
    ...documentRows,
    '',
    '## Assumptions',
    ...packageJson.assumptions.map((item) => `- ${item}`),
    '',
    '## Open Questions',
    ...packageJson.openQuestions.map((item) => `- ${item}`),
    '',
    '## Red Flags',
    ...packageJson.redFlags.map((item) => `- ${item}`),
    '',
    '## Red Flag Drilldowns',
    ...packageJson.redFlagDrilldowns.flatMap((entry) => {
      const lines = [`- ${entry.flag}`, `  - Origin: ${entry.workpaper}`]
      for (const field of entry.relatedFields) {
        const locationParts = [
          field.location?.sheet ? `sheet ${field.location.sheet}` : '',
          typeof field.location?.row === 'number' ? `row ${field.location.row}` : '',
          field.location?.column ? `column ${field.location.column}` : '',
          typeof field.location?.line === 'number' ? `line ${field.location.line}` : '',
          typeof field.location?.page === 'number' ? `page ${field.location.page}` : '',
        ].filter(Boolean)
        const location = locationParts.length > 0 ? ` (${locationParts.join(', ')})` : ''
        lines.push(`  - Source: ${field.label} from ${field.fileName}${location}`)
      }
      return lines
    }),
    '',
    '## Quality Gate',
    `Status: ${packageJson.qualityGate.status === 'pass' ? 'PASS' : 'WARNING'}`,
    '| Checklist Item | Status | Detail |',
    '| --- | --- | --- |',
    ...qualityRows,
    ...packageJson.qualityGate.warnings.map((item) => `- Warning: ${item}`),
    '',
    '## Reviewer Signoff',
    `- State: ${packageJson.qualityGate.reviewerSignoff.state}`,
    `- Reviewer: ${packageJson.qualityGate.reviewerSignoff.reviewer ?? 'unassigned'}`,
    `- Signed at: ${packageJson.qualityGate.reviewerSignoff.signedAt ?? 'not signed'}`,
    ...(packageJson.qualityGate.reviewerSignoff.note ? [`- Note: ${packageJson.qualityGate.reviewerSignoff.note}`] : []),
    '',
    '## Launch Gate',
    ...packageJson.readiness.blockers.map((item) => `- Blocker: ${item}`),
    ...packageJson.readiness.warnings.map((item) => `- Warning: ${item}`),
    '',
    '## Package Version History',
    '| Version | Generated | Readiness | Approved Fields | Evidence Score | Signoff |',
    '| --- | --- | --- | --- | --- | --- |',
    ...packageJson.versionHistory.map((entry) =>
      `| ${entry.version} | ${markdownCell(entry.generatedAt)} | ${markdownCell(entry.readinessStatus)} | ${entry.approvedFieldCount} | ${(entry.evidenceScore * 100).toFixed(0)}% | ${markdownCell(entry.reviewerSignoffState)} |`
    ),
    '',
  ].join('\n')
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
  // P5: give the classifier a text sample so tabular content (rent roll / T12) is
  // routed by what the file IS, not just what it's named — preventing silent data loss.
  const type = classifyDocument(fileName, content.subarray(0, 8192).toString('utf8'))
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
    allowedBasePath: context.dataRoot,
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
  // I2b: auto-apply the trusted subset by default. Conflicting / low-confidence / invalid reads
  // are left as candidates for the operator (the credibility gate is concentrated, not removed).
  const autoAppliedPaths = autoApplyTrustedExtraction(context, dealId, documentId)
  if (autoAppliedPaths.length === 0) {
    return { document: updated, extraction: { ...extraction, autoAppliedPaths: [] } }
  }
  // Re-read so the response reflects the applied statuses + document state after auto-apply.
  const refreshedManifest = readManifest(context, dealId)
  const refreshedDocument =
    refreshedManifest.documents.find((doc) => doc.documentId === documentId) ?? updated
  const refreshedExtraction =
    readJson<ExtractionPreview | null>(extractionPath(context, dealId, documentId), null) ?? extraction
  return {
    document: refreshedDocument,
    extraction: { ...refreshedExtraction, autoAppliedPaths },
  }
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

export function reviewSourceExtraction(
  context: ServiceContext,
  dealId: string,
  documentId: string,
  payload: Record<string, unknown>,
): { document: SourceDocument; extraction: ExtractionPreview } {
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const extraction = readJson<ExtractionPreview | null>(extractionPath(context, dealId, documentId), null)
  if (!extraction) throw new Error(`Extraction not found for document: ${documentId}`)
  if (extraction.status !== 'extracted' || extraction.fields.length === 0) {
    throw new Error('Only extracted documents with review-ready fields can be reviewed.')
  }
  const selectedFieldIds = Array.isArray(payload.fieldIds)
    ? new Set(payload.fieldIds.filter((entry): entry is string => typeof entry === 'string'))
    : new Set<string>()
  if (selectedFieldIds.size === 0) throw new Error('No extraction fields were selected for review.')
  const availableFieldIds = new Set(extraction.fields.map((field) => extractionFieldId(field)))
  const unknownSelectedFieldId = [...selectedFieldIds].find((fieldId) => !availableFieldIds.has(fieldId))
  if (unknownSelectedFieldId) {
    throw new Error(`Selected extraction field is no longer available: ${unknownSelectedFieldId}`)
  }
  const nextStatus = normalizeReviewStatus(payload.reviewStatus)
  const note = asString(payload.note)
  const now = new Date().toISOString()
  const nextExtraction: ExtractionPreview = {
    ...enrichExtractionFields(extraction, record.deal),
    reviewStatus: nextStatus,
    fields: extraction.fields.map((field) => (
      selectedFieldIds.has(extractionFieldId(field))
        ? {
            ...field,
            fieldId: extractionFieldId(field),
            reviewStatus: nextStatus,
            reviewNote: note,
            reviewedAt: now,
          }
        : field
    )),
  }
  const nextDocumentStatus = extractionDocumentStatus(nextExtraction.fields)
  const nextDocument = updateDocument(context, dealId, documentId, (current) => ({
    ...current,
    status: nextDocumentStatus,
    reviewedAt: now,
    lifecycleReason: note || current.lifecycleReason,
    summary: nextStatus === 'waived'
      ? 'Operator waived selected extracted fields.'
      : nextStatus === 'rejected'
        ? 'Operator rejected selected extracted fields.'
        : current.summary,
  }))
  writeJsonAtomic(extractionPath(context, dealId, documentId), nextExtraction)
  // W41: record a decision-history entry per reviewed field.
  appendDecisionEntries(
    context,
    dealId,
    nextExtraction.fields
      .filter((field) => selectedFieldIds.has(extractionFieldId(field)))
      .map((field) => ({
        fieldId: extractionFieldId(field),
        path: field.path,
        label: field.label,
        action: decisionStatusToAction(nextStatus),
        reviewStatus: nextStatus,
        documentId,
        decidedAt: now,
        note: note || undefined,
        value: field.value,
        previousValue: field.currentValue,
        conflict: Boolean(field.conflict),
      })),
  )
  return {
    document: nextDocument,
    extraction: enrichExtractionFields(nextExtraction, record.deal),
  }
}

// Shared result shape for applying parser-sourced fields into a deal (manual apply + I2b
// auto-apply both produce this).
interface FieldApplyResult {
  document: SourceDocument
  extraction: ExtractionPreview
  deal: DealRecord
  approvedFields: ApprovedFieldManifest
  validation: { valid: boolean; launchReady: boolean; errors: string[]; warnings: string[] }
}

/**
 * I2b: shared commit core for applying parser-sourced extraction fields into the deal record.
 * Both manual apply (applySourceExtraction) and auto-apply (during extractSourceDocument) call
 * this AFTER they have selected + validated the field set. It performs the identical persistence
 * the manual path always did: build the next deal, run the draft/launch validateDealConfig gates,
 * upsert the approved-fields manifest (full provenance retained), write a rollback snapshot, commit
 * all files atomically, and append one audit decision per field. The only behavioural difference
 * between manual and auto is the recorded `action` ('apply' vs 'auto-apply'); the trust model
 * (provenance + audit + validation) is byte-for-byte the same. Selection/conflict gating is the
 * CALLER's responsibility so each path can keep its own rules (manual allows confirmConflictReview;
 * auto applies trusted fields only and never bypasses a conflict).
 */
function commitFieldApply(
  context: ServiceContext,
  dealId: string,
  args: {
    documentId: string
    manifest: { documents: SourceDocument[] }
    sourceDocument: SourceDocument
    enrichedExtraction: ExtractionPreview
    localDeal: Record<string, unknown>
    selectedFields: ExtractionField[]
    action: Extract<FieldDecisionAction, 'apply' | 'auto-apply'>
    note?: string
  },
): FieldApplyResult {
  const { documentId, manifest, sourceDocument, enrichedExtraction, localDeal, selectedFields, action, note } = args
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
    previousValue: field.currentValue,
    valueType: field.valueType,
    unit: field.unit,
    approvedAt: now,
    appliedAt: now,
    documentId,
    sourceRef: field.sourceRef,
    confidence: field.confidence,
    provenance: 'parser',
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
    reason: action === 'auto-apply' ? 'pre-extraction-auto-apply' : 'pre-extraction-apply',
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
  // W41 / I2b: record one decision-history entry per applied field, tagged with the action.
  appendDecisionEntries(
    context,
    dealId,
    selectedFields.map((field) => ({
      fieldId: field.fieldId,
      path: field.path,
      label: field.label,
      action,
      reviewStatus: 'applied',
      documentId,
      decidedAt: now,
      note: note || undefined,
      value: field.value,
      previousValue: field.currentValue,
      conflict: Boolean(field.conflict),
    })),
  )
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

/**
 * I2b: a field is TRUSTED (eligible for auto-apply) only when every credibility signal is clean:
 * an approved source-backed path, a parser fieldId, no source conflict, confidence at/above the
 * threshold, no validation issues, and a sourceRef that matches this extraction. Anything else
 * (conflict, low confidence, validation issue) stays a candidate for the operator. Exported so the
 * trust gate can be unit-tested directly across every exclusion branch.
 */
export function isAutoApplyTrusted(field: ExtractionField, extraction: ExtractionPreview, documentId: string): boolean {
  if (!field.fieldId) return false
  if (!SOURCE_BACKED_FIELD_PATHS.has(field.path)) return false
  if (field.conflict) return false
  if (typeof field.confidence !== 'number' || field.confidence < AUTO_APPLY_MIN_CONFIDENCE) return false
  if (Array.isArray(field.validationIssues) && field.validationIssues.length > 0) return false
  const sourceRef = field.sourceRef
  if (
    !sourceRef ||
    sourceRef.documentId !== documentId ||
    sourceRef.parserId !== extraction.parserId ||
    sourceRef.parserVersion !== extraction.parserVersion ||
    sourceRef.fileHash !== extraction.sourceHash
  ) {
    return false
  }
  return true
}

/**
 * I2b: auto-apply the trusted subset of a freshly-persisted extraction. Mirrors the cross-document
 * conflict guard the manual path enforces (a trusted field whose path still has an unresolved,
 * disagreeing candidate in another document is held back, not auto-applied). Returns the paths that
 * were auto-applied (empty when none qualify). Safe to call right after extraction is written.
 */
function autoApplyTrustedExtraction(
  context: ServiceContext,
  dealId: string,
  documentId: string,
): string[] {
  const record = getDealRecord(context, dealId)
  if (!record) return []
  const extraction = readJson<ExtractionPreview | null>(extractionPath(context, dealId, documentId), null)
  if (!extraction || extraction.status !== 'extracted' || extraction.fields.length === 0) return []
  const manifest = readManifest(context, dealId)
  const sourceDocument = manifest.documents.find((doc) => doc.documentId === documentId)
  if (!sourceDocument) return []
  // Only auto-apply when the on-disk source still matches the extraction hash (same guard as apply).
  let currentHash: string
  try {
    currentHash = fileHash(sourceDocument.path)
  } catch {
    return []
  }
  if (
    !extraction.sourceHash ||
    extraction.sourceHash !== currentHash ||
    !sourceDocument.sourceHash ||
    sourceDocument.sourceHash !== currentHash
  ) {
    return []
  }
  const localDeal = JSON.parse(JSON.stringify(record.deal)) as Record<string, unknown>
  const enrichedExtraction = enrichExtractionFields(extraction, localDeal)
  const trusted = enrichedExtraction.fields.filter((field) => isAutoApplyTrusted(field, extraction, documentId))
  // Respect the cross-document conflict guard: hold back any trusted field whose path still has an
  // unresolved, disagreeing candidate elsewhere. The operator resolves those before they apply.
  const selectedFields = trusted.filter(
    (field) => !findUnresolvedCandidateConflict(context, dealId, documentId, [field]),
  )
  if (selectedFields.length === 0) return []
  commitFieldApply(context, dealId, {
    documentId,
    manifest,
    sourceDocument,
    enrichedExtraction,
    localDeal,
    selectedFields,
    action: 'auto-apply',
    note: 'Auto-applied trusted field on extraction (no conflict, confidence above threshold).',
  })
  return selectedFields.map((field) => field.path)
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
  // W41: block apply when another document still has an unresolved candidate for
  // the same field path that disagrees with the value being applied. Unlike the
  // same-document value conflict above, this cannot be bypassed with
  // confirmConflictReview — the competing candidate must be explicitly resolved
  // (approved, rejected, waived, or applied) first.
  const crossConflict = findUnresolvedCandidateConflict(context, dealId, documentId, selectedFields)
  if (crossConflict) {
    throw new Error(
      `Field has an unresolved conflicting candidate in ${crossConflict.fileName}: ${crossConflict.label}. ` +
        'Resolve the conflicting candidate (approve, reject, or waive it) before applying this field.',
    )
  }
  // Persist via the shared commit core (also used by I2b auto-apply). Manual apply records the
  // `apply` action; gating above (conflict bypass, source-ref validation) already ran.
  return commitFieldApply(context, dealId, {
    documentId,
    manifest,
    sourceDocument,
    enrichedExtraction,
    localDeal,
    selectedFields,
    action: 'apply',
    note: asString(payload.note) || undefined,
  })
}

/**
 * I1: inline operator override. Writes an operator-supplied value directly into a deal field,
 * mirroring applySourceExtraction's persistence guarantees: the prior value is captured as
 * previousValue, the path is validated against the source-backed allow-list, the deal is re-run
 * through the draft + launch validateDealConfig gates (rejecting edits that would break the deal),
 * all files are committed atomically with a rollback snapshot, an `operator-edit` audit entry is
 * recorded, and the approved field is marked operator-originated (provenance 'operator-edited', no
 * parser sourceRef). This is the direct-edit affordance behind the Intake inline edit; it does NOT
 * require a source document.
 */
export function applyOperatorFieldEdit(
  context: ServiceContext,
  dealId: string,
  payload: Record<string, unknown>,
): {
  deal: DealRecord
  approvedFields: ApprovedFieldManifest
  field: ApprovedField
  validation: { valid: boolean; launchReady: boolean; errors: string[]; warnings: string[] }
} {
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const path = asString(payload.path)
  if (!path) throw new Error('Missing required field: path')
  if (!SOURCE_BACKED_FIELD_PATHS.has(path)) {
    throw new Error(`Field is not editable: ${path}`)
  }
  if (!('value' in payload)) {
    throw new Error('Missing required field: value')
  }
  const value = payload.value
  const localDeal = JSON.parse(JSON.stringify(record.deal)) as Record<string, unknown>
  const previousValue = getDeepValue(localDeal, path)
  const label = asString(payload.label) || path
  const nextDeal = JSON.parse(JSON.stringify(localDeal)) as Record<string, unknown>
  setDeepValue(nextDeal, path, value)
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
    throw new Error(`Operator edit would make the deal invalid: ${draftMessages.errors.join('; ')}`)
  }
  const now = new Date().toISOString()
  const valueType = extractionValueType(value)
  const editedField: ApprovedField = {
    fieldId: `operator-edit:${path}`,
    path,
    label,
    value,
    previousValue,
    valueType,
    unit: asString(payload.unit) || undefined,
    approvedAt: now,
    appliedAt: now,
    documentId: 'operator-edit',
    confidence: 1,
    provenance: 'operator-edited',
  }
  const currentApproved = readApprovedFields(context, dealId)
  const nextApprovedFields = upsertApprovedFields(currentApproved.fields, [editedField])
  const approvedFields: ApprovedFieldManifest = {
    version: 1,
    dealId,
    updatedAt: now,
    fields: nextApprovedFields,
  }
  const previousMeta = asObject(readJson<Record<string, unknown>>(metaPath(context, dealId), {}))
  const nextMeta = {
    dealId,
    saveState: launchValidation.launchReady ? 'ready' : 'draft',
    createdAt: asString(previousMeta.createdAt, now),
    updatedAt: now,
  }
  const rollbackPath = join(rollbackDir(context, dealId), `operator-edit-${safeSegment(path)}-${Date.now()}.json`)
  writeJsonAtomic(rollbackPath, {
    createdAt: now,
    reason: 'pre-operator-edit',
    path,
    previousValue,
    deal: localDeal,
  })
  const stagedWrites: StagedJsonWrite[] = []
  try {
    stagedWrites.push(stageJsonWrite(userDealPath(context, dealId), nextDeal))
    stagedWrites.push(stageJsonWrite(approvedFieldsPath(context, dealId), approvedFields))
    stagedWrites.push(stageJsonWrite(metaPath(context, dealId), nextMeta))
    commitStagedWrites(stagedWrites)
  } catch (error) {
    cleanupStagedWrites(stagedWrites)
    throw error
  }
  // I1: record the operator-edit decision in the same audit trail as parser decisions.
  appendDecisionEntries(context, dealId, [
    {
      fieldId: editedField.fieldId,
      path,
      label,
      action: 'operator-edit',
      reviewStatus: 'applied',
      documentId: 'operator-edit',
      decidedAt: now,
      note: asString(payload.note) || undefined,
      value,
      previousValue,
      conflict: false,
    },
  ])
  const refreshed = getDealRecord(context, dealId)
  if (!refreshed) throw new Error(`Deal not found after operator edit: ${dealId}`)
  return {
    deal: refreshed,
    approvedFields,
    field: editedField,
    validation: {
      valid: draftValidation.valid,
      launchReady: launchValidation.launchReady,
      errors: launchMessages.errors,
      warnings: [...draftMessages.warnings, ...launchMessages.warnings],
    },
  }
}

export function exportIcStarterPackage(
  context: ServiceContext,
  dealId: string,
  payload: Record<string, unknown> = {},
): IcStarterPackageExport {
  const record = getDealRecord(context, dealId)
  if (!record) throw new Error(`Deal not found: ${dealId}`)
  const workflowId = normalizePackageWorkflowId(context, payload.workflowId)
  const workspace = getDealWorkspace(context, dealId)
  const documents = readManifest(context, dealId).documents
  const approvedFields = approvedFieldManifestWithCurrentEvidence(readApprovedFields(context, dealId), documents)
  const readiness = evaluateLaunchReadiness(context, dealId, workflowId, { enforceSourceBackedInputs: true })
  const criteria = readCriteria(context, record)
  const generatedAt = new Date().toISOString()

  // W63: incrementing package version + version history.
  const versionHistoryPath = packageVersionHistoryPath(context, dealId, workflowId)
  const priorHistory = readJson<PackageVersionHistory>(versionHistoryPath, {
    version: 1,
    dealId,
    updatedAt: generatedAt,
    entries: [],
  })
  const priorEntries = Array.isArray(priorHistory.entries) ? priorHistory.entries : []
  const packageVersion = priorEntries.reduce((max, entry) => Math.max(max, entry.version), 0) + 1

  // W60: reviewer signoff state (from payload, defaults to unsigned).
  const reviewerSignoff = normalizeReviewerSignoff(payload.reviewerSignoff, generatedAt)

  // W63: per-field source drilldown references.
  // I1: operator-edited fields have no parser sourceRef — surface the operator origin
  // explicitly so the drilldown stays honest about how the value got there.
  const sourceDrilldown: IcStarterPackageSourceDrilldown[] = approvedFields.fields.map((field) => {
    const sourceRef = field.sourceRef
    if (!sourceRef) {
      return {
        fieldId: field.fieldId,
        path: field.path,
        label: field.label,
        documentId: field.documentId,
        fileName: 'Operator edit',
        parserId: 'operator',
        parserVersion: 'operator-edit',
        raw: typeof field.value === 'string' ? field.value : JSON.stringify(field.value),
      }
    }
    return {
      fieldId: field.fieldId,
      path: field.path,
      label: field.label,
      documentId: sourceRef.documentId,
      fileName: sourceRef.fileName,
      fileHash: sourceRef.fileHash,
      parserId: sourceRef.parserId,
      parserVersion: sourceRef.parserVersion,
      location: sourceRef.location,
      raw: sourceRef.raw,
    }
  })

  // W61: per-phase evidence completeness scoring.
  const approvedPathSet = new Set(approvedFields.fields.map((field) => field.path))
  const evidenceCompleteness = buildEvidenceCompleteness(
    operatorGuideSections(context),
    documents,
    approvedPathSet,
  )

  const assumptions = packageAssumptions(criteria, readiness, documents)
  const openQuestions = packageOpenQuestions(workspace, readiness)
  const redFlags = packageRedFlags(readiness)
  // W62: link each red flag back to its originating workpaper + source snippet.
  const redFlagDrilldowns = buildRedFlagDrilldowns(redFlags, workflowId, sourceDrilldown)

  // W60: quality gate derived from the assembled package + reviewer signoff.
  const qualityGate = buildPackageQualityGate(
    { approvedInputs: approvedFields.fields, assumptions, openQuestions, redFlags, sourceDrilldown },
    reviewerSignoff,
  )

  const versionHistoryEntry: PackageVersionHistoryEntry = {
    version: packageVersion,
    generatedAt,
    workflowId,
    readinessStatus: readiness.status,
    approvedFieldCount: approvedFields.fields.length,
    evidenceScore: evidenceCompleteness.overallScore,
    reviewerSignoffState: reviewerSignoff.state,
  }
  const versionHistory: PackageVersionHistoryEntry[] = [...priorEntries, versionHistoryEntry]

  const packageJsonBase: Omit<IcStarterPackage, 'evidenceGraph'> = {
    version: packageVersion,
    generatedAt,
    dealId,
    dealName: record.item.dealName,
    workflowId,
    criteria,
    deal: record.deal,
    sourceCoverage: readiness.sourceCoverage,
    readiness: {
      status: readiness.status,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      requiredApprovedFields: readiness.requiredApprovedFields,
      approvedFields: readiness.approvedFields,
      missingApprovedFields: readiness.missingApprovedFields,
    },
    approvedInputs: approvedFields.fields.map((field) => ({
      fieldId: field.fieldId,
      path: field.path,
      label: field.label,
      value: field.value,
      valueType: field.valueType,
      unit: field.unit,
      confidence: field.confidence,
      approvedAt: field.approvedAt,
      appliedAt: field.appliedAt,
      sourceRef: field.sourceRef,
    })),
    sourceDocuments: documents.map((document) => ({
      documentId: document.documentId,
      fileName: document.fileName,
      typeLabel: document.typeLabel,
      status: document.status,
      extractionStatus: document.extractionStatus,
      uploadedAt: document.uploadedAt,
      extractedAt: document.extractedAt,
      reviewedAt: document.reviewedAt,
      appliedAt: document.appliedAt,
      parserId: document.parserId,
      parserVersion: document.parserVersion,
      sourceHash: document.sourceHash,
    })),
    assumptions,
    openQuestions,
    redFlags,
    redFlagDrilldowns,
    nextAction: workspace.operatorCommand.recommendedAction,
    sourceDrilldown,
    qualityGate,
    evidenceCompleteness,
    versionHistory,
  }
  const evidenceGraph = buildEvidenceGraph(packageJsonBase)
  const packageJson: IcStarterPackage = {
    ...packageJsonBase,
    evidenceGraph,
  }
  const markdown = renderIcStarterPackageMarkdown(packageJson)
  const outputDir = packagesDir(context, dealId)
  ensureDir(outputDir)
  const safeWorkflow = safeSegment(workflowId)
  const jsonPath = join(outputDir, `${safeWorkflow}-ic-starter-package.json`)
  const markdownPath = join(outputDir, `${safeWorkflow}-ic-starter-package.md`)
  writeJsonAtomic(jsonPath, packageJson)
  writeFileSync(markdownPath, markdown)
  // W63: persist the incrementing version history for subsequent re-exports.
  writeJsonAtomic(versionHistoryPath, {
    version: 1,
    dealId,
    updatedAt: generatedAt,
    entries: versionHistory,
  })
  return {
    packageJson,
    markdown,
    files: {
      json: jsonPath,
      markdown: markdownPath,
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
