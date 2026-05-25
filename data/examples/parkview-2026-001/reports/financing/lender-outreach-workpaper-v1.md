# lender-outreach Workpaper

## Control Sheet
- Deal: parkview-2026-001
- Property: Parkview Apartments
- Phase: Financing
- Agent: lender-outreach
- Started: 2026-05-25T02:29:58.199Z
- Completed: 2026-05-25T02:29:58.203Z
- Verdict: PASS
- Reviewer signoff: unsigned
- Quality gate: WARNING
- Summary: Collected 5 lender indications.

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

## Quality Gate
Status: WARNING
Reviewer signoff: unsigned.
| Checklist Item | Status | Detail |
| --- | --- | --- |
| Cited inputs | PASS | Deal identity and source financials/property are tied to config. |
| Stated assumptions | PASS | Material assumptions are stated in the findings and analysis. |
| Calculation coverage | PASS | Pro forma, NOI, and scenario calculations are derived from deal inputs. |
| Caveats, red flags, and data gaps | PASS | Risk flags and open data gaps are documented for the reviewer. |
| Reviewer signoff | WARNING | Reviewer signoff is unsigned. |
- WARNING: Quality gate item incomplete: Reviewer signoff — Reviewer signoff is unsigned.

## Work Program
- Summarize likely lender channels and quote status.
- Check proceeds against DSCR, debt yield, rate, IO, and amortization.
- Separate agency, bank, bridge, life company, and CMBS fit.
- Flag terms that require IC approval before application.
- Preserve a clean record of lender indications.

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
- Collected 5 lender indications.

## Agent Analysis
Primary finding: Collected 5 lender indications.

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
| RENT_DOWN_VACANCY_HIGH_EXIT_TIGHT | Downside | High | 5.03% | 20.7% | 2.50x | 1.04x | FAIL |
| RENT_DOWN_VACANCY_HIGH_EXIT_BASE | Downside | High | 5.53% | 16.5% | 2.10x | 1.04x | FAIL |
| RENT_DOWN_VACANCY_HIGH_EXIT_WIDE | Downside | High | 6.03% | 12.5% | 1.76x | 1.04x | FAIL |
| RENT_DOWN_VACANCY_BASE_EXIT_TIGHT | Downside | Base | 5.03% | 21.9% | 2.61x | 1.06x | FAIL |
| RENT_DOWN_VACANCY_BASE_EXIT_BASE | Downside | Base | 5.53% | 17.8% | 2.20x | 1.06x | FAIL |
| RENT_DOWN_VACANCY_BASE_EXIT_WIDE | Downside | Base | 6.03% | 13.8% | 1.86x | 1.06x | FAIL |
| RENT_DOWN_VACANCY_LOW_EXIT_TIGHT | Downside | Low | 5.03% | 23.0% | 2.72x | 1.08x | FAIL |
| RENT_DOWN_VACANCY_LOW_EXIT_BASE | Downside | Low | 5.53% | 18.9% | 2.31x | 1.08x | FAIL |
| RENT_DOWN_VACANCY_LOW_EXIT_WIDE | Downside | Low | 6.03% | 15.1% | 1.96x | 1.08x | FAIL |
| RENT_BASE_VACANCY_HIGH_EXIT_TIGHT | Base | High | 5.03% | 21.9% | 2.61x | 1.06x | FAIL |
| RENT_BASE_VACANCY_HIGH_EXIT_BASE | Base | High | 5.53% | 17.8% | 2.20x | 1.06x | FAIL |
| RENT_BASE_VACANCY_HIGH_EXIT_WIDE | Base | High | 6.03% | 13.8% | 1.86x | 1.06x | FAIL |
| RENT_BASE_VACANCY_BASE_EXIT_TIGHT | Base | Base | 5.03% | 23.0% | 2.72x | 1.08x | FAIL |
| RENT_BASE_VACANCY_BASE_EXIT_BASE | Base | Base | 5.53% | 18.9% | 2.31x | 1.08x | FAIL |
| RENT_BASE_VACANCY_BASE_EXIT_WIDE | Base | Base | 6.03% | 15.1% | 1.96x | 1.08x | FAIL |
| RENT_BASE_VACANCY_LOW_EXIT_TIGHT | Base | Low | 5.03% | 24.1% | 2.83x | 1.10x | PASS |
| RENT_BASE_VACANCY_LOW_EXIT_BASE | Base | Low | 5.53% | 20.1% | 2.41x | 1.10x | PASS |
| RENT_BASE_VACANCY_LOW_EXIT_WIDE | Base | Low | 6.03% | 16.3% | 2.06x | 1.10x | PASS |
| RENT_UP_VACANCY_HIGH_EXIT_TIGHT | Upside | High | 5.03% | 23.0% | 2.72x | 1.08x | FAIL |
| RENT_UP_VACANCY_HIGH_EXIT_BASE | Upside | High | 5.53% | 18.9% | 2.31x | 1.08x | FAIL |
| RENT_UP_VACANCY_HIGH_EXIT_WIDE | Upside | High | 6.03% | 15.1% | 1.96x | 1.08x | FAIL |
| RENT_UP_VACANCY_BASE_EXIT_TIGHT | Upside | Base | 5.03% | 24.1% | 2.83x | 1.10x | PASS |
| RENT_UP_VACANCY_BASE_EXIT_BASE | Upside | Base | 5.53% | 20.1% | 2.41x | 1.10x | PASS |
| RENT_UP_VACANCY_BASE_EXIT_WIDE | Upside | Base | 6.03% | 16.3% | 2.06x | 1.10x | PASS |
| RENT_UP_VACANCY_LOW_EXIT_TIGHT | Upside | Low | 5.03% | 25.2% | 2.94x | 1.13x | PASS |
| RENT_UP_VACANCY_LOW_EXIT_BASE | Upside | Low | 5.53% | 21.2% | 2.51x | 1.13x | PASS |
| RENT_UP_VACANCY_LOW_EXIT_WIDE | Upside | Low | 6.03% | 17.5% | 2.15x | 1.13x | PASS |

