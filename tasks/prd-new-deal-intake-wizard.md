# PRD: New Deal Intake Wizard

- Status: Draft
- Date: 2026-03-27
- Owner: Product / Engineering
- Primary feature area: Dashboard onboarding and deal creation

## 1. Introduction / Overview

The `New Deal Intake Wizard` adds a guided, in-dashboard flow for creating, validating, saving, and launching a deal analysis without requiring the user to manually edit `config/deal.json` first.

Today, the system is powerful but front-loaded with developer workflow. A new user must understand the repo layout, edit JSON by hand, and follow CLI-oriented docs before experiencing value. The wizard shifts the first-run experience from "configure files" to "create a deal and launch analysis," while preserving the existing orchestration engine, schema contract, and dashboard run flow.

This feature is intended to make the product materially more usable for first-time evaluators, acquisitions team members, and operators who are comfortable reviewing deal information but not comfortable working directly in repository files.

## 2. Goals

- Reduce time-to-first-run from a multi-step doc-following workflow to a guided dashboard flow.
- Eliminate manual editing of the single global `config/deal.json` as the default onboarding path.
- Reuse the existing deal schema and launch pipeline so the feature improves usability without rewriting the engine.
- Prevent destructive or confusing behavior when users create multiple deals over time.
- Make deal setup feel productized enough that a non-developer can successfully create and launch a run with minimal guidance.

## 3. Problem Statement

The current system is operationally capable, but onboarding is optimized for technical users. This creates three problems:

1. Users must understand file structure before they see value.
2. The default workflow depends on a single shared deal file, which is fragile for repeated use.
3. The dashboard starts as a monitor, not as a guided starting point for creating a new analysis.

As a result, interested users can abandon the flow before they ever reach the final report, not because the engine is weak, but because setup feels like implementation work.

## 4. Target Users

### Primary User: First-Time Evaluator
- Someone exploring the product for the first or second time.
- Comfortable reviewing deal inputs and business terms.
- Not comfortable editing JSON or pasting prompts into an AI coding tool.

### Secondary User: Acquisition Analyst / Associate
- Runs deal analysis repeatedly.
- Wants a faster, safer way to create and save deals.
- Needs validation and confidence that the setup matches runtime requirements.

### Tertiary User: Technical Operator / Demo Owner
- Uses the dashboard to demo the system or run internal analyses.
- Needs sample deals and new deals to coexist cleanly.
- Needs a launch flow that is repeatable and safe.

## 5. Assumptions

- V1 is manual-entry first. It is not dependent on OCR, LLM extraction, or live document parsing.
- V1 should reuse the existing schema contract in `config/deal-schema.json`.
- V1 should launch existing run flows by passing an explicit deal path into the current run manager.
- V1 should preserve existing demo/sample flows rather than replacing them.
- Upload-driven extraction can be deferred to a follow-on release if it threatens delivery of the core manual-entry experience.

## 6. User Stories

### US-001: Start a New Deal From the Dashboard
**Description:** As a first-time user, I want a clear dashboard entry point for creating a deal so that I do not need to find and edit repo files before using the product.

**Acceptance Criteria:**
- [ ] The dashboard shows a primary `New Deal` entry point in the empty state and a visible create action in the main app shell.
- [ ] The entry point opens the intake wizard without requiring terminal interaction.
- [ ] The empty state no longer assumes the user will edit `config/deal.json` manually as the primary path.
- [ ] Typecheck/lint passes.
- [ ] Verify visually in browser.

### US-002: Enter Core Deal Information in Guided Steps
**Description:** As a user, I want the wizard to break deal entry into logical steps so that the process feels manageable and I can understand what information is required.

**Acceptance Criteria:**
- [ ] The wizard groups fields into clear steps such as deal basics, property, financials, financing, seller/timeline, and review.
- [ ] Each step exposes only the fields relevant to that step.
- [ ] The user can move backward and forward without losing entered data.
- [ ] Required fields are visually distinguished from optional fields.
- [ ] Typecheck/lint passes.
- [ ] Verify visually in browser.

