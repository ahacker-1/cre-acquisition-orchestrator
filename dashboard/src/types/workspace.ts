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

export interface ApplyExtractionResult {
  applied: ApprovedField[]
  rejected: ExtractionField[]
  validation: {
    valid: boolean
    launchReady: boolean
    errors: string[]
    warnings: string[]
  }
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
  deal: DealRecordResponse
  criteria: DealCriteria
  documents: SourceDocument[]
  phases: PhaseWorkspaceStatus[]
}