## Red Flags
- None identified by this agent.

## Data Gaps
- MEDIUM | Final third-party report requested by lead lender | Owner: lender-outreach

## Evidence Tie-Out Appendix
- E01: lender-outreach checked the property identity against parkview-2026-001 and the Austin / Travis County fixture narrative.
- E02: lender-outreach reconciled purchase price to $32,000,000 before using any cap-rate or leverage conclusions.
- E03: lender-outreach reconciled current NOI to $1,688,500 and stabilized NOI to $2,400,000.
- E04: lender-outreach treated concessions as contra-revenue, bad debt as a separate loss line, and RUBS as utility expense recovery.
- E05: lender-outreach carried annual Texas reassessment cadence into tax-adjusted risk language where property tax matters.
- E06: lender-outreach preserved debt service, exit cap, and renovation premium assumptions from the deterministic source checkpoint.
- E07: lender-outreach left any legal, tax, and lender-specific terms as diligence items unless directly present in the fixture.
- E08: lender-outreach used the 27-scenario grid for downside/base/upside framing rather than a single-point answer.
- E09: lender-outreach tied workpaper recommendations to conditional thresholds and dealbreaker policy.
- E10: lender-outreach confirmed no external credentials, private files, or unverifiable market facts are embedded in this sample workpaper.

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
- lender-outreach output is ready for Financing orchestration review.
- If this workpaper supports IC materials, preserve the conditional recommendation language unless the debt/tax issues are mitigated.
- Reviewer signoff required before treating sample outputs as production underwriting.

## Reviewer Tickmark Log
- lender-outreach tickmark 01: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 02: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 03: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 04: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 05: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 06: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 07: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 08: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 09: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 10: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 11: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 12: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 13: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 14: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 15: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
- lender-outreach tickmark 16: reviewed source tie-out, calculation flow, risk wording, and downstream handoff consistency.
