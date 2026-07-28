# Release Notes v3.6.0 - Conversation Desk + Persistent Agent Conversations

Released: 2026-07-28

v3.6.0 turns the CRE Acquisition Orchestrator into a conversation-first workspace. The dashboard
now opens on a guided Conversation Desk where an operator chooses a deal, chooses one of the 31
registered agents, selects the source documents that agent may inspect, and asks a plain-English
question. Each thread is retained with the deal, restores from its URL after reload, and stays
connected to the same documents, citations, recorded workflow activity, and filed workpapers.

## Highlights

- **Chat-first home** - the root route now explains the opening workflow as `Choose a deal`,
  `Choose a specialist`, and `Ask`, with editable starter questions, recent conversations, New Deal,
  source-upload, guided-demo, and full-workspace actions in the same coherent starting surface.
- **Persistent specialist conversations** - every thread is scoped to one deal and registered agent,
  with durable messages, selected-document attachments, turn state, citations, cancellation, and
  retry history.
- **Shareable navigation state** - `deal`, `agent`, and `thread` URL parameters restore the exact
  conversation through deep links, reloads, browser Back/Forward, and round trips to the full deal
  workspace.
- **Live without hidden reasoning** - compact WebSocket activity labels communicate queued,
  reading, analyzing, answering, completed, failed, cancelled, and session-reset states while REST
  remains the authoritative transcript after reload or reconnect.
- **A specialist picker built for 31 agents** - the former browser-native dropdown is now a compact,
  searchable, dark-theme picker with agent context, selected-state feedback, a bounded scroll area,
  and full keyboard operation.

## Conversation Desk

The new home keeps the operator's three decisions visible instead of dropping them into a resumed
workspace without context:

1. Select the deal whose evidence should be in scope.
2. Search for and select the specialist best suited to the question.
3. Confirm the source documents, edit a starter question or write a new prompt, and send.

A new thread is created lazily on the first send. Selecting a different deal or specialist opens a
fresh conversation state instead of silently loading unrelated history; selecting a recent thread
explicitly resumes its exact messages and evidence. Empty libraries, deals without documents,
disabled conversations, disconnected sessions, unavailable sources, and read-only samples all
surface a specific next action.

The conversation canvas has also been rebalanced for longer answers and source review. Speaker
roles, timestamps, answer typography, citation rows, live state, document controls, and the composer
remain legible and reachable on desktop and mobile without horizontal page overflow.

## Persistent, Source-Backed Threads

Conversation history lives under `data/deals/{dealId}/conversations/` as deal-local thread metadata,
append-only messages and events, and turn state. The browser can:

- create and list threads across the complete 31-agent registry;
- reload an authoritative transcript after refresh or reconnect;
- attach only documents from the current deal;
- submit idempotent messages with an explicit document scope;
- cancel the exact queued or active turn;
- retry the original request after a cancelled or failed turn; and
- expand server-derived citations that identify the file, source location, evidence state, and
  supporting excerpt.

The full deal workspace uses the same retained conversation model in its specialist panel. An
operator can therefore continue a chat while keeping the agent's recorded workflow work and filed
workpaper in view.

## Runtime Boundary and Recovery

Conversation execution is separate from the workflow `RunManager`. It allows one active turn per
thread and a bounded number of simultaneous independent threads, with configurable concurrency and
queue limits. The manager owns explicit session resume, cancellation, timeouts, structured-response
validation, and startup reconciliation for interrupted work.

Document conversations run from a fresh read-only evidence root. Shell, browser, app, plugin, MCP,
memory, skill, and web capabilities are disabled. For each live turn, the server-built prompt
contains the selected documents' extracted evidence, the current deal record, underwriting
criteria, approved fields, the selected agent's role guide, the recent conversation transcript,
and the operator's current question. Browser payloads do not expose runtime session IDs, raw runtime
output, tool arguments, commands, absolute paths, or hidden model reasoning. Conversation turns
cannot edit deal fields, approvals, source files, or workpapers.

