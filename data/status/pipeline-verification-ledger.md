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
| accept candidate fields | UNVERIFIED | Pending real source-gate/dashboard verification. |
| reject candidate fields | UNVERIFIED | Pending real source-gate/dashboard verification. |
| waive candidate fields | UNVERIFIED | Pending real source-gate/dashboard verification. |
| provenance trail | UNVERIFIED | Pending real source-gate/dashboard verification. |
| flagged-field gating | UNVERIFIED | Pending real source-gate/dashboard verification. |
| operator-edit precedence | UNVERIFIED | Pending real source-gate/dashboard verification. |

## Phase 3 - Due Diligence

| Step | Status | Evidence |
| --- | --- | --- |
| 7 specialist agents | UNVERIFIED | Pending real phase output and schema verification. |
| unit mix | UNVERIFIED | Pending real phase output and schema verification. |
| rent-roll analysis | UNVERIFIED | Pending real phase output and schema verification. |
| OpEx notes | UNVERIFIED | Pending real phase output and schema verification. |
| diligence flags | UNVERIFIED | Pending real phase output and schema verification. |

## Phase 4 - Underwriting

| Step | Status | Evidence |
| --- | --- | --- |
| model builder | UNVERIFIED | Pending real phase output and schema verification. |
| scenario analyst | UNVERIFIED | Pending real phase output and schema verification. |
| 27-scenario matrix | UNVERIFIED | Pending real phase output and schema verification. |
| IC memo writer | UNVERIFIED | Pending real phase output and schema verification. |
| DSCR | UNVERIFIED | Pending real phase output and schema verification. |
| IRR | UNVERIFIED | Pending real phase output and schema verification. |
| equity multiple | UNVERIFIED | Pending real phase output and schema verification. |
| 10-year pro forma | UNVERIFIED | Pending real phase output and schema verification. |

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
