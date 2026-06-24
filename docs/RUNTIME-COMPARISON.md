# Runtime Comparison: Offline Demo vs Live Codex Agents

The project has two runtime paths. The dashboard's operator launch lane is live Codex / ChatGPT execution. Use the offline deterministic demo when you need a no-credential product tour, screenshots, or CI-safe validation.

| Question | Offline deterministic demo | Live Codex / ChatGPT execution |
|---|---|---|
| Best for | Screenshots, docs, local product demo, CI-safe validation | Main operator workflow and testing the markdown agent catalog against a real LLM runtime |
| Requires API keys? | No | No repo-stored API keys; uses the user's local Codex CLI / ChatGPT login |
| Requires ChatGPT/Codex login? | No | Yes, via `codex login` / dashboard **Login to ChatGPT** |
| External network calls during run? | No AI calls during the demo run | Yes, selected prompts and deal context are sent through the authenticated Codex CLI session; dashboard workflow launches keep live web search on by default and API launches can pass `codexSearch: true` to forward `--search` |
| Deterministic? | Yes: sample Parkview deal, fixed scenario, fixed seed | No: model output can vary by run |
| Default command | `npm run demo` | `npm run codex:smoke`, `npm run codex:run`, or dashboard-launched Codex workflows |
| Strong validation command | `npm run verify:v3` | `npm run codex:status` first, then inspect run manifests and package artifacts |
| Main artifacts | `data/status/`, `data/phase-outputs/`, `data/reports/` | `data/codex-runs/`, plus dashboard-readable status/package artifacts under `data/status/` and `data/reports/` |
| Document intelligence | Local parsers and parser `.venv`; readable scanned PDFs use a local review-gated OCR bridge | Same local parser boundary before any live agent workflow consumes approved evidence |
| Dashboard experience | Fully local sample workspace, Guided Demo Mode, screenshots | Default workflow launches, live workpapers, and story events when the local Codex runner completes agents |
| Secret handling | No credentials needed | Credentials stay outside the repo; dashboard status returns booleans only and must never expose token/cookie contents |
| Public positioning | Safe fallback for README screenshots, demos, release notes, and CI | Main lane for users who understand the data-sharing boundary |

## Recommended Evaluation Path

1. Install dependencies with `npm install`.
2. Check live auth with `npm run codex:status`, or use the dashboard **Login to ChatGPT** button.
3. Start the dashboard with `npm run dashboard`.
4. Drop a deal package, review source-backed fields, and launch the selected workflow with the default Codex runtime.
5. Use `npm run demo` and **Start Guided Demo** only when you need the deterministic sample tour.
6. Run `npm run verify:v3` before publishing screenshots, docs, or release notes.

## Safety Notes for Live Runs

- Do not run live Codex workflows on confidential deal data unless that data is approved for the user's Codex / ChatGPT environment.
- When live web search is enabled, agents may query external sources through the Codex CLI in addition to sending selected prompts and approved deal context.
- Do not commit runtime artifacts from `data/`; they are local outputs and may contain deal context.
- Keep authentication outside the repository. If a future integration needs credentials, document the storage boundary before adding code.
- Redact tokens, cookies, connection strings, or secrets from logs, screenshots, issue bodies, and sample artifacts.
- Scanned/image-only PDFs are never sent to an external OCR service by this repo. Readable PDFs are rendered locally with PyMuPDF, OCR'd with `tesseract.js`, and returned through the same source-review gate; unsupported or low-confidence OCR remains pending with warnings.

## Operator Rule of Thumb

If the goal is to operate on a deal or test the specialist prompt catalog with a real model, use Codex after confirming authentication and data approval. If the goal is a stable product tour or CI proof, use the offline demo.
