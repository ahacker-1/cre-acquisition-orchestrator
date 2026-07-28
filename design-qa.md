# Design QA — Conversation Desk

## Reference and target

- Selected direction: Option 2, “Conversation Desk.”
- Source visual: internal design exploration used during implementation; the release evidence below is committed and portable.
- Source dimensions: 1487 × 1058 pixels.
- Implementation state: `UI Audit First Deal` → `Rent Roll Analyst` → completed, cited occupancy answer.
- Release implementation screenshot: [`docs/assets/agent-conversation.jpg`](docs/assets/agent-conversation.jpg).
- Chat-first landing screenshot: [`docs/assets/conversation-desk.jpg`](docs/assets/conversation-desk.jpg).
- Searchable specialist picker: [`docs/assets/specialist-picker.jpg`](docs/assets/specialist-picker.jpg).
- Mobile behavior is covered by the Pixel 5 browser regression in `dashboard/e2e/conversation-home.spec.ts`.

## Density normalization

- The working source was normalized to the implementation viewport for like-for-like review during development.
- The committed release screenshots preserve the states needed to judge the rail proportion, header hierarchy, picker containment, conversation rhythm, cited-source rows, and composer without relying on a machine-local path.

## Final comparison findings

- Layout: passed. The persistent deal/thread rail, specialist canvas, fixed composer, header actions, and dense editorial spacing match the selected direction.
- Visual language: passed. Graphite surfaces, copper rules and actions, serif display type, square hairlines, restrained status colors, and low-chrome controls are consistent with the source.
- Conversation hierarchy: passed. User and specialist roles are explicit, assistant answers receive the dominant editorial treatment, and citations appear as full-width evidence rows.
- Real-state fidelity: passed. The implementation uses actual deal names, registered agents, retained threads, source documents, live activity, and validated citations instead of hard-coded concept data.
- Opening comprehension: passed. The fresh homepage visibly communicates `1 · Choose a deal`, `2 · Choose a specialist`, and `3 · Ask`, includes editable starter questions, and does not silently resume an older thread.
- Responsive behavior: passed. At 393 pixels the deal and recent-conversation rails scroll within their own containers, the page has no horizontal overflow, and the guided start plus composer remain reachable in one normal vertical scroll.

## Iteration history

- Pass 1 P2: Assistant text and card hierarchy were too compact; speaker roles were understated. Fixed with page-specific editorial answer type, role labels, timestamps, and full-width source rows.
- Pass 1 P2: The mobile header could crowd or clip action labels. Fixed with compact icon-first actions and a narrower mobile hierarchy.
- Pass 1 P3: The left rail was wider than the selected direction. Reduced the desktop rail to 360 pixels.
- Pass 2 P1: Browser Back could restore the deal and agent before the new deal’s thread catalog arrived, leaving the requested thread unloaded. Fixed by binding restoration to the loaded catalog’s deal ID; the focused regression now passes.
- Pass 2 P1: The root route opened the latest conversation without explaining what to do. Changed it to a fresh-first landing state with numbered guidance, editable starter prompts, lazy thread creation, and explicit recent-thread resumption.
- Final P0/P1/P2: none observed.

## Interaction and state checks

- Root route: preselects a useful deal and agent but opens a fresh, understandable conversation state.
- Starter prompt: stages focused, editable composer text and does not create or send a thread.
- First send: lazily creates one thread with the selected document IDs, sends the message, and writes the exact deal/agent/thread URL.
- Deal and specialist selection: resets to a fresh conversation without silently loading old history.
- Recent thread and deep link: restore the exact deal, specialist, messages, documents, and citations.
- Browser Back: restores the prior deal/agent/thread after cross-deal navigation.
- Workspace round-trip and New Deal round-trip: preserve conversation selection.
- Empty library, disabled conversations, and no-document states: each expose a clear next action.
- Live activity, completed cited answer, cancellation/retry, disconnected state, and document selection: retained.
- Mobile: Pixel 5 E2E and 393-pixel visual pass completed with `scrollWidth === innerWidth`.
- Browser console: a fresh-load review returned no warnings or errors.

## Automated evidence

- Focused Conversation Desk regressions cover desktop Chromium and Pixel 5, including picker search,
  deep links, Back/Forward restoration, stale-request races, mobile thread resumption, and draft
  preservation after a failed send.
- Dashboard typecheck: passed.
- Production build: passed.
- Full `npm run verify:v3` passed through the local core gate and the release pull request's GitHub CI
  core and browser-E2E jobs before `v3.6.0` was tagged and published.

## Intentional P3 deviations

- Real source chips remain directly visible above the composer instead of hiding them behind one “Attach source” menu; this makes deal evidence and scope inspectable before sending.
- The global header remains slightly more compact than the concept so the product-level Advanced, Deals, and New Deal actions stay available.
- The landing state adds numbered guidance and editable starter questions; these are product requirements absent from the active-thread concept visual.

final result: passed
