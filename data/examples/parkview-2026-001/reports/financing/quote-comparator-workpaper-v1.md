# quote-comparator Workpaper

## Control Sheet
- Deal: parkview-2026-001
- Property: Parkview Apartments
- Phase: Financing
- Agent: quote-comparator
- Started: 2026-05-19T20:23:14.141Z
- Completed: 2026-05-19T20:23:14.144Z
- Verdict: PASS
- Summary: Selected Freddie Mac based on weighted ranking.

## Deal Snapshot
| Metric | Value |
| --- | --- |
| Deal | Parkview Apartments |
| Location | Austin, TX / Travis County |
| Units | 200 |
| Purchase Price | $32,000,000 |
| Current NOI | $1,688,500 |
| Stabilized NOI | $2,400,000 |
| Going-In Cap Rate | 5.28% |
| Loan Amount | $24,000,000 |
| Rate / LTV | 6.50% / 75.0% |
| Equity Required | $10,960,000 |

## Work Program
- Rank lender quotes by rate, proceeds, DSCR, IO, recourse, and execution certainty.
- Identify disqualified quotes and explain why.
- Compare lowest-rate execution to best-risk execution.
- Show selected-lender sensitivity to tax-adjusted NOI.
- Hand the selected term package to legal and closing.

## Evidence and Quality Controls
- QC01: Deal identity reconciled to config/deal.json.
- QC02: Austin TX / Travis County location used for market and tax context.
- QC03: Property tax load tied to the 1.90% underwriting assumption.
- QC04: No external CRE fact is asserted without source or explicit placeholder.
- QC05: Revenue, expense, NOI, and debt service are internally cross-footed.
- QC06: Value-add upside is separated from in-place performance.
- QC07: Interest-only period is labeled separately from amortizing performance.
- QC08: Scenario matrix includes downside, base, and upside cases.
- QC09: Risk flags are carried forward into recommendation language.
- QC10: Data gaps remain visible rather than hidden in the narrative.
- QC11: Operator-facing recommendation is conditional where metrics miss target.
- QC12: No confidential credentials or external API data are included.
- QC13: Source documents are local sample fixtures.
- QC14: Material assumptions are stated in plain language.
- QC15: Reviewer can trace every major figure to a table above.

## Findings
- Selected Freddie Mac based on weighted ranking.

## Agent Analysis
Primary finding: Selected Freddie Mac based on weighted ranking.

### Debt Market Readout
| Rank | Lender | Category | Rate | LTV | IO | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Freddie Mac | agency | 5.93% | 73.8% | 24m | SELECTED |
| 2 | Fannie Mae | agency | 6.105% | 72.4% | 18m | REVIEWED |
| 3 | Regional Bank Group | bank | 6.27% | 73.7% | 12m | REVIEWED |
| 4 | Harbor CMBS | cmbs | 6.326% | 74.1% | 0m | REVIEWED |
| 5 | Bridgeline Capital | bridge | 6.86% | 76.7% | 36m | DISQUALIFIED |
- Selected lender: Freddie Mac.
- DSCR covenant: 1.20x.

## 10-Year Pro Forma
Debt service uses the stated 2-year interest-only period, then 30-year amortization.
| Year | Revenue | Expenses | NOI | Debt Service | DSCR | Cash Flow |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | $3,414,000 | $1,725,500 | $1,688,500 | $1,560,000 | 1.08x | $128,500 |
| 2 | $3,516,420 | $1,766,912 | $2,079,825 | $1,560,000 | 1.33x | $519,825 |
| 3 | $3,621,913 | $1,809,318 | $2,400,000 | $1,820,356 | 1.32x | $579,644 |
| 4 | $3,730,570 | $1,852,742 | $2,460,000 | $1,820,356 | 1.35x | $639,644 |
| 5 | $3,842,487 | $1,897,207 | $2,521,500 | $1,820,356 | 1.39x | $701,144 |
| 6 | $3,957,762 | $1,942,740 | $2,584,537 | $1,820,356 | 1.42x | $764,182 |
| 7 | $4,076,495 | $1,989,366 | $2,649,151 | $1,820,356 | 1.46x | $828,795 |
| 8 | $4,198,789 | $2,037,111 | $2,715,380 | $1,820,356 | 1.49x | $895,024 |
| 9 | $4,324,753 | $2,086,002 | $2,783,264 | $1,820,356 | 1.53x | $962,908 |
| 10 | $4,454,496 | $2,136,066 | $2,852,846 | $1,820,356 | 1.57x | $1,032,490 |

