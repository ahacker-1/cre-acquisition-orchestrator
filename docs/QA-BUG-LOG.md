# QA Bug Log

Last updated: 2026-06-22

This log records every defect found during the production-scale local QA pass, with reproduction evidence and fix status.

## Fixed

### QA-005: Full e2e draft-upload test treated a retryable quick-create ID conflict as fatal

Status: Fixed

Severity: Medium

Shared cause: The quick-create UI retries when the suggested `DEAL-2026-*` ID already exists, but the e2e test waited for the first `POST /api/deals` response and called it a failure if that first response was the expected retryable conflict. This made full-suite reruns fail after prior local draft artifacts existed.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e
```

Observed failure:

```text
API request failed (400 Bad Request): {"error":"Validation failed", ... "dealId":"A deal with this ID already exists"}
```

Fix:

- `dashboard/e2e/deal-library.spec.ts` now waits for the successful quick-create `POST /api/deals` response, matching the UI retry behavior.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- e2e/deal-library.spec.ts:345
npm --prefix dashboard run test:e2e
```

Result:

```text
focused path passed
30 passed
```

### QA-006: Manual extraction review actions were blocked by unrelated workspace work

Status: Fixed

Severity: High

Shared cause: `ExtractionPreviewPanel` used the page-level `working` flag to disable Apply, Reject, and Waive actions. Background extraction, save, or refresh activity could keep the visible manual review controls disabled even when the reviewer was acting on the currently displayed extraction.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e -- e2e/deal-library.spec.ts:345
```

Observed failure:

```text
The review apply control stayed disabled while the workspace was still processing unrelated work.
```

Fix:

- `dashboard/src/components/DealWorkspace.tsx` now scopes review-action disabled state to a local `submittingReview` flag.
- Apply, Reject, and Waive actions still guard their own in-flight submission, but no longer inherit unrelated workspace work.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- e2e/deal-library.spec.ts:345
npm --prefix dashboard run test:e2e
```

Result:

```text
focused path passed
30 passed
```

### QA-007: Opening a different saved deal could retain stale workspace state

Status: Fixed

Severity: High

Shared cause: The workspace hook did not clear deal-specific state on `dealId` changes, and the manual workspace component reused the same mounted instance across selected deals. A completed run or previously opened deal could bleed source documents, extraction state, or package context into the next saved deal.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e -- production-scale-inventory.spec.ts
```

Observed failure:

```text
After selecting a seeded QA deal from the library, source-backed workspace assertions could resolve against the previously mounted workspace state.
```

Fix:

- `dashboard/src/hooks/useDealWorkspace.ts` now resets workspace, extraction, and error state when `dealId` changes.
- `dashboard/src/App.tsx` keys `DealWorkspace` by deal ID so deal-scoped component state remounts cleanly.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- production-scale-inventory.spec.ts
npm --prefix dashboard run test:e2e
```

Result:

```text
production-scale inventory passed
30 passed
```

### QA-008: API sanitizer converted repeated validation objects to null

Status: Fixed

Severity: Medium

Shared cause: `sanitizeApiResponse` used one `WeakSet` for the entire traversal. Reused object references in safe validation payloads were treated as circular references after first visit, so later appearances were serialized as `null`.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e -- e2e/deal-library.spec.ts:345
```

Observed failure:

```text
Quick-create conflict handling could miss duplicate-ID evidence when validation issue entries were nulled by response sanitization.
```

Fix:

- `dashboard/server/watcher.ts` now treats the `WeakSet` as a recursion stack and removes objects after each safe branch completes.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- e2e/deal-library.spec.ts:345
npm --prefix dashboard run test:e2e
```

Result:

```text
focused path passed
30 passed
```

### QA-009: Recent-deals e2e path was brittle during auto-refresh and live-run reveal

Status: Fixed

Severity: Medium

Shared cause: Several user-like tests opened workspaces from the recent-deals strip while the app was also refreshing data or revealing an active run. The locator could detach between visibility and click, making the automation fail even though the user path had a reliable Deal Library fallback.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e -- e2e/workspace-frame.spec.ts
```

Observed failure:

```text
Recent deal card locator detached or disappeared before click during local file-refresh churn.
```

Fix:

- `dashboard/e2e/helpers.ts` now retries fresh recent-card locators and falls back to the Deal Library modal when the recent strip is unavailable.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- e2e/workspace-frame.spec.ts
npm --prefix dashboard run test:e2e
```

