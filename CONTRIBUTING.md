# Contributing

Thanks for your interest in the CRE Acquisition Orchestrator! Contributions are welcome.

## How to Contribute

1. **Open an issue first** - Before starting work, open an issue describing what you'd like to change. This ensures we're aligned before you invest time.

2. **Fork and branch** - Fork the repo, create a feature branch from `main`.

3. **Make your changes** - Follow the existing code style and patterns.

4. **Test your changes** - Run the smallest relevant validation first, then the stronger release path when touching demo, dashboard, contract, or release-facing docs:
   ```powershell
   npm run demo:verify
   npm --prefix dashboard run build
   ```

   Browser-level changes should also run `npm --prefix dashboard run test:e2e`. Live Codex changes should start with `npm run codex:status`; do not commit artifacts from `data/`.

5. **Submit a PR** - Reference the issue in your pull request description.

## Running Locally

```powershell
# Clone your fork
git clone https://github.com/YOUR_USERNAME/cre-acquisition-orchestrator.git
cd cre-acquisition-orchestrator

# Run the simulation
npm run demo

# Start the dashboard
npm run dashboard
# Dashboard available at http://localhost:5173
```

The dashboard stores local deal workspaces, uploaded source documents, extraction previews, presets, and run snapshots under `data/`. These runtime files are ignored by git and should not be included in pull requests.

Start with the offline deterministic demo for product, docs, and screenshot work. The optional Codex / ChatGPT runtime has a different data-sharing boundary; compare the paths in [`docs/RUNTIME-COMPARISON.md`](docs/RUNTIME-COMPARISON.md) before testing live-agent workflows.

## Code Style

- JavaScript/Node.js for scripts and orchestration engine
- TypeScript + React for the dashboard
- Markdown for agent prompts and documentation
- JSON Schema for data contracts

## Adding or Extending a Specialist Agent

The most useful agent contributions are reviewable end-to-end, not just a new prompt file. Use this checklist when adding a specialist role or materially changing an existing one:

1. **Start with the role contract** - define the agent's responsibility, required inputs, expected outputs, dependencies, escalation path, and downstream handoff.
2. **Update the prompt catalog** - add or edit the Markdown role file under the relevant orchestrator/agent directory and keep terminology aligned with the existing CRE vocabulary.
3. **Add or update schemas** - if the agent produces structured output, add a JSON Schema contract or update the existing one so validation fails clearly when the output drifts.
4. **Wire the workflow** - update the relevant workflow/phase configuration so the orchestrator can schedule the agent and downstream agents can consume its output.
5. **Add sample artifacts** - update Parkview or fixture outputs when the change affects public demo workpapers, package state, or release screenshots.
6. **Document the operator-facing behavior** - update `docs/AGENT-CATALOG.md`, architecture docs, or the relevant operator guide so contributors can inspect the role without reading implementation code.
7. **Run targeted validation** - start with `npm run validate`, then run `npm test` and `npm --prefix dashboard run build` when the change affects runtime artifacts or dashboard surfaces.

Do not commit real deal files, credentials, private lender terms, or client-identifying artifacts. Redact sensitive examples before adding fixtures or docs.

## Public Issue Seeds

Approval-ready issue drafts for the next public roadmap items live in [`docs/ISSUE-SEEDS.md`](docs/ISSUE-SEEDS.md). Use them as starting points; do not publish, label, or milestone issues automatically without maintainer approval.

## Questions?

Open an issue with the `question` label.
