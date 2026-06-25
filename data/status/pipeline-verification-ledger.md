# Pipeline Verification Ledger

Created: 2026-06-25
Deal: `config/deal.json`
Scenario: `core-plus`
Seed: `42`

Status values:
- `UNVERIFIED`: no current-session proof yet.
- `PASSED`: real command/path executed and output was read.
- `FAILED`: real command/path reproduced a failure.
- `BLOCKED`: cannot verify without user/external action.

## Preflight

| Gate | Status | Evidence |
| --- | --- | --- |
| Codex auth availability | PASSED | `npm run codex:status` on 2026-06-25 reported `Codex CLI: codex-cli 0.142.0`, `Login: Logged in using ChatGPT`, `ChatGPT auth: confirmed`, `Live agents ready: yes`. |

## Phase 1 - Document Intake

| Step | Status | Evidence |
| --- | --- | --- |
| upload | PASSED | `npm --prefix dashboard run test:e2e -- deal-library.spec.ts -g "creates a draft from the document-first homepage and uploads the dropped file"` on 2026-06-25 started watcher/API + Vite, created a draft from `playwright-hero-rent-roll.csv`, uploaded it, opened Intake, and found `source-document-rent_roll` with the uploaded file. Result: `1 passed (2.2s)`. |
| type classification | PASSED | `npm --prefix dashboard run test:e2e -- deal-library.spec.ts -g "operates the deal hub criteria, source documents, extraction, phase coverage, and phase launch"` on 2026-06-25 uploaded rent roll, T12, and offering memo fixtures through the dashboard and asserted `source-document-rent_roll`, `source-document-t12`, and `source-document-offering_memo` labels. Result: `1 passed (5.5s)`. |
| parser preview | PASSED | Same E2E command loaded the extracted rent-roll preview, asserted `Fields Found`, `Mapped`, `Total Units`, and `In-Place Occupancy`, proving the real preview path rendered parsed output. Result: `1 passed (5.5s)`. |
| hashing | PASSED | `npm run test:parsers` and `npm run test:workspace` on 2026-06-25 passed. Read assertions verify `fileHash()` matches the canonical SHA-256 digest, PDF candidates preserve `sourceRef.fileHash`, workspace extracted fields carry `sourceRef.fileHash`, and approved fields preserve the extraction source hash. Results: `[parser-service-test] PASS`, `[workspace-service-test] PASS`. |
| extraction candidates | PASSED | Same E2E command drove conflicting uploaded reads into `Review Fields`, then asserted candidate paths in the extraction preview before operator resolution. Result: `1 passed (5.5s)`. |
| warnings | PASSED | `npm run test:parsers`, `npm run test:workspace`, and `npm run test:pile` on 2026-06-25 passed. Read assertions verify parser warning/notes for ambiguous occupancy, uploaded-data truncation issues, stale-source readiness warnings, and real-world pile failure handling without silent failures. Results: `[parser-service-test] PASS`, `[workspace-service-test] PASS`, `[real-world-pile-test] PASS - 14 files, zero crashes/hangs/silent-failures/path-leaks`. |

## Phase 2 - Source Review

