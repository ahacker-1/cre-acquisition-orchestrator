import { spawn, spawnSync, type ChildProcessByStdio } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import type { Readable } from 'stream'

export type RunMode = 'live' | 'fast'
export type RunSpeed = 'fast' | 'normal' | 'slow'
export type RuntimeProvider = 'simulation' | 'codex'
export type RunLifecycleState =
  | 'IDLE'
  | 'STARTING'
  | 'RUNNING'
  | 'STOPPING'
  | 'COMPLETED'
  | 'FAILED'
  | 'STOPPED'

export interface RunStatus {
  active: boolean
  runId: string | null
  dealPath: string | null
  workflowId: string | null
  runtimeProvider: RuntimeProvider | null
  presetId: string | null
  inputSnapshotPath: string | null
  outputPath: string | null
  state: RunLifecycleState
  mode: RunMode | null
  speed: RunSpeed | null
  pid: number | null
  startedAt: string | null
  endedAt: string | null
  exitCode: number | null
  error: string | null
}

export interface StartRunRequest {
  dealPath?: string
  mode?: RunMode
  speed?: RunSpeed
  scenario?: string
  seed?: number
  reset?: boolean
  workflowId?: string
  runtimeProvider?: RuntimeProvider
  presetId?: string
  inputSnapshotPath?: string
  codexMaxAgents?: number | null
  codexConcurrency?: number | null
  codexSandbox?: string | null
  codexModel?: string | null
  codexSearch?: boolean
  // Phase 3 / A1 (single-agent dispatch): restrict a codex run to a specific named agent (or a
  // small subset) via repeatable `--agent` flags. Codex-only; the simulation runner has no
  // per-agent flag, so this is ignored for simulation runs. Additive + backward-compatible.
  codexAgents?: string[]
  // W70: per-agent retry/backoff configuration (optional, backward-compatible).
  codexMaxRetries?: number | null
  codexRetryBaseMs?: number | null
  // W71: re-run only the failed agents from a prior run (requires reusing its run id).
  codexRerunFailed?: boolean
  codexRerunRunId?: string | null
}

export interface RunMessage {
  type: 'run'
  event: 'started' | 'state' | 'stopped' | 'exited' | 'error'
  runId: string | null
  state: RunLifecycleState
  mode?: RunMode | null
  speed?: RunSpeed | null
  timestamp: string
  details?: Record<string, unknown>
}

interface StartRunResponse {
  statusCode: number
  body: Record<string, unknown>
}

interface StopRunResponse {
  statusCode: number
  body: Record<string, unknown>
}

interface RunManagerOptions {
  projectRoot: string
  dataRoot: string
  onEvent: (message: RunMessage) => void
  onReset?: () => void
}

function nowIso(): string {
  return new Date().toISOString()
}

function sanitizeSpeed(speed: unknown): RunSpeed {
  return speed === 'fast' || speed === 'slow' || speed === 'normal' ? speed : 'normal'
}

function sanitizeMode(mode: unknown): RunMode {
  return mode === 'fast' ? 'fast' : 'live'
}

function sanitizeDealPath(dealPath: unknown): string {
  if (typeof dealPath !== 'string' || dealPath.trim().length === 0) return 'config/deal.json'
  return dealPath
}

function sanitizeScenario(scenario: unknown): string {
  if (typeof scenario !== 'string' || scenario.trim().length === 0) return 'core-plus'
  return scenario
}

function sanitizeWorkflowId(workflowId: unknown): string {
  if (typeof workflowId !== 'string' || workflowId.trim().length === 0) return 'full-acquisition-review'
  return workflowId.trim()
}

function sanitizeRuntimeProvider(runtimeProvider: unknown): RuntimeProvider {
  return runtimeProvider === 'codex' ? 'codex' : 'simulation'
}

function sanitizePresetId(presetId: unknown): string | null {
  if (typeof presetId !== 'string' || presetId.trim().length === 0) return null
  return presetId.trim()
}

function sanitizeInputSnapshotPath(inputSnapshotPath: unknown): string | null {
  if (typeof inputSnapshotPath !== 'string' || inputSnapshotPath.trim().length === 0) return null
  return inputSnapshotPath.trim()
}

function sanitizeSeed(seed: unknown): number | null {
  if (typeof seed !== 'number') return null
  if (!Number.isFinite(seed)) return null
  return Math.round(seed)
}

function sanitizePositiveInteger(value: unknown, fallback: number | null = null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const nextValue = Math.round(value)
  return nextValue > 0 ? nextValue : fallback
}

function sanitizeNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const nextValue = Math.round(value)
  return nextValue >= 0 ? nextValue : fallback
}

function sanitizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return value.trim()
}

