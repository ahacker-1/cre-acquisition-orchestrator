import { useState, useEffect, useRef, useCallback } from 'react'
import type {
  DealCheckpoint,
  PhaseStatus,
  Verdict,
  PhaseInfo,
  AgentCheckpoint,
  LogEntry,
  RunStatus,
  RunEventMessage,
  RunLifecycleState,
  StartRunRequestPayload,
  WebSocketMessage,
  RedFlag,
  DataGap,
  StoryEvent,
  DocumentArtifact,
} from '../types/checkpoint'

const WS_URL = 'ws://localhost:8080'
const API_URL = 'http://localhost:8081'
const MAX_RECONNECT_DELAY = 30000
const MAX_RECONNECT_ATTEMPTS = 20

function createIdleRunStatus(): RunStatus {
  return {
    active: false,
    runId: null,
    dealPath: null,
    state: 'IDLE',
    mode: null,
    speed: null,
    pid: null,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    error: null,
  }
}

function normalizeRunLifecycleState(value: unknown): RunLifecycleState {
  if (typeof value !== 'string') return 'IDLE'
  const upper = value.toUpperCase()
  if (
    upper === 'IDLE' ||
    upper === 'STARTING' ||
    upper === 'RUNNING' ||
    upper === 'STOPPING' ||
    upper === 'COMPLETED' ||
    upper === 'FAILED' ||
    upper === 'STOPPED'
  ) {
    return upper
  }
  return 'IDLE'
}

function normalizeRunStatus(value: unknown): RunStatus {
  if (!value || typeof value !== 'object') return createIdleRunStatus()
  const raw = value as Record<string, unknown>
  return {
    active: Boolean(raw.active),
    runId: typeof raw.runId === 'string' ? raw.runId : null,
    dealPath: typeof raw.dealPath === 'string' ? raw.dealPath : null,
    state: normalizeRunLifecycleState(raw.state),
    mode: raw.mode === 'fast' || raw.mode === 'live' ? raw.mode : null,
    speed: raw.speed === 'fast' || raw.speed === 'normal' || raw.speed === 'slow' ? raw.speed : null,
    pid: typeof raw.pid === 'number' ? raw.pid : null,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
    endedAt: typeof raw.endedAt === 'string' ? raw.endedAt : null,
    exitCode: typeof raw.exitCode === 'number' ? raw.exitCode : null,
    error: typeof raw.error === 'string' ? raw.error : null,
  }
}

function normalizeProgress(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value > 1) return Math.min(value / 100, 1)
  return Math.min(value, 1)
}

function timestampFromValue(value: unknown): number {
  if (typeof value !== 'string' || value.trim().length === 0) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function dealTimestamp(deal: DealCheckpoint): number {
  return Math.max(timestampFromValue(deal.lastUpdatedAt), timestampFromValue(deal.startedAt))
}

function parseLogLine(line: string): LogEntry | null {
  const match = line.match(
    /^\[(\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?)\]\s+\[([^\]]+)\]\s+\[(ACTION|FINDING|INFO|PHASE|ERROR|DATA_GAP|COMPLETE)\]\s+(.+)$/
  )
  if (!match) return null
  return {
    timestamp: match[1],
    agent: match[2],
    category: match[3] as LogEntry['category'],
    message: match[4],
  }
}

function isRawDealCheckpoint(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'dealId' in data &&
    'phases' in data
  )
}

const PHASE_KEY_MAP: Record<string, string> = {
  dueDiligence: 'due_diligence',
  'due-diligence': 'due_diligence',
  due_diligence: 'due_diligence',
  underwriting: 'underwriting',
  financing: 'financing',
  legal: 'legal',
  closing: 'closing',
}

function normalizePhaseKey(key: string): string {
  if (PHASE_KEY_MAP[key]) return PHASE_KEY_MAP[key]
  let normalized = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
  normalized = normalized.replace(/-/g, '_')
  return normalized
}

