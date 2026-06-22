# Release Notes v3.2.0 - Production-Scale Local QA Harness

Released: 2026-06-22

v3.2.0 adds a production-scale local QA harness and turns the public proof path into a first-class visitor flow. The release is still local-first: it uses sanitized generated data, deterministic Parkview artifacts, and loopback dashboard services without touching production data or external AI APIs.

## Highlights

- **Production-scale local data** - `npm run seed:prod-local -- --count 150` creates sanitized `QA-LOCAL-2026-*` deal workspaces with source documents, extraction artifacts, approved fields, criteria, phase state, checkpoint status, and completed-report artifacts.
- **Local data regression gate** - `npm run test:prod-local-data` validates schemas, provenance, idempotent reseeding, local output boundaries, and generated artifact sensitive-token avoidance.
- **Full user-facing QA inventory** - `docs/QA-INVENTORY.md` documents routes, states, roles, buttons, inputs, modals, workflows, acceptance criteria, and finite risk-based edge cases.
- **Evidence-backed bug log** - `docs/QA-BUG-LOG.md` records each production-scale QA defect with reproduction evidence, fix, and verification.
- **Real-user browser inventory** - Playwright now opens a 150-deal library, loads a completed seeded workspace, walks the lifecycle, checks source review and uploaded data inspection, opens underwriting and agent surfaces, and exports the IC package.
- **Public proof command** - `npm run proof` regenerates Parkview, starts the dashboard, waits for readiness, and points reviewers to `docs/PROOF-PATH.md`.

## Operator Impact

The project now has a stronger local trust loop:

1. Generate a production-scale sanitized corpus.
2. Open the dashboard as a real user.
3. Inspect uploaded source data before trusting extraction.
4. Review and approve source-backed evidence.
5. Trace evidence into workpaper context and the IC package.
6. Re-run the same path as a regression gate before release.

## Reliability Fixes

- Completed saved deals preserve checkpoint and source-backed package evidence when reopened.
- Switching saved deals clears stale workspace state.
- Manual extraction review buttons are no longer disabled by unrelated background work.
- Quick-create duplicate-ID retries and validation payloads are handled deterministically.
- API response sanitization preserves repeated safe objects.
- Browser helpers tolerate transient loopback resets and UI refresh card detachments.
- Agent drawer tests re-query the current drawer instead of stale panel instances.

## Verification

The release candidate was verified locally with:

```powershell
npm test
npm run validate:docs
npm run validate:guides
npm --prefix dashboard run typecheck
npm --prefix dashboard run test:e2e
```

The final browser pass completed with all 30 Playwright tests green.

## Notes

- The production-scale corpus is sanitized and local-only.
- No production credentials or sensitive deal files are required for the proof path.
- Live Codex/ChatGPT agent runs remain optional and outside the default local proof flow.