// A1: a list of agent ids for single-agent (or subset) codex dispatch. Drops blanks/dupes and
// keeps only safe slug-shaped ids (the codex runner matches these against the workflow plan).
function sanitizeAgentList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed || !/^[a-z0-9][a-z0-9-]*$/i.test(trimmed) || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function commandOutput(result: ReturnType<typeof spawnSync>): string {
  return [result.stdout, result.stderr]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join('\n')
}

function speedToDelayMs(speed: RunSpeed): number {
  if (speed === 'fast') return 500
  if (speed === 'slow') return 5000
  return 2000
}

export class RunManager {
  private readonly projectRoot: string
  private readonly dataRoot: string
  private readonly onEvent: (message: RunMessage) => void
  private readonly onReset?: () => void
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null
  private stopTimer: ReturnType<typeof setTimeout> | null = null

  private status: RunStatus = {
    active: false,
    runId: null,
    dealPath: null,
    workflowId: null,
    runtimeProvider: null,
    presetId: null,
    inputSnapshotPath: null,
    outputPath: null,
    state: 'IDLE',
    mode: null,
    speed: null,
    pid: null,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    error: null,
  }

  constructor(options: RunManagerOptions) {
    this.projectRoot = options.projectRoot
    this.dataRoot = options.dataRoot
    this.onEvent = options.onEvent
    this.onReset = options.onReset
  }

  getStatus(): RunStatus {
    return { ...this.status }
  }

  getStateMessage(): RunMessage {
    return {
      type: 'run',
      event: 'state',
      runId: this.status.runId,
      state: this.status.state,
      mode: this.status.mode,
      speed: this.status.speed,
      timestamp: nowIso(),
      details: {
        active: this.status.active,
        dealPath: this.status.dealPath,
        workflowId: this.status.workflowId,
        runtimeProvider: this.status.runtimeProvider,
        presetId: this.status.presetId,
        inputSnapshotPath: this.status.inputSnapshotPath,
        outputPath: this.status.outputPath,
        pid: this.status.pid,
        startedAt: this.status.startedAt,
        endedAt: this.status.endedAt,
        exitCode: this.status.exitCode,
        error: this.status.error,
      },
    }
  }

  private validateSimulationRun(dealPath: string): string | null {
    let resolvedDealId: string | null = null
    try {
      const deal = JSON.parse(readFileSync(join(this.projectRoot, dealPath), 'utf8')) as { dealId?: unknown }
      resolvedDealId = typeof deal.dealId === 'string' && deal.dealId.trim() ? deal.dealId.trim() : null
    } catch {
      resolvedDealId = null
    }

    const validateArgs = [
      join(this.projectRoot, 'scripts', 'validate-contracts.js'),
      '--deal',
      dealPath,
      ...(resolvedDealId ? ['--deal-id', resolvedDealId] : []),
    ]
    const result = spawnSync('node', validateArgs, {
      cwd: this.projectRoot,
      encoding: 'utf8',
      windowsHide: true,
    })
    const output = commandOutput(result)
    if (output) console.log(`[run:${this.status.runId}:validate]\n${output}`)
    if (result.status === 0) return null
    return `Post-run contract validation failed${result.status !== null ? ` with code ${result.status}` : ''}${output ? `: ${output}` : ''}`
  }

