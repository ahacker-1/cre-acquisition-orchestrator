import { watch } from 'chokidar';
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, readdirSync, existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { resolve, dirname, join, basename, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { RunManager, type RunMessage, type StartRunRequest } from './run-manager';
import {
  getDealRecord,
  listDealLibrary,
  markDealLaunched,
  saveUserDeal,
  validateDealConfig,
  type ValidationMode,
} from './deal-service';
import {
  getWorkflow,
  listWorkflowPresets,
  listWorkflows,
  saveWorkflowPreset,
} from './workflow-service';
import {
  applyOperatorFieldEdit,
  applySourceExtraction,
  buildRunInputSnapshot,
  evaluateLaunchReadiness,
  exportIcStarterPackage,
  extractSourceDocument,
  getDealWorkspace,
  getSourceExtraction,
  listDealDocuments,
  reviewSourceExtraction,
  saveDealCriteria,
  savePhaseState,
  saveSourceDocument,
} from './workspace-service';

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const goalHelper = require('../../scripts/lib/goal-helper') as {
  suggestSwarmGoal: (input: {
    goal?: string;
    catalog: Record<string, unknown>;
    registry: Record<string, unknown>;
    phaseMetadata: Array<Record<string, unknown>>;
    dealSummary?: Record<string, unknown>;
  }) => {
    workflowId: string;
    [key: string]: unknown;
  };
};
const runtimeCore = require('../../scripts/lib/runtime-core') as {
  PHASES: Array<Record<string, unknown>>;
};
const workflowCatalog = require('../../config/workflows.json') as Record<string, unknown>;
const agentRegistry = require('../../config/agent-registry.json') as Record<string, unknown>;
const codexCli = require('../../scripts/lib/codex-cli') as {
  getCodexStatus: (cwd?: string) => {
    installed: boolean;
    loggedIn: boolean;
    usingChatGpt: boolean;
    version: string | null;
    loginStatus: string | null;
    error: string | null;
  };
  runDetached: (command: string, args?: string[], options?: { cwd?: string }) => number | null;
};
const safePaths = require('../../scripts/lib/safe-paths') as {
  assertSafeSegment: (value: string, label?: string) => string;
  assertWithinBase: (base: string, candidate: string, label?: string) => string;
  toRelativePath: (base: string, candidate: string, label?: string) => string;
};

const customDataPath: string | undefined = process.argv[2];
const projectRoot: string = resolve(__dirname, '..', '..');
const dataRoot: string = customDataPath
  ? safePaths.assertWithinBase(projectRoot, resolve(customDataPath), 'data root')
  : join(projectRoot, 'data');

const statusDir: string = join(dataRoot, 'status');
const logsDir: string = join(dataRoot, 'logs');

// Ensure watched directories exist so chokidar doesn't throw
for (const dir of [statusDir, logsDir]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`[watcher] Created missing directory: ${dir}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CheckpointMessage {
  type: 'checkpoint';
  path: string;
  data: unknown;
}

interface LogMessage {
  type: 'log';
  path: string;
  lines: string[];
}

interface InitialMessage {
  type: 'initial';
  checkpoints: Record<string, unknown>;
  logs: Record<string, string[]>;
  events?: Record<string, unknown[]>;
  documents?: Record<string, unknown>;
}

interface StoryEventMessage {
  type: 'event';
  path: string;
  event: Record<string, unknown>;
}

type WatcherMessage = CheckpointMessage | LogMessage | InitialMessage | StoryEventMessage | RunMessage;

const logLineOffsets: Map<string, number> = new Map();
const eventLineOffsets: Map<string, number> = new Map();

function isTransientFsError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'ENOENT' || code === 'EPERM' || code === 'EBUSY';
}

function readJsonSafe(filePath: string): unknown | null {
  try {
    const raw: string = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    // Warn, not error: malformed JSON should not crash server or alarm operators
    console.warn(`[watcher] Skipping malformed JSON: ${filePath}`, (err as Error).message);
    return null;
  }
}

function readLastLines(filePath: string, count: number): string[] {
  try {
    const raw: string = readFileSync(filePath, 'utf-8');
    const lines: string[] = raw.split(/\r?\n/);
    return lines.slice(-count).filter((l) => l.length > 0);
  } catch (err) {
    if (!isTransientFsError(err)) {
      console.error(`[watcher] Failed to read log file: ${filePath}`, err);
    }
    return [];
  }
}

function readAllLines(filePath: string): string[] {
  try {
    const raw: string = readFileSync(filePath, 'utf-8');
    return raw.split(/\r?\n/).filter((l) => l.length > 0);
  } catch (err) {
    if (!isTransientFsError(err)) {
      console.error(`[watcher] Failed to read log file: ${filePath}`, err);
    }
    return [];
  }
}

function readIncrementalLines(filePath: string): string[] {
  const lines = readAllLines(filePath);
  const previousCount = logLineOffsets.get(filePath) ?? 0;

  // File was truncated or rotated, reset offset and replay all lines.
  if (lines.length < previousCount) {
    logLineOffsets.set(filePath, lines.length);
    return lines;
  }

  if (lines.length === previousCount) {
    return [];
  }

  const delta = lines.slice(previousCount);
  logLineOffsets.set(filePath, lines.length);
  return delta;
}

function normalizedRelPath(basePath: string, filePath: string): string {
  return safePaths.toRelativePath(basePath, filePath, 'API artifact path');
}

function isLockArtifactPath(relPath: string): boolean {
  return relPath.split('/').includes('.locks') || relPath.endsWith('.lock-target');
}

function repoRelativePath(filePath: string): string {
  return normalizedRelPath(projectRoot, filePath);
}

function pathForApi(value: string): string {
  if (!isAbsolute(value)) return value.replace(/\\/g, '/');
  try {
    return repoRelativePath(value);
  } catch {
    return basename(value);
  }
}

function sanitizeApiResponse(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return pathForApi(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeApiResponse(entry, seen));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeApiResponse(entry, seen)]),
  );
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const remoteAddress = req.socket.remoteAddress;
  return remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1' ||
    remoteAddress === undefined;
}

function ensureLoopbackRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (isLoopbackRequest(req)) return true;
  sendJson(res, 403, { error: 'This local-only endpoint is restricted to loopback requests.' });
  return false;
}

function safeDealId(value: string): string {
  return safePaths.assertSafeSegment(value, 'deal ID');
}

function safeRunId(value: string): string {
  return safePaths.assertSafeSegment(value, 'run ID');
}

function asRuntimeProvider(value: unknown): 'simulation' | 'codex' {
  return value === 'codex' ? 'codex' : 'simulation';
}

function asPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const nextValue = Math.round(value);
  return nextValue > 0 ? nextValue : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readCodexStatus(): Record<string, unknown> {
  const status = codexCli.getCodexStatus(projectRoot);
  return {
    installed: status.installed,
    loggedIn: status.loggedIn,
    usingChatGpt: status.usingChatGpt,
    version: status.version,
    loginStatus: status.loginStatus,
    error: status.error,
    storesCredentialsInRepo: false,
    authStorage: 'Managed by Codex CLI outside this repository',
  };
}

function startCodexLogin(): Record<string, unknown> {
  const status = codexCli.getCodexStatus(projectRoot);
  if (!status.installed) {
    return {
      started: false,
      statusCode: 400,
      error: 'Codex CLI is not installed. Install it with: npm install -g @openai/codex',
      codexStatus: readCodexStatus(),
    };
  }
  const pid = codexCli.runDetached('codex', ['login'], { cwd: projectRoot });
  return {
    started: true,
    statusCode: 202,
    pid,
    message: 'Codex login started. Choose Sign in with ChatGPT in the browser flow, then refresh status.',
    codexStatus: readCodexStatus(),
  };
}

function isRunArtifactJson(filePathOrRel: string): boolean {
  const normalized = filePathOrRel.replace(/\\/g, '/');
  return /\/run-[^/]+-(documents|manifest)\.json$/i.test(`/${normalized}`);
}

function walkFiles(dir: string, include: (entry: string, fullPath: string) => boolean): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          results.push(...walkFiles(fullPath, include));
        } else if (include(entry, fullPath)) {
          results.push(fullPath);
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  } catch {
    // Skip directories we can't read
  }
  return results;
}

function readNdjsonRawLines(filePath: string): string[] {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (err) {
    if (!isTransientFsError(err)) {
      console.error(`[watcher] Failed to read events file: ${filePath}`, err);
    }
    return [];
  }
}

function parseJsonLine(line: string, filePath: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(line);
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return null;
  } catch (err) {
    console.warn(`[watcher] Skipping malformed NDJSON line in ${filePath}`, (err as Error).message);
    return null;
  }
}

function readAllEvents(filePath: string): Record<string, unknown>[] {
  const lines = readNdjsonRawLines(filePath);
  eventLineOffsets.set(filePath, lines.length);
  return lines
    .map((line) => parseJsonLine(line, filePath))
    .filter((event): event is Record<string, unknown> => event !== null);
}

function readIncrementalEvents(filePath: string): Record<string, unknown>[] {
  const lines = readNdjsonRawLines(filePath);
  const previousCount = eventLineOffsets.get(filePath) ?? 0;
  if (lines.length < previousCount) {
    eventLineOffsets.set(filePath, lines.length);
    return lines
      .map((line) => parseJsonLine(line, filePath))
      .filter((event): event is Record<string, unknown> => event !== null);
  }
  if (lines.length === previousCount) {
    return [];
  }
  const delta = lines.slice(previousCount);
  eventLineOffsets.set(filePath, lines.length);
  return delta
    .map((line) => parseJsonLine(line, filePath))
    .filter((event): event is Record<string, unknown> => event !== null);
}

function findRunArtifactPaths(runId: string): {
  eventsPath: string | null;
  documentsPath: string | null;
  manifestPath: string | null;
} {
  const targetEvents = `run-${runId}-events.ndjson`;
  const targetDocuments = `run-${runId}-documents.json`;
  const targetManifest = `run-${runId}-manifest.json`;
  const files = walkFiles(statusDir, () => true);
  let eventsPath: string | null = null;
  let documentsPath: string | null = null;
  let manifestPath: string | null = null;

  for (const filePath of files) {
    const name = basename(filePath);
    if (!eventsPath && name === targetEvents) {
      eventsPath = filePath;
    } else if (!documentsPath && name === targetDocuments) {
      documentsPath = filePath;
    } else if (!manifestPath && name === targetManifest) {
      manifestPath = filePath;
    }
    if (eventsPath && documentsPath && manifestPath) break;
  }

  return { eventsPath, documentsPath, manifestPath };
}

function buildInitialRunArtifacts(runId: string | null): {
  events: Record<string, unknown[]>;
  documents: Record<string, unknown>;
} {
  const events: Record<string, unknown[]> = {};
  const documents: Record<string, unknown> = {};
  if (!runId) return { events, documents };

  const artifacts = findRunArtifactPaths(runId);
  if (artifacts.eventsPath && existsSync(artifacts.eventsPath)) {
    events[normalizedRelPath(statusDir, artifacts.eventsPath)] = readAllEvents(artifacts.eventsPath);
  }
  if (artifacts.documentsPath && existsSync(artifacts.documentsPath)) {
    const data = readJsonSafe(artifacts.documentsPath);
    if (data && typeof data === 'object') {
      documents[normalizedRelPath(statusDir, artifacts.documentsPath)] = data;
    }
  }
  return { events, documents };
}

/**
 * Recursively walk a directory and collect all .json file paths.
 * Supports the nested checkpoint hierarchy:
 *   data/status/{deal-id}.json               (master checkpoint)
 *   data/status/{deal-id}/agents/{agent}.json (agent checkpoints)
 *   data/status/{deal-id}/agents/{agent}/batch-{N}.json (batch checkpoints)
 */
function walkJsonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          results.push(...walkJsonFiles(fullPath));
        } else if (entry.endsWith('.json')) {
          results.push(fullPath);
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  } catch {
    // Skip directories we can't read
  }
  return results;
}

function readAllCheckpoints(): Record<string, unknown> {
  const checkpoints: Record<string, unknown> = {};
  try {
    if (!existsSync(statusDir)) return checkpoints;
    const jsonFiles = walkJsonFiles(statusDir);
    for (const fullPath of jsonFiles) {
      const relPath: string = normalizedRelPath(statusDir, fullPath);
      if (isRunArtifactJson(relPath)) continue;
      const data: unknown | null = readJsonSafe(fullPath);
      if (data !== null) {
        checkpoints[relPath] = data;
      }
    }
  } catch (err) {
    console.error('[watcher] Failed to read status directory', err);
  }
  return checkpoints;
}

function readAllLogs(): Record<string, string[]> {
  const logs: Record<string, string[]> = {};
  try {
    if (!existsSync(logsDir)) return logs;
    // Recursively find .log files in subdirectories (e.g., logs/test-deal-001/master.log)
    const dealDirs: string[] = readdirSync(logsDir);
    for (const entry of dealDirs) {
      const entryPath: string = join(logsDir, entry);
      try {
        const stat = statSync(entryPath);
        if (stat.isDirectory()) {
          const logFiles: string[] = readdirSync(entryPath).filter((f) =>
            f.endsWith('.log'),
          );
          for (const logFile of logFiles) {
            const fullPath: string = join(entryPath, logFile);
            const relPath: string = normalizedRelPath(logsDir, fullPath);
            const lines: string[] = readLastLines(fullPath, 500);
            logLineOffsets.set(fullPath, readAllLines(fullPath).length);
            if (lines.length > 0) {
              logs[relPath] = lines;
            }
          }
        } else if (entry.endsWith('.log')) {
          const lines: string[] = readLastLines(entryPath, 500);
          logLineOffsets.set(entryPath, readAllLines(entryPath).length);
          if (lines.length > 0) {
            logs[entry] = lines;
          }
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  } catch (err) {
    console.error('[watcher] Failed to read logs directory', err);
  }
  return logs;
}

function broadcast(message: WatcherMessage): void {
  const payload: string = JSON.stringify(message);
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('[watcher] Failed to send to client', err);
      }
    }
  });
}

const runManager = new RunManager({
  projectRoot,
  dataRoot,
  onEvent: (message: RunMessage) => {
    broadcast(message);
  },
  onReset: () => {
    logLineOffsets.clear();
    eventLineOffsets.clear();
  },
});

const dealServiceContext = {
  dataRoot,
  projectRoot,
  statusDir,
};

const workflowServiceContext = {
  dataRoot,
  projectRoot,
};

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) || 'item';
}

function logFileWatcherError(scope: string, err: Error): void {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'EPERM' || code === 'ENOENT') {
    console.warn(`[watcher] ${scope} watcher skipped transient filesystem event`, err.message);
    return;
  }
  console.error(`[watcher] ${scope} watcher error`, err);
}

function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function createRunInputSnapshotFile(
  dealId: string,
  workflowId: string,
  launch: Record<string, unknown>,
): {
  absolutePath: string;
  relativePath: string;
  snapshot: ReturnType<typeof buildRunInputSnapshot>;
  readiness: ReturnType<typeof evaluateLaunchReadiness>;
} {
  const snapshot = buildRunInputSnapshot({ ...dealServiceContext, projectRoot }, dealId, workflowId, launch);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const absolutePath = safePaths.assertWithinBase(dataRoot, join(
    dataRoot,
    'runs',
    safeDealId(dealId),
    `${timestamp}-${safeFileSegment(workflowId)}-input-snapshot.json`,
  ), 'run input snapshot path');
  writeJsonFile(absolutePath, snapshot);
  return {
    absolutePath,
    relativePath: repoRelativePath(absolutePath),
    snapshot,
    readiness: snapshot.readiness,
  };
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

const LOCAL_API_HOST = '127.0.0.1';
const WS_PORT = 8080;
const wss: WebSocketServer = new WebSocketServer({
  port: WS_PORT,
  host: LOCAL_API_HOST,
  verifyClient: (info, done) => {
    if (isAllowedBrowserOrigin(info.origin)) {
      done(true);
      return;
    }
    done(false, 403, 'Browser origin is not allowed for this local WebSocket.');
  },
});

wss.on('connection', (ws: WebSocket) => {
  console.log('[watcher] Client connected');

  const runState = runManager.getStatus();
  const runArtifacts = buildInitialRunArtifacts(runState.runId);

  // Send full current state on connection
  const initialMessage: InitialMessage = {
    type: 'initial',
    checkpoints: readAllCheckpoints(),
    logs: readAllLogs(),
    events: runArtifacts.events,
    documents: runArtifacts.documents,
  };

  try {
    ws.send(JSON.stringify(initialMessage));
    ws.send(JSON.stringify(runManager.getStateMessage()));
  } catch (err) {
    console.error('[watcher] Failed to send initial state', err);
  }

  ws.on('error', (err: Error) => {
    console.error('[watcher] WebSocket client error', err);
  });

  ws.on('close', () => {
    console.log('[watcher] Client disconnected');
  });
});

wss.on('error', (err: Error) => {
  console.error('[watcher] WebSocket server error', err);
});

console.log(`[watcher] WebSocket server listening on ws://${LOCAL_API_HOST}:${WS_PORT}`);

// ---------------------------------------------------------------------------
// File watchers
// ---------------------------------------------------------------------------

const statusWatcher = watch(statusDir, {
  ignoreInitial: true,
  ignored: /(^|[/\\])\.locks([/\\]|$)/,
  persistent: true,
  depth: 3,  // Watch nested agent/batch checkpoint subdirectories
  awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
});

statusWatcher.on('change', (filePath: string) => {
  const relPath: string = normalizedRelPath(statusDir, filePath);
  if (isLockArtifactPath(relPath)) return;
  console.log(`[watcher] File changed: status/${relPath}`);

  if (filePath.endsWith('.ndjson')) {
    const events = readIncrementalEvents(filePath);
    events.forEach((event) => {
      broadcast({ type: 'event', path: relPath, event });
    });
    return;
  }

  if (isRunArtifactJson(relPath)) {
    // Run document/manifest files are served via dedicated API endpoints.
    return;
  }

  const data: unknown | null = readJsonSafe(filePath);
  if (data !== null) {
    broadcast({ type: 'checkpoint', path: relPath, data });
  }
});

statusWatcher.on('add', (filePath: string) => {
  const relPath: string = normalizedRelPath(statusDir, filePath);
  if (isLockArtifactPath(relPath)) return;
  console.log(`[watcher] File added: status/${relPath}`);

  if (filePath.endsWith('.ndjson')) {
    const events = readAllEvents(filePath);
    events.forEach((event) => {
      broadcast({ type: 'event', path: relPath, event });
    });
    return;
  }

  if (isRunArtifactJson(relPath)) {
    return;
  }

  const data: unknown | null = readJsonSafe(filePath);
  if (data !== null) {
    broadcast({ type: 'checkpoint', path: relPath, data });
  }
});

statusWatcher.on('error', (err: Error) => {
  logFileWatcherError('Status', err);
});

const logsWatcher = watch(logsDir, {
  ignoreInitial: true,
  persistent: true,
  awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
});

logsWatcher.on('change', (filePath: string) => {
  const relPath: string = normalizedRelPath(logsDir, filePath);
  console.log(`[watcher] File changed: logs/${relPath}`);

  const lines: string[] = readIncrementalLines(filePath);
  if (lines.length > 0) {
    broadcast({ type: 'log', path: relPath, lines });
  }
});

logsWatcher.on('add', (filePath: string) => {
  const relPath: string = normalizedRelPath(logsDir, filePath);
  console.log(`[watcher] File added: logs/${relPath}`);

  const allLines = readAllLines(filePath);
  logLineOffsets.set(filePath, allLines.length);
  if (allLines.length > 0) {
    broadcast({ type: 'log', path: relPath, lines: allLines });
  }
});

logsWatcher.on('error', (err: Error) => {
  logFileWatcherError('Logs', err);
});

console.log(`[watcher] Watching status: ${statusDir}`);
console.log(`[watcher] Watching logs:   ${logsDir}`);
console.log('[watcher] Watcher started');

// ---------------------------------------------------------------------------
// REST API server (Node built-in http)
// ---------------------------------------------------------------------------

const API_PORT = 8081;
const MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024;
const DOCUMENT_ROUTE_RATE_LIMIT = {
  capacity: 60,
  refillPerMinute: 120,
};

interface TokenBucket {
  tokens: number;
  updatedAt: number;
}

const documentRouteBuckets: Map<string, TokenBucket> = new Map();

class RequestBodyTooLargeError extends Error {
  readonly statusCode = 413;

  constructor(limitBytes: number) {
    super(`Request body exceeds the ${Math.round(limitBytes / 1024 / 1024)} MB local API limit.`);
  }
}

function isAllowedBrowserOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname === '::1'
    );
  } catch {
    return false;
  }
}

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && isAllowedBrowserOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(sanitizeApiResponse(body));
  res.writeHead(status, {
    'Content-Type': 'application/json',
  });
  res.end(payload);
}