const STANDARD_PHASE_KEYS = new Set([
  'status', 'progress', 'startedAt', 'completedAt', 'name',
  'agents', 'outputs', 'dataForDownstream', 'agentStatuses',
  'verdict', 'phaseSummary', 'keyFindings', 'redFlags', 'dataGaps',
  'phaseVerdict', 'overallVerdict', 'recommendation',
])

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function normalizeRedFlag(rawFlag: unknown): RedFlag | null {
  if (!rawFlag || typeof rawFlag !== 'object') return null
  const value = rawFlag as Record<string, unknown>
  const description =
    asString(value.description) ||
    asString(value.message) ||
    asString(value.title) ||
    'Flag'
  const rawSeverity = asString(value.severity, 'MEDIUM').toUpperCase()
  const severity: RedFlag['severity'] =
    rawSeverity === 'CRITICAL' || rawSeverity === 'HIGH' || rawSeverity === 'LOW'
      ? rawSeverity
      : 'MEDIUM'
  return {
    description,
    severity,
    category: asString(value.category, 'GENERAL'),
    message: asOptionalString(value.message),
    owner: asOptionalString(value.owner),
    impact: asOptionalString(value.impact),
    status: asOptionalString(value.status),
    createdAt: asOptionalString(value.createdAt),
  }
}

function normalizeDataGap(rawGap: unknown): DataGap | null {
  if (!rawGap) return null
  if (typeof rawGap === 'string') {
    return { description: rawGap, message: rawGap }
  }
  if (typeof rawGap !== 'object') return null
  const value = rawGap as Record<string, unknown>
  const description =
    asString(value.description) ||
    asString(value.message) ||
    asString(value.title) ||
    'Data gap'
  return {
    description,
    message: asOptionalString(value.message),
    severity: asOptionalString(value.severity),
    category: asOptionalString(value.category),
    owner: asOptionalString(value.owner),
    impact: asOptionalString(value.impact),
    status: asOptionalString(value.status),
    createdAt: asOptionalString(value.createdAt),
  }
}

function normalizeRedFlags(value: unknown): RedFlag[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeRedFlag)
    .filter((flag): flag is RedFlag => flag !== null)
}

function normalizeDataGaps(value: unknown): DataGap[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeDataGap)
    .filter((gap): gap is DataGap => gap !== null)
}

function mergePhaseData(rawPhase: Record<string, unknown>): Record<string, unknown> | undefined {
  const explicit = (rawPhase.dataForDownstream as Record<string, unknown>) || {}
  const extras: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rawPhase)) {
    if (!STANDARD_PHASE_KEYS.has(k)) {
      extras[k] = v
    }
  }
  if (Object.keys(explicit).length === 0 && Object.keys(extras).length === 0) return undefined
  return { ...extras, ...explicit }
}