  start(request: StartRunRequest = {}): StartRunResponse {
    if (this.status.active) {
      return {
        statusCode: 409,
        body: {
          error: 'A run is already active',
          runId: this.status.runId,
          state: this.status.state,
        },
      }
    }

    const mode = sanitizeMode(request.mode)
    const speed = sanitizeSpeed(request.speed)
    const dealPath = sanitizeDealPath(request.dealPath)
    const scenario = sanitizeScenario(request.scenario)
    const seed = sanitizeSeed(request.seed)
    const workflowId = sanitizeWorkflowId(request.workflowId)
    const runtimeProvider = sanitizeRuntimeProvider(request.runtimeProvider)
    const presetId = sanitizePresetId(request.presetId)
    const inputSnapshotPath = sanitizeInputSnapshotPath(request.inputSnapshotPath)
    const codexMaxAgents = sanitizePositiveInteger(request.codexMaxAgents)
    const codexConcurrency = sanitizePositiveInteger(request.codexConcurrency, 2) ?? 2
    const codexSandbox = sanitizeOptionalString(request.codexSandbox) || 'read-only'
    const codexModel = sanitizeOptionalString(request.codexModel)
    const codexSearch = request.codexSearch === true
    // A1: single-agent (or subset) dispatch — codex only.
    const codexAgents = sanitizeAgentList(request.codexAgents)
    // W70: retries default to small (2) when omitted; 0 is an explicit valid choice.
    const codexMaxRetries = sanitizeNonNegativeInteger(request.codexMaxRetries, 2)
    const codexRetryBaseMs = sanitizeNonNegativeInteger(request.codexRetryBaseMs, 1000)
    // W71: rerun-failed reuses the prior run's id so its manifest can be read.
    const codexRerunFailed = request.codexRerunFailed === true
    const codexRerunRunId = sanitizeOptionalString(request.codexRerunRunId)
    const reset = request.reset !== false
    const runId =
      codexRerunFailed && runtimeProvider === 'codex' && codexRerunRunId
        ? codexRerunRunId
        : `run_${nowIso().replace(/[:.]/g, '-')}`
    const outputPath = runtimeProvider === 'codex' ? `data/codex-runs/${runId}` : null

    this.status = {
      active: true,
      runId,
      dealPath,
      workflowId,
      runtimeProvider,
      presetId,
      inputSnapshotPath,
      outputPath,
      state: 'STARTING',
      mode,
      speed,
      pid: null,
      startedAt: nowIso(),
      endedAt: null,
      exitCode: null,
      error: null,
    }
    this.emit('state', { reset, dealPath, workflowId, runtimeProvider, presetId, inputSnapshotPath, outputPath })

    if (reset && runtimeProvider === 'simulation') {
      try {
        this.resetRuntimeArtifacts()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.status = {
          ...this.status,
          active: false,
          dealPath: null,
          state: 'FAILED',
          endedAt: nowIso(),
          error: `Failed to reset runtime artifacts: ${message}`,
        }
        this.emit('error', { reason: this.status.error })
        return {
          statusCode: 500,
          body: {
            error: this.status.error,
            runId: this.status.runId,
          },
        }
      }
    }

    const scriptPath =
      runtimeProvider === 'codex'
        ? join(this.projectRoot, 'scripts', 'codex-agent-runner.js')
        : join(this.projectRoot, 'scripts', 'orchestrate.js')
    const agentDelayMs = speedToDelayMs(speed)

    const args: string[] =
      runtimeProvider === 'codex'
        ? [
            scriptPath,
            '--deal',
            dealPath,
            '--scenario',
            scenario,
            '--workflow',
            workflowId,
            '--run-id',
            runId,
            '--concurrency',
            String(codexConcurrency),
            '--sandbox',
            codexSandbox,
            '--max-retries',
            String(codexMaxRetries),
            '--retry-base-ms',
            String(codexRetryBaseMs),
            ...(inputSnapshotPath ? ['--input-snapshot', inputSnapshotPath] : []),
            ...(codexMaxAgents ? ['--max-agents', String(codexMaxAgents)] : []),
            ...(codexAgents.length ? codexAgents.flatMap((agent) => ['--agent', agent]) : []),
            ...(codexModel ? ['--model', codexModel] : []),
            ...(codexSearch ? ['--search'] : []),
            ...(codexRerunFailed ? ['--rerun-failed'] : []),
          ]
        : [
            scriptPath,
            '--deal',
            dealPath,
            '--scenario',
            scenario,
            '--workflow',
            workflowId,
            '--run-id',
            runId,
            ...(inputSnapshotPath ? ['--input-snapshot', inputSnapshotPath] : []),
            ...(seed !== null ? ['--seed', String(seed)] : []),
            '--agent-delay-ms',
            String(agentDelayMs),
          ]

    try {
      const child = spawn('node', args, {
        cwd: this.projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.child = child
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.status = {
        ...this.status,
        active: false,
        state: 'FAILED',
        endedAt: nowIso(),
        error: `Failed to spawn run: ${message}`,
      }
      this.emit('error', { reason: this.status.error })
      return {
        statusCode: 500,
        body: {
          error: this.status.error,
          runId: this.status.runId,
        },
      }
    }

    const currentRunId = runId

    const child = this.child
    if (!child) {
      this.status = {
        ...this.status,
        active: false,
        dealPath: null,
        state: 'FAILED',
        endedAt: nowIso(),
        error: 'Failed to retain child process handle',
      }
      this.emit('error', { reason: this.status.error })
      return {
        statusCode: 500,
        body: {
          error: this.status.error,
          runId: this.status.runId,
        },
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (text) console.log(`[run:${currentRunId}] ${text}`)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (text) console.error(`[run:${currentRunId}:stderr] ${text}`)
    })

    child.on('error', (err: Error) => {
      if (this.status.runId !== currentRunId) return
      this.clearStopTimer()
      this.status = {
        ...this.status,
        active: false,
        state: 'FAILED',
        endedAt: nowIso(),
        exitCode: null,
        pid: null,
        error: `Child process error: ${err.message}`,
      }
      this.child = null
      this.emit('error', { reason: this.status.error })
    })

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.status.runId !== currentRunId) return
      this.clearStopTimer()
      const stoppedByUser = this.status.state === 'STOPPING'
      const childSucceeded = !stoppedByUser && code === 0
      const validationError = childSucceeded && runtimeProvider === 'simulation'
        ? this.validateSimulationRun(dealPath)
        : null
      const succeeded = childSucceeded && !validationError
      const failed = !stoppedByUser && !succeeded

      this.status = {
        ...this.status,
        active: false,
        dealPath: null,
        state: stoppedByUser ? 'STOPPED' : succeeded ? 'COMPLETED' : 'FAILED',
        endedAt: nowIso(),
        pid: null,
        exitCode: code,
        error: validationError ?? (failed ? `Run exited with code ${code}${signal ? ` (${signal})` : ''}` : null),
      }

      this.child = null

      if (stoppedByUser) {
        this.emit('stopped', { code, signal })
      } else if (succeeded) {
        this.emit('exited', { code, signal })
      } else {
        this.emit('error', { code, signal, reason: this.status.error })
      }
    })

