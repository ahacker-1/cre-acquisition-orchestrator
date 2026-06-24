import type { DealCheckpoint } from '../../types/checkpoint'
import {
  fmtFull$,
  fmtPct,
  safeNum,
  safeStr,
  safeBool,
  safeArr,
  safeObj,
  verdictColor,
  verdictLabel,
  SectionHeading,
} from './ReportHelpers'
import EmptyPhaseState from './EmptyPhaseState'

interface Props {
  dealCheckpoint: DealCheckpoint
}

/** Convert "psa-reviewer" to "Psa Reviewer" */
function formatAgentName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function agentStatusColor(status: string): string {
  const upper = status.toUpperCase()
  if (upper === 'COMPLETE' || upper === 'ACCEPTABLE' || upper === 'CLEAR' || upper === 'BOUND')
    return 'bg-cre-success/20 text-cre-success'
  if (upper === 'FAILED' || upper === 'ERROR')
    return 'bg-cre-danger/20 text-cre-danger'
  return 'bg-[#4b5563]/20 text-gray-400'
}

export default function LegalClosing({ dealCheckpoint }: Props) {
  const { phases } = dealCheckpoint

  /* Guard: need Legal or Closing data */
  if (!phases?.legal?.dataForDownstream && !phases?.closing?.dataForDownstream) {
    return (
      <EmptyPhaseState
        sectionTitle="Legal & Closing"
        phaseName="Legal and Closing"
      />
    )
  }

  /* Legal data */
  const legal = (phases?.legal?.dataForDownstream || {}) as Record<string, unknown>
  const legalFindings = safeObj(legal.agentFindings)
  const legalVerdict = phases?.legal?.verdict || phases?.legal?.outputs?.phaseVerdict || null
  const legalAgentStatuses = phases?.legal?.agentStatuses || {}
  const legalAgentTotal = Object.keys(legalAgentStatuses).length
  const legalAgentComplete = Object.values(legalAgentStatuses).filter(
    (s) => typeof s === 'string' && /^complete$/i.test(s)
  ).length

  /* Closing data */
  const closing = (phases?.closing?.dataForDownstream || {}) as Record<string, unknown>
  const closingVerdict = phases?.closing?.verdict || phases?.closing?.outputs?.phaseVerdict || null
  const closingAgentStatuses = phases?.closing?.agentStatuses || {}
  const closingAgentTotal = Object.keys(closingAgentStatuses).length
  const closingAgentComplete = Object.values(closingAgentStatuses).filter(
    (s) => typeof s === 'string' && /^complete$/i.test(s)
  ).length

  /* Pre-closing status */
  const preClosing = safeObj(closing.preClosingStatus)
  const preClosingComplete = safeNum(preClosing.complete)
  const preClosingTotal = safeNum(preClosing.total)
  const pendingItems = safeArr(preClosing.pendingItems) as string[]

  /* Prorations */
  const prorations = safeArr(closing.prorations) as Array<Record<string, unknown>>

  /* Funds flow */
  const fundsFlow = safeObj(closing.fundsFlow)
  const sources = safeArr(fundsFlow.sources) as Array<Record<string, unknown>>
  const uses = safeArr(fundsFlow.uses) as Array<Record<string, unknown>>
  const totalSources = safeNum(fundsFlow.totalSources)
  const totalUses = safeNum(fundsFlow.totalUses)
  const balanced = safeBool(fundsFlow.balanced)

  /* Closing agent */
  const closingAgent = safeStr(closing.closingAgent, 'N/A')

  return (
    <section className="space-y-6">
      {/* ================================================================ */}
      {/*  LEGAL PHASE                                                     */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <SectionHeading>Legal Phase</SectionHeading>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <span className={`status-badge ${verdictColor(typeof legalVerdict === 'string' ? legalVerdict : null)}`}>
            {verdictLabel(typeof legalVerdict === 'string' ? legalVerdict : null)}
          </span>
          <span className="text-xs text-gray-500">
            ({legalAgentComplete}/{legalAgentTotal} agents complete)
          </span>
        </div>

        {/* Legal Agent Findings */}
        <div className="space-y-3">
          {Object.entries(legalFindings).map(([name, data]) => {
            const agent = safeObj(data as Record<string, unknown>)
            const status = safeStr(agent.status, 'N/A')
            const finding = safeStr(agent.finding, 'No finding recorded.')

            /* Special rendering: estoppel-tracker */
            if (name === 'estoppel-tracker') {
              const received = safeNum(agent.received)
              const total = safeNum(agent.total)
              const returnRate = safeNum(agent.returnRate)
              const minimumRequired = safeNum(agent.minimumRequired)
              const discrepancies = safeNum(agent.discrepancies)
              const discrepancyNote = safeStr(agent.discrepancyNote, '')

              return (
                <div key={name} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-semibold text-white">
                      {formatAgentName(name)}
                    </h5>
                    <span className={`status-badge ${agentStatusColor(status)}`}>
                      {status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed mb-3">{finding}</p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-cre-border/30">
                    <div className="bg-black/20 rounded p-2 text-center">
                      <div className="text-base font-bold font-mono tabular-nums text-white">
                        {received}/{total}
                      </div>
                      <div className="text-[10px] text-gray-500">Received</div>
                    </div>
                    <div className="bg-black/20 rounded p-2 text-center">
                      <div className="text-base font-bold font-mono tabular-nums text-cre-success">
                        {agent.returnRate != null ? fmtPct(returnRate) : '--'}
                      </div>
                      <div className="text-[10px] text-gray-500">Return Rate</div>
                    </div>
                    <div className="bg-black/20 rounded p-2 text-center">
                      <div className="text-base font-bold font-mono tabular-nums text-gray-300">
                        {agent.minimumRequired != null ? fmtPct(minimumRequired) : '--'}
                      </div>
                      <div className="text-[10px] text-gray-500">Min Required</div>
                    </div>
                    <div className="bg-black/20 rounded p-2 text-center">
                      <div
                        className={`text-base font-bold font-mono tabular-nums ${
                          discrepancies > 0 ? 'text-cre-warning' : 'text-cre-success'
                        }`}
                      >
                        {discrepancies}
                      </div>
                      <div className="text-[10px] text-gray-500">Discrepancies</div>
                    </div>
                  </div>
                  {discrepancyNote && (
                    <p className="text-xs text-gray-500 mt-2 italic">{discrepancyNote}</p>
                  )}
                </div>
              )
            }

            /* Special rendering: insurance-coordinator */
            if (name === 'insurance-coordinator') {
              const policies = safeArr(agent.policies) as Array<Record<string, unknown>>
              const totalAnnualPremium = safeNum(agent.totalAnnualPremium)
              const perUnit = safeNum(agent.perUnit)

              return (
                <div key={name} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-semibold text-white">
                      {formatAgentName(name)}
                    </h5>
                    <span className={`status-badge ${agentStatusColor(status)}`}>
                      {status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed mb-3">{finding}</p>

                  {policies.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-cre-border/30">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-cre-border text-xs text-gray-500 uppercase">
                            <th className="py-1.5 text-left font-medium">Policy Type</th>
                            <th className="py-1.5 text-right font-medium">Annual Premium</th>
                          </tr>
                        </thead>
                        <tbody>
                          {policies.map((policy, i) => (
                            <tr
                              key={i}
                              className="border-b border-cre-border/30 last:border-b-0"
                            >
                              <td className="py-1.5 text-gray-300">
                                {safeStr(policy.type)}
                              </td>
                              <td className="py-1.5 text-right font-mono tabular-nums text-white">
                                {policy.annual != null ? fmtFull$(safeNum(policy.annual)) : '--'}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t border-cre-border">
                            <td className="py-2 text-gray-200 font-semibold">Total</td>
                            <td className="py-2 text-right font-mono tabular-nums text-white font-semibold">
                              {agent.totalAnnualPremium != null ? fmtFull$(totalAnnualPremium) : '--'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      {perUnit > 0 && (
                        <p className="text-xs text-gray-500 mt-1 text-right">
                          {fmtFull$(perUnit)}/unit
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            }

            /* Special rendering: transfer-doc-preparer */
            if (name === 'transfer-doc-preparer') {
              const documents = safeArr(agent.documents) as string[]

              return (
                <div key={name} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-semibold text-white">
                      {formatAgentName(name)}
                    </h5>
                    <span className={`status-badge ${agentStatusColor(status)}`}>
                      {status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed mb-3">{finding}</p>

                  {documents.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-cre-border/30">
                      <ul className="space-y-1.5">
                        {documents.map((doc, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                            <span className="flex-shrink-0 w-4 h-4 rounded border border-cre-success/50 bg-cre-success/10 flex items-center justify-center">
                              <span className="text-cre-success text-[10px]">&#10003;</span>
                            </span>
                            {typeof doc === 'string' ? doc : '--'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            }

            /* Default rendering for all other agents */
            return (
              <div key={name} className="card">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-semibold text-white">
                    {formatAgentName(name)}
                  </h5>
                  <span className={`status-badge ${agentStatusColor(status)}`}>
                    {status.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{finding}</p>
              </div>
            )
          })}

          {Object.keys(legalFindings).length === 0 && (
            <div className="card">
              <p className="text-sm text-gray-500">No legal agent findings available.</p>
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t-2 border-cre-border" />

      {/* ================================================================ */}
      {/*  CLOSING PHASE                                                   */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <SectionHeading>Closing Phase</SectionHeading>
        <div className="flex items-center gap-3 mb-2">
          <span className={`status-badge ${verdictColor(typeof closingVerdict === 'string' ? closingVerdict : null)}`}>
            {verdictLabel(typeof closingVerdict === 'string' ? closingVerdict : null)}
          </span>
          <span className="text-xs text-gray-500">
            ({closingAgentComplete}/{closingAgentTotal} agents complete)
          </span>
        </div>

        {/* Pre-Closing Status */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">Pre-Closing Status</h4>
            <span className="text-sm font-mono tabular-nums text-gray-300">
              {preClosingComplete} of {preClosingTotal} items complete
            </span>
          </div>
          <div className="progress-bar h-3 mb-4">
            <div
              className={`progress-fill ${
                preClosingTotal > 0 && preClosingComplete / preClosingTotal >= 1
                  ? 'bg-cre-success'
                  : 'bg-cre-accent'
              }`}
              style={{
                width: `${preClosingTotal > 0 ? (preClosingComplete / preClosingTotal) * 100 : 0}%`,
              }}
            />
          </div>

          {pendingItems.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                Pending Items ({pendingItems.length})
              </p>
              <ul className="space-y-1.5">
                {pendingItems.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="flex-shrink-0 w-4 h-4 rounded border border-cre-warning/50 bg-cre-warning/10 flex items-center justify-center">
                      <span className="text-cre-warning text-[10px]">&#9711;</span>
                    </span>
                    {typeof item === 'string' ? item : '--'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-cre-border/30">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Closing Agent</span>
              <span className="text-white">{closingAgent}</span>
            </div>
          </div>
        </div>

        {/* Prorations Table */}
        {prorations.length > 0 && (
          <div className="card">
            <h4 className="text-sm font-semibold text-white mb-3">Prorations</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cre-border text-xs text-gray-500 uppercase">
                    <th className="py-2 text-left font-medium">Item</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                    <th className="py-2 text-right font-medium">Credit To</th>
                  </tr>
                </thead>
                <tbody>
                  {prorations.map((pror, i) => (
                    <tr
                      key={i}
                      className="border-b border-cre-border/30 last:border-b-0"
                    >
                      <td className="py-2 text-gray-300">{safeStr(pror.item)}</td>
                      <td className="py-2 text-right font-mono tabular-nums text-white">
                        {pror.amount != null ? fmtFull$(safeNum(pror.amount)) : '--'}
                      </td>
                      <td className="py-2 text-right text-gray-400">
                        {safeStr(pror.creditTo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Funds Flow Statement */}
        {(sources.length > 0 || uses.length > 0) && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white">Funds Flow Statement</h4>
              {balanced && (
                <span className="status-badge bg-cre-success/20 text-cre-success">
                  BALANCED
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sources */}
              <div>
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Sources
                </h5>
                <table className="w-full text-sm">
                  <tbody>
                    {sources.map((src, i) => (
                      <tr
                        key={i}
                        className="border-b border-cre-border/30 last:border-b-0"
                      >
                        <td className="py-1.5 text-gray-300">{safeStr(src.item)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-white">
                          {src.amount != null ? fmtFull$(safeNum(src.amount)) : '--'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-cre-border">
                      <td className="py-2 text-gray-200 font-semibold">Total Sources</td>
                      <td className="py-2 text-right font-mono tabular-nums text-cre-accent font-bold">
                        {fundsFlow.totalSources != null ? fmtFull$(totalSources) : '--'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Uses */}
              <div>
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Uses
                </h5>
                <table className="w-full text-sm">
                  <tbody>
                    {uses.map((use, i) => (
                      <tr
                        key={i}
                        className="border-b border-cre-border/30 last:border-b-0"
                      >
                        <td className="py-1.5 text-gray-300">{safeStr(use.item)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-white">
                          {use.amount != null ? fmtFull$(safeNum(use.amount)) : '--'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-cre-border">
                      <td className="py-2 text-gray-200 font-semibold">Total Uses</td>
                      <td className="py-2 text-right font-mono tabular-nums text-cre-accent font-bold">
                        {fundsFlow.totalUses != null ? fmtFull$(totalUses) : '--'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
