import { useCallback } from 'react'
import { IconPrinter } from '@tabler/icons-react'
import type { DealCheckpoint } from '../types/checkpoint'
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

export default function FinalReport({ dealCheckpoint }: FinalReportProps) {
  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  return (
    <div className="mx-auto max-w-6xl pb-20 [&_.card]:rounded-none [&_.card]:bg-transparent [&_.card]:shadow-none">
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
