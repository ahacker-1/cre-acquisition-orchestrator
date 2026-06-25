import type { DealRecordResponse } from './deals'

export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive'
export type SourceDocumentStatus =
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
export type ExtractionStatus =
  | 'not-started'
  | 'extracted'
  | 'extraction-pending'
  | 'parse_failed'
  | 'parser-unavailable'
  | 'unsupported'
export type ExtractionReviewStatus = 'candidate' | 'approved' | 'rejected' | 'applied' | 'waived'
export type ExtractionValueType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null'
export type PhaseReadiness = 'ready' | 'partial' | 'blocked'
export type LaunchReadinessStatus = 'ready' | 'warning' | 'blocked'
export type GuideChecklistStatus = 'blocked' | 'missing' | 'ready' | 'in_review' | 'complete' | 'waived'
export type GuideChecklistPriority = 'critical' | 'important' | 'optional'
export type GuideChecklistCategory =
  | 'documents'
  | 'extraction'
  | 'underwriting'
  | 'diligence'
  | 'financing'
  | 'legal'
  | 'closing'
  | 'package'
export type GuideActionType = 'open_tab' | 'edit_details' | 'launch_workflow' | 'upload_documents' | 'review_package'

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
  riskTolerance: RiskTolerance
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
  // I2b: paths auto-applied into the deal during this extraction (trusted fields).
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

// I1: how an approved field's value got into the deal record. 'parser' = extracted from a
// source document (manual apply or I2b auto-apply); 'operator-edited' = direct inline override.
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
  // Optional: absent for operator-edited fields (no parser sourceRef). I1.
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

export interface ApplyExtractionResult {
  document: SourceDocument
  extraction: ExtractionPreview
  deal: DealRecordResponse
  approvedFields: ApprovedFieldManifest
  validation: {
    valid: boolean
    launchReady: boolean
    errors: string[]
    warnings: string[]
  }
}

export interface ReviewExtractionResult {
  document: SourceDocument
  extraction: ExtractionPreview
}

// I1: result of an inline operator override (POST /api/deals/:dealId/field-edit).
export interface ApplyOperatorFieldEditResult {
  deal: DealRecordResponse
  approvedFields: ApprovedFieldManifest
  field: ApprovedField
  validation: {
    valid: boolean
    launchReady: boolean
    errors: string[]
    warnings: string[]
  }
}

// W62: red-flag drilldown linkage back to originating workpaper + source snippet.
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

export interface IcStarterPackageExport {
  packageJson: {
    version: number
    generatedAt: string
    dealId: string
    dealName: string
    workflowId: string
    sourceCoverage: LaunchReadinessResult['sourceCoverage']
    readiness: Pick<LaunchReadinessResult, 'status' | 'blockers' | 'warnings' | 'requiredApprovedFields' | 'approvedFields' | 'missingApprovedFields'>
    approvedInputs: Array<{
      fieldId: string
      path: string
      label: string
      value: unknown
      confidence: number
      sourceRef?: SourceReference
    }>
    documentManifest?: {
      version: 1
      dealId: string
      generatedAt: string
      sourceDocuments: Array<{
        documentId: string
        fileName: string
        typeLabel: string
        status: string
        extractionStatus: string
        uploadedAt: string
        extractedAt?: string
        reviewedAt?: string
        appliedAt?: string
        parserId?: string
        parserVersion?: string
        sourceHash?: string
      }>
      packageFiles: Array<{
        format: 'json' | 'markdown'
        fileName: string
        path: string
      }>
    }
    decisionTrail?: Array<{
      decisionId: string
      fieldId: string
      path: string
      label: string
      action: string
      reviewStatus: string
      documentId: string
      decidedAt: string
      note?: string
      conflict?: boolean
      value?: unknown
      previousValue?: unknown
    }>
    assumptions: string[]
    openQuestions: string[]
    redFlags: string[]
    redFlagDrilldowns?: IcStarterPackageRedFlagDrilldown[]
    evidenceGraph: EvidenceGraph
  }
  markdown: string
  files: {
    json: string
    markdown: string
  }
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

export interface DealWorkspace {
  deal: DealRecordResponse
  criteria: DealCriteria
  documents: SourceDocument[]
  approvedFields: ApprovedFieldManifest
  phases: PhaseWorkspaceStatus[]
  launchReadiness: LaunchReadinessResult[]
  progressionGuide: DealProgressionGuide
  operatorCommand: OperatorCommand
}
