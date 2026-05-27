# Deal Workspace Redesign — Design Spec

**Date:** 2026-05-27
**Status:** Draft for review
**Author:** Avi Hacker (with Claude)
**Topic:** Re-presenting the CRE Acquisition Orchestrator dashboard as a single, living "deal space" you drive by summoning agents.

---

## 1. Problem & Goals

The underlying system is functionally strong (31 agents, extraction, workflows, workpapers, IC package, live Codex runtime). The **presentation** is the problem:

- It **looks cold and complex** — dense panels, a wall of same-size uppercase badges, flat letter-spacing, everything boxed into competing surfaces.
- **Starting a deal is confusing** and requires manual number entry (the `DealIntakeWizard` and the criteria grid). The user should never type a number to begin.
- It doesn't yet **feel like an open space** where you track a deal's whole lifecycle and **call on agents on demand** to do work, watch them, read their output, and give them more tasks.

**North Star:** the *"watch the team work"* demo moment — drop a deal, watch a team of agents visibly go to work, get a committee-ready package. Optimize for **credibility and first impression**.

**Scope (agreed):** presentation / information-architecture / visual redesign **plus thin, surgical backend hooks** where the experience genuinely needs them (dispatch a single named agent, inline-edit an auto-populated value, stream one agent's output).

**Non-goals:** backend re-architecture, multi-tenant hosting, OCR, autonomous investment decisions, a freeform canvas/board metaphor.

---

## 2. Core Concept — One Persistent Frame + Context-Sensitive Stage

A blend of two metaphors: a **Lifecycle War Room** (the deal's whole lifecycle is always visible) wrapped around a **Command Console** (you dispatch the team and watch them work).

One persistent frame; only the **center stage** changes:

```
┌ Deal header — identity · key facts · live package readiness ─────────────┐
├ Lifecycle spine — Intake · Diligence · Underwriting · Financing · Legal · │
│                   Closing · IC   (always visible, statusful, click=focus) │
├──────────────────────────────────────────────────┬──────────────────────┤
│ CENTER STAGE (swaps per spine step)               │ RIGHT RAIL            │
│  · agents working + their outputs for this step   │  · Live Feed          │
│                                                   │  · Your Team (summon) │
├──────────────────────────────────────────────────┴──────────────────────┤
│ COMMAND BAR — "Tell your team what to do…" + smart suggestion chips       │
└───────────────────────────────────────────────────────────────────────────┘
```

This single structure absorbs most of today's separate screens.

---

## 3. Information Architecture — Old → New

| Today | Becomes |
|---|---|
| 6 workspace tabs (Command / Evidence / Deal Team / Workpapers / IC Package / Controls) | The **lifecycle spine** (7 stages) + the persistent frame |
| `DropZoneHero` + `QuickDealCreate` + manual `DealIntakeWizard` (two competing intake paths) | **One front door**: drop → workspace → land in **Intake** step (no manual entry) |
| `ExtractionPreviewPanel` (checkbox approve/reject/waive per field) | **Auto-applied deal record** with inline edit; review concentrates on **flagged** fields only |
| Mission Control / Operator Briefing / Operator Command / Progression Guide (overlapping "what next" panels) | **Command bar** suggestions + each stage's own state |
| `WorkflowLauncher` (runtime/scenario/concurrency dropdowns) | **Command bar** for the everyday path; knobs move to an **Advanced drawer** |
| `AgentTree` / Deal Team tab | Per-stage "agents at work" + the **Live Feed** + the **agent panel** |
| Workpapers tab + `CompletionPackage` | Per-stage **outputs**, assembled at the **IC** step |
| `CriteriaPanel` (manual target IRR/LTV/etc.) | Optional **overrides** in the Advanced drawer, not a required entry step |

The intent is explicitly a **re-presentation** of existing capability, not a rebuild of the engine.

---

## 4. The Lifecycle Spine

- Seven stages, always visible: **Intake → Diligence → Underwriting → Financing → Legal → Closing → IC.**
- Each stage is **statusful** via the color system (§12): done (green), live (blue), needs-eye (amber), blocked (red), idle (gray).
- Clicking a stage **focuses the center stage** on it. The spine replaces the old tab bar.
- Maps onto the existing phase model (DD/UW/Financing/Legal/Closing) plus an explicit **Intake** front-stage and an **IC** assembly stage.

---

## 5. Intake — the "no manual entry" moment (the demo opener)

The single biggest change and the opening beat of the demo.

1. Drop the document package (rent roll, T12, offering memo, inspection, etc.).
2. **Ingestion agents read it** (Document Orchestrator routes → Rent Roll / Financials / Offering Memo parsers), visibly working.
3. The **deal record auto-populates** — grouped **Property / Operations / Deal Terms** — every value tagged with its **source** and a **confidence** dot.
4. **Auto-apply by default.** Values are live the moment they're read. (Locked decision.)
5. You only touch **flagged** fields: source **conflicts** (two docs disagree) and **low-confidence** reads. Flags use the amber cue.
6. **Inline edit** any value; **provenance** (file + sheet/row/page + raw snippet) is one tap away.
7. One forward action: **"Looks right → start Diligence."**

**Trust story preserved.** Auto-apply does not discard the credibility gate — it **concentrates** human review on flagged values, keeps full provenance, and retains the approve/reject/waive **audit trail** behind the edit/flag affordances (reusing the existing source-decision history). This is a re-presentation of the existing extraction-review pipeline, with the default flipped from "nothing applies until approved" to "everything applies, correct what's wrong."

---

## 6. Center Stage — per spine step

Each stage renders the same shape — **agents at work + outputs collected** — with stage-specific content:

- **Intake:** the auto-filled record + dropzone + ingestion agents (see §5).
- **Diligence / Underwriting / Financing / Legal / Closing:** that phase's specialists working, their streaming progress, and the workpapers they file.
- **IC:** the package assembly — recommendation, phase outcomes, red flags, data gaps, manifest, export (reuses `CompletionPackage`).

---

## 7. Agents — summon, watch, read, re-task

The **agent panel** (a side panel that slides in over a dimmed workspace) is the unit of working with one agent. It maps one-to-one onto the user's words:

- **Call on it** — three ways, all landing in the same panel: click the agent in the **Your Team** rail, type intent in the **command bar**, or tap a **suggestion chip**.
- **Watch it work** — live reasoning streams as it runs, with an elapsed timer.
- **See the output** — a real **workpaper** (cited inputs → finding → impact → caveats) with **"open full workpaper"** and **"file to deal."**
- **Give it more tasks** — a follow-up box + chips to keep tasking the **same** agent.

The workspace dims behind the panel; the **Live Feed keeps running** so other agents visibly carry on. **Your Team** rail shows the agents relevant to the focused stage with live status, plus **"summon any of 31 agents."**

**Container decision:** side panel (chosen). Alternatives considered: inline card on the stage (more "open," less focused) and center takeover (most cinematic). Side panel balances focus with keeping the feed/lifecycle in view.

---

## 8. Command Bar

- Persistent **"Tell your team what to do…"** input + **smart suggestion chips** that are context-aware per stage (e.g. Underwriting → "Refresh the model," "Stress-test the exit cap," "Draft the IC memo").
- **Replaces the workflow launcher** for the everyday path; runtime/scenario/concurrency move to the Advanced drawer (§11).
- **v1 routing:** a static **intent → workflow/agent map** (no LLM router required) using the existing workflow catalog and agent registry. Upgradeable later to a natural-language router. *(Open question — see §15.)*

---

## 9. Live Feed

- A chronological **war-room feed** of every agent's activity, sourced from the existing WebSocket `storyEvents` / `logEntries` / `agentCheckpoints`.
- The emotional heartbeat of "watch it work." Lives in the right rail with enough vertical room to feel alive (the user flagged wanting it prominent).

---

## 10. Front Door (entry)

- A single **"Drop your deal. Watch your team go to work."** entry: drop files → create workspace → land in the **Intake** step.
- **Recent deals** below + **"Try the Parkview demo"** (deterministic, no-upload).
- **Unify the two intake paths:** remove the manual `DealIntakeWizard` and the outcome-chip / mission-goal friction from the primary path. Outcome/intent is inferred and changeable later via the command bar. Keep an **"edit details"** escape hatch for the rare manual override.

---

## 11. Advanced Drawer (where the knobs live)

Everything power-user moves off the primary path, one click away:

- Runtime provider (Simulation / Codex), scenario preset, Codex agent limit & concurrency.
- Deal **criteria / target overrides** (IRR, equity multiple, LTV, rate, hold) — optional, no longer a required step.
- Workflow presets, raw log stream, timeline, and the **partial-failure recovery** ("retry failed agents") panel.

---

## 12. Visual System

**On-brand by construction** (per the live-site brand guide). The current dashboard is *already* monochrome/square/Playfair+Inter — the redesign fixes the **execution**, it does not change the aesthetic.

- **Canvas:** black with near-black layers — `#000000` → `#050505` (`cre-surface`) → `#0A0A0A` (`cre-elevated`). No filled "competing panels"; structure via **hairline dividers** (`rgba(255,255,255,0.12)`).
- **Type:** **Playfair Display** headlines (600/800) with **tight negative tracking**; **Inter** for everything else; UI labels **uppercase with wide tracking (1.2–2.4px)**. Oversized headlines; generous whitespace; premium restraint.
- **Fix the anti-brand execution:** remove the global `letter-spacing: 0 !important` and the uniform tiny-uppercase treatment; establish a real **type scale**; replace boxed panels with hairline structure; cut badge density. Emphasis comes from **size + weight + space**, not chrome.

**Functional color palette** (≈90% monochrome; color only on **state markers** — spine dots, the live stream, tags, the package meter):

| State | Color | Token |
|---|---|---|
| Live / working | blue ≈ `#56A8F0` | **NEW** token (e.g. `cre-live`) |
| Done / verified | green `#2DB87A` | `cre-success` (exists) |
| Needs your eye | amber `#D9B56C` | `cre-warning` (exists) |
| Blocked / risk | red `#EF4444` | `cre-danger` (exists) |
| Idle / pending | gray `#A3A5B3` | `cre-info` (exists) |

Only one new token is required; the rest already exist in `tailwind.config.js`.

---

## 13. Thin Backend Hooks (to confirm against existing API during planning)

The everyday path is presentation over existing endpoints (`/api/deal`, `/api/deals`, workspace upload/extract/apply/review/criteria/export, `/api/run/*`, `/api/workflows`, WebSocket events). The genuinely new affordances:

1. **Single-agent dispatch** — run one named agent (or a small subset) on demand and stream it to the panel. *Likely builds on the existing workflow-launch + `codexMaxAgents` + per-agent checkpoints + the "rerun failed agents" mechanism.* **Confirm feasibility / shape during planning.**
2. **Inline value override** — edit an auto-populated field directly, with provenance + audit retained. *Likely reuses `applyExtraction` / `reviewExtraction` / `saveCriteria`; needs a direct-edit affordance + override record.* **Confirm.**
3. **Per-agent output stream** — the panel subscribes to one agent's events. *Likely a filtered view of existing WS `storyEvents` / `agentCheckpoints`.* **Confirm.**
4. **Command-bar routing** — v1 is a static intent→workflow/agent map over the existing catalog; no new model dependency.

---

## 14. Suggested Phasing (the implementation plan will detail this)

1. **Frame & visual system** — the persistent shell (header, spine replacing tabs, command-bar shell, feed), type scale, color tokens, decluttering. Pure presentation.
2. **Intake** — auto-apply record, inline edit, flags, provenance, single forward action; front-door unification.
3. **Agent panel** — summon / watch / read / re-task; command-bar dispatch; Your Team rail.
4. **Advanced drawer + polish** — knobs relocated, recovery panel, IC assembly, demo pass.

---

## 15. Open Questions (resolve in spec review or early planning)

- Exact **"live" blue** hex (placeholder `#56A8F0`).
- Command-bar v1: **static intent map** (proposed) vs. an LLM router.
- How much **Terminal density** to borrow inside number-heavy stages (Underwriting/Financing) — base is Editorial Premium; denser data cells allowed within a stage.
- Confirm the three **thin backend hooks** (§13) are as light as assumed against the real API.

---

## 16. Reference — working mockups

Local visual-companion mockups (not committed; under `.superpowers/brainstorm/.../content/`): `paradigms.html`, `blend.html`, `intake.html`, `agent-drawer.html`, `visual-style.html`, `color-system.html`.
