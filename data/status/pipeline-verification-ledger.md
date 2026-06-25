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
| lender outreach | UNVERIFIED | Pending real phase output and schema verification. |
| quote comparator | UNVERIFIED | Pending real phase output and schema verification. |
| term-sheet builder | UNVERIFIED | Pending real phase output and schema verification. |
| loan sizing | UNVERIFIED | Pending real phase output and schema verification. |

## Phase 6 - Legal

| Step | Status | Evidence |
| --- | --- | --- |
| PSA | UNVERIFIED | Pending real phase output and schema verification. |
| title/survey | UNVERIFIED | Pending real phase output and schema verification. |
| loan docs | UNVERIFIED | Pending real phase output and schema verification. |
| insurance | UNVERIFIED | Pending real phase output and schema verification. |
| estoppels | UNVERIFIED | Pending real phase output and schema verification. |
| transfer docs | UNVERIFIED | Pending real phase output and schema verification. |
| closing conditions | UNVERIFIED | Pending real phase output and schema verification. |

## Phase 7 - Closing

| Step | Status | Evidence |
| --- | --- | --- |
| closing coordinator | UNVERIFIED | Pending real phase output and schema verification. |
| funds-flow manager | UNVERIFIED | Pending real phase output and schema verification. |
| prorations | UNVERIFIED | Pending real phase output and schema verification. |
| wire schedule | UNVERIFIED | Pending real phase output and schema verification. |
| funds-flow workpaper | UNVERIFIED | Pending real phase output and schema verification. |

## Phase 8 - IC Package

| Step | Status | Evidence |
| --- | --- | --- |
| markdown package | UNVERIFIED | Pending real dashboard/report verification. |
| JSON export | UNVERIFIED | Pending real dashboard/report verification. |
| manifest | UNVERIFIED | Pending real dashboard/report verification. |
| review/decision trail | UNVERIFIED | Pending real dashboard/report verification. |

## Offline Gate

| Gate | Status | Evidence |
| --- | --- | --- |
| `npm test` | PASSED | `npm test` on 2026-06-25 completed with all bundled checks green after the ledger-preservation fix, including fixture validation, production local data, runtime lock, security hardening, real-world pile, legal parser, dashboard-lib, system-test, codex runtime, codex legal docs, and eval scoring. Result included `[system-test] PASS`, `[codex-runtime] PASS 27 assertions/tests`, `[eval-scoring-test] PASS`. Ledger file still existed after the run. |
| `npm run verify:v3:core` | UNVERIFIED | Pending. |
| `npm run test:e2e` | UNVERIFIED | Pending. |

## Live Codex Gate

| Gate | Status | Evidence |
| --- | --- | --- |
| `npm run codex:status` | UNVERIFIED | Full gate item pending final pass evidence. Auth preflight passed above. |
| `npm run codex:smoke` | UNVERIFIED | Pending. |
| `npm run codex:run:full` | UNVERIFIED | Pending. |
| `npm run validate:codex` | UNVERIFIED | Pending validation of live full run manifest. |
| `npm run eval:live` | UNVERIFIED | Pending. |

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
