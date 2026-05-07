import type { DealCheckpoint } from '../../types/checkpoint'
import {
  PHASE_ORDER,
  safeArr,
  safeObj,
  safeStr,
} from './ReportHelpers'

interface ReportHeaderProps {
  dealCheckpoint: DealCheckpoint
}

export default function ReportHeader({ dealCheckpoint }: ReportHeaderProps) {
  const { dealName, property, phases } = dealCheckpoint

  /* ---------------------------------------------------------------- */
  /*  Derive overall recommendation from all 5 phase verdicts          */
  /* ---------------------------------------------------------------- */
  const verdicts = PHASE_ORDER.map((k) => {
    const phase = phases?.[k]
    const v = phase?.verdict || phase?.outputs?.phaseVerdict || null
    return typeof v === 'string' ? v.toUpperCase() : null
  })
  const phaseValues = Object.values(phases || {})
  const hasSkipped = phaseValues.some((phase) => phase.status === 'skipped')

  const hasFail = verdicts.some((v) => v === 'FAIL')
  const hasConditional = verdicts.some(
    (v) => v !== null && (v.includes('CONDITIONAL') || v.includes('MITIGATION'))
  )

  let recommendation = hasSkipped ? 'SCOPED WORKFLOW COMPLETE' : 'PROCEED TO CLOSE'
  let recClasses = hasSkipped
    ? 'bg-cre-info/20 text-cre-info border-cre-info/40'
    : 'bg-cre-success/20 text-cre-success border-cre-success/40'

  if (hasFail) {
    recommendation = 'DO NOT PROCEED'
    recClasses = 'bg-cre-danger/20 text-cre-danger border-cre-danger/40'
  } else if (hasConditional) {
    recommendation = 'CONDITIONAL PASS - PROCEED TO CLOSE'
    recClasses = 'bg-cre-warning/20 text-cre-warning border-cre-warning/40'
  }

  /* ---------------------------------------------------------------- */
  /*  Conditions from closing phase                                    */
  /* ---------------------------------------------------------------- */
  const closingData = safeObj(phases?.closing?.dataForDownstream)
  const conditions = safeArr(closingData.conditions)
  const conditionsCount = conditions.length

  /* ---------------------------------------------------------------- */
  /*  Report date                                                      */
  /* ---------------------------------------------------------------- */
  const reportDate = new Date(
    dealCheckpoint.lastUpdatedAt || Date.now()
  ).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  /* ---------------------------------------------------------------- */
  /*  Address string                                                   */
  /* ---------------------------------------------------------------- */
  const addressParts = [
    safeStr(property?.address, ''),
    safeStr(property?.city, ''),
    safeStr(property?.state, ''),
  ].filter((p) => p && p !== '--')

  const zip = property?.zip || ''
  const fullAddress = addressParts.join(', ') + (zip ? ` ${zip}` : '')

  return (
    <section className="card border-2 border-cre-border">
      <div className="text-center">
        {/* Confidential label */}
        <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] mb-1">
          Confidential
        </p>

        {/* Title */}
        <h1 className="text-2xl font-bold tracking-tight text-white">
          INVESTMENT COMMITTEE MEMORANDUM
        </h1>

        {/* Deal info */}
        <div className="mt-4 space-y-1">
          <p className="text-lg text-gray-200 font-semibold">
            {dealName || 'Untitled Deal'}
          </p>
          <p className="text-sm text-gray-400">
            {fullAddress || 'Address not available'}
          </p>
          <p className="text-xs text-gray-500">{reportDate}</p>
        </div>

        {/* Recommendation badge */}
        <div className="mt-6 inline-block">
          <div
            className={`px-8 py-3 rounded-lg border-2 text-lg font-bold tracking-wide ${recClasses}`}
          >
            {recommendation}
          </div>
          {conditionsCount > 0 && (
            <p className="text-sm text-gray-400 mt-2">
              Subject to {conditionsCount} condition{conditionsCount !== 1 ? 's' : ''} precedent
            </p>
          )}
        </div>

        {/* Prepared by line */}
        <div className="mt-6 pt-4 border-t border-cre-border/40">
          <p className="text-xs text-gray-500">
            Prepared by:{' '}
            <span className="text-gray-400">
              {dealCheckpoint.workflowName || 'CRE Acquisition Orchestration System'} ({hasSkipped ? 'scoped workflow' : '21 agents, 5 phases'})
            </span>
          </p>
          <p className="text-[10px] text-gray-600 mt-1 font-mono">
            Deal ID: {dealCheckpoint.dealId || '--'}
          </p>
        </div>
      </div>
    </section>
  )
}
