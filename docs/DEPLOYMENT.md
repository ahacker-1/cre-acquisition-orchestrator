# Deployment (Single-Operator Self-Host)

Reproducible steps to run the **built** dashboard in a local "production" mode on
your own machine. This bundles the compiled UI with the local API + WebSocket
server behind a single static server.

> **Scope / non-goal.** This is a **single-operator self-host** setup only. It is
> **NOT** multi-tenant SaaS and **NOT** cloud hosting. The server binds to
> loopback (`127.0.0.1`) by default and is intended to run on the operator's own
> workstation. There is no auth layer, no tenant isolation, and no horizontal
> scaling here — do not put this on the public internet as-is.
>
> **No secrets in the repo.** Nothing in this flow reads or writes credentials to
> the repository. Codex/ChatGPT auth (if used) is managed by the Codex CLI
> outside this repo. Never commit a real `.env` — only the `.env.example`
> template is tracked.

---

## What "production self-host" means here

The development workflow (`npm run dashboard`) runs Vite's dev server with
hot-reload and a dev proxy. The production self-host path instead:

1. **Builds** the dashboard to static files (`tsc` typecheck + `vite build` →
   `dashboard/dist/`).
2. **Serves** those static files AND runs the existing local API/WebSocket
   server (`dashboard/server/watcher.ts`) together, via a single entry point:
   `scripts/serve-prod.mjs`.

Three processes/ports are involved:

| Component                 | Port   | Bind                | Configurable           |
| ------------------------- | ------ | ------------------- | ---------------------- |
| Static server (built UI)  | `4174` | `127.0.0.1` default | Yes — `HOST` / `PORT`  |
| Local REST API (watcher)  | `8081` | `127.0.0.1` (fixed) | No — loopback by design |
| WebSocket server (watcher)| `8080` | `127.0.0.1` (fixed) | No — loopback by design |

The static server reverse-proxies `/api/*` → `127.0.0.1:8081` and `/ws` →
`127.0.0.1:8080`, mirroring the Vite dev proxy. The API and WebSocket servers are
**intentionally hard-bound to loopback** inside `watcher.ts` and are never exposed
directly; only the static server's bind is operator-configurable.

---

## Prerequisites

- Node.js 18+ and npm 9+ (see [PREREQUISITES.md](PREREQUISITES.md)).
- Fresh-clone setup completed from the repository root:

```bash
npm install
npm run setup
```

This installs root/dashboard dependencies and parser dependencies. If you are
only serving an already-built dashboard and do not need parser verification, the
minimum dashboard dependency install is `npm --prefix dashboard install`.

---

## 1. Build

From the repository root:

```bash
npm --prefix dashboard run build
```

This runs the server typecheck, the app typecheck, and `vite build`, emitting the
static bundle to `dashboard/dist/` (`index.html` + `assets/`).

## 2. Serve

From the repository root:

```bash
node scripts/serve-prod.mjs
```

Then open `http://127.0.0.1:4174` in your browser. Press `Ctrl+C` to stop both the
static server and the API/WS server cleanly.

If the build is missing, the script exits early and tells you to run the build
first.

### npm shortcut

The root `package.json` already wires the same entry point:

```bash
npm run serve
```

## 3. Verify (smoke check)

The serve entry has a built-in smoke check that starts everything on loopback,
fetches the served `index.html` (expects `200` + HTML) and `GET /api/run/status`
(expects `200` + JSON), verifies the `/ws` WebSocket proxy returns a `101`
upgrade response, then shuts down cleanly:

```bash
node scripts/serve-prod.mjs --smoke
```

Expected output (abridged):

```
[serve] Static dashboard listening on http://127.0.0.1:4174
[serve] API/WS server ready at http://127.0.0.1:8081
[smoke] GET http://127.0.0.1:4174/ -> 200 text/html; charset=utf-8
[smoke] GET http://127.0.0.1:4174/api/run/status -> 200 application/json
[smoke] GET ws://127.0.0.1:4174/ws -> HTTP/1.1 101 Switching Protocols
[smoke] RESULT: PASS
```

The process exits `0` on PASS and `1` on FAIL — usable in CI or a pre-flight
check.

For the full release/demo gate that also proves parsers, evidence lineage,
dashboard build, npm audits, offline evaluation, production smoke, and browser
E2E together, run from the repository root:

```bash
npm run verify:v3
```

---

## Environment variables

Configure via shell env or a git-ignored `dashboard/.env` (copy from
`dashboard/.env.example`):

| Var    | Default     | Applies to                | Notes                                             |
| ------ | ----------- | ------------------------- | ------------------------------------------------- |
| `HOST` | `127.0.0.1` | Static server bind host   | Loopback default. See "Changing the bind" below.  |
| `PORT` | `4174`      | Static server bind port   | Any free port.                                     |

The API (`8081`) and WebSocket (`8080`) ports are fixed loopback binds in
`watcher.ts` and are not env-configurable by design.

```bash
# Example: serve on a different loopback port
PORT=5000 node scripts/serve-prod.mjs
```

---

## Changing the bind (and why you usually shouldn't)

`HOST` defaults to `127.0.0.1` so the UI is reachable only from the operator's own
machine. The loopback default is a deliberate safety property: the API enforces
loopback-only and same-origin (`localhost` / `127.0.0.1`) checks, so a default
install cannot be reached from other machines.

You may set `HOST` to a LAN address (e.g. `0.0.0.0` or a specific interface IP)
**only if** you deliberately need another device on a network **you fully control**
to reach the UI — for example, viewing the dashboard from a tablet on your home
network, or placing it behind your own reverse proxy.

Be aware of the trade-offs when you do this:

- The **static UI** becomes reachable from other devices on that network.
- The **API and WebSocket servers remain loopback-only**. Cross-origin browser
  requests from a non-`localhost`/`127.0.0.1` origin are rejected by the API's
  origin check, and direct (non-proxied) connections from other hosts are
  rejected by the loopback check. This is intentional and is **not** changed by
  setting `HOST`.
- There is still no authentication. Treat any non-loopback bind as "trusted LAN
  only" and never expose it to the public internet.

If you need true remote/multi-user access, that is out of scope for this project
and would require a proper auth + tenancy layer that does not exist here.

---

## Related

- [DASHBOARD-SETUP.md](DASHBOARD-SETUP.md) — development workflow and feature tour.
- [PREREQUISITES.md](PREREQUISITES.md) — required software.
- [API-REFERENCE.md](API-REFERENCE.md) — local REST API routes.