| Step | Status | Evidence |
| --- | --- | --- |
| accept candidate fields | PASSED | `npm --prefix dashboard run test:e2e -- deal-library.spec.ts -g "operates the deal hub criteria, source documents, extraction, phase coverage, and phase launch"` on 2026-06-25 applied selected rent-roll, T12, and offering-memo candidate fields through the dashboard `apply-extraction` path after conflict confirmation. Result: `1 passed (5.0s)`. |
| reject candidate fields | PASSED | `npm run test:workspace` on 2026-06-25 passed. Read assertions cover rejecting a conflicting candidate through `reviewSourceFields(... reviewStatus: 'rejected')`, then applying the remaining source after the conflict is resolved. Result: `[workspace-service-test] PASS`. |
| waive candidate fields | PASSED | Same deal-library E2E waived the offering-memo NOI candidate with an operator note via `/review-extraction` and asserted `waived`; `npm run test:workspace` also records waive decision history. Results: `1 passed (5.0s)`, `[workspace-service-test] PASS`. |
| provenance trail | PASSED | Same deal-library E2E reopened applied rent-roll evidence, expanded source drilldown, and asserted source file plus sheet/row location; `npm run test:workspace` asserts approved fields retain `sourceRef.fileHash`. Results: `1 passed (5.0s)`, `[workspace-service-test] PASS`. |
| flagged-field gating | PASSED | `npm --prefix dashboard run test:e2e -- workspace-frame.spec.ts -g "blocks diligence start while intake record fields need review"` on 2026-06-25 seeded a low-confidence flagged field, asserted `start-diligence` disabled, forced a click, and confirmed the spine stayed on Intake; then seeded a clean deal and confirmed Diligence could start. Result: `1 passed (3.5s)`. |
| operator-edit precedence | PASSED | Same deal-library E2E edited occupancy through `/field-edit` and confirmed the saved deal stored `0.95`; `cd dashboard && npm exec tsx ../scripts/dashboard-lib.test.mjs` asserts operator-edited approved fields override stale parser rows; `npm run test:workspace` asserts operator-edited provenance/audit persistence. Results: `1 passed (5.0s)`, `dashboard-lib: 45 checks passed`, `[workspace-service-test] PASS`. |

## Phase 3 - Due Diligence

| Step | Status | Evidence |
| --- | --- | --- |
| 7 specialist agents | PASSED | `npm run simulate` on 2026-06-25 completed canonical `config/deal.json` / `core-plus` / seed `42` and wrote due-diligence output. Read `agentFindings` keys: `environmental-review`, `legal-title-review`, `market-study`, `opex-analyst`, `physical-inspection`, `rent-roll-analyst`, `tenant-credit`. Workpapers exist for all seven in `data/reports/parkview-2026-001/due-diligence/`. `npm run validate` passed `phase-due-diligence` and all agent checkpoints. |
| unit mix | PASSED | Read `data/phase-outputs/parkview-2026-001/due-diligence-output.json`: `unitMix` has 4 rows totaling 200 units with type/count/avgSqFt/marketRent/inPlaceRent values. `npm run validate` passed `phase-due-diligence`. |
| rent-roll analysis | PASSED | Read due-diligence `rentRoll`: `totalUnits: 200`, `occupancy: 0.94`, `avgRent: 1513`, `avgMarketRent: 1665`, `lossToLease: 341777`, `lossToLeasePercent: 0.091`; rent-roll workpaper summary states it validated 200 units and rent strata. `npm run validate` passed. |
| OpEx notes | PASSED | Read due-diligence `expenses`: `totalOpEx: 1725500`, `opExPerUnit: 8628`, `opExRatio: 0.5054`; `opexBenchmark: "50.5% expense ratio"` and `opexBreakdown` has 6 rows. OpEx workpaper includes the expense stack. `npm run validate` passed. |
| diligence flags | PASSED | Read due-diligence output: `redFlagCount: 0`, `dataGapCount: 0`, `riskScore: 82`, with `redFlags: []` and `dataGaps: []`; schema validation accepted the explicit zero-count/empty-list flag state. `npm run validate` passed. |

## Phase 4 - Underwriting