function normalizeDealCheckpoint(raw: Record<string, unknown>): DealCheckpoint | null {
  if (!raw.dealId || !raw.phases) return null

  const rawPhases = raw.phases as Record<string, Record<string, unknown>>
  const normalizedPhases: Record<string, PhaseInfo> = {}

  for (const [key, rawPhase] of Object.entries(rawPhases)) {
    const normalizedKey = normalizePhaseKey(key)
    const rawOutputs = ((rawPhase.outputs as Record<string, unknown>) || {})

    const rawAgentStatuses = (rawPhase.agentStatuses || {}) as Record<string, string>
    const agentStatuses = Object.fromEntries(
      Object.entries(rawAgentStatuses).map(([agent, status]) => [
        agent,
        typeof status === 'string'
          ? status.toLowerCase() === 'completed'
            ? 'complete'
            : status.toLowerCase() === 'in_progress'
              ? 'running'
              : status.toLowerCase()
          : 'pending',
      ])
    ) as Record<string, string>
    const statusValues = Object.values(agentStatuses)
    const agents = {
      total: statusValues.length,
      completed: statusValues.filter((s) => /^complete$/i.test(s)).length,
      running: statusValues.filter((s) => /^running$/i.test(s)).length,
      failed: statusValues.filter((s) => /^failed$/i.test(s)).length,
      pending: statusValues.filter((s) => /^pending$/i.test(s)).length,
    }

    const progress = typeof rawPhase.progress === 'number'
      ? normalizeProgress(rawPhase.progress)
      : normalizeProgress(agents.total > 0 ? agents.completed / agents.total : 0)

    const rawPhaseStatus = ((rawPhase.status as string) || 'pending').toLowerCase()
    const normalizedStatus =
      rawPhaseStatus === 'completed'
        ? 'complete'
        : rawPhaseStatus === 'in_progress'
          ? 'running'
          : rawPhaseStatus

    normalizedPhases[normalizedKey] = {
      name: normalizedKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      status: normalizedStatus as PhaseStatus,
      progress,
      startedAt: asNullableString(rawPhase.startedAt),
      completedAt: asNullableString(rawPhase.completedAt),
      agents,
      outputs: {
        phaseSummary: asString(rawOutputs.phaseSummary) || asString(rawPhase.phaseSummary),
        keyFindings:
          (Array.isArray(rawOutputs.keyFindings) ? rawOutputs.keyFindings : rawPhase.keyFindings) as string[] || [],
        redFlags: normalizeRedFlags(rawOutputs.redFlags ?? rawPhase.redFlags),
        dataGaps: normalizeDataGaps(rawOutputs.dataGaps ?? rawPhase.dataGaps),
        phaseVerdict: ((rawOutputs.phaseVerdict as string) || (rawPhase.verdict as string) || null) as Verdict,
      },
      dataForDownstream: mergePhaseData(rawPhase),
      agentStatuses,
      verdict: asOptionalString(rawPhase.verdict),
    }
  }

  const rawProp = raw.property as Record<string, unknown> | undefined
  const property = {
    address: asString(rawProp?.address) || asString(raw.address, 'N/A'),
    city: asString(rawProp?.city) || asString(raw.city),
    state: asString(rawProp?.state) || asString(raw.state),
    zip: (rawProp?.zip ?? raw.zip) != null ? String(rawProp?.zip ?? raw.zip) : undefined,
    totalUnits: toNumberOrNull(rawProp?.totalUnits ?? raw.totalUnits) ?? 0,
    askingPrice: toNumberOrNull(rawProp?.askingPrice ?? raw.askingPrice) ?? 0,
  }

  const rawDealStatus = ((raw.status as string) || 'pending').toLowerCase()
  const normalizedDealStatus =
    rawDealStatus === 'completed'
      ? 'complete'
      : rawDealStatus === 'in_progress'
        ? 'running'
        : rawDealStatus

  return {
    dealId: raw.dealId as string,
    dealName: asString(raw.dealName, 'Unknown Deal'),
    property,
    status: normalizedDealStatus,
    overallProgress: normalizeProgress(raw.overallProgress),
    startedAt: asString(raw.startedAt, ''),
    lastUpdatedAt: asString(raw.lastUpdatedAt) || asString(raw.lastUpdated),
    phases: normalizedPhases,
    resumeInstructions: asString(raw.resumeInstructions, ''),
  }
}

function normalizeAgentCheckpoint(raw: AgentCheckpoint): AgentCheckpoint {
  const phase = normalizePhaseKey(raw.phase || '')
  const statusRaw = typeof raw.status === 'string' ? raw.status.toLowerCase() : 'pending'
  const status =
    statusRaw === 'completed'
      ? 'complete'
      : statusRaw === 'in_progress'
        ? 'running'
        : statusRaw

  return {
    ...raw,
    phase,
    status: status as AgentCheckpoint['status'],
    progress: normalizeProgress(raw.progress),
    redFlags: normalizeRedFlags(raw.redFlags),
    dataGaps: normalizeDataGaps(raw.dataGaps),
  }
}