function readBody(req: IncomingMessage, limitBytes = MAX_REQUEST_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(contentLength) && contentLength > limitBytes) {
      req.destroy();
      reject(new RequestBodyTooLargeError(limitBytes));
      return;
    }
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > limitBytes) {
        settled = true;
        req.destroy();
        reject(new RequestBodyTooLargeError(limitBytes));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, totalBytes).toString('utf-8'));
    });
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function parseDealId(url: string): string | null {
  // Match /api/deal/:id  or /api/deal/:id/pause  or /api/deal/:id/resume
  const match = url.match(/^\/api\/deal\/([^/]+)/);
  if (!match) return null;
  try {
    return safeDealId(decodeUrlPart(match[1]));
  } catch {
    return null;
  }
}

function parseRunId(url: string, suffix: 'events' | 'documents'): string | null {
  const match = url.match(new RegExp(`^/api/run/([^/]+)/${suffix}$`));
  if (!match) return null;
  try {
    return safeRunId(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function parseLibraryDealId(url: string): string | null {
  const match = url.match(/^\/api\/deals\/([^/]+)/);
  if (!match) return null;
  try {
    return safeDealId(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function parseWorkflowId(url: string): string | null {
  const match = url.match(/^\/api\/workflows\/([^/]+)/);
  if (!match) return null;
  try {
    return safePaths.assertSafeSegment(decodeURIComponent(match[1]), 'workflow ID');
  } catch {
    return null;
  }
}

function decodeUrlPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseDealWorkspaceId(url: string, suffix: string): string | null {
  const match = url.match(new RegExp(`^/api/deals/([^/]+)/${suffix}$`));
  if (!match) return null;
  try {
    return safeDealId(decodeUrlPart(match[1]));
  } catch {
    return null;
  }
}

function parseDealDocumentRoute(url: string, suffix: 'extract' | 'extraction' | 'apply-extraction' | 'review-extraction'): {
  dealId: string;
  documentId: string;
} | null {
  const match = url.match(new RegExp(`^/api/deals/([^/]+)/documents/([^/]+)/${suffix}$`));
  if (!match) return null;
  try {
    return {
      dealId: safeDealId(decodeUrlPart(match[1])),
      documentId: safePaths.assertSafeSegment(decodeUrlPart(match[2]), 'document ID'),
    };
  } catch {
    return null;
  }
}

function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress || 'local';
}

function consumeDocumentRouteToken(req: IncomingMessage): boolean {
  const key = clientIp(req);
  const now = Date.now();
  const current = documentRouteBuckets.get(key) ?? {
    tokens: DOCUMENT_ROUTE_RATE_LIMIT.capacity,
    updatedAt: now,
  };
  const elapsedMinutes = Math.max(0, (now - current.updatedAt) / 60000);
  const refilled = Math.min(
    DOCUMENT_ROUTE_RATE_LIMIT.capacity,
    current.tokens + elapsedMinutes * DOCUMENT_ROUTE_RATE_LIMIT.refillPerMinute,
  );

  if (refilled < 1) {
    documentRouteBuckets.set(key, { tokens: refilled, updatedAt: now });
    return false;
  }

  documentRouteBuckets.set(key, { tokens: refilled - 1, updatedAt: now });
  return true;
}

function isDocumentMutationRoute(method: string, url: string): boolean {
  return method === 'POST' && /^\/api\/deals\/[^/]+\/documents(?:\/|$)/.test(url);
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const method = req.method || 'GET';
  const url = req.url || '/';
  applyCorsHeaders(req, res);

  if (!isAllowedBrowserOrigin(req.headers.origin)) {
    sendJson(res, 403, { error: 'Browser origin is not allowed for this local API.' });
    return;
  }

  if (isDocumentMutationRoute(method, url) && !consumeDocumentRouteToken(req)) {
    sendJson(res, 429, { error: 'Too many document requests from this local client. Try again shortly.' });
    return;
  }

  // CORS preflight
  if (method === 'OPTIONS') {
    sendJson(res, 204, null);
    return;
  }

  try {
    // POST /api/deal — Create a new deal checkpoint
    // GET /api/run/status - current run lifecycle status
    if (method === 'GET' && url === '/api/run/status') {
      sendJson(res, 200, runManager.getStatus());
      return;
    }

    // GET /api/codex/status - report local Codex CLI auth state without exposing credentials
    if (method === 'GET' && url === '/api/codex/status') {
      if (!ensureLoopbackRequest(req, res)) return;
      sendJson(res, 200, readCodexStatus());
      return;
    }

    // POST /api/codex/login - start Codex login so users can choose ChatGPT in the browser
    if (method === 'POST' && url === '/api/codex/login') {
      if (!ensureLoopbackRequest(req, res)) return;
      const result = startCodexLogin();
      sendJson(res, Number(result.statusCode || 202), result);
      return;
    }

    // GET /api/deals - list saved and sample deals for the dashboard library
    if (method === 'GET' && url === '/api/deals') {
      sendJson(res, 200, listDealLibrary(dealServiceContext));
      return;
    }

    // GET /api/workflows - list built-in outcome workflows for the cockpit launcher
    if (method === 'GET' && url === '/api/workflows') {
      sendJson(res, 200, listWorkflows(workflowServiceContext));
      return;
    }

    // GET /api/workflow-presets - list locally saved workflow presets
    if (method === 'GET' && url === '/api/workflow-presets') {
      sendJson(res, 200, listWorkflowPresets(workflowServiceContext));
      return;
    }

    // POST /api/workflow-presets - save a reusable local workflow preset
    if (method === 'POST' && url === '/api/workflow-presets') {
      const rawBody = await readBody(req);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const dealId = typeof body.dealId === 'string' ? body.dealId : '';
      if (!dealId || !getDealRecord(dealServiceContext, dealId)) {
        sendJson(res, 400, { error: `Deal not found: ${dealId || 'missing dealId'}` });
        return;
      }

      try {
        const preset = saveWorkflowPreset(workflowServiceContext, body);
        sendJson(res, 201, { preset });
      } catch (err) {
        sendJson(res, 400, {
          error: err instanceof Error ? err.message : 'Failed to save workflow preset',
        });
      }
      return;
    }

    // POST /api/deals/validate - validate a user-provided deal for draft or launch readiness
    if (method === 'POST' && url === '/api/deals/validate') {
      const rawBody = await readBody(req);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const deal = body.deal;
      if (!deal || typeof deal !== 'object' || Array.isArray(deal)) {
        sendJson(res, 400, { error: 'Missing required field: deal' });
        return;
      }

      const library = listDealLibrary(dealServiceContext);
      const mode: ValidationMode = body.mode === 'launch' ? 'launch' : 'draft';
      const currentDealId = typeof body.currentDealId === 'string' ? body.currentDealId : undefined;
      const validation = validateDealConfig(deal as Record<string, unknown>, {
        projectRoot,
        mode,
        existingIds: library.deals.map((entry) => entry.dealId),
        currentDealId,
      });

      sendJson(res, 200, validation);
      return;
    }

    // POST /api/deals - save a user-created deal draft or launch-ready configuration
    if (method === 'POST' && url === '/api/deals') {
      const rawBody = await readBody(req);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const deal = body.deal;
      if (!deal || typeof deal !== 'object' || Array.isArray(deal)) {
        sendJson(res, 400, { error: 'Missing required field: deal' });
        return;
      }

      const mode: ValidationMode = body.mode === 'launch' ? 'launch' : 'draft';
      const currentDealId = typeof body.currentDealId === 'string' ? body.currentDealId : undefined;

      try {
        const record = saveUserDeal(dealServiceContext, {
          deal: deal as Record<string, unknown>,
          mode,
          currentDealId,
        });
        sendJson(res, 201, record);
      } catch (err) {
        const validation = (err as Error & { validation?: unknown }).validation;
        sendJson(res, 400, {
          error: err instanceof Error ? err.message : 'Failed to save deal',
          ...(validation && typeof validation === 'object' ? { validation } : {}),
        });
      }
      return;
    }

    // POST /api/run/start - start a live or fast run
    if (method === 'POST' && url === '/api/run/start') {
      const rawBody = await readBody(req);
      let body: StartRunRequest = {};
      if (rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody) as StartRunRequest;
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
      }
      const result = runManager.start(body);
      sendJson(res, result.statusCode, result.body);
      return;
    }

    // POST /api/run/stop - stop active run process
    if (method === 'POST' && url === '/api/run/stop') {
      const result = runManager.stop();
      sendJson(res, result.statusCode, result.body);
      return;
    }

    // GET /api/run/:runId/events - fetch all structured events for a run
    if (method === 'GET' && /^\/api\/run\/[^/]+\/events$/.test(url)) {
      const runId = parseRunId(url, 'events');
      if (!runId) {
        sendJson(res, 400, { error: 'Invalid run ID' });
        return;
      }
      const { eventsPath } = findRunArtifactPaths(runId);
      if (!eventsPath || !existsSync(eventsPath)) {
        sendJson(res, 200, {
          runId,
          path: null,
          events: [],
        });
        return;
      }
      const events = readAllEvents(eventsPath);
      sendJson(res, 200, {
        runId,
        path: normalizedRelPath(statusDir, eventsPath),
        events,
      });
      return;
    }

    // GET /api/run/:runId/documents - fetch all document artifacts for a run
    if (method === 'GET' && /^\/api\/run\/[^/]+\/documents$/.test(url)) {
      const runId = parseRunId(url, 'documents');
      if (!runId) {
        sendJson(res, 400, { error: 'Invalid run ID' });
        return;
      }
      const { documentsPath } = findRunArtifactPaths(runId);
      if (!documentsPath || !existsSync(documentsPath)) {
        sendJson(res, 200, {
          runId,
          path: null,
          documents: [],
        });
        return;
      }
      const payload = readJsonSafe(documentsPath);
      if (!payload || typeof payload !== 'object') {
        sendJson(res, 200, {
          runId,
          path: normalizedRelPath(statusDir, documentsPath),
          documents: [],
          pending: true,
          warning: 'Run documents are still being written. Try again shortly.',
        });
        return;
      }
      sendJson(res, 200, {
        runId,
        path: normalizedRelPath(statusDir, documentsPath),
        ...(payload as Record<string, unknown>),
      });
      return;
    }

    // POST /api/swarm/plan - turn an operator goal into a recommended specialist swarm
    if (method === 'POST' && url === '/api/swarm/plan') {
      const rawBody = await readBody(req);
      let body: Record<string, unknown> = {};
      if (rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
      }

      const dealId = typeof body.dealId === 'string' ? body.dealId.trim() : '';
      const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
      if (!dealId) {
        sendJson(res, 400, { error: 'Missing required field: dealId' });
        return;
      }
      if (!goal) {
        sendJson(res, 400, { error: 'Missing required field: goal' });
        return;
      }

      const record = getDealRecord(dealServiceContext, dealId);
      if (!record) {
        sendJson(res, 404, { error: `Deal not found: ${dealId}` });
        return;
      }

      try {
        const workspace = getDealWorkspace({ ...dealServiceContext, projectRoot }, dealId) as unknown as Record<string, unknown>;
        const operatorCommand = workspace.operatorCommand && typeof workspace.operatorCommand === 'object'
          ? workspace.operatorCommand as Record<string, unknown>
          : {};
        const sourceCoverage = operatorCommand.sourceCoverage && typeof operatorCommand.sourceCoverage === 'object'
          ? operatorCommand.sourceCoverage as Record<string, unknown>
          : {};
        const initialPlan = goalHelper.suggestSwarmGoal({
          goal,
          catalog: workflowCatalog,
          registry: agentRegistry,
          phaseMetadata: runtimeCore.PHASES,
          dealSummary: {
            dealId,
            sourceCoverage,
          },
        });
        const workflowReadiness = evaluateLaunchReadiness(
          { ...dealServiceContext, projectRoot },
          dealId,
          initialPlan.workflowId,
          { enforceSourceBackedInputs: false },
        );
        const plan = goalHelper.suggestSwarmGoal({
          goal,
          catalog: workflowCatalog,
          registry: agentRegistry,
          phaseMetadata: runtimeCore.PHASES,
          dealSummary: {
            dealId,
            sourceCoverage: {
              ...workflowReadiness.sourceCoverage,
              sampleComplete: record.item.kind === 'sample',
            },
          },
        });
        sendJson(res, 200, {
          ...plan,
          deal: record.item,
        });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to plan swarm' });
      }
      return;
    }

    // POST /api/workflows/:workflowId/launch - launch an outcome workflow for a selected deal
    if (method === 'POST' && /^\/api\/workflows\/[^/]+\/launch$/.test(url)) {
      const workflowId = parseWorkflowId(url);
      if (!workflowId) {
        sendJson(res, 400, { error: 'Invalid workflow ID' });
        return;
      }

      const workflow = getWorkflow(workflowServiceContext, workflowId);
      if (!workflow) {
        sendJson(res, 404, { error: `Workflow not found: ${workflowId}` });
        return;
      }

      const rawBody = await readBody(req);
      let body: Record<string, unknown> = {};
      if (rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
      }

      const presetId = typeof body.presetId === 'string' ? body.presetId : null;
      const preset = presetId
        ? listWorkflowPresets(workflowServiceContext).presets.find((entry) => entry.presetId === presetId)
        : null;
      const dealId = typeof body.dealId === 'string' ? body.dealId : preset?.dealId;
      if (!dealId) {
        sendJson(res, 400, { error: 'Missing required field: dealId' });
        return;
      }

      const record = getDealRecord(dealServiceContext, dealId);
      if (!record) {
        sendJson(res, 404, { error: `Deal not found: ${dealId}` });
        return;
      }
      if (record.item.kind === 'user' && !record.validation.launchReady) {
        sendJson(res, 400, {
          error: 'Deal is not launch ready',
          validation: record.validation,
        });
        return;
      }

      const requireSourceBackedInputs =
        typeof body.requireSourceBackedInputs === 'boolean'
          ? body.requireSourceBackedInputs
          : preset?.requireSourceBackedInputs === true;

      const startRequest: StartRunRequest = {
        dealPath: record.item.dealPath,
        mode: body.mode === 'fast' ? 'fast' : 'live',
        speed:
          body.speed === 'fast' || body.speed === 'slow' || body.speed === 'normal'
            ? body.speed
            : preset?.speed || 'normal',
        scenario:
          typeof body.scenario === 'string'
            ? body.scenario
            : preset?.scenario || workflow.recommendedScenario,
        seed: typeof body.seed === 'number' ? body.seed : preset?.seed ?? undefined,
        reset: typeof body.reset === 'boolean' ? body.reset : false,
        workflowId: workflow.id,
        runtimeProvider: asRuntimeProvider(body.runtimeProvider),
        presetId: preset?.presetId || presetId || undefined,
        codexMaxAgents: asPositiveInteger(body.codexMaxAgents),
        codexConcurrency: asPositiveInteger(body.codexConcurrency),
        codexSandbox: asOptionalString(body.codexSandbox),
        codexModel: asOptionalString(body.codexModel),
        codexSearch: body.codexSearch === true,
        // A1: single-agent dispatch — forwarded to the codex runner as `--agent` flags
        // (run-manager re-sanitizes the list; ignored for simulation runs).
        codexAgents: Array.isArray(body.codexAgents) ? (body.codexAgents as string[]) : undefined,
      };

      const inputSnapshot = createRunInputSnapshotFile(dealId, workflow.id, {
        ...startRequest,
        dealId,
        workflowName: workflow.name,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        requireSourceBackedInputs,
      });
      if (inputSnapshot.readiness.blockers.length > 0) {
        sendJson(res, 400, {
          error: 'Workflow launch readiness blocked',
          readiness: inputSnapshot.readiness,
          inputSnapshot: { path: inputSnapshot.relativePath },
        });
        return;
      }
      startRequest.inputSnapshotPath = inputSnapshot.absolutePath;

      const result = runManager.start(startRequest);
      if (result.statusCode < 300 && record.item.kind === 'user') {
        markDealLaunched(dealServiceContext, dealId);
      }
      sendJson(res, result.statusCode, {
        ...result.body,
        workflow,
        deal: record.item,
        readiness: inputSnapshot.readiness,
        inputSnapshot: {
          path: inputSnapshot.relativePath,
          sourceCoverage: inputSnapshot.readiness.sourceCoverage,
        },
      });
      return;
    }

    // GET /api/deals/:dealId/workspace - full operator workspace payload
    if (method === 'GET' && /^\/api\/deals\/[^/]+\/workspace$/.test(url)) {
      const dealId = parseDealWorkspaceId(url, 'workspace');
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }
      try {
        sendJson(res, 200, getDealWorkspace({ ...dealServiceContext, projectRoot }, dealId));
      } catch (err) {
        sendJson(res, 404, { error: err instanceof Error ? err.message : 'Workspace not found' });
      }
      return;
    }

    // POST /api/deals/:dealId/criteria - save deal-specific underwriting criteria
    if (method === 'POST' && /^\/api\/deals\/[^/]+\/criteria$/.test(url)) {
      const dealId = parseDealWorkspaceId(url, 'criteria');
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }
      const rawBody = await readBody(req);
      let body: Record<string, unknown>;
      try {
        body = rawBody.trim() ? JSON.parse(rawBody) : {};
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        sendJson(res, 200, saveDealCriteria({ ...dealServiceContext, projectRoot }, dealId, body));
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to save criteria' });
      }
      return;
    }

    // I1: POST /api/deals/:dealId/field-edit - inline operator override of a deal field
    // (value + previousValue + operator-edit audit + provenance), mirroring apply-extraction.
    if (method === 'POST' && /^\/api\/deals\/[^/]+\/field-edit$/.test(url)) {
      const dealId = parseDealWorkspaceId(url, 'field-edit');
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }
      const rawBody = await readBody(req);
      let body: Record<string, unknown>;
      try {
        body = rawBody.trim() ? JSON.parse(rawBody) : {};
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        sendJson(res, 200, applyOperatorFieldEdit({ ...dealServiceContext, projectRoot }, dealId, body));
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to apply field edit' });
      }
      return;
    }

    // GET /api/deals/:dealId/documents - list source documents for a deal
    if (method === 'GET' && /^\/api\/deals\/[^/]+\/documents$/.test(url)) {
      const dealId = parseDealWorkspaceId(url, 'documents');
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }
      try {
        sendJson(res, 200, listDealDocuments({ ...dealServiceContext, projectRoot }, dealId));
      } catch (err) {
        sendJson(res, 404, { error: err instanceof Error ? err.message : 'Documents not found' });
      }
      return;
    }

    // POST /api/deals/:dealId/documents - upload a local source document as JSON/base64
    if (method === 'POST' && /^\/api\/deals\/[^/]+\/documents$/.test(url)) {
      const dealId = parseDealWorkspaceId(url, 'documents');
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }
      const rawBody = await readBody(req);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        sendJson(res, 201, saveSourceDocument({ ...dealServiceContext, projectRoot }, dealId, body));
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to save document' });
      }
      return;
    }

    // POST /api/deals/:dealId/documents/:documentId/extract - create extraction preview
    if (method === 'POST' && /^\/api\/deals\/[^/]+\/documents\/[^/]+\/extract$/.test(url)) {
      const route = parseDealDocumentRoute(url, 'extract');
      if (!route) {
        sendJson(res, 400, { error: 'Invalid document route' });
        return;
      }
      try {
        sendJson(res, 200, extractSourceDocument({ ...dealServiceContext, projectRoot }, route.dealId, route.documentId));
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to extract document' });
      }
      return;
    }

    // GET /api/deals/:dealId/documents/:documentId/extraction - read persisted extraction preview
    if (method === 'GET' && /^\/api\/deals\/[^/]+\/documents\/[^/]+\/extraction$/.test(url)) {
      const route = parseDealDocumentRoute(url, 'extraction');
      if (!route) {
        sendJson(res, 400, { error: 'Invalid document route' });
        return;
      }
      try {
        sendJson(res, 200, { extraction: getSourceExtraction({ ...dealServiceContext, projectRoot }, route.dealId, route.documentId) });
      } catch (err) {
        sendJson(res, 404, { error: err instanceof Error ? err.message : 'Extraction not found' });
      }
      return;
    }

    // POST /api/deals/:dealId/documents/:documentId/apply-extraction - apply approved fields to deal inputs
    if (method === 'POST' && /^\/api\/deals\/[^/]+\/documents\/[^/]+\/apply-extraction$/.test(url)) {
      const route = parseDealDocumentRoute(url, 'apply-extraction');
      if (!route) {
        sendJson(res, 400, { error: 'Invalid document route' });
        return;
      }
      const rawBody = await readBody(req);
      let body: Record<string, unknown> = {};
      if (rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
      }
      try {
        sendJson(res, 200, applySourceExtraction({ ...dealServiceContext, projectRoot }, route.dealId, route.documentId, body));
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to apply extraction' });
      }
      return;
    }

    // POST /api/deals/:dealId/documents/:documentId/review-extraction - reject or waive selected extracted fields
    if (method === 'POST' && /^\/api\/deals\/[^/]+\/documents\/[^/]+\/review-extraction$/.test(url)) {
      const route = parseDealDocumentRoute(url, 'review-extraction');
      if (!route) {
        sendJson(res, 400, { error: 'Invalid document route' });
        return;
      }
      const rawBody = await readBody(req);
      let body: Record<string, unknown> = {};
      if (rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
      }
      try {
        sendJson(res, 200, reviewSourceExtraction({ ...dealServiceContext, projectRoot }, route.dealId, route.documentId, body));
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to review extraction' });
      }
      return;
    }

    // POST /api/deals/:dealId/ic-starter-package - export a source-backed Markdown and JSON IC starter package
    if (method === 'POST' && /^\/api\/deals\/[^/]+\/ic-starter-package$/.test(url)) {
      const dealId = parseDealWorkspaceId(url, 'ic-starter-package');
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }
      const rawBody = await readBody(req);
      let body: Record<string, unknown> = {};
      if (rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
      }
      try {
        sendJson(res, 200, exportIcStarterPackage({ ...dealServiceContext, projectRoot }, dealId, body));
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to export package' });
      }
      return;
    }

    // POST /api/deals/:dealId/phase-state - save phase checklist state
    if (method === 'POST' && /^\/api\/deals\/[^/]+\/phase-state$/.test(url)) {
      const dealId = parseDealWorkspaceId(url, 'phase-state');
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }
      const rawBody = await readBody(req);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      try {
        sendJson(res, 200, savePhaseState({ ...dealServiceContext, projectRoot }, dealId, body));
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Failed to save phase state' });
      }
      return;
    }

    // GET /api/deals/:id - fetch a saved deal or sample deal by ID
    if (method === 'GET' && /^\/api\/deals\/[^/]+$/.test(url)) {
      const dealId = parseLibraryDealId(url);
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }

      const record = getDealRecord(dealServiceContext, dealId);
      if (!record) {
        sendJson(res, 404, { error: `Deal not found: ${dealId}` });
        return;
      }

      sendJson(res, 200, record);
      return;
    }

    // POST /api/deals/:id/launch - launch a saved or sample deal via explicit path
    if (method === 'POST' && /^\/api\/deals\/[^/]+\/launch$/.test(url)) {
      const dealId = parseLibraryDealId(url);
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }

      const record = getDealRecord(dealServiceContext, dealId);
      if (!record) {
        sendJson(res, 404, { error: `Deal not found: ${dealId}` });
        return;
      }

      if (record.item.kind === 'user' && !record.validation.launchReady) {
        sendJson(res, 400, {
          error: 'Deal is not launch ready',
          validation: record.validation,
        });
        return;
      }

      const rawBody = await readBody(req);
      let body: Record<string, unknown> = {};
      if (rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
      }

      const startRequest: StartRunRequest = {
        dealPath: record.item.dealPath,
        mode: body.mode === 'fast' ? 'fast' : 'live',
        speed:
          body.speed === 'fast' || body.speed === 'slow' || body.speed === 'normal'
            ? body.speed
            : 'normal',
        scenario: typeof body.scenario === 'string' ? body.scenario : undefined,
        reset: typeof body.reset === 'boolean' ? body.reset : false,
        workflowId: 'full-acquisition-review',
        runtimeProvider: asRuntimeProvider(body.runtimeProvider),
        codexMaxAgents: asPositiveInteger(body.codexMaxAgents),
        codexConcurrency: asPositiveInteger(body.codexConcurrency),
        codexSandbox: asOptionalString(body.codexSandbox),
        codexModel: asOptionalString(body.codexModel),
        codexSearch: body.codexSearch === true,
      }

      const inputSnapshot = createRunInputSnapshotFile(dealId, 'full-acquisition-review', {
        ...startRequest,
        dealId,
        requireSourceBackedInputs: body.requireSourceBackedInputs === true,
      });
      if (inputSnapshot.readiness.blockers.length > 0) {
        sendJson(res, 400, {
          error: 'Deal launch readiness blocked',
          readiness: inputSnapshot.readiness,
          inputSnapshot: { path: inputSnapshot.relativePath },
        });
        return;
      }
      startRequest.inputSnapshotPath = inputSnapshot.absolutePath;

      const result = runManager.start(startRequest);
      if (result.statusCode < 300 && record.item.kind === 'user') {
        markDealLaunched(dealServiceContext, dealId);
      }
      sendJson(res, result.statusCode, {
        ...result.body,
        deal: record.item,
        readiness: inputSnapshot.readiness,
        inputSnapshot: {
          path: inputSnapshot.relativePath,
          sourceCoverage: inputSnapshot.readiness.sourceCoverage,
        },
      });
      return;
    }

    if (method === 'POST' && url === '/api/deal') {
      const rawBody = await readBody(req);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      let dealId = '';
      try {
        dealId = typeof body.dealId === 'string' ? safeDealId(body.dealId) : '';
      } catch {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }
      if (!dealId) {
        sendJson(res, 400, { error: 'Missing required field: dealId' });
        return;
      }

      const checkpointPath = safePaths.assertWithinBase(statusDir, join(statusDir, `${dealId}.json`), 'checkpoint path');
      const checkpoint = {
        dealId,
        dealName: (body.dealName as string) || dealId,
        property: body.property || {},
        status: 'pending',
        overallProgress: 0,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        phases: body.phases || {},
        resumeInstructions: '',
        ...body,
      };

      writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
      console.log(`[api] Created deal checkpoint: ${dealId}`);
      sendJson(res, 201, { dealId, path: repoRelativePath(checkpointPath), checkpoint });
      return;
    }

    // GET /api/deal/:id — Get deal status
    if (method === 'GET' && /^\/api\/deal\/[^/]+$/.test(url)) {
      const dealId = parseDealId(url);
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }

      const checkpointPath = safePaths.assertWithinBase(statusDir, join(statusDir, `${dealId}.json`), 'checkpoint path');
      if (!existsSync(checkpointPath)) {
        sendJson(res, 404, { error: `Deal not found: ${dealId}` });
        return;
      }

      const data = readJsonSafe(checkpointPath);
      if (data === null) {
        sendJson(res, 500, { error: `Failed to read checkpoint for: ${dealId}` });
        return;
      }

      // Also gather agent-level checkpoints if they exist
      const agentsDir = safePaths.assertWithinBase(statusDir, join(statusDir, dealId, 'agents'), 'agent checkpoint directory');
      const agentCheckpoints: Record<string, unknown> = {};
      if (existsSync(agentsDir)) {
        const agentFiles = walkJsonFiles(agentsDir);
        for (const agentFile of agentFiles) {
          const relPath = normalizedRelPath(agentsDir, agentFile);
          const agentData = readJsonSafe(agentFile);
          if (agentData !== null) {
            agentCheckpoints[relPath] = agentData;
          }
        }
      }

      sendJson(res, 200, { deal: data, agents: agentCheckpoints });
      return;
    }

    // POST /api/deal/:id/pause — Pause a deal
    if (method === 'POST' && /^\/api\/deal\/[^/]+\/pause$/.test(url)) {
      const dealId = parseDealId(url);
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }

      const checkpointPath = safePaths.assertWithinBase(statusDir, join(statusDir, `${dealId}.json`), 'checkpoint path');
      if (!existsSync(checkpointPath)) {
        sendJson(res, 404, { error: `Deal not found: ${dealId}` });
        return;
      }

      const data = readJsonSafe(checkpointPath) as Record<string, unknown> | null;
      if (data === null) {
        sendJson(res, 500, { error: `Failed to read checkpoint for: ${dealId}` });
        return;
      }

      data.status = 'paused';
      data.lastUpdatedAt = new Date().toISOString();
      data.resumeInstructions = `Deal ${dealId} was paused at ${data.lastUpdatedAt}. Resume by calling POST /api/deal/${dealId}/resume.`;

      writeFileSync(checkpointPath, JSON.stringify(data, null, 2));
      console.log(`[api] Paused deal: ${dealId}`);
      sendJson(res, 200, { dealId, status: 'paused', lastUpdatedAt: data.lastUpdatedAt });
      return;
    }

    // POST /api/deal/:id/resume — Resume a deal
    if (method === 'POST' && /^\/api\/deal\/[^/]+\/resume$/.test(url)) {
      const dealId = parseDealId(url);
      if (!dealId) {
        sendJson(res, 400, { error: 'Invalid deal ID' });
        return;
      }

      const checkpointPath = safePaths.assertWithinBase(statusDir, join(statusDir, `${dealId}.json`), 'checkpoint path');
      if (!existsSync(checkpointPath)) {
        sendJson(res, 404, { error: `Deal not found: ${dealId}` });
        return;
      }

      const data = readJsonSafe(checkpointPath) as Record<string, unknown> | null;
      if (data === null) {
        sendJson(res, 500, { error: `Failed to read checkpoint for: ${dealId}` });
        return;
      }

      data.status = 'running';
      data.lastUpdatedAt = new Date().toISOString();
      data.resumeInstructions = `Deal ${dealId} resumed at ${data.lastUpdatedAt}. Check phases for current progress.`;

      writeFileSync(checkpointPath, JSON.stringify(data, null, 2));
      console.log(`[api] Resumed deal: ${dealId}`);
      sendJson(res, 200, { dealId, status: 'running', lastUpdatedAt: data.lastUpdatedAt });
      return;
    }

    // Fallback: 404
    sendJson(res, 404, { error: `Not found: ${method} ${url}` });
  } catch (err) {
    console.error(`[api] Unhandled error: ${method} ${url}`, err);
    if (err instanceof RequestBodyTooLargeError) {
      sendJson(res, err.statusCode, { error: err.message });
      return;
    }
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

httpServer.listen(API_PORT, LOCAL_API_HOST, () => {
  console.log(`[watcher] REST API listening on http://${LOCAL_API_HOST}:${API_PORT}`);
});
