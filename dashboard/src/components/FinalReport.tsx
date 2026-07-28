import { useCallback } from 'react'
import { IconPrinter } from '@tabler/icons-react'
import type { DealCheckpoint } from '../types/checkpoint'
import { isCompleteDealStatus } from '../lib/stageModel'
import ReportHeader from './report/ReportHeader'
import ExecutiveSummary from './report/ExecutiveSummary'
import PropertyOverview from './report/PropertyOverview'
import MarketAnalysis from './report/MarketAnalysis'
import ProForma from './report/ProForma'
import SensitivityAnalysis from './report/SensitivityAnalysis'
import FinancingDetail from './report/FinancingDetail'
import AgentFindings from './report/AgentFindings'
import LegalClosing from './report/LegalClosing'
import RiskAssessment from './report/RiskAssessment'
import PipelineSummary from './report/PipelineSummary'

interface FinalReportProps {
  dealCheckpoint: DealCheckpoint
}

const REQUIRED_LONG_FORM_PHASES = [
  ['dueDiligence', 'due-diligence', 'due_diligence'],
  ['underwriting'],
  ['financing'],
  ['legal'],
  ['closing'],
] as const

function hasSubstantiveValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.some(hasSubstantiveValue)
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasSubstantiveValue)
  }
  return false
}

export function hasSubstantiveFinalReportData(dealCheckpoint: DealCheckpoint): boolean {
  if (!isCompleteDealStatus(dealCheckpoint.status)) return false
  return REQUIRED_LONG_FORM_PHASES.every((aliases) => {
    const phase = aliases.map((alias) => dealCheckpoint.phases[alias]).find(Boolean)
    return Boolean(
      phase &&
      phase.status !== 'skipped' &&
      hasSubstantiveValue(phase.dataForDownstream),
    )
  })
}

export default function FinalReport({ dealCheckpoint }: FinalReportProps) {
  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  if (!isCompleteDealStatus(dealCheckpoint.status)) return null

  if (!hasSubstantiveFinalReportData(dealCheckpoint)) {
    return (
      <section
        data-testid="final-report-gate"
        className="mx-auto max-w-6xl border-y border-white/10 py-8"
        aria-label="Detailed acquisition memo availability"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Detailed acquisition memo</p>
        <h2 className="mt-3 font-serif text-2xl text-cre-primary">The completed package above is the final output for this scope.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500">
          The long-form acquisition memo is shown only when a full five-phase run files substantive
          diligence, underwriting, financing, legal, and closing datasets. This prevents a completed
          scoped review from being followed by placeholder tables or unfinished-looking sections.
        </p>
      </section>
    )
  }

  return (
    <div data-testid="final-report" className="mx-auto max-w-6xl pb-20 [&_.card]:rounded-none [&_.card]:bg-transparent [&_.card]:shadow-none">
      {/* Print button — hidden during print via print.css */}
      <div className="no-print flex justify-end border-b border-white/10 pb-5">
        <button
          type="button"
          onClick={handlePrint}
          className="portal-button portal-button-secondary"
        >
          <IconPrinter size={17} stroke={1.6} aria-hidden="true" />
          Print Report
        </button>
      </div>

      <div className="mt-8 space-y-10 [&>section:first-child]:border [&>section]:border-b [&>section]:border-white/10 [&>section]:pb-10">
        <ReportHeader dealCheckpoint={dealCheckpoint} />
        <ExecutiveSummary dealCheckpoint={dealCheckpoint} />
        <PropertyOverview dealCheckpoint={dealCheckpoint} />
        <MarketAnalysis dealCheckpoint={dealCheckpoint} />
        <ProForma dealCheckpoint={dealCheckpoint} />
        <SensitivityAnalysis dealCheckpoint={dealCheckpoint} />
        <FinancingDetail dealCheckpoint={dealCheckpoint} />
        <AgentFindings dealCheckpoint={dealCheckpoint} />
        <LegalClosing dealCheckpoint={dealCheckpoint} />
        <RiskAssessment dealCheckpoint={dealCheckpoint} />
        <PipelineSummary dealCheckpoint={dealCheckpoint} />
      </div>
    </div>
  )
}