function normalizeStoryEvent(value: unknown): StoryEvent | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const runId = asString(raw.runId)
  const dealId = asString(raw.dealId)
  const kind = asString(raw.kind)
  const ts = asString(raw.ts) || new Date().toISOString()
  const seq = typeof raw.seq === 'number' ? raw.seq : Number(raw.seq ?? 0)
  if (!runId || !dealId || !kind || !Number.isFinite(seq)) return null
  return {
    ...raw,
    runId,
    dealId,
    kind,
    ts,
    seq,
  }
}

function normalizeDocumentArtifact(value: unknown): DocumentArtifact | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const docId = asString(raw.docId)
  const runId = asString(raw.runId)
  const dealId = asString(raw.dealId)
  if (!docId || !runId || !dealId) return null
  return {
    docId,
    runId,
    dealId,
    phase: asString(raw.phase, 'general'),
    agent: asString(raw.agent, 'system'),
    docType: asString(raw.docType, 'artifact'),
    title: asString(raw.title, docId),
    path: asString(raw.path),
    mime: asString(raw.mime, 'text/plain'),
    version: typeof raw.version === 'number' ? raw.version : 1,
    summary: asString(raw.summary),
    dependsOn: Array.isArray(raw.dependsOn) ? (raw.dependsOn as string[]) : [],
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    status: asString(raw.status, 'final'),
    createdAt: asOptionalString(raw.createdAt),
  }
}

function mergeStoryEvents(
  previous: StoryEvent[],
  incoming: StoryEvent[],
): StoryEvent[] {
  const byKey = new Map<string, StoryEvent>()
  const all = [...previous, ...incoming]
  all.forEach((event) => {
    byKey.set(`${event.runId}:${event.seq}`, event)
  })
  return [...byKey.values()].sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq
    return a.ts.localeCompare(b.ts)
  })
}

function mergeDocuments(
  previous: DocumentArtifact[],
  incoming: DocumentArtifact[],
): DocumentArtifact[] {
  const byId = new Map<string, DocumentArtifact>()
  const all = [...previous, ...incoming]
  all.forEach((doc) => {
    byId.set(doc.docId, doc)
  })
  return [...byId.values()].sort((a, b) => {
    return timestampFromValue(a.createdAt) - timestampFromValue(b.createdAt)
  })
}