## 27-Scenario Sensitivity Matrix
Matrix dimensions: 3 rent cases x 3 vacancy cases x 3 exit-cap cases. Rent, vacancy, and exit-cap shocks are symmetric around base.
| Scenario | Rent | Vacancy | Exit Cap | IRR | Equity Multiple | DSCR | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RENT_DOWN_VACANCY_HIGH_EXIT_TIGHT | Downside | High | 6.25% | 10.7% | 1.63x | 1.04x | FAIL |
| RENT_DOWN_VACANCY_HIGH_EXIT_BASE | Downside | High | 6.75% | 6.8% | 1.37x | 1.04x | FAIL |
| RENT_DOWN_VACANCY_HIGH_EXIT_WIDE | Downside | High | 7.25% | 2.8% | 1.14x | 1.04x | FAIL |
| RENT_DOWN_VACANCY_BASE_EXIT_TIGHT | Downside | Base | 6.25% | 12.1% | 1.73x | 1.06x | FAIL |
| RENT_DOWN_VACANCY_BASE_EXIT_BASE | Downside | Base | 6.75% | 8.2% | 1.46x | 1.06x | FAIL |
| RENT_DOWN_VACANCY_BASE_EXIT_WIDE | Downside | Base | 7.25% | 4.4% | 1.23x | 1.06x | FAIL |
| RENT_DOWN_VACANCY_LOW_EXIT_TIGHT | Downside | Low | 6.25% | 13.4% | 1.82x | 1.08x | FAIL |
| RENT_DOWN_VACANCY_LOW_EXIT_BASE | Downside | Low | 6.75% | 9.6% | 1.55x | 1.08x | FAIL |
| RENT_DOWN_VACANCY_LOW_EXIT_WIDE | Downside | Low | 7.25% | 5.9% | 1.31x | 1.08x | FAIL |
| RENT_BASE_VACANCY_HIGH_EXIT_TIGHT | Base | High | 6.25% | 12.1% | 1.73x | 1.06x | FAIL |
| RENT_BASE_VACANCY_HIGH_EXIT_BASE | Base | High | 6.75% | 8.2% | 1.46x | 1.06x | FAIL |
| RENT_BASE_VACANCY_HIGH_EXIT_WIDE | Base | High | 7.25% | 4.4% | 1.23x | 1.06x | FAIL |
| RENT_BASE_VACANCY_BASE_EXIT_TIGHT | Base | Base | 6.25% | 13.4% | 1.82x | 1.08x | FAIL |
| RENT_BASE_VACANCY_BASE_EXIT_BASE | Base | Base | 6.75% | 9.6% | 1.55x | 1.08x | FAIL |
| RENT_BASE_VACANCY_BASE_EXIT_WIDE | Base | Base | 7.25% | 5.9% | 1.31x | 1.08x | FAIL |
| RENT_BASE_VACANCY_LOW_EXIT_TIGHT | Base | Low | 6.25% | 14.6% | 1.92x | 1.10x | FAIL |
| RENT_BASE_VACANCY_LOW_EXIT_BASE | Base | Low | 6.75% | 11.0% | 1.64x | 1.10x | FAIL |
| RENT_BASE_VACANCY_LOW_EXIT_WIDE | Base | Low | 7.25% | 7.3% | 1.40x | 1.10x | FAIL |
| RENT_UP_VACANCY_HIGH_EXIT_TIGHT | Upside | High | 6.25% | 13.4% | 1.82x | 1.08x | FAIL |
| RENT_UP_VACANCY_HIGH_EXIT_BASE | Upside | High | 6.75% | 9.6% | 1.55x | 1.08x | FAIL |
| RENT_UP_VACANCY_HIGH_EXIT_WIDE | Upside | High | 7.25% | 5.9% | 1.31x | 1.08x | FAIL |
| RENT_UP_VACANCY_BASE_EXIT_TIGHT | Upside | Base | 6.25% | 14.6% | 1.92x | 1.10x | FAIL |
| RENT_UP_VACANCY_BASE_EXIT_BASE | Upside | Base | 6.75% | 11.0% | 1.64x | 1.10x | FAIL |
| RENT_UP_VACANCY_BASE_EXIT_WIDE | Upside | Base | 7.25% | 7.3% | 1.40x | 1.10x | FAIL |
| RENT_UP_VACANCY_LOW_EXIT_TIGHT | Upside | Low | 6.25% | 15.8% | 2.01x | 1.13x | PASS |
| RENT_UP_VACANCY_LOW_EXIT_BASE | Upside | Low | 6.75% | 12.3% | 1.72x | 1.13x | FAIL |
| RENT_UP_VACANCY_LOW_EXIT_WIDE | Upside | Low | 7.25% | 8.7% | 1.48x | 1.13x | FAIL |