| Step | Status | Evidence |
| --- | --- | --- |
| model builder | PASSED | `npm run simulate` on 2026-06-25 completed canonical `config/deal.json` / `core-plus` / seed `42`; read `agentFindings` with `financial-model-builder`, and `financial-model-builder-workpaper-v1.md` summary `Base-case model calibrated and validated.` `npm run validate` passed `phase-underwriting`. |
| scenario analyst | PASSED | Same canonical run produced `scenario-analyst` in `agentFindings` and `scenario-analyst-workpaper-v1.md` summary `9/27 sensitivity scenarios pass constraints.` `npm run validate` passed. |
| 27-scenario matrix | PASSED | Initial inspection found `scenarioMatrixPath` pointed to missing `data/phase-outputs/parkview-2026-001/underwriting-scenarios.json`; added artifact writing in `scripts/orchestrate.js` and a validator check in `scripts/validate-contracts.js`. Re-ran `npm run simulate && npm run validate`; validation now reports `PASS phase-underwriting-artifacts`. Read generated matrix file: 27 rows, matching `underwriting-output.json`, with 9 passing scenarios. |
| IC memo writer | PASSED | Initial inspection found `icMemoPath` pointed to missing `data/reports/parkview-2026-001/ic-memo.md`; added generated IC memo writing and validation. Re-ran `npm run simulate && npm run validate`; read `ic-memo.md` with `# IC Memo`, `## Recommendation`, return metrics, red flags, data gaps, and scenario summary. |
| DSCR | PASSED | Read `baseCase.targetDSCR: 0.947` and 10-year pro forma DSCR values from 1.082 in year 1 to 1.567 in year 10; generated IC memo shows Target DSCR 0.95x. `npm run validate` passed. |
| IRR | PASSED | Read `baseCase.leveragedIRR: 0.1895`; return metrics show `Leveraged IRR: 19% vs target 15%`; scenario summary best/median/worst IRR 25.2% / 18.9% / 12.5%. `npm run validate` passed. |
| equity multiple | PASSED | Read `baseCase.equityMultiple: 2.305`; return metrics show `Equity Multiple: 2.31x vs target 1.8x`; scenario rows include per-case equity multiples. `npm run validate` passed. |
| 10-year pro forma | PASSED | Read `proForma` with 10 rows; year 1 revenue/expenses/NOI/debt service/DSCR/cash flow are `3414000/1725500/1688500/1560000/1.082/128500`, and year 10 ends at NOI `2852846`, DSCR `1.567`, cash flow `1032490`. `npm run validate` passed. |

## Phase 5 - Financing

| Step | Status | Evidence |
| --- | --- | --- |
| lender outreach | PASSED | `npm run simulate && npm run validate` on 2026-06-25 passed canonical `config/deal.json` / `core-plus` / seed `42`; read `agentFindings` with `lender-outreach`, `quotesReceived: 5`, and `lender-outreach-workpaper-v1.md` summary `Collected 5 lender indications.` |
| quote comparator | PASSED | Same run produced `quote-comparator` in `agentFindings`; read `lenderComparison` with 5 ranked quotes and selected `Freddie Mac` as rank 1 / `SELECTED`; `quote-comparator-workpaper-v1.md` summary `Selected Freddie Mac based on weighted ranking.` `npm run validate` passed `phase-financing`. |
| term-sheet builder | PASSED | Same run produced `term-sheet-builder` in `agentFindings`; read term sheet fields `rateType: Fixed`, `term: 10`, `amortization: 30`, `interestOnlyMonths: 24`, `prepayment: Yield maintenance`, `recourse: Non-recourse`, and reserve amounts. Workpaper summary: `Term sheet generated with covenant and timeline package.` |
| loan sizing | PASSED | Read financing output loan sizing: `loanAmount: 24000000`, `ltv: 0.75`, `rate: 0.061`, `annualDebtServiceIO: 1464000`, `annualDebtServiceAmort: 1745265`, `dscrIO: 1.153`, `dscrAmort: 0.967`, `dscrCovenant: 1.2`; `bestQuote` also records Freddie Mac quote amount `23507200` and DSCR `1.193`. `npm run validate` passed. |

## Phase 6 - Legal

| Step | Status | Evidence |
| --- | --- | --- |
| PSA | PASSED | `npm run simulate && npm run validate` on 2026-06-25 passed canonical `config/deal.json` / `core-plus` / seed `42`; read `psaStatus.reviewStatus: REVIEWED`, `psa-reviewer` agent finding, and `psa-reviewer-workpaper-v1.md` summary `PSA reviewed and deadlines calendared.` `npm run test:legal` also passed PSA fixture extraction with provenance. |
| title/survey | PASSED | Same run produced `title-survey-reviewer` in `agentFindings`; read `titleStatus.status: CLEAR` and `title-survey-reviewer-workpaper-v1.md` summary `Title and survey package clear.` `npm run test:legal` passed title commitment fixture extraction. |
| loan docs | PASSED | Same run produced `loan-doc-reviewer` in `agentFindings` with status `COMPLETE` and finding `Loan docs align with selected financing terms.` Workpaper exists and `npm run test:codex-legal` confirms legal-phase prompts include scoped legal source documents. |
| insurance | PASSED | Same run produced `insurance-coordinator` in `agentFindings`; read `insuranceStatus.overallStatus: ALL_BOUND` and workpaper summary `Primary insurance coverages bound.` `npm run validate` passed `phase-legal`. |
| estoppels | PASSED | Same run produced `estoppel-tracker` in `agentFindings`; read `estoppelStatus.returnRate: 0.85` and workpaper summary `153/180 estoppels collected.` `npm run test:legal` passed estoppel fixture extraction. |
| transfer docs | PASSED | Same run produced `transfer-doc-preparer` in `agentFindings`; read `transferDocStatus.overallReadiness: READY` and workpaper summary `Transfer package complete for signature routing.` `npm run validate` passed. |
| closing conditions | PASSED | Same run read `closingChecklistStatus` with pre-closing `18/18`, closing-day `9/11`, post-closing `4/6` identified, and critical path `Rate lock confirmation`; schema validation passed `phase-legal`. |

