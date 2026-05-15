# v2.4.0 - Agentic Deal Team Workspace

This release turns the operator workbench into an agentic deal-team workspace. The product journey is now explicit: drop source documents, state the acquisition goal, watch specialist agents coordinate, answer only the blockers, and review the acquisition package.

## What Changed

- Added the new Acquisition Command surface as the executive center of the deal workspace.
- Added mission metadata to deal creation and persistence so goal text, outcome intent, and recommended workflow survive the full deal lifecycle.
- Reframed workspace navigation around the user journey: Command, Evidence, Deal Team, Workpapers, IC Package, and Controls.
- Added a MissionControl component that shows package readiness, orchestration stages, team pulse, latest material movement, evidence state, and decision-package status.
- Added visible agent communication events across the story pipeline: `agent_message`, `agent_handoff`, `agent_review`, `agent_dependency`, and `phase_handoff`.
- Updated the runtime so specialist agents and phase orchestrators emit assignment, dependency, handoff, review, phase brief, and final package handoff events.
- Reworked the Deal Team view so agents appear as human-readable specialist roles with active/filed/queued status language instead of raw checkpoint slugs.
- Fixed Due Diligence phase alias handling across `due-diligence`, `due_diligence`, and `dueDiligence` checkpoint forms.
- Reframed Workpapers & Evidence as a first-class review surface for filed agent artifacts and source-backed materials.
- Strengthened the document-first homepage around the core promise: “Drop the deal. Watch the team go to work.”
- Added sample-evidence/completed-run handling so demo states do not contradict completed package states with missing-source or blocked-workstream copy.
- Updated dashboard e2e coverage for the Command surface, visible handoffs, specialist rows, phase status, and package assembly.
- Updated README and operator docs to describe the open-source multi-orchestrator workspace and clarify the 31-role catalog.

## Operator Impact

- First-time users see a clearer product journey before they understand the underlying workflow engine.
- Operators can distinguish the polished executive Command surface from advanced controls and diagnostic feed details.
- Deal teams can see which specialists are active, what they filed, and what moved between workstreams.
- Package review now feels connected to the agent work that produced it, rather than disconnected from the orchestration timeline.
- Demo/sample states are more coherent because completed simulations show the sample evidence bundle as the source of the package instead of implying live documents are missing.

## Honest Scope

- This is still a local-first reference architecture and educational framework, not investment, legal, or underwriting advice.
- Simulation remains the safe default runtime.
- Live Codex / ChatGPT execution remains optional and depends on the user’s local Codex CLI authentication.
- PDF and Excel extraction remain stored/routed as extraction-pending unless a source-backed parser path exists.
- The new story communication events are additive and optional; older checkpoint consumers should continue to work.

## Verified For Release

- `git diff --check`
- `npm --prefix dashboard run build`
- `npm --prefix dashboard run test:e2e`
- `npm run demo`
- `npm run validate`
- `npm run validate:guides`
- `npm test`
- `npm --prefix dashboard audit --omit=dev --audit-level=high`

## Release Tag

- Git tag: `v2.4.0`
- Release commit: `b05771e4479e041467f9d71c53a73dd7b8f0c1f6`