Result:

```text
workspace-frame passed
30 passed
```

### QA-010: Full e2e could fail on transient loopback API resets

Status: Fixed

Severity: Medium

Shared cause: The e2e suite creates, seeds, and rewrites many local files while the watcher serves API requests. Under full-suite pressure, occasional loopback `ECONNRESET` and similar transient request failures could fail setup helpers before the UI under test loaded.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e
```

Observed failure:

```text
fetch failed / read ECONNRESET during local API setup or teardown
```

Fix:

- `dashboard/e2e/helpers.ts` now wraps setup API calls with bounded `apiGet` and `apiPost` retries for loopback transport errors only.
- `dashboard/e2e/deal-library.spec.ts` uses those wrappers for local API setup and cleanup paths.

Verification:

```powershell
npm --prefix dashboard run test:e2e
```

Result:

```text
30 passed
```

### QA-011: Agent drawer assertions reused stale drawer locators

Status: Fixed

Severity: Low

Shared cause: The quick-deal completion e2e test reused an old drawer locator after closing and reopening agent panels. The app had rendered the correct current drawer, but the assertion still targeted the stale panel instance.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e -- e2e/deal-library.spec.ts:1208
```

Observed failure:

```text
Drawer assertion resolved against a closed or stale agent drawer after reopening a different panel.
```

Fix:

- `dashboard/e2e/deal-library.spec.ts` now re-queries the current drawer after each panel transition.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- e2e/deal-library.spec.ts:1208
npm --prefix dashboard run test:e2e
```

Result:

```text
focused path passed
30 passed
```

### QA-012: Deal-team e2e assertion missed a valid staffed-agent task label

Status: Fixed

Severity: Low

Shared cause: The quick-deal package-view e2e test had two related assumptions that were too narrow for the live browser refresh path. First, it treated the Rent Roll Analyst row as valid only when the visible text included a lifecycle status such as `Filed`, `Working now`, or `Queued`, even though the row can legitimately render the staffed task label `Reconciling leases`. Second, after relaunching from the Swarm Goal Console, the test waited for the API run to go idle but did not force a fresh UI read from the final checkpoint before asserting the IC package completion text.

Reproduction evidence:

```powershell
npm run verify:v3
```

Observed failure:

```text
Expected pattern: /Filed|Working now|Queued/
Unexpected value: "RRRent Roll AnalystReconciling leases"

Expected substring: "Scoped workflow completed. Review the package outputs before expanding to a full closing run."
Unexpected value included: "Package in progress"
```

Fix:

- `dashboard/e2e/deal-library.spec.ts` now accepts the visible staffed task label for the Rent Roll Analyst row while keeping the phase-status assertion intact.
- After the Swarm relaunch goes idle, the test reloads the dashboard to read the final checkpoint before asserting IC package completion.
- The IC-stage retry loop now waits for the scoped-completion recommendation text, not just for the package container to be visible.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- e2e/deal-library.spec.ts:699
npm --prefix dashboard run test:e2e
```

Result:

- Focused regression passed.
- Full browser inventory passed with `30 passed`.

### QA-013: Deal-library e2e suite still depended on stale selection and single-checkbox timing

Status: Fixed

Severity: Medium

Shared cause: The full browser suite can start with many generated QA deals already present from prior production-scale runs. The workflow launcher test selected the intended sample deal but did not assert that the select actually held `demo-pass-001` before launch, so a stale/default draft could remain selected and block launch. In the workspace operation test, manually checking individual source fields could race the extraction preview rerender and leave only `Unit Mix` selected, while the assertion expected `Total Units` to be included in the change summary.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e
```

Observed failures:

```text
Expected substring: "Total Units"
Received string: "Deal data changesUnit Mix1 rowsto4 rows"

Locator: getByText('Run: Running')
Error: element(s) not found
```

Fix:

- The workspace operation test now uses the bulk safe-field selector, then explicitly unchecks the intentionally unresolved occupancy field and asserts both Total Units and Unit Mix are checked before applying.
- The quick-deal package-view test now waits for the workflow deal select to contain and hold `demo-pass-001` before launching, and accepts fast launches that jump directly from Starting to Completed.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- e2e/deal-library.spec.ts:1089
npm --prefix dashboard run test:e2e
```

Result:

- Focused regression passed.
- Full browser inventory passed with `30 passed`.

### QA-004: Saved completed deals lost checkpoint evidence in manual workspace package view

