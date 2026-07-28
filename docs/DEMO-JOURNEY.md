# Demo Journey

Use this as the public walkthrough for `v3.6.0` on current `main`. The journey starts where a first-time operator now starts: in the chat-first **Conversation Desk**, then moves through source intake and into the full acquisition workspace. For the shortest runnable trust loop, use [`docs/PROOF-PATH.md`](PROOF-PATH.md) and `npm run proof`.

## Current Reality

The product has two complementary working surfaces:

- **Conversation Desk** — choose a deal, choose one of the 31 deal-team roles, select the source documents in scope, and ask plain-English questions. A thread is created only when the first message is sent. Completed answers remain attached to that deal, agent, and thread for follow-ups and expose source citations when the underlying evidence is available.
- **Deal Workspace** — inspect uploads and extraction, approve evidence, run the acquisition lifecycle, review specialist workpapers, monitor the live feed, and assemble the IC package.

**New Deal** connects them. It opens the source-package uploader for a real deal and also exposes the deterministic Parkview Guided Demo. The deterministic path does not require API keys or Codex. Live Conversation Desk answers are optional and use the operator's local Codex / ChatGPT setup.

When a live question is sent, the local server supplies Codex with the selected documents' extracted evidence, current deal record, underwriting criteria, approved fields, selected agent role guide, recent conversation transcript, and operator question.

For the exact runtime split, artifacts, and data-sharing boundaries, see [`docs/RUNTIME-COMPARISON.md`](RUNTIME-COMPARISON.md).

## Promise

**Pick the deal. Call the right specialist. Ask against the source documents. Then trace the same evidence through review, specialist work, and the IC package.**

## Ten-Minute Local Demo

```powershell
git clone https://github.com/ahacker-1/cre-acquisition-orchestrator.git
cd cre-acquisition-orchestrator
npm install
npm run setup -- --skip-codex-install --skip-login
npm run proof
```

Open `http://localhost:5173`.

## Screenshot Refresh Command

Regenerate the deterministic sample, start the dashboard, and run the capture flow in a second terminal:

```powershell
npm run demo
npm run dashboard
# in a second terminal while the dashboard is running:
npm run screenshots
```

The release capture follows the walkthrough in this order:

1. `docs/assets/conversation-desk.jpg`
2. `docs/assets/specialist-picker.jpg`
3. `docs/assets/new-deal-source-package.jpg`
4. `docs/assets/agent-conversation.jpg` when a completed, retained, source-backed local thread already exists
5. `docs/assets/uploaded-data-inspector.jpg`
6. `docs/assets/source-extraction-review.jpg`
7. `docs/assets/acquisition-command.png`
8. `docs/assets/ic-package.png`
9. `docs/assets/workflow-launcher.png`

The script never sends a live prompt to manufacture `agent-conversation.jpg`. If no retained thread contains both an assistant answer and a citation, it logs a clear skip and continues the deterministic release capture.

## Guided Demo Mode

From the Conversation Desk, click **New Deal**, then **Start Guided Demo**. Parkview opens in the Deal Workspace and presents five steps: **The Deal Space**, **Command Your Team**, **Your Team**, **Watch It Work**, and **IC Package**.

Use this path for a repeatable first impression without uploads, API keys, or live model calls. It explains the full operational surface after the Conversation Desk has established the simpler deal-and-specialist mental model.

## Source-to-IC Proof Path

Use [`docs/PROOF-PATH.md`](PROOF-PATH.md) when someone asks, "What proves this is more than a generic chatbot?"

1. **Conversation scope** — the operator explicitly chooses a deal, specialist, and source documents. Merely changing a deal or specialist does not create a durable thread or send anything.
2. **Source package** — a real deal begins with uploaded documents; Parkview provides a deterministic no-upload fallback.
3. **Uploaded data inspector** — parsed tables expose field types, fill rates, examples, source rows, and row detail before extracted values are trusted.
4. **Extraction review** — candidates show confidence, warnings, hashes, source locations, and OCR limitations. Unsupported or ambiguous values stay review-gated.
5. **Approved evidence** — trusted fields are explicitly approved and applied; rejected or waived fields retain the human decision.
6. **Specialist work** — Conversation Desk answers cite selected evidence when available, while full-workspace specialists file reviewable workpapers with findings, impact, caveats, and available references.
7. **IC package** — the final package assembles recommendation, red flags, data gaps, manifest, workpaper links, and Markdown/JSON export for human review.

## Walkthrough Storyboard

### 1. Conversation Desk — Start With Context

What to show:

- The compact deal list and current deal selection.
- The chosen specialist, recent conversations for that deal, selected source documents, and the large conversation canvas.
- The **Open full workspace** action that makes the relationship between the two surfaces explicit.

Why it matters:

- A first-time operator immediately understands the three-step flow: choose a deal, choose a specialist, ask the question.
- The conversation is scoped to deal evidence instead of beginning as a context-free prompt.

Anchor testids: `conversation-home`, `conversation-home-deal-list`, `conversation-home-agent-select`, `agent-conversation`.

