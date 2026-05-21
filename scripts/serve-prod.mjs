#!/usr/bin/env node
/**
 * Production self-host serve path (single-operator, loopback-default).
 *
 * Serves the pre-built dashboard static bundle (dashboard/dist) AND runs the
 * existing local API/WebSocket server (dashboard/server/watcher.ts) together,
 * so an operator can run the "production" app on their own machine.
 *
 * SCOPE: single-operator self-host ONLY. This is NOT multi-tenant SaaS and NOT
 * cloud hosting. No secrets are read from or written to the repo.
 *
 * Bind defaults to loopback (127.0.0.1). The static server bind host/port can
 * be overridden via env (HOST/PORT) for cases where the operator deliberately
 * needs LAN access (e.g. a reverse proxy or a second device on a trusted
 * network). The API/WS server (watcher.ts) always stays loopback-only and is
 * intentionally never exposed directly — the static server reverse-proxies to
 * it. See docs/DEPLOYMENT.md.
 *
 * Usage:
 *   node scripts/serve-prod.mjs            # build must already exist; serve
 *   node scripts/serve-prod.mjs --smoke    # serve, self-test, shut down
 *
 * Env:
 *   HOST  static-server bind host (default 127.0.0.1)
 *   PORT  static-server bind port (default 4174)
 */

import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const isWindows = process.platform === 'win32'
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(__dirname, '..')
const dashboardRoot = join(repoRoot, 'dashboard')
const distRoot = join(dashboardRoot, 'dist')

// The watcher (API/WS) is hard-bound to loopback by design. Do not change.
const API_HOST = '127.0.0.1'
const API_PORT = 8081
const WS_PORT = 8080

// The static server bind is operator-configurable; loopback by default.
const STATIC_HOST = process.env.HOST && process.env.HOST.trim() ? process.env.HOST.trim() : '127.0.0.1'
const STATIC_PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 4174

const SMOKE = process.argv.includes('--smoke')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function log(scope, msg) {
  process.stdout.write(`[${scope}] ${msg}\n`)
}

// ---------------------------------------------------------------------------
// Static file serving (SPA: unknown non-/api routes fall back to index.html)
// ---------------------------------------------------------------------------

function resolveStaticPath(urlPath) {
  // Strip query/hash, decode, and normalize to prevent path traversal.
  let cleanPath
  try {
    cleanPath = decodeURIComponent(urlPath.split('?')[0].split('#')[0])
  } catch {
    // Malformed percent-encoding — treat as not found rather than throwing.
    return null
  }
  const requested = normalize(join(distRoot, cleanPath))
  // Reject anything that escapes distRoot.
  if (requested !== distRoot && !requested.startsWith(distRoot + (isWindows ? '\\' : '/'))) {
    return null
  }
  if (existsSync(requested) && statSync(requested).isFile()) {
    return requested
  }
  return null
}

function serveStatic(req, res) {
  const urlPath = req.url || '/'
  let filePath = resolveStaticPath(urlPath === '/' ? '/index.html' : urlPath)

  // SPA fallback: serve index.html for client-side routes (no extension).
  if (!filePath && !extname(urlPath.split('?')[0])) {
    const indexPath = join(distRoot, 'index.html')
    if (existsSync(indexPath)) filePath = indexPath
  }

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  createReadStream(filePath).pipe(res)
}

// ---------------------------------------------------------------------------
// Reverse proxy: /api/* -> loopback API (8081). Preserves CORS/loopback checks
// in watcher.ts because requests arrive at the watcher from 127.0.0.1.
// ---------------------------------------------------------------------------

function proxyApi(req, res) {
  const headers = { ...req.headers, host: `${API_HOST}:${API_PORT}` }
  const proxyReq = httpRequest(
    {
      host: API_HOST,
      port: API_PORT,
      method: req.method,
      path: req.url,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )
  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    }
    res.end(JSON.stringify({ error: `Upstream API unavailable: ${err.message}` }))
  })
  req.pipe(proxyReq)
}

// ---------------------------------------------------------------------------
// WebSocket proxy: /ws -> loopback WS server (8080). Raw TCP tunnel on upgrade.
// ---------------------------------------------------------------------------

function proxyWebSocketUpgrade(req, clientSocket, head) {
  const upstream = connect(WS_PORT, API_HOST, () => {
    const headerLines = [`GET ${req.url} HTTP/1.1`]
    const headers = { ...req.headers, host: `${API_HOST}:${WS_PORT}` }
    for (const [key, value] of Object.entries(headers)) {
      headerLines.push(`${key}: ${value}`)
    }
    upstream.write(headerLines.join('\r\n') + '\r\n\r\n')
    if (head && head.length) upstream.write(head)
    upstream.pipe(clientSocket)
    clientSocket.pipe(upstream)
  })
  upstream.on('error', () => clientSocket.destroy())
  clientSocket.on('error', () => upstream.destroy())
}

// ---------------------------------------------------------------------------
// Watcher (API/WS server) lifecycle — spawn the existing loopback server.
// ---------------------------------------------------------------------------