Invalid agent IDs, unsafe deal/thread/turn identifiers, unknown or cross-deal documents, oversized
messages, and concurrent work in the same thread are rejected before a runtime begins.

## First-Run, Workflow, and Accessibility Audit

The release incorporates a full first-run and workflow audit rather than treating chat as an
isolated screen:

- clarifies the split between Conversation Desk, New Deal document intake, Guided Demo, and the
  Advanced/full workspace;
- fixes the restoration race that could leave a Back/Forward deep link waiting on the wrong deal's
  thread catalog;
- preserves selection across workspace and New Deal round trips;
- keeps document upload, recent conversations, live status, evidence review, and full workflow
  navigation discoverable from the opening experience;
- gives active, completed, cancelled, failed, disconnected, no-document, and disabled states clear
  status and recovery controls;
- prevents narrow-screen horizontal overflow and keeps navigation and the composer reachable; and
- adds accessible names, status semantics, focus behavior, touch-friendly controls, and a searchable
  specialist picker with Arrow, Home, End, Enter, and Escape support.

## Updated Visual Walkthrough

The README walkthrough is refreshed with current product captures:

- [Conversation Desk](docs/assets/conversation-desk.jpg) - the guided chat-first opening state.
- [Specialist picker](docs/assets/specialist-picker.jpg) - search and selection across the agent
  directory without the oversized native browser menu.
- [New Deal source package](docs/assets/new-deal-source-package.jpg) - upload and deterministic-demo
  entry points in one source-first surface.
- [Retained agent conversation](docs/assets/agent-conversation.jpg) - a deal-scoped answer with live
  state, selected documents, and expandable source citations.
- [Uploaded data inspector](docs/assets/uploaded-data-inspector.jpg) - source-table fields and rows
  before extracted values are trusted.
- [Extraction review](docs/assets/source-extraction-review.jpg) - candidate evidence and explicit
  approve, reject, and waive controls.

The first-deal guide, proof path, API reference, WebSocket event reference, dashboard architecture,
and design QA record now describe the same end-to-end workflow.

## Configuration

- `CRE_AGENT_CONVERSATIONS=0` disables new conversations without removing stored history.
- `CRE_AGENT_CONVERSATION_CONCURRENCY` controls independent local turns (default `2`, maximum `4`).
- `CRE_AGENT_CONVERSATION_QUEUE_LIMIT` controls waiting turns (default `16`, maximum `64`).
- Live agent chat requires the optional local Codex / ChatGPT authentication path. Document upload,
  extraction review, the deterministic Parkview demo, and the rest of the local evidence workflow
  remain available without it.

## Release Gates

The `v3.6.0` release passed:

- `npm run verify:v3`
- `npm run release:check`
- `npm run validate:docs`
- `npm run validate:guides`
- `npm test`
- `npm run test:workspace`
- `npm run test:conversations`
- `npm --prefix dashboard run typecheck`
- `npm --prefix dashboard run build`
- the repository's root and dashboard dependency-audit thresholds
- focused Conversation Desk and persistent-conversation Playwright coverage on desktop and mobile
- final README link/image validation and a clean-clone release smoke

Release verification completed on 2026-07-28. The local core gate passed in full, including unit,
system, parser, workspace, conversation, TypeScript, production-build, dependency-audit, offline
evaluation, HTTP, and WebSocket smoke checks. Both GitHub CI jobs — core verification and browser
E2E — passed on the release pull request before the exact merged `main` commit was tagged and
published as `v3.6.0`.

## Safety Notes

- Live Codex conversations send the selected documents' extracted evidence, current deal record,
  underwriting criteria, approved fields, selected agent role guide, recent conversation transcript,
  and operator question through the user's authenticated local Codex CLI / ChatGPT session. Do not
  use confidential deal data unless all of that context is approved for that environment.
- Conversation answers are read-only analysis. They do not approve extracted fields, mutate deal
  records, file workpapers, or launch workflows without a separate operator action.
- Server-derived citations make the evidence scope reviewable, but they do not replace legal,
  financial, engineering, environmental, or investment review.