function mergeLogEntries(previous: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  const byKey = new Map<string, LogEntry>()
  for (const entry of [...previous, ...incoming]) {
    const key = `${entry.timestamp}|${entry.agent}|${entry.category}|${entry.message}`
    byKey.set(key, entry)
  }
  return [...byKey.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

function documentFromEvent(event: StoryEvent): DocumentArtifact | null {
  if (event.kind !== 'document_created') return null
  const rawDocId = event.docId
  if (typeof rawDocId !== 'string' || rawDocId.length === 0) return null
  return normalizeDocumentArtifact({
    docId: rawDocId,
    runId: event.runId,
    dealId: event.dealId,
    phase: typeof event.phase === 'string' ? event.phase : 'general',
    agent: typeof event.agent === 'string' ? event.agent : 'system',
    docType: typeof event.docType === 'string' ? event.docType : 'artifact',
    title: typeof event.title === 'string' ? event.title : rawDocId,
    path: typeof event.path === 'string' ? event.path : '',
    mime: typeof event.mime === 'string' ? event.mime : 'text/plain',
    version: typeof event.version === 'number' ? event.version : 1,
    summary: typeof event.summary === 'string' ? event.summary : '',
    tags: Array.isArray(event.tags) ? event.tags : [],
    status: 'final',
    createdAt: event.ts,
  })
}

export function useCheckpointData() {
  const [dealCheckpoint, setDealCheckpoint] = useState<DealCheckpoint | null>(null)
  const [agentCheckpoints, setAgentCheckpoints] = useState<Map<string, AgentCheckpoint>>(
    new Map()
  )
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [storyEvents, setStoryEvents] = useState<StoryEvent[]>([])
  const [documentArtifacts, setDocumentArtifacts] = useState<DocumentArtifact[]>([])
  const [connected, setConnected] = useState(false)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [reconnectIn, setReconnectIn] = useState(0)
  const [runStatus, setRunStatus] = useState<RunStatus>(createIdleRunStatus())
  const [runRequestPending, setRunRequestPending] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const currentRunIdRef = useRef<string | null>(null)

  const refreshRunStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/run/status`)
      if (!response.ok) return
      const payload = await response.json()
      if (!mountedRef.current) return
      const normalized = normalizeRunStatus(payload)
      currentRunIdRef.current = normalized.runId
      setRunStatus(normalized)
    } catch {
      // Keep existing run status if API is temporarily unavailable.
    }
  }, [])

  const refreshRunArtifacts = useCallback(async (runId: string) => {
    const encoded = encodeURIComponent(runId)

    try {
      const eventsResponse = await fetch(`${API_URL}/api/run/${encoded}/events`)
      if (eventsResponse.ok) {
        const payload = (await eventsResponse.json()) as Record<string, unknown>
        const events = Array.isArray(payload.events)
          ? payload.events
              .map(normalizeStoryEvent)
              .filter((event): event is StoryEvent => event !== null)
          : []
        if (mountedRef.current) {
          setStoryEvents((prev) => mergeStoryEvents(prev, events))
        }
      }
    } catch {
      // Event endpoint may not be ready at run startup.
    }

    try {
      const documentsResponse = await fetch(`${API_URL}/api/run/${encoded}/documents`)
      if (documentsResponse.ok) {
        const payload = (await documentsResponse.json()) as Record<string, unknown>
        const documents = Array.isArray(payload.documents)
          ? payload.documents
              .map(normalizeDocumentArtifact)
              .filter((doc): doc is DocumentArtifact => doc !== null)
          : []
        if (mountedRef.current) {
          setDocumentArtifacts((prev) => mergeDocuments(prev, documents))
        }
      }
    } catch {
      // Documents endpoint may not be ready at run startup.
    }
  }, [])

  const resetLocalState = useCallback(() => {
    setDealCheckpoint(null)
    setAgentCheckpoints(new Map())
    setLogEntries([])
    setStoryEvents([])
    setDocumentArtifacts([])
  }, [])

  const startLiveRun = useCallback(async () => {
    setRunRequestPending(true)
    try {
      const payload: StartRunRequestPayload = {
        dealPath: 'config/deal.json',
        mode: 'live',
        speed: 'normal',
        reset: true,
      }
      const response = await fetch(`${API_URL}/api/run/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as Record<string, unknown>
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to start run'
        )
      }
      if (!mountedRef.current) return
      resetLocalState()
      await refreshRunStatus()
    } catch (err) {
      if (!mountedRef.current) return
      setRunStatus((prev) => ({
        ...prev,
        state: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      }))
    } finally {
      if (mountedRef.current) setRunRequestPending(false)
    }
  }, [refreshRunStatus, resetLocalState])

  const stopRun = useCallback(async () => {
    setRunRequestPending(true)
    try {
      const response = await fetch(`${API_URL}/api/run/stop`, {
        method: 'POST',
      })
      const data = (await response.json()) as Record<string, unknown>
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to stop run'
        )
      }
      await refreshRunStatus()
    } catch (err) {
      if (!mountedRef.current) return
      setRunStatus((prev) => ({
        ...prev,
        state: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      }))
    } finally {
      if (mountedRef.current) setRunRequestPending(false)
    }
  }, [refreshRunStatus])

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        setConnected(true)
        reconnectDelayRef.current = 1000
        setReconnectAttempt(0)
        setReconnectIn(0)
        void refreshRunStatus()
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
        }
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setConnected(false)
        wsRef.current = null

        setReconnectAttempt((prev) => {
          const next = prev + 1
          if (next > MAX_RECONNECT_ATTEMPTS) return next
          return next
        })

        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY)

        const delaySec = Math.ceil(delay / 1000)
        setReconnectIn(delaySec)
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = setInterval(() => {
          if (!mountedRef.current) return
          setReconnectIn((prev) => {
            if (prev <= 1) {
              if (countdownTimerRef.current) {
                clearInterval(countdownTimerRef.current)
                countdownTimerRef.current = null
              }
              return 0
            }
            return prev - 1
          })
        }, 1000)

        reconnectTimerRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        // onclose will fire after onerror, reconnection handled there
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return

        let msg: WebSocketMessage
        try {
          msg = JSON.parse(event.data) as WebSocketMessage
        } catch {
          return
        }

        switch (msg.type) {
          case 'initial': {
            if (msg.checkpoints) {
              const agents = new Map<string, AgentCheckpoint>()
              const deals: DealCheckpoint[] = []

              for (const checkpoint of Object.values(msg.checkpoints)) {
                const raw = checkpoint as unknown as Record<string, unknown>
                if (isRawDealCheckpoint(raw)) {
                  const normalized = normalizeDealCheckpoint(raw)
                  if (normalized) deals.push(normalized)
                } else {
                  const agent = normalizeAgentCheckpoint(raw as unknown as AgentCheckpoint)
                  if (agent.agentName) {
                    agents.set(agent.agentName, agent)
                  }
                }
              }

              if (deals.length > 0) {
                deals.sort((a, b) => dealTimestamp(b) - dealTimestamp(a))
                setDealCheckpoint(deals[0])
              } else {
                setDealCheckpoint(null)
              }
              setAgentCheckpoints(agents)
            }

            if (msg.logs && typeof msg.logs === 'object') {
              const allParsed: LogEntry[] = []
              for (const lines of Object.values(msg.logs as Record<string, string[]>)) {
                if (!Array.isArray(lines)) continue
                for (const line of lines) {
                  const entry = parseLogLine(line)
                  if (entry) allParsed.push(entry)
                }
              }
              allParsed.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
              setLogEntries((prev) => mergeLogEntries(prev, allParsed))
            } else {
              setLogEntries([])
            }

            if (msg.events && typeof msg.events === 'object') {
              const initialEvents = Object.values(msg.events as Record<string, unknown[]>)
                .flat()
                .map(normalizeStoryEvent)
                .filter((storyEvent): storyEvent is StoryEvent => storyEvent !== null)
              setStoryEvents(initialEvents.sort((a, b) => a.seq - b.seq))
            } else {
              setStoryEvents([])
            }

            if (msg.documents && typeof msg.documents === 'object') {
              const initialDocuments = Object.values(msg.documents as Record<string, unknown>)
                .flatMap((record) => {
                  if (!record || typeof record !== 'object') return []
                  const value = record as Record<string, unknown>
                  return Array.isArray(value.documents) ? value.documents : []
                })
                .map(normalizeDocumentArtifact)
                .filter((doc): doc is DocumentArtifact => doc !== null)
              setDocumentArtifacts(initialDocuments)
            } else {
              setDocumentArtifacts([])
            }
            break
          }

          case 'checkpoint': {
            if (msg.data) {
              const raw = msg.data as unknown as Record<string, unknown>
              if (isRawDealCheckpoint(raw)) {
                const normalized = normalizeDealCheckpoint(raw)
                if (normalized) {
                  setDealCheckpoint((prev) => {
                    if (!prev) return normalized
                    return dealTimestamp(normalized) >= dealTimestamp(prev) ? normalized : prev
                  })
                }
              } else {
                const agent = normalizeAgentCheckpoint(raw as unknown as AgentCheckpoint)
                if (agent.agentName) {
                  setAgentCheckpoints((prev) => {
                    const next = new Map(prev)
                    next.set(agent.agentName, agent)
                    return next
                  })
                }
              }
            }
            break
          }

          case 'log': {
            if (msg.lines && Array.isArray(msg.lines)) {
              const parsed = msg.lines
                .map(parseLogLine)
                .filter((entry): entry is LogEntry => entry !== null)
              if (parsed.length > 0) {
                setLogEntries((prev) => mergeLogEntries(prev, parsed))
              }
            }
            break
          }

          case 'event': {
            const normalized = normalizeStoryEvent(msg.event)
            if (!normalized) break
            setStoryEvents((prev) => mergeStoryEvents(prev, [normalized]))
            const doc = documentFromEvent(normalized)
            if (doc) {
              setDocumentArtifacts((prev) => mergeDocuments(prev, [doc]))
            }
            break
          }

          case 'run': {
            const runMsg = msg as RunEventMessage
            const nextRunId = runMsg.runId ?? currentRunIdRef.current
            if (nextRunId !== undefined) {
              currentRunIdRef.current = nextRunId
            }
            setRunStatus((prev) => ({
              ...prev,
              runId: runMsg.runId ?? prev.runId,
              dealPath:
                typeof runMsg.details?.dealPath === 'string'
                  ? runMsg.details.dealPath
                  : runMsg.state === 'COMPLETED' || runMsg.state === 'FAILED' || runMsg.state === 'STOPPED' || runMsg.state === 'IDLE'
                    ? null
                    : prev.dealPath,
              state: runMsg.state ?? prev.state,
              mode: runMsg.mode ?? prev.mode,
              speed: runMsg.speed ?? prev.speed,
              active:
                runMsg.state === 'STARTING' ||
                runMsg.state === 'RUNNING' ||
                runMsg.state === 'STOPPING',
              ...(typeof runMsg.details?.pid === 'number'
                ? { pid: runMsg.details.pid as number }
                : {}),
              ...(typeof runMsg.details?.error === 'string'
                ? { error: runMsg.details.error as string }
                : runMsg.event === 'started' || runMsg.event === 'exited' || runMsg.event === 'stopped'
                  ? { error: null }
                  : {}),
            }))

            if (runMsg.event === 'started') {
              resetLocalState()
            }
            break
          }
        }
      }
    } catch {
      setReconnectAttempt((prev) => prev + 1)
      const delay = reconnectDelayRef.current
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY)

      const delaySec = Math.ceil(delay / 1000)
      setReconnectIn(delaySec)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = setInterval(() => {
        if (!mountedRef.current) return
        setReconnectIn((prev) => {
          if (prev <= 1) {
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current)
              countdownTimerRef.current = null
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)

      reconnectTimerRef.current = setTimeout(connect, delay)
    }
  }, [refreshRunStatus, resetLocalState])

  useEffect(() => {
    mountedRef.current = true
    void refreshRunStatus()
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect, refreshRunStatus])

  useEffect(() => {
    const runId = runStatus.runId
    if (!runId) {
      setStoryEvents([])
      setDocumentArtifacts([])
      return
    }

    void refreshRunArtifacts(runId)

    if (
      runStatus.state !== 'STARTING' &&
      runStatus.state !== 'RUNNING' &&
      runStatus.state !== 'STOPPING'
    ) {
      return
    }

    const timer = setInterval(() => {
      void refreshRunArtifacts(runId)
    }, 2000)

    return () => clearInterval(timer)
  }, [refreshRunArtifacts, runStatus.runId, runStatus.state])

  return {
    dealCheckpoint,
    agentCheckpoints,
    logEntries,
    storyEvents,
    documentArtifacts,
    connected,
    reconnectAttempt,
    reconnectIn,
    runStatus,
    runRequestPending,
    startLiveRun,
    stopRun,
    refreshRunStatus,
  }
}
