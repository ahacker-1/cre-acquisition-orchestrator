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
}

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
  sourceRef: SourceReference
  confidence: number
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
      sourceRef: SourceReference
    }>
    assumptions: string[]
    openQuestions: string[]
    redFlags: string[]
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
  phases: PhaseWorkspaceStatus[]
  launchReadiness: LaunchReadinessResult[]
  progressionGuide: DealProgressionGuide
  operatorCommand: OperatorCommand
}