    this.status = {
      ...this.status,
      state: 'RUNNING',
      pid: child.pid ?? null,
    }
    this.emit('started', {
      pid: this.status.pid,
      mode,
      speed,
      reset,
      dealPath,
      workflowId,
      runtimeProvider,
      presetId,
      inputSnapshotPath,
      outputPath,
      scenario,
      seed,
      agentDelayMs,
      script: scriptPath,
      ...(runtimeProvider === 'codex'
        ? {
            codexMaxAgents,
            codexConcurrency,
            codexSandbox,
            codexSearch,
            codexModel,
            codexAgents,
            codexMaxRetries,
            codexRetryBaseMs,
            codexRerunFailed,
            codexRerunRunId,
          }
        : {}),
    })

    return {
      statusCode: 202,
      body: {
        runId: this.status.runId,
        status: 'started',
        mode: this.status.mode,
        speed: this.status.speed,
        workflowId: this.status.workflowId,
        runtimeProvider: this.status.runtimeProvider,
        presetId: this.status.presetId,
        inputSnapshotPath: this.status.inputSnapshotPath,
        outputPath: this.status.outputPath,
        pid: this.status.pid,
        startedAt: this.status.startedAt,
      },
    }
  }

  stop(): StopRunResponse {
    if (!this.status.active || !this.child) {
      return {
        statusCode: 200,
        body: {
          status: 'idle',
          active: false,
          dealPath: null,
          runId: this.status.runId,
          state: this.status.state,
        },
      }
    }

    if (this.status.state === 'STOPPING') {
      return {
        statusCode: 200,
        body: {
          status: 'stopping',
          runId: this.status.runId,
          state: this.status.state,
        },
      }
    }

    this.status = { ...this.status, state: 'STOPPING' }
    this.emit('state', { action: 'stop-requested' })

    const activeRunId = this.status.runId
    const activePid = this.status.pid

    try {
      this.killChildProcessTree()
      this.clearStopTimer()
      this.stopTimer = setTimeout(() => {
        if (!this.child) return
        if (this.status.runId !== activeRunId) return
        if (this.status.state !== 'STOPPING') return
        try {
          this.child.kill('SIGKILL')
        } catch (err) {
          console.error('[run-manager] Failed to force kill process', err)
        }
      }, 5000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.status = {
        ...this.status,
        active: false,
        state: 'FAILED',
        endedAt: nowIso(),
        error: `Failed to stop run: ${message}`,
      }
      this.emit('error', { reason: this.status.error })
      return {
        statusCode: 500,
        body: {
          error: this.status.error,
          runId: this.status.runId,
        },
      }
    }

    return {
      statusCode: 200,
      body: {
        status: 'stopping',
        runId: activeRunId,
        pid: activePid,
      },
    }
  }

  private emit(event: RunMessage['event'], details: Record<string, unknown> = {}): void {
    this.onEvent({
      type: 'run',
      event,
      runId: this.status.runId,
      state: this.status.state,
      mode: this.status.mode,
      speed: this.status.speed,
      timestamp: nowIso(),
      details,
    })
  }

  private resetRuntimeArtifacts(): void {
    const runtimeDirs = ['logs', 'normalized', 'phase-outputs', 'reports', 'status']
    for (const name of runtimeDirs) {
      const fullPath = join(this.dataRoot, name)
      if (existsSync(fullPath)) {
        rmSync(fullPath, { recursive: true, force: true })
      }
      mkdirSync(fullPath, { recursive: true })
    }
    if (this.onReset) this.onReset()
  }

  private clearStopTimer(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
  }

  private killChildProcessTree(): void {
    if (!this.child) return
    const pid = this.child.pid
    if (process.platform === 'win32' && pid) {
      const result = spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
        cwd: this.projectRoot,
        stdio: 'ignore',
      })
      if (result.status === 0) return
    }
    this.child.kill()
  }
}
