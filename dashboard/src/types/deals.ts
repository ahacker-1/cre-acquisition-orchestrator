import type { RunSpeed } from './checkpoint'

export type InvestmentStrategy = 'core' | 'core-plus' | 'value-add' | 'opportunistic' | ''
export type LoanType = 'Agency' | 'CMBS' | 'Bank' | 'Bridge' | 'Life Company' | 'HUD' | ''
export type PropertyType = 'multifamily' | 'office' | 'retail' | 'industrial' | ''
export type LaunchScenario = 'core-plus' | 'value-add' | 'distressed'
export type DealSaveMode = 'draft' | 'launch'
export type DealLibraryKind = 'user' | 'sample'
export type DealSaveState = 'draft' | 'ready' | 'sample'

export interface DealValidationIssue {
  path: string
  severity: 'error' | 'warning'
  message: string
}

export interface DealValidationResult {
  valid: boolean
  launchReady: boolean
  issues: DealValidationIssue[]
  blockingIssues: DealValidationIssue[]
  warnings: DealValidationIssue[]
}

export interface UnitMixRowForm {
  id: string
  type: string
  count: number | null
  avgSqFt: number | null
  marketRent: number | null
  inPlaceRent: number | null
}

export interface DealFormData {
  dealId: string
  dealName: string
  property: {
    address: string
    city: string
    state: string
    zip: string
    propertyType: PropertyType
    yearBuilt: number | null
    totalUnits: number | null
    unitMix: {
      types: UnitMixRowForm[]
    }
  }
  financials: {
    askingPrice: number | null
    currentNOI: number | null
    inPlaceOccupancy: number | null
  }
  financing: {
    targetLTV: number | null
    estimatedRate: number | null
    loanTerm: number | null
    amortization: number | null
    loanType: LoanType
  }
  investmentStrategy: InvestmentStrategy
  targetHoldPeriod: number | null
  targetIRR: number | null
  targetEquityMultiple: number | null
  targetCashOnCash: number | null
  seller: {
    entity: string
  }
  timeline: {
    psaExecutionDate: string
    ddStartDate: string
    ddExpirationDate: string
    closingDate: string
  }
  notes: string
  launch: {
    scenario: LaunchScenario
    speed: RunSpeed
  }
}

export interface DealLibraryItem {
  dealId: string
  dealName: string
  kind: DealLibraryKind
  readOnly: boolean
  saveState: DealSaveState
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

export interface DealRecordResponse {
  item: DealLibraryItem
  deal: Record<string, unknown>
  validation: DealValidationResult
}

export interface DealLibraryResponse {
  deals: DealLibraryItem[]
  suggestedDealId: string
}

export interface SaveDealResponse extends DealRecordResponse {}

export interface LaunchDealResponse {
  runId: string
  status: string
  mode: string
  speed: string
  pid: number | null
  startedAt: string
  deal: DealLibraryItem
}
