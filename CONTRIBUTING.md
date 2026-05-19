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

## Questions?

Open an issue with the `question` label.