## Phase 7 - Closing

| Step | Status | Evidence |
| --- | --- | --- |
| closing coordinator | PASSED | `npm run simulate && npm run validate` on 2026-06-25 passed canonical `config/deal.json` / `core-plus` / seed `42`; read `preClosingStatus` as `6/6` complete with no pending items, `closingAgent: Acquisition Closing Desk`, and `agentFindings.closing-coordinator.status: COMPLETE`. Workpaper summary says `Closing checklist is complete.` |
| funds-flow manager | PASSED | Same run produced `agentFindings.funds-flow-manager.status: COMPLETE` with finding `Sources and uses are balanced.` Read `fundsFlow.totalSources: 33058685`, `totalUses: 33058685`, and `balanced: true`; `npm run validate` passed `phase-closing`. |
| prorations | PASSED | Read structured prorations in `closing-output.json`: tax proration `$38,227` and insurance proration `$9,902`; those values also appear in closing sources/uses. |
| wire schedule | PASSED | Initial validation after tightening the schema failed because old closing output lacked `wireSchedule`. Added structured `wireSchedule` generation, schema requirements, and `phase-closing-artifacts` validation. Regenerated output includes `WIRE-001` senior loan `$24,000,000`, `WIRE-002` buyer equity `$8,960,000`, and `WIRE-003` buyer true-up `$50,556`, all due `2026-03-31` with control language; `npm run validate` passed `phase-closing-artifacts`. |
| funds-flow workpaper | PASSED | `closing-coordinator-workpaper-v1.md`, `funds-flow-manager-workpaper-v1.md`, and `final-report.md` now render the wire schedule and closing sources/uses. `npm test` passed, and `system-test` validated `phase-closing-artifacts` across core-plus, value-add, distressed, and failure-resume runs. |

## Phase 8 - IC Package

| Step | Status | Evidence |
| --- | --- | --- |
| markdown package | PASSED | `npm run test:workspace` passed package export assertions and confirmed the markdown includes `## Document Manifest`, `## Review Decision Trail`, `## Evidence Chain`, source drilldowns, quality gate, reviewer signoff, and version history. Targeted Playwright export path passed via `package-export-markdown` with `ic-starter-package.md` download. |
| JSON export | PASSED | `npm run test:workspace` verified `exportIcStarterPackage` writes JSON and Markdown files and returns package JSON with source drilldown, evidence graph, quality gate, reviewer signoff, evidence completeness, and version history. Targeted Playwright export path passed via `package-export-json` with `ic-starter-package.json` download. |
| manifest | PASSED | Added first-class `documentManifest` to the IC package JSON. Temporary exporter proof produced package files `quick-deal-screen-ic-starter-package.json` and `quick-deal-screen-ic-starter-package.md`, `sourceDocuments: 2`, and evidence graph `26` nodes / `29` edges. Workspace test asserts the manifest mirrors exported source documents and names both package files. |
| review/decision trail | PASSED | Added first-class `decisionTrail` to package JSON and `## Review Decision Trail` to markdown. Temporary exporter proof produced decisions for `property.totalUnits` (`needs-review`, `apply`) and `financials.currentNOI` (`apply`). Targeted Playwright package view passed with `Decision Log`, final recommendation, document manifest/workpapers, and decision-event summary visible. `npm test` passed after the Phase 8 changes. |

