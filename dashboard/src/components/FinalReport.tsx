import { useCallback } from 'react'
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
    <div className="space-y-8 pb-16 max-w-6xl mx-auto">
      {/* Print button — hidden during print via print.css */}
      <div className="flex justify-end no-print">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-200 text-black font-semibold text-sm uppercase transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          Print Report
        </button>
      </div>

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
  )
}