Status: Fixed

Severity: High

Shared cause: Opening a saved deal from the library called `GET /api/deals/:id`, but that response only returned the saved deal record. The App then synthesized a pending checkpoint from deal metadata, so manually opened completed workspaces lost `inputSnapshot.sourceCoverage`, completed phase outcomes, and the source-to-IC proof path even when `data/status/<dealId>.json` existed.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e -- production-scale-inventory.spec.ts
```

Observed failure:

```text
Locator: getByTestId('source-backed-input-summary')
Expected: visible
Error: element(s) not found
```

Failure artifact:

```text
dashboard/test-results/production-scale-inventory-89a95--production-scale-workspace-chromium/error-context.md
```

Fix:

- `dashboard/server/watcher.ts` now enriches `GET /api/deals/:id` responses with the local checkpoint from `data/status/<dealId>.json` when present.
- `dashboard/src/types/deals.ts` models the optional checkpoint on `DealRecordResponse`.
- `dashboard/src/App.tsx` now prefers the existing checkpoint and only falls back to synthetic pending phases when no checkpoint exists.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- production-scale-inventory.spec.ts
```

Result:

```text
1 passed
```

### QA-003: Production-scale browser inventory skipped the launcher review step

Status: Fixed

Severity: Medium

Shared cause: The embedded workflow launcher opens on its Deal step, while the deal/workflow/runtime selectors live on the Review step. The test asserted review inputs immediately after opening the advanced drawer, so it failed before clicking through the actual user-visible launcher steps.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e -- production-scale-inventory.spec.ts
```

Observed failure:

```text
Locator: getByTestId('advanced-drawer').getByTestId('workflow-deal-select')
Expected: visible
Error: element(s) not found
```

Failure artifact:

```text
dashboard/test-results/production-scale-inventory-89a95--production-scale-workspace-chromium/error-context.md
```

Fix:

- `dashboard/e2e/production-scale-inventory.spec.ts` now asserts the launcher step controls and clicks `workflow-step-review` before checking review inputs.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- production-scale-inventory.spec.ts
```

Result:

```text
1 passed
```

### QA-002: Production-scale browser inventory asserted the wrong Underwriting surface

Status: Fixed

Severity: Medium

Shared cause: The new Playwright inventory targeted `guide-section-underwriting` immediately after clicking the Underwriting lifecycle stage. That test id belongs to the advanced progression guide, not the main stage view. The actual user-facing Underwriting stage rendered correctly as the Agent Playbook with phase launch controls and staffed specialist cards.

Reproduction evidence:

```powershell
npm --prefix dashboard run test:e2e -- production-scale-inventory.spec.ts
```

Observed failure:

```text
Locator: getByTestId('guide-section-underwriting')
Expected: visible
Error: element(s) not found
```

Failure artifact:

```text
dashboard/test-results/production-scale-inventory-89a95--production-scale-workspace-chromium/error-context.md
```

Fix:

- `dashboard/e2e/production-scale-inventory.spec.ts` now asserts the main stage `Agent Playbook`, `phase-launch-underwriting`, and `phase-agent-financial-model-builder` controls.

Verification:

```powershell
npm --prefix dashboard run test:e2e -- production-scale-inventory.spec.ts
```

Result:

```text
1 passed
```

### QA-001: Seeded approved fields missed trusted file-hash provenance

Status: Fixed

Severity: High

Shared cause: The production-scale seed generator wrote document hashes as `document.sourceHash`, but copied `input.fileHash` into approved-field provenance. Generated document objects do not expose `fileHash`, so approved fields were missing `sourceRef.fileHash`.

Reproduction evidence:

```powershell
npm run test:prod-local-data
```

Observed failure:

```text
AssertionError [ERR_ASSERTION]: assert.ok(approved.fields.every((field) => field.sourceRef?.fileHash))
```

Fix:

- `scripts/seed-production-local-data.js` now maps document `sourceHash` into extraction `sourceRef.fileHash`.
- `scripts/production-local-data.test.mjs` keeps the provenance assertion so the fixture cannot regress silently.

Verification:

```powershell
npm run test:prod-local-data
```

Result:

```text
production-local-data: 12 sanitized local deals generated, validated, and re-seeded
```

## Open

No open production-scale local QA defects are confirmed. The final full browser pass completed cleanly:

```powershell
npm --prefix dashboard run test:e2e
```

```text
30 passed
```