## Offline Gate

| Gate | Status | Evidence |
| --- | --- | --- |
| `npm test` | PASSED | `npm test` on 2026-06-25 completed with all bundled checks green after the ledger-preservation fix, including fixture validation, production local data, runtime lock, security hardening, real-world pile, legal parser, dashboard-lib, system-test, codex runtime, codex legal docs, and eval scoring. Result included `[system-test] PASS`, `[codex-runtime] PASS 27 assertions/tests`, `[eval-scoring-test] PASS`. Re-ran after the live Codex manifest schema fix and passed again. Ledger file still existed after the run. |
| `npm run verify:v3:core` | PASSED | Passed on 2026-06-25. Gate included `release:check`, `npm test`, parser/workspace tests, dashboard typecheck/build, root and dashboard audits with `0 vulnerabilities`, offline eval with regression gate `PASS (9/9 measured gate(s) held)`, and production static/API/WS smoke with `[smoke] RESULT: PASS`. |
| `npm run test:e2e` | PASSED | Passed on 2026-06-25 after refreshing the local dashboard install for declared `@axe-core/playwright`; full Playwright suite completed `42 passed (1.9m)`, including a11y, agent panel, source review/export, package view/decision log, red flag drilldown, source gate, workflow launcher, workspace frame, and mobile smoke. |

## Live Codex Gate

| Gate | Status | Evidence |
| --- | --- | --- |
| `npm run codex:status` | PASSED | Passed on 2026-06-25. Output reported `Codex CLI: codex-cli 0.142.0`, `Login: Logged in using ChatGPT`, `ChatGPT auth: confirmed`, and `Live agents ready: yes`. |
| `npm run codex:smoke` | PASSED | Passed on 2026-06-25 with run ID `codex-smoke`, workflow `underwriting-refresh`, and live agent `financial-model-builder`. Manifest `data/codex-runs/codex-smoke/manifest.json` finished `COMPLETE`; summary written to `data/codex-runs/codex-smoke/summary.md`. |
| `npm run codex:run:full` | PASSED | Passed on 2026-06-25 with run ID `codex-1782411174372`, workflow `Full Acquisition Review`, and 21 live agents. Manifest finished `COMPLETE` / `runOutcome: success`; all 21 agent results were `PASS` with `attempts: 1`; summary written to `data/codex-runs/codex-1782411174372/summary.md`. |
| `npm run validate:codex` | PASSED | Passed on 2026-06-25 after adding schema coverage for live runner fields `agentTimeoutMs` and result-level `timedOut`. `npm run validate:codex` passed `codex-run-codex-smoke`; direct full-run validation `node scripts/validate-contracts.js --codex-run-id codex-1782411174372` also passed `codex-run-codex-1782411174372`. |
| `npm run eval:live` | PASSED | Passed on 2026-06-25 with live run ID `eval-2026-06-25T18-44-12-814Z`, Codex `codex-cli 0.142.0`, and 8/8 fake benchmark deals run through live Codex agents. Committed scorecard/trust report were regenerated by no-Codex reparse run `eval-2026-06-25T20-32-52-043Z`, preserving the live run path and showing live determinable financials `100% (n=8)`, required red-flag recall `100% (n=5)`, dealbreaker recall `100% (n=2)`, IC exact match `100% (n=8)`, IC directional match `100% (n=8)`, and `0` partial failures. |

## Iteration Log