### US-003: Validate Inputs Against Real Runtime Rules
**Description:** As a user, I want validation that matches the actual pipeline requirements so that a wizard-created deal does not fail later for avoidable reasons.

**Acceptance Criteria:**
- [ ] Required fields, enums, patterns, and ranges align with `config/deal-schema.json`.
- [ ] The wizard validates deal ID format, state abbreviation, ZIP format, decimal percentages, and required date fields.
- [ ] Backend validation exists as the source of truth, not only frontend validation.
- [ ] Validation errors are specific enough for a non-technical user to correct.
- [ ] Typecheck/lint passes.

### US-004: Save a Draft Deal Safely
**Description:** As an analyst, I want to save a draft without launching immediately so that I can return later and continue work.

**Acceptance Criteria:**
- [ ] A user can save a draft before all launch-required fields are complete.
- [ ] Draft data is persisted in a per-deal location instead of overwriting the shared global config.
- [ ] Re-opening the wizard for a saved draft restores all prior values.
- [ ] The saved draft has a status that distinguishes it from launch-ready deals.
- [ ] Typecheck/lint passes.

### US-005: Review the Deal Before Launch
**Description:** As a user, I want a review step that summarizes the deal and highlights missing or risky fields so that I can confirm the setup before starting a run.

**Acceptance Criteria:**
- [ ] The final wizard step shows a readable summary of key property, financial, financing, strategy, and timeline inputs.
- [ ] The review screen distinguishes blocking issues from non-blocking warnings.
- [ ] The review screen makes it clear whether the deal is draft-only or launch-ready.
- [ ] Typecheck/lint passes.
- [ ] Verify visually in browser.

### US-006: Launch a Run From a Saved Deal
**Description:** As a user, I want to launch analysis directly from the reviewed deal so that I can move from intake to execution in one flow.

**Acceptance Criteria:**
- [ ] Launch passes an explicit deal path to the existing run start flow.
- [ ] The run starts without requiring manual edits to `config/deal.json`.
- [ ] The UI shows launch state, success, and failure clearly.
- [ ] If launch fails, the saved deal is not lost.
- [ ] Typecheck/lint passes.

### US-007: Keep Sample Deals and User Deals Separate
**Description:** As a demo owner or technical operator, I want sample/demo deals and wizard-created deals to coexist so that demo workflows remain stable while real usage grows.

**Acceptance Criteria:**
- [ ] Wizard-created deals are stored separately from shipped examples and demo fixtures.
- [ ] Starting a new user deal does not require replacing the current sample config file.
- [ ] The product still supports running sample/demo flows for onboarding and demos.
- [ ] Typecheck/lint passes.

### US-008: Generate or Suggest a Valid Deal ID
**Description:** As a user, I want help generating a valid deal ID so that I do not need to memorize format rules.

**Acceptance Criteria:**
- [ ] The wizard can prefill or suggest a valid `DEAL-YYYY-NNN` identifier.
- [ ] The user can edit the deal ID before save.
- [ ] Duplicate or conflicting IDs are flagged before save.
- [ ] Typecheck/lint passes.

### US-009: Handle Partial Document Uploads Gracefully
**Description:** As a user, I want optional document uploads to fail safely so that the wizard is still useful even when supporting files are incomplete or unsupported.

**Acceptance Criteria:**
- [ ] If document upload is included in V1, uploads are optional and never block manual entry.
- [ ] Upload failure or unsupported file types show a clear message and preserve manual progress.
- [ ] The system never claims documents were parsed if no extraction occurred.
- [ ] Typecheck/lint passes.

## 7. Functional Requirements

### FR-1: Dashboard Entry Point
The dashboard must expose a `New Deal` action from the empty state and a persistent create action from the main dashboard shell.

### FR-2: Multi-Step Wizard
The system must present deal creation as a multi-step wizard with progressive disclosure rather than a single dense form.

