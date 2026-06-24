import type { DealCheckpoint } from '../../types/checkpoint'
import {
  fmt$,
  fmtPct,
  fmtRate,
  fmtX,
  safeNum,
  safeStr,
  safeArr,
  safeObj,
  SectionHeading,
  StatCard,
} from './ReportHelpers'
import EmptyPhaseState from './EmptyPhaseState'

interface Props {
  dealCheckpoint: DealCheckpoint
}

function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-cre-border/30 last:border-b-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-mono tabular-nums text-white">{value}</span>
    </div>
  )
}

export default function FinancingDetail({ dealCheckpoint }: Props) {
  const { phases } = dealCheckpoint

  /* Guard: need Financing data */
  if (!phases?.financing?.dataForDownstream) {
    return (
      <EmptyPhaseState
        sectionTitle="Financing Detail"
        phaseName="Financing"
      />
    )
  }

  const fin = (phases?.financing?.dataForDownstream || {}) as Record<string, unknown>
  const reserves = safeObj(fin.reserves)
  const lenderComparison = safeArr(fin.lenderComparison) as Array<Record<string, unknown>>
  const quotesReceived = safeNum(fin.quotesReceived, lenderComparison.length)

  return (
    <section className="space-y-5">
      <SectionHeading>Financing Detail</SectionHeading>

      {/* ---- Selected Lender Header ---- */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cre-accent/20 flex items-center justify-center flex-shrink-0">
            <span className="text-cre-accent font-bold text-lg">$</span>
          </div>
          <div>
            <h4 className="text-base font-semibold text-white">
              {safeStr(fin.selectedLenderFull, safeStr(fin.selectedLender, 'No Lender Selected'))}
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">Selected Lender</p>
          </div>
        </div>
        <span className="status-badge bg-cre-success/20 text-cre-success">SELECTED</span>
      </div>

      {/* ---- Loan Terms Grid ---- */}
      <div className="card">
        <h4 className="text-sm font-semibold text-white mb-3">Loan Terms</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
          <TermRow
            label="Loan Amount"
            value={fin.loanAmount != null ? fmt$(safeNum(fin.loanAmount)) : '--'}
          />
          <TermRow
            label="LTV"
            value={fin.ltv != null ? fmtPct(safeNum(fin.ltv)) : '--'}
          />
          <TermRow
            label="Rate"
            value={
              fin.rate != null
                ? `${fmtRate(safeNum(fin.rate))}${fin.rateType ? ` ${safeStr(fin.rateType).toLowerCase()}` : ''}`
                : '--'
            }
          />
          <TermRow
            label="Term"
            value={fin.term != null ? `${safeNum(fin.term)} years` : '--'}
          />
          <TermRow
            label="Amortization"
            value={fin.amortization != null ? `${safeNum(fin.amortization)} years` : '--'}
          />
          <TermRow
            label="IO Period"
            value={
              fin.interestOnlyMonths != null
                ? `${safeNum(fin.interestOnlyMonths)} months`
                : '--'
            }
          />
          <TermRow
            label="Annual DS (IO)"
            value={fin.annualDebtServiceIO != null ? fmt$(safeNum(fin.annualDebtServiceIO)) : '--'}
          />
          <TermRow
            label="Annual DS (Amort)"
            value={
              fin.annualDebtServiceAmort != null
                ? fmt$(safeNum(fin.annualDebtServiceAmort))
                : '--'
            }
          />
          <TermRow
            label="DSCR (IO)"
            value={fin.dscrIO != null ? fmtX(safeNum(fin.dscrIO)) : '--'}
          />
          <TermRow
            label="DSCR (Amort)"
            value={fin.dscrAmort != null ? fmtX(safeNum(fin.dscrAmort)) : '--'}
          />
          <TermRow
            label="DSCR Covenant"
            value={fin.dscrCovenant != null ? fmtX(safeNum(fin.dscrCovenant)) : '--'}
          />
          <TermRow label="Prepayment" value={safeStr(fin.prepayment)} />
          <TermRow label="Recourse" value={safeStr(fin.recourse)} />
        </div>
      </div>

      {/* ---- Monthly Reserves ---- */}
      <div className="card">
        <h4 className="text-sm font-semibold text-white mb-3">Monthly Reserves</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Tax"
            value={reserves.taxMonthly != null ? fmt$(safeNum(reserves.taxMonthly)) : '--'}
          />
          <StatCard
            label="Insurance"
            value={
              reserves.insuranceMonthly != null
                ? fmt$(safeNum(reserves.insuranceMonthly))
                : '--'
            }
          />
          <StatCard
            label="CapEx"
            value={
              reserves.capexMonthly != null
                ? fmt$(safeNum(reserves.capexMonthly))
                : '--'
            }
          />
          <div className="bg-black/20 rounded-lg p-3 text-center">
            <div className="text-lg font-bold font-mono tabular-nums text-cre-accent">
              {reserves.renovationEscrow != null
                ? fmt$(safeNum(reserves.renovationEscrow))
                : '--'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Renovation Escrow</div>
            {reserves.renovationEscrow != null && (
              <div className="text-[10px] text-cre-warning mt-1">upfront</div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Lender Comparison Table ---- */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-white">Lender Comparison</h4>
          <span className="status-badge bg-cre-info/20 text-cre-info">
            {quotesReceived} Quotes Received
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cre-border text-xs text-gray-500 uppercase">
                <th className="py-2 text-left font-medium w-10">Rank</th>
                <th className="py-2 text-left font-medium">Lender</th>
                <th className="py-2 text-center font-medium">LTV</th>
                <th className="py-2 text-center font-medium">Rate</th>
                <th className="py-2 text-center font-medium">Term</th>
                <th className="py-2 text-center font-medium">IO</th>
                <th className="py-2 text-center font-medium">DSCR (IO)</th>
                <th className="py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {lenderComparison.length > 0 ? (
                lenderComparison.map((lender, i) => {
                  const rank = safeNum(lender.rank, i + 1)
                  const status = safeStr(lender.status, '')
                  const isSelected = status.toUpperCase() === 'SELECTED'
                  const isDisqualified = status.toUpperCase() === 'DISQUALIFIED'

                  return (
                    <tr
                      key={i}
                      className={`border-b border-cre-border/30 last:border-b-0 ${
                        isSelected
                          ? 'bg-cre-accent/10'
                          : isDisqualified
                            ? 'opacity-60'
                            : ''
                      }`}
                    >
                      <td className="py-2.5 font-mono tabular-nums text-gray-500 text-sm">
                        {rank}
                      </td>
                      <td className="py-2.5 text-gray-200 font-medium">
                        {safeStr(lender.lender)}
                        {isSelected && (
                          <span className="ml-2 text-cre-accent text-xs">&#9733;</span>
                        )}
                      </td>
                      <td className="py-2.5 text-center font-mono tabular-nums text-gray-300">
                        {safeStr(lender.ltv)}
                      </td>
                      <td className="py-2.5 text-center font-mono tabular-nums text-gray-300">
                        {safeStr(lender.rate)}
                      </td>
                      <td className="py-2.5 text-center font-mono tabular-nums text-gray-300">
                        {safeStr(lender.term)}
                      </td>
                      <td className="py-2.5 text-center font-mono tabular-nums text-gray-300">
                        {safeStr(lender.io)}
                      </td>
                      <td className="py-2.5 text-center font-mono tabular-nums text-gray-300">
                        {safeStr(lender.dscrIO)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`status-badge ${
                            isSelected
                              ? 'bg-cre-success/20 text-cre-success'
                              : isDisqualified
                                ? 'bg-cre-danger/20 text-cre-danger'
                                : 'bg-[#4b5563]/20 text-gray-400'
                          }`}
                        >
                          {status.toUpperCase() || '--'}
                        </span>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-gray-500">
                    No lender comparison data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