- 2026-06-25: Initialized ledger after confirming Codex auth preflight.
- 2026-06-25: Phase 1 upload passed through the real dashboard upload path.
- 2026-06-25: Phase 1 classification, parser preview, and candidate rendering passed through the real dashboard intake path.
- 2026-06-25: Phase 1 hashing and warnings passed through parser/workspace/pile verification.
- 2026-06-25: Broader `npm test` regression passed after Phase 1 verification, but `scripts/system-test.js` deleted the ignored ledger because it resets `data/status`.
- 2026-06-25: Added ledger preservation to `scripts/system-test.js` and `dashboard/server/run-manager.ts`.
- 2026-06-25: `npm --prefix dashboard run typecheck` and `npm test` passed after the preservation fix; the ledger survived the `system-test.js` runtime reset.
- 2026-06-25: Phase 2 source review passed through workspace service tests, dashboard-lib tests, and serial Playwright dashboard paths. One attempted parallel E2E run hit fixed-port collision; rerun serially passed.
- 2026-06-25: Broader `npm test` regression passed after Phase 2 verification.
- 2026-06-25: Phase 3 due diligence passed via canonical simulation output inspection and `npm run validate`.
- 2026-06-25: Broader `npm test` regression passed after Phase 3 verification.
- 2026-06-25: Phase 4 underwriting initially failed artifact proof because `underwriting-scenarios.json` and `ic-memo.md` were referenced but missing. Added side-artifact writing plus validator coverage, then `npm run simulate && npm run validate` passed with `phase-underwriting-artifacts`.
- 2026-06-25: Broader `npm test` regression passed after Phase 4 fix; system-test now validates `phase-underwriting-artifacts` across core-plus, value-add, distressed, and failure-resume runs.
- 2026-06-25: Phase 5 financing passed via canonical simulation output inspection and `npm run validate`.
- 2026-06-25: Broader `npm test` regression passed after Phase 5 verification.
- 2026-06-25: Phase 6 legal passed via canonical simulation output inspection, `npm run validate`, `npm run test:legal`, and `npm run test:codex-legal`.
- 2026-06-25: Broader `npm test` regression passed after Phase 6 verification.
- 2026-06-25: Phase 7 closing initially failed artifact proof because `wireSchedule` was not emitted or validated. Added structured wire schedule output, schema requirements, report rendering, and `phase-closing-artifacts` validation.
- 2026-06-25: Phase 7 closing passed via canonical simulation output inspection and `npm run validate`; `phase-closing-artifacts` ties senior loan and buyer equity wires back to funds-flow sources.
- 2026-06-25: Broader `npm test` regression passed after Phase 7 fix; system-test now validates `phase-closing-artifacts` across core-plus, value-add, distressed, and failure-resume runs.
- 2026-06-25: Phase 8 package export initially lacked first-class manifest and decision-trail fields in the exported JSON/markdown. Added `documentManifest`, `decisionTrail`, markdown sections, workspace assertions, and a dashboard package-view Decision Log assertion.
- 2026-06-25: Phase 8 IC package passed `npm run test:workspace`, dashboard typecheck, targeted Playwright package export, targeted Playwright package view, temporary exporter artifact inspection, and broader `npm test`.
- 2026-06-25: Offline gate `npm run verify:v3:core` passed, including release check, audits, dashboard production build, offline eval regression gate, and production smoke.
- 2026-06-25: Offline gate `npm run test:e2e` initially failed because the locally installed dashboard `node_modules` lacked already-declared `@axe-core/playwright`; `npm --prefix dashboard install` restored the dependency without manifest changes, then the full suite passed `42 passed`.
- 2026-06-25: Live Codex preflight `npm run codex:status` passed with Codex CLI `0.142.0`, ChatGPT login confirmed, and live agents ready.
- 2026-06-25: Live smoke `npm run codex:smoke` passed for `financial-model-builder`, but first `npm run validate:codex` exposed schema drift because live manifests now include root `agentTimeoutMs` and result-level `timedOut`.
- 2026-06-25: Added `agentTimeoutMs` and `timedOut` to `schemas/codex/run-manifest.schema.json`; `npm run validate:codex`, `node scripts/validate-fixtures.js`, `node scripts/codex-runtime.test.mjs`, and `npm test` passed after the schema fix.
- 2026-06-25: Live full run `npm run codex:run:full` passed as `codex-1782411174372`; 21/21 live agents passed on first attempt, and direct contract validation passed for that run.
- 2026-06-25: Live benchmark `npm run eval:live` passed as `eval-2026-06-25T18-44-12-814Z`; all 8 fake benchmark deals were run through live Codex agents and scored with 100% live IC exact/directional match, 100% determinable financial accuracy, 100% required red-flag recall, and 100% dealbreaker recall. Regenerated the committed all-layer trust report with `node eval/run-eval.mjs --mode all --reparse-run eval-2026-06-25T18-44-12-814Z`, which passed `PASS (9/9 measured gate(s) held)` without re-running Codex.