### FR-3: Manual Entry for Launch-Critical Fields
The wizard must support manual entry of all launch-critical fields currently required by runtime validation:
- `dealId`
- `dealName`
- `property.address`
- `property.city`
- `property.state`
- `property.zip`
- `property.propertyType`
- `property.yearBuilt`
- `property.totalUnits`
- `property.unitMix.types`
- `financials.askingPrice`
- `financials.currentNOI`
- `financials.inPlaceOccupancy`
- `financing.targetLTV`
- `financing.estimatedRate`
- `financing.loanTerm`
- `financing.amortization`
- `financing.loanType`
- `investmentStrategy`
- `targetHoldPeriod`
- `targetIRR`
- `targetEquityMultiple`
- `targetCashOnCash`
- `seller.entity`
- `timeline.psaExecutionDate`
- `timeline.ddStartDate`
- `timeline.ddExpirationDate`
- `timeline.closingDate`

### FR-4: Runtime-Accurate Validation
The system must validate against the existing schema and runtime rules, including:
- Deal ID format `DEAL-YYYY-NNN`
- State as 2-letter uppercase abbreviation
- ZIP as string-compatible US ZIP format
- Percentage/rate fields as decimals from `0.0` to `1.0`
- Required arrays such as `property.unitMix.types`
- Required timeline and seller fields

### FR-5: Draft Save
The system must allow users to save incomplete deals as drafts without requiring all launch-critical fields.

### FR-6: Per-Deal Persistence
The system must persist wizard-created deals in a per-deal storage model, not in the single shared `config/deal.json` file.

### FR-7: Review Step
The system must provide a review step that summarizes the deal and identifies:
- blocking launch errors
- non-blocking warnings
- missing optional fields that may reduce analysis quality

### FR-8: Launch by Explicit Deal Path
The system must launch runs by passing the saved deal artifact path into the current run start flow.

### FR-9: Safe Failure Handling
If save or launch fails, the system must preserve the user’s data and show a recoverable error state.

### FR-10: Sample Deal Compatibility
The system must not break the current demo/sample-deal workflow shipped with the repository.

### FR-11: Visibility of Deal State
The system must make deal status visible, including at minimum:
- Draft
- Ready to Launch
- Running
- Completed
- Failed

### FR-12: Optional Uploads Must Be Secondary
If document uploads are included in V1, they must be clearly secondary to manual entry and must not be represented as automated extraction unless extraction actually occurs.

### FR-13: Launch Must Not Destructively Reset Unrelated User Data
The launch flow initiated from the wizard must not silently remove unrelated saved deals, reports, logs, or run history beyond the intended scope of the requested run.

## 8. Non-Goals / Out of Scope

The following are explicitly out of scope for V1 unless otherwise approved:

- Replacing the existing orchestration engine
- Replacing the existing run manager or dashboard watcher architecture
- Real LLM-powered document extraction
- OCR, PDF parsing, or automated ingestion of arbitrary data room files
- Multi-user collaboration, auth, or permissions
- Portfolio-level deal management
- Historical deal comparison dashboards
- Mobile-optimized end-to-end workflows
- Editing every possible optional field from `deal-schema.json` in the first release

## 9. Design Considerations

- The wizard should feel like product onboarding, not a thin UI over a JSON file.
- The first screen should favor clarity and forward motion over exposing every advanced field.
- Steps should use plain business labels, with technical field names hidden unless helpful.
- Validation messaging should explain the rule in user language, for example:
  - "Use a two-letter state abbreviation like `TX`"
  - "Enter occupancy as a decimal like `0.94`, not `94`"
- The review step should feel decision-oriented and confidence-building.
- Sample deals should remain discoverable so the dashboard still supports demos and fast exploration.

## 10. Technical Considerations