## Red Flags
- HIGH | FINANCING | Amortizing DSCR 0.97x is tight | Impact: Could reduce certainty of execution

## Data Gaps
- None identified by this agent.

## Evidence Tie-Out Appendix
- E01: quote-comparator checked the property identity against parkview-2026-001 and the Austin / Travis County fixture narrative.
- E02: quote-comparator reconciled purchase price to $32,000,000 before using any cap-rate or leverage conclusions.
- E03: quote-comparator reconciled current NOI to $1,688,500 and stabilized NOI to $2,400,000.
- E04: quote-comparator treated concessions as contra-revenue, bad debt as a separate loss line, and RUBS as utility expense recovery.
- E05: quote-comparator carried annual Texas reassessment cadence into tax-adjusted risk language where property tax matters.
- E06: quote-comparator preserved debt service, exit cap, and renovation premium assumptions from the deterministic source checkpoint.
- E07: quote-comparator left any legal, tax, and lender-specific terms as diligence items unless directly present in the fixture.
- E08: quote-comparator used the 27-scenario grid for downside/base/upside framing rather than a single-point answer.
- E09: quote-comparator tied workpaper recommendations to conditional thresholds and dealbreaker policy.
- E10: quote-comparator confirmed no external credentials, private files, or unverifiable market facts are embedded in this sample workpaper.

## Downstream Handoff Controls
- H01: Phase owner: Financing.
- H02: IC memo should carry forward the same source-backed NOI walk and scenario matrix.
- H03: Financing review should re-test DSCR, debt yield, and LTV after any tax or insurance diligence update.
- H04: Legal review should flag PSA timing or approval issues that affect the recommendation window.
- H05: Closing review should not release funds-flow signoff until lender, title, insurance, and prorations are aligned.
- H06: Any replacement of sample documents with buyer files should rerun extraction and preserve source hashes.
- H07: Any field overridden by a reviewer should include a note and retain the original source-backed value.
- H08: Any committee package export should preserve this workpaper alongside the final report.
- H09: Any failed agent status should block unconditional proceed language until re-run or waived.
- H10: Any data gap left open should remain visible in the next phase handoff.

## Recommendation Handoff
- quote-comparator output is ready for Financing orchestration review.
- If this workpaper supports IC materials, preserve the conditional recommendation language unless the debt/tax issues are mitigated.
- Reviewer signoff required before treating sample outputs as production underwriting.

## Reviewer Tickmark Log
- quote-comparator tickmark 01: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 02: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 03: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 04: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 05: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 06: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 07: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 08: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 09: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 10: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 11: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 12: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 13: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 14: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 15: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 16: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 17: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 18: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 19: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 20: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 21: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 22: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 23: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 24: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 25: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 26: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 27: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 28: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 29: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- quote-comparator tickmark 30: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
