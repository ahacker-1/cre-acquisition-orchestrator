import type { DealCheckpoint } from '../../types/checkpoint'
import {
  safeNum,
  safeStr,
  safeArr,
  safeObj,
  SectionHeading,
} from './ReportHelpers'
import EmptyPhaseState from './EmptyPhaseState'

interface Props {
  dealCheckpoint: DealCheckpoint
}

export default function RiskAssessment({ dealCheckpoint }: Props) {
  const { phases } = dealCheckpoint

  /* Guard: need DD or Closing data */
  if (!phases?.due_diligence?.dataForDownstream && !phases?.closing?.dataForDownstream) {
    return (
      <EmptyPhaseState
        sectionTitle="Risk Assessment"
        phaseName="Due Diligence and Closing"
      />
    )
  }

  /* Due diligence data for risk metrics */
  const dd = (phases?.due_diligence?.dataForDownstream || {}) as Record<string, unknown>
  const riskScore = safeNum(dd.riskScore, 0)
  const redFlagCount = safeNum(dd.redFlagCount, 0)
  const dataGapCount = safeNum(dd.dataGapCount, 0)
  const environmentalRisk = safeStr(dd.environmentalRisk, '--')
  const floodZone = safeStr(dd.floodZone, '--')
  const dataGaps = safeArr(dd.dataGaps) as Array<Record<string, unknown>>

  /* Closing data for merits, risks, conditions */
  const closing = (phases?.closing?.dataForDownstream || {}) as Record<string, unknown>
  const keyMerits = safeArr(closing.keyMerits) as string[]
  const keyRisks = safeArr(closing.keyRisks) as string[]
  const conditions = safeArr(closing.conditions) as Array<Record<string, unknown>>

  /* Risk score display colors */
  const riskColor =
    riskScore <= 40 ? 'text-cre-success' : riskScore <= 70 ? 'text-cre-warning' : 'text-cre-danger'
  const riskBarColor =
    riskScore <= 40 ? 'bg-cre-success' : riskScore <= 70 ? 'bg-cre-warning' : 'bg-cre-danger'
  const riskLabel =
    riskScore <= 40 ? 'Low Risk' : riskScore <= 70 ? 'Moderate Risk' : 'High Risk'

  /** Split a merit/risk string into title and description at the first colon. */
  function splitTitleDescription(text: string): { title: string; description: string } {
    const colonIdx = text.indexOf(':')
    if (colonIdx > 0 && colonIdx < 60) {
      return {
        title: text.slice(0, colonIdx).trim(),
        description: text.slice(colonIdx + 1).trim(),
      }
    }
    return { title: '', description: text }
  }

  /** Priority badge color */
  function priorityColor(priority: string): string {
    const upper = priority.toUpperCase()
    if (upper === 'HIGH') return 'bg-cre-danger/20 text-cre-danger'
    if (upper === 'MEDIUM') return 'bg-cre-warning/20 text-cre-warning'
    return 'bg-[#4b5563]/20 text-gray-400'
  }

  return (
    <section className="space-y-5">
      <SectionHeading>Risk Assessment</SectionHeading>

      {/* ---- Risk Score ---- */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-white">Composite Risk Score</h4>
          <div className="text-right">
            <span className={`text-4xl font-bold font-mono tabular-nums ${riskColor}`}>
              {riskScore}
            </span>
            <span className="text-lg text-gray-500 font-mono">/100</span>
          </div>
        </div>

        <div className="progress-bar h-5 mb-2">
          <div
            className={`progress-fill ${riskBarColor}`}
            style={{ width: `${riskScore}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span className={riskScore <= 40 ? 'text-cre-success font-semibold' : ''}>
            Low Risk
          </span>
          <span className={riskScore > 40 && riskScore <= 70 ? 'text-cre-warning font-semibold' : ''}>
            Moderate
          </span>
          <span className={riskScore > 70 ? 'text-cre-danger font-semibold' : ''}>
            High Risk
          </span>
        </div>

        <div className="mt-3 text-center">
          <span className={`status-badge ${
            riskScore <= 40
              ? 'bg-cre-success/20 text-cre-success'
              : riskScore <= 70
                ? 'bg-cre-warning/20 text-cre-warning'
                : 'bg-cre-danger/20 text-cre-danger'
          }`}>
            {riskLabel}
          </span>
        </div>
      </div>

      {/* ---- Summary Stats Row ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-black/20 rounded-lg p-3 text-center">
          <div
            className={`text-xl font-bold font-mono tabular-nums ${
              redFlagCount === 0 ? 'text-cre-success' : 'text-cre-danger'
            }`}
          >
            {redFlagCount}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Red Flags</div>
        </div>
        <div className="bg-black/20 rounded-lg p-3 text-center">
          <div className="text-xl font-bold font-mono tabular-nums text-cre-warning">
            {dataGapCount}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Data Gaps</div>
        </div>
        <div className="bg-black/20 rounded-lg p-3 text-center">
          <div
            className={`text-xl font-bold font-mono tabular-nums ${
              environmentalRisk.toUpperCase() === 'LOW' ? 'text-cre-success' : 'text-cre-warning'
            }`}
          >
            {environmentalRisk.toUpperCase()}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Environmental</div>
        </div>
        <div className="bg-black/20 rounded-lg p-3 text-center">
          <div
            className={`text-xl font-bold font-mono tabular-nums ${
              floodZone.toUpperCase() === 'PENDING' ? 'text-cre-warning' : 'text-cre-success'
            }`}
          >
            {floodZone.toUpperCase()}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Flood Zone</div>
        </div>
      </div>

      {/* ---- Key Merits ---- */}
      {keyMerits.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-white mb-3">Key Merits</h4>
          <ol className="space-y-3">
            {keyMerits.map((merit, i) => {
              const { title, description } = splitTitleDescription(
                typeof merit === 'string' ? merit : '--'
              )
              return (
                <li
                  key={i}
                  className="flex items-start gap-3 border-l-3 border-l-cre-success pl-3"
                  style={{ borderLeftWidth: '3px' }}
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cre-success/20 flex items-center justify-center mt-0.5">
                    <span className="text-xs font-bold font-mono text-cre-success">
                      {i + 1}
                    </span>
                  </span>
                  <div className="text-sm text-gray-300">
                    {title ? (
                      <>
                        <span className="font-semibold text-white">{title}:</span>{' '}
                        {description}
                      </>
                    ) : (
                      description
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* ---- Key Risks ---- */}
      {keyRisks.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-white mb-3">Key Risks</h4>
          <ol className="space-y-3">
            {keyRisks.map((risk, i) => {
              const { title, description } = splitTitleDescription(
                typeof risk === 'string' ? risk : '--'
              )
              return (
                <li
                  key={i}
                  className="flex items-start gap-3 pl-3"
                  style={{ borderLeftWidth: '3px', borderLeftColor: '#e53e3e', borderLeftStyle: 'solid' }}
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cre-danger/20 flex items-center justify-center mt-0.5">
                    <span className="text-xs font-bold font-mono text-cre-danger">
                      {i + 1}
                    </span>
                  </span>
                  <div className="text-sm text-gray-300">
                    {title ? (
                      <>
                        <span className="font-semibold text-white">{title}:</span>{' '}
                        {description}
                      </>
                    ) : (
                      description
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* ---- Data Gaps Table ---- */}
      {dataGaps.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">Outstanding Data Gaps</h4>
            <span className="status-badge bg-cre-warning/20 text-cre-warning">
              {dataGaps.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cre-border text-xs text-gray-500 uppercase">
                  <th className="py-2 text-left font-medium w-8">#</th>
                  <th className="py-2 text-left font-medium">Gap</th>
                  <th className="py-2 text-center font-medium">Priority</th>
                  <th className="py-2 text-left font-medium">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {dataGaps.map((gap, i) => {
                  const gapObj = safeObj(gap)
                  const priority = safeStr(gapObj.priority, 'N/A')
                  return (
                    <tr
                      key={i}
                      className="border-b border-cre-border/30 last:border-b-0"
                    >
                      <td className="py-2 font-mono tabular-nums text-gray-500 text-xs">
                        {i + 1}
                      </td>
                      <td className="py-2 text-gray-300">{safeStr(gapObj.gap)}</td>
                      <td className="py-2 text-center">
                        <span className={`status-badge ${priorityColor(priority)}`}>
                          {priority.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 text-gray-400">{safeStr(gapObj.resolution)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Conditions for Approval ---- */}
      {conditions.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-white mb-3">Conditions for Approval</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cre-border text-xs text-gray-500 uppercase">
                  <th className="py-2 text-left font-medium w-8">#</th>
                  <th className="py-2 text-left font-medium">Condition</th>
                  <th className="py-2 text-left font-medium">Responsible</th>
                  <th className="py-2 text-left font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {conditions.map((cond, i) => {
                  const condObj = safeObj(cond)
                  return (
                    <tr
                      key={i}
                      className="border-b border-cre-border/30 last:border-b-0"
                    >
                      <td className="py-2.5">
                        <div className="w-5 h-5 rounded border-2 border-[#6b7280] flex items-center justify-center">
                          <span className="text-[10px] text-gray-600 font-mono">
                            {i + 1}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-gray-300">
                        {safeStr(condObj.condition)}
                      </td>
                      <td className="py-2.5 text-gray-400">
                        {safeStr(condObj.responsible)}
                      </td>
                      <td className="py-2.5 text-gray-400 whitespace-nowrap">
                        {safeStr(condObj.deadline)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
