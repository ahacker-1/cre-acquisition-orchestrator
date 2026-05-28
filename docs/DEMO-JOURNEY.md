# Demo Journey

Use this as the public demo path for current `main`. It is optimized for a first-time visitor who wants to understand the product before reading the architecture docs.

## Current Reality

The demo reflects the redesigned deal-workspace UI: a single persistent **deal space** (deal header + an always-visible lifecycle spine + a context-sensitive center stage + a Live Feed / Your Team rail + a command bar), document-first **Intake** that auto-extracts and auto-fills the deal record, deterministic offline orchestration, generated workpapers, and an optional local Codex/ChatGPT live-agent path. Power-user controls live in an Advanced drawer. Current `main` may include unreleased hardening and documentation updates on top of the most recent packaged release line.

## Promise

**Drop the deal. Watch your team go to work across the lifecycle. Trace one source-backed fact from extraction review, to approved evidence, to specialist workpaper, to IC package.**

The safe default demo runs locally with deterministic data and does not require API keys. The optional live-agent path uses the user's local Codex CLI / ChatGPT login and should be introduced only after the offline journey is clear.

For the exact runtime split, artifacts, and data-sharing boundaries, see [`docs/RUNTIME-COMPARISON.md`](RUNTIME-COMPARISON.md).

## Ten-Minute Local Demo

```powershell
git clone https://github.com/ahacker-1/cre-acquisition-orchestrator.git
cd cre-acquisition-orchestrator
npm install
npm run setup
npm run demo
npm run dashboard
```

Open `http://localhost:5173`.

## Screenshot Refresh Command

For release hygiene, refresh the deterministic sample and then run the Playwright capture flow against the local dashboard:

```powershell
npm run demo
npm run dashboard
# in a second terminal while the dashboard is running:
npm run screenshots
```

`npm run screenshots` updates the current public gallery under `docs/assets/` for the front door, the Intake auto-fill, the deal space (lifecycle spine + center stage + rail), the agent panel, and the IC package.

## Guided Demo Mode

For a no-video first impression, run the dashboard and click **Start Guided Demo** on the front door. If a workspace is already open, click **Parkview Demo** in the header to reopen the deterministic sample. The app presents an in-product tour through five steps — **The Deal Space**, **Command Your Team**, **Your Team**, **Watch It Work**, and **IC Package** — each spotlighting a part of the persistent frame (the lifecycle spine, the command bar, the Your Team rail, the live feed, and the completion package).

Use this when you want a first-time visitor to understand the product without uploads, API keys, or a recorded walkthrough.

## Source-to-IC Proof Path

Use this as the reviewer script when someone asks, "What proves this is more than a generic AI dashboard?" Pick one number, document warning, or red flag and follow it across the product:

1. **Document drop** — the operator starts from source files on the front door, not a blank form or pasted prompt.
2. **Extraction review** — supported CSV/XLSX/TXT/MD and text-based PDF sources produce candidate fields with confidence, warnings, file hashes, and source-location provenance. Scanned/image-only documents are detected and flagged for OCR instead of silently guessed.
3. **Approved evidence** — trusted fields are explicitly approved/applied; ambiguous fields are rejected or waived with a reason, so underwriting inputs change only after human review.
4. **Specialist workpapers** — the deal team works from the reviewed deal context, filing outputs with findings, impact, caveats, review status, and source/workpaper references where the current artifact provides them.
5. **IC package** — the final package assembles recommendation, red flags, data gaps, manifest, workpaper links, and Markdown/JSON export so a human can review the decision trail and drill into available source/workpaper references.

The current public screenshot sequence supports this proof with `dashboard-front-door.png`, `source-extraction-review.png`, `acquisition-command.png`, `deal-team-handoffs.png`, and `ic-package.png`.

## Operator Storyboard

The storyboard tracks the five guided-tour steps and the persistent frame. Each step is anchored to a stable testid so the capture script and the in-product tour stay aligned.

### 1. Front Door — Drop Your Deal

What to show:

- The lead message: drop your deal and watch your team go to work — source documents are the starting point, not a blank form.
- The drop zone for rent rolls, T12s, offering memoranda, LOIs, legal files, PDFs, and XLSX files.
- Recent deals and the **Try the Parkview demo** (deterministic, no-upload) entry.

Why it matters:

- A CRE operator recognizes the workflow immediately: every acquisition starts with source files.
- The dashboard positions the project as a workspace, not just a script runner.

Anchor testids: `drop-zone-hero`, `drop-zone-input`.

Current screenshot asset:

- `docs/assets/dashboard-front-door.png`

### 2. Intake — Drop Documents, the Record Auto-Fills

What to show:

- The dropped document package being read by the ingestion agents (Document Orchestrator → Rent Roll / Financials / Offering Memo parsers).
- The auto-filled **deal record** — grouped Property / Operations / Deal Terms, each value tagged with its source and a confidence dot — with nothing typed by hand.
- The review gate where trusted values become approved evidence, while ambiguous fields are rejected or waived with a reason before they can influence downstream work.
- Only **flagged** values (source conflicts / low-confidence reads) highlighted for inline edit, full provenance one tap away, and the single forward action: **"Looks right → start Diligence."**

Why it matters:

- This is the redesign's opening beat: the operator never types a number to begin, and human review concentrates on what the agents flag while the full approve/reject/waive audit trail stays available behind a disclosure.

Anchor testids: `intake-stage`, `deal-record`, `start-diligence`.

Current screenshot asset:

- `docs/assets/source-extraction-review.png`

### 3. The Deal Space — One Frame, the Whole Lifecycle

What to show:

- The persistent frame: the deal header with IC-package readiness, the always-visible **lifecycle spine** (Intake → Diligence → Underwriting → Financing → Legal → Closing → IC) with status dots, the focused center stage, and the right rail.
- The **command bar** ("Tell your team what to do…" + suggestion chips) along the bottom, and the **Advanced** entry in the header for power-user controls.

Why it matters:

- It makes the whole deal lifecycle legible at a glance and shows the single console an operator drives, before they study the underlying orchestration engine.

Anchor testids: `workspace-frame`, `lifecycle-spine`, `spine-step-<stage>`, `command-bar`.

Current screenshot asset:

- `docs/assets/acquisition-command.png`

### 4. Watch It Work — Summon a Specialist, Read Its Workpaper

What to show:

- **Your Team** rail for the focused stage and the "summon any of 31 agents" picker.
- The **agent panel** sliding in over the dimmed workspace: one specialist's live (or replayed) reasoning with an elapsed timer, the workpaper it filed (cited inputs → finding → impact → caveats), and a follow-up box to re-task it.
- The intended evidence chain: approved source-backed inputs inform the specialist context, and the filed workpaper remains inspectable with available source/workpaper references instead of being a free-floating answer.
- The **Live Feed** in the rail continuing to run behind the panel so the rest of the desk visibly carries on.

Why it matters:

- This is the "watch the team work" moment: agent output is treated as a reviewable workpaper artifact with explicit caveats and available references, not an opaque answer.

Anchor testids: `team-rail`, `team-summon`, `live-feed`, `agent-panel`.

Current screenshot asset:

- `docs/assets/deal-team-handoffs.png`

### 5. IC Package — Reviewable Decision Output

What to show:

- Final recommendation, phase outcomes, priority red flags and data gaps, document manifest, decision log, workpaper links, and Markdown/JSON export — assembled at the **IC** stage of the spine.
- The review path from an IC red flag or data gap back to the originating workpaper or source evidence wherever the current package exposes that provenance.

Why it matters:

- This is the payoff: a human operator can review the committee package instead of trusting an opaque AI answer.

Anchor testids: `spine-step-ic`, `completion-package-view`.

Current screenshot asset:

- `docs/assets/ic-package.png`

## Guided Demo Checklist

Before the next public release:

- [ ] Run `npm run demo` to regenerate sample artifacts.
- [ ] Run `npm run dashboard` and click **Start Guided Demo**.
- [ ] Confirm the guided tour advances through The Deal Space, Command Your Team, Your Team, Watch It Work, and IC Package.
- [ ] Run `npm run screenshots` while the dashboard is available at `http://localhost:5173`.
- [ ] Capture current public surfaces for the front door, the Intake auto-fill, the deal space, the agent panel, and the IC package.
- [x] Add a current screenshot gallery in `docs/assets/`.
- [ ] Update README image alt text so each screenshot explains the operator value.
- [ ] Run `git diff --check`.
- [ ] Run `npm --prefix dashboard run build`.