### 10.1 Existing System Constraints
- The current run flow already accepts `dealPath` in the run manager.
- The current dashboard hook currently defaults to `config/deal.json`.
- The existing `POST /api/deal` route creates a checkpoint, not a reusable saved deal input artifact.
- The current repo contains strong validation logic in `config/deal-schema.json` and `scripts/launch-deal.js`.

### 10.2 Recommended Technical Direction
- Add a dedicated saved-deal persistence layer for wizard-created deals.
- Keep existing demo configuration intact for backward compatibility.
- Make backend validation reusable so the frontend and backend cannot drift.
- Treat schema-driven validation as the canonical contract and frontend forms as a projection of that contract.
- Use explicit deal paths for launching rather than implicit reliance on the shared config file.

### 10.3 Suggested Storage Model
The implementation should store user-created deals in a dedicated location separate from shipped config and demo files.

Suggested candidate:
- `data/deals/<deal-id>/deal.json`

This location should be treated as a working proposal, not a locked implementation detail. The final path can change if a better repo-consistent option emerges, but the core rule is fixed: wizard-created deals must be isolated from the single shared config.

### 10.4 Validation Sources
The implementation should reconcile validation from these existing sources:
- `config/deal-schema.json` for schema constraints
- `scripts/launch-deal.js` for runtime launch requirements
- existing dashboard/server launch behavior for run integration

### 10.5 Backward Compatibility
Existing commands, sample deals, and demo flows should continue to work for technical users. The wizard is an additive experience, not a breaking workflow replacement.

### 10.6 Reset and Run Safety
The current run flow includes reset-oriented behavior suitable for demos. The implementation must review that behavior carefully so wizard-driven launches do not feel destructive in normal usage.

## 11. Success Metrics

### Primary Metrics
- A first-time user can create and launch a valid deal from the dashboard without editing `config/deal.json`.
- Time-to-first-launch is materially reduced versus the current doc-led workflow.
- The rate of launch failures caused by invalid deal configuration decreases.

### Secondary Metrics
- Saved draft deals can be resumed successfully.
- Demo/sample runs remain intact after the feature ships.
- The empty-state experience is more often used to create a deal than to refer users out to manual documentation.

### Qualitative Success Signals
- Users describe the dashboard as a usable product entry point rather than only a run monitor.
- Demo operators can onboard someone without instructing them to modify repository files.

## 12. Release Boundaries

### V1
- Dashboard `New Deal` entry point
- Multi-step manual-entry wizard
- Draft save
- Review step
- Runtime-accurate validation
- Launch from saved deal path
- Safe coexistence with sample/demo flows

### V1.1 / Follow-On
- Optional document attachment UX
- Pre-fill from known sample templates
- Better deal history browsing
- Guided import from existing `config/deal.json`

### Later
- Live extraction from uploaded documents
- Multi-deal comparison
- Team collaboration features

## 13. Open Questions

1. What exact storage path should be the long-term home for user-created deal inputs?
2. Should `unitMix.types` be required before draft save, or only before launch?
3. Should V1 include optional file uploads at all, or should that be deferred to V1.1 to keep scope tight?
4. Should the launch step expose scenario and speed controls, or default to a single recommended flow for V1?
5. Should the wizard support generating a new deal from an existing sample/template as a shortcut?

## 14. Risks

- Validation drift between UI fields and runtime requirements could create false confidence.
- Over-scoping document uploads could delay delivery of the core onboarding win.
- Reusing current reset behavior without guardrails could make users lose data or run history unexpectedly.
- If draft and launch storage are not clearly separated from demo assets, the feature could create operational confusion.

## 15. Implementation Notes for Future Engineering Work

- Favor boring technology and reuse. This feature should assemble existing primitives instead of introducing a new framework or persistence stack.
- Keep the first implementation path narrow. A reliable manual-entry wizard beats a half-finished smart ingestion flow.
- Make trust explicit. Missing data should surface clearly rather than being silently coerced or hidden.
- Use the final review step as the product quality hinge. If the review experience feels trustworthy, the feature will feel real.