function spawnWatcher() {
  const command = isWindows ? 'npx.cmd' : 'npx'
  const child = spawn(command, ['tsx', 'server/watcher.ts'], {
    cwd: dashboardRoot,
    stdio: 'pipe',
    windowsHide: true,
    shell: isWindows,
  })
  child.stdout.on('data', (c) => process.stdout.write(`[watcher] ${c}`))
  child.stderr.on('data', (c) => process.stderr.write(`[watcher] ${c}`))
  return child
}

async function isApiReady() {
  return new Promise((resolveReady) => {
    const req = httpRequest(
      { host: API_HOST, port: API_PORT, path: '/api/run/status', method: 'GET', timeout: 1500 },
      (res) => {
        res.resume()
        resolveReady(res.statusCode === 200)
      },
    )
    req.on('error', () => resolveReady(false))
    req.on('timeout', () => {
      req.destroy()
      resolveReady(false)
    })
    req.end()
  })
}

async function waitForApi(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isApiReady()) return true
    await sleep(500)
  }
  return false
}

async function killWatcher(child) {
  if (!child || child.killed) return
  if (isWindows && child.pid) {
    await new Promise((done) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.on('exit', () => done())
      killer.on('error', () => done())
    })
    return
  }
  child.kill('SIGTERM')
}

// ---------------------------------------------------------------------------
// Smoke check: fetch served index.html (expect 200 + HTML) and /api/run/status
// (expect 200 + JSON), then shut everything down cleanly.
// ---------------------------------------------------------------------------

async function runSmoke(staticServer, watcher) {
  const base = `http://${STATIC_HOST === '0.0.0.0' ? '127.0.0.1' : STATIC_HOST}:${STATIC_PORT}`
  let failed = false

  // 1. index.html
  try {
    const res = await fetch(`${base}/`)
    const body = await res.text()
    const ct = res.headers.get('content-type') || ''
    const ok = res.status === 200 && ct.includes('text/html') && body.includes('<div id="root">')
    log('smoke', `GET ${base}/ -> ${res.status} ${ct}`)
    log('smoke', `  first bytes: ${JSON.stringify(body.slice(0, 60))}`)
    if (!ok) failed = true
  } catch (err) {
    log('smoke', `GET ${base}/ FAILED: ${err.message}`)
    failed = true
  }

  // 2. /api/run/status (proxied to loopback API)
  try {
    const res = await fetch(`${base}/api/run/status`)
    const body = await res.text()
    const ct = res.headers.get('content-type') || ''
    let parsed = null
    try {
      parsed = JSON.parse(body)
    } catch {
      /* not JSON */
    }
    const ok = res.status === 200 && ct.includes('application/json') && parsed !== null
    log('smoke', `GET ${base}/api/run/status -> ${res.status} ${ct}`)
    log('smoke', `  JSON: ${JSON.stringify(parsed).slice(0, 120)}`)
    if (!ok) failed = true
  } catch (err) {
    log('smoke', `GET ${base}/api/run/status FAILED: ${err.message}`)
    failed = true
  }

  // Shut down cleanly.
  await new Promise((done) => staticServer.close(() => done()))
  await killWatcher(watcher)

  if (failed) {
    log('smoke', 'RESULT: FAIL')
    process.exit(1)
  }
  log('smoke', 'RESULT: PASS')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(join(distRoot, 'index.html'))) {
    log('serve', `No build found at ${distRoot}. Run: npm --prefix dashboard run build`)
    process.exit(1)
  }

  const watcher = spawnWatcher()

  const staticServer = createServer((req, res) => {
    const url = req.url || '/'
    if (url.startsWith('/api/')) {
      proxyApi(req, res)
      return
    }
    serveStatic(req, res)
  })

  staticServer.on('upgrade', (req, clientSocket, head) => {
    if ((req.url || '').startsWith('/ws')) {
      proxyWebSocketUpgrade(req, clientSocket, head)
    } else {
      clientSocket.destroy()
    }
  })

  const cleanup = async (code) => {
    await new Promise((done) => staticServer.close(() => done()))
    await killWatcher(watcher)
    process.exit(code)
  }
  process.on('SIGINT', () => cleanup(130))
  process.on('SIGTERM', () => cleanup(143))

  await new Promise((done) => staticServer.listen(STATIC_PORT, STATIC_HOST, done))
  log('serve', `Static dashboard listening on http://${STATIC_HOST}:${STATIC_PORT}`)
  log('serve', `Proxying /api -> http://${API_HOST}:${API_PORT}, /ws -> ws://${API_HOST}:${WS_PORT}`)

  const apiReady = await waitForApi(120_000)
  if (!apiReady) {
    log('serve', 'API/WS server (watcher) did not become ready within 120s.')
    await cleanup(1)
    return
  }
  log('serve', `API/WS server ready at http://${API_HOST}:${API_PORT}`)

  if (SMOKE) {
    await runSmoke(staticServer, watcher)
    return
  }

  log('serve', 'Production self-host running. Press Ctrl+C to stop.')
}

main().catch(async (err) => {
  log('serve', `Fatal: ${err instanceof Error ? err.stack : String(err)}`)
  process.exit(1)
})