Screenshot: `docs/assets/conversation-desk.jpg`.

### 2. Specialist Picker — Call the Right Expert

What to show:

- The contained dark picker instead of a browser-native page-covering menu.
- Search across the available specialists, role labels, the selected state, and keyboard guidance.

Why it matters:

- The operator can find a legal, rent-roll, finance, title, closing, or orchestration specialist without scanning a 31-item native select.
- Changing specialists changes the conversation context but does not create or send a thread.

Anchor testids: `conversation-home-agent-select`, `conversation-home-agent-menu`, `conversation-home-agent-search`.

Screenshot: `docs/assets/specialist-picker.jpg`.

### 3. New Deal — Upload or Explore

What to show:

- **Upload Source Package** for a real acquisition.
- **Start Guided Demo** for deterministic Parkview data.
- Copy that explains local-first source extraction and the no-key demo boundary.

Why it matters:

- Upload and demo are visible choices instead of hidden setup knowledge.
- The operator sees that documents, not manual data entry, establish the deal record.

Anchor testids: `drop-zone-hero`, `drop-zone-input`, `guided-demo-front-door-cta`.

Screenshot: `docs/assets/new-deal-source-package.jpg`.

### 4. Agent Conversation — Ask, Cite, Follow Up

What to show when a retained source-backed thread exists:

- The user's question and the specialist's completed answer.
- Source citations that identify the supporting file and location.
- The same deal / agent / thread restored for follow-ups.

Why it matters:

- The thread feels conversational without losing its evidence boundary.
- The first send is the durable-thread boundary; browsing deals or specialists alone does not create history or call a model.

Anchor testids: `agent-conversation`, `conversation-timeline`, `conversation-message-*`, `conversation-citation-*`.

Screenshot: `docs/assets/agent-conversation.jpg` (conditionally refreshed; live Codex is never invoked by the capture script).

### 5. Uploaded Data Inspector — Inspect Before Trust

What to show:

- Parsed sheets and tables, field types, fill rates, examples, source rows, and row detail.
- The selected field and selected row in the original uploaded shape.

Why it matters:

- The operator can verify the source-shaped data before approving extracted values.

Anchor testids: `uploaded-data-inspector`, `uploaded-field-list`, `uploaded-row-grid`, `uploaded-row-detail`.

Screenshot: `docs/assets/uploaded-data-inspector.jpg`.

### 6. Extraction Review — Promote Evidence Deliberately

What to show:

- Candidate fields with confidence, provenance, validation warnings, and current-versus-proposed values.
- Explicit approve/apply, reject, and waive controls.

Why it matters:

- Raw extraction cannot silently change underwriting inputs.
- The evidence layer records both machine output and human review.

Anchor testids: `extraction-preview`, `extraction-field-*`, `apply-extraction`.

Screenshot: `docs/assets/source-extraction-review.jpg`.

### 7. Deal Workspace — One Frame, the Whole Lifecycle

What to show:

- The persistent deal header and lifecycle spine from Intake through IC.
- The focused center stage, Live Feed / Your Team rail, and command bar.
- The **Advanced** entry for workflow controls.

Why it matters:

- The Conversation Desk answers questions; the Deal Workspace runs and reviews the acquisition process.

Anchor testids: `workspace-frame`, `lifecycle-spine`, `live-feed`, `command-bar`.

Screenshot: `docs/assets/acquisition-command.png`.

### 8. IC Package — Reviewable Decision Output

What to show:

- Recommendation, phase outcomes, priority red flags and data gaps, manifest, decision log, workpaper links, and export.
- The available path back to evidence and specialist work, with gaps shown honestly.

Why it matters:

- A human can review the committee package instead of trusting an opaque AI answer.

Anchor testids: `spine-step-ic`, `completion-package-view`.

Screenshot: `docs/assets/ic-package.png`.

### 9. Workflow Launcher — Optional Live Runtime

What to show:

- The Advanced drawer's workflow review step, runtime selection, Codex controls, and live web-search toggle.
- No workflow is launched during screenshot capture.

Why it matters:

- The deterministic proof and optional live runtime are visibly separate.

Anchor testids: `open-advanced`, `workspace-workflow-launcher`, `workflow-runtime-provider-select`.

Screenshot: `docs/assets/workflow-launcher.png`.

## Release Checklist

- [ ] Run `npm run demo` to regenerate the Parkview sample.
- [ ] Run `npm run dashboard` and verify the Conversation Desk opens at `/`.
- [ ] Confirm the specialist picker searches, selects, closes with Escape, and stays within the viewport.
- [ ] Click **New Deal**, verify both upload and Guided Demo entry points, and open Parkview through the UI.
- [ ] Confirm the guided tour advances through all five Deal Workspace steps.
- [ ] Run `npm run screenshots` and review every refreshed asset; an `agent-conversation.jpg` skip is acceptable when no retained cited thread exists.
- [ ] Confirm README walkthrough image order and alt text match this storyboard.
- [ ] Run `git diff --check`.
- [ ] Run `npm --prefix dashboard run build`.
