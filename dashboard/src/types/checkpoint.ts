import type { PhaseDownstreamData } from './phase-contracts'

export type AgentStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped'

export type PhaseStatus = 'pending' | 'running' | 'complete' | 'failed' | 'blocked'

export type Verdict = 'PASS' | 'FAIL' | 'CONDITIONAL' | 'NEEDS_REVIEW' | 'PROCEED_WITH_MITIGATIONS' | null

export interface RedFlag {
  description: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  category: string
  message?: string
  owner?: string
  impact?: string
  status?: string
  createdAt?: string
}

export interface DataGap {
  description: string
  message?: string
  severity?: string
  category?: string
  owner?: string
  impact?: string
  status?: string
  createdAt?: string
}

export interface AgentError {
  message: string
  timestamp: string
  recoverable: boolean
}

export interface AgentCheckpoint {
  agentName: string
  phase: string
  dealId: string
  status: AgentStatus
  progress: number
  startedAt: string | null
  completedAt: string | null
  lastUpdatedAt: string | null
  resumePoint: string | null
  outputs: {
    summary: string
    findings: string[]
    metrics: Record<string, unknown>
    verdict: Verdict
  }
  dataGaps: DataGap[]
  errors: AgentError[]
  redFlags: RedFlag[]
  childAgents: {
    agentName: string
    status: string
    taskId: string
  }[]
}

export interface PhaseInfo {
  name: string
  status: PhaseStatus
  progress: number
  startedAt: string | null
  completedAt: string | null
  agents: {
    total: number
    completed: number
    running: number
    failed: number
    pending: number
  }
  outputs: {
    phaseSummary: string
    keyFindings: string[]
    redFlags: RedFlag[]
    dataGaps: DataGap[]
    phaseVerdict: Verdict
  }
  dataForDownstream?: PhaseDownstreamData | Record<string, unknown>
  agentStatuses?: Record<string, string>
  verdict?: string
}

export interface DealCheckpoint {
  dealId: string
  dealName: string
  property: {
    address: string
    city: string
    state: string
    zip?: string
    totalUnits: number
    askingPrice: number
  }
  status: string
  overallProgress: number
  startedAt: string
  lastUpdatedAt: string
  phases: Record<string, PhaseInfo>
  resumeInstructions: string
}

export interface LogEntry {
  timestamp: string
  agent: string
  category: 'ACTION' | 'FINDING' | 'INFO' | 'PHASE' | 'ERROR' | 'DATA_GAP' | 'COMPLETE'
  message: string
}

export type RunMode = 'live' | 'fast'
export type RunSpeed = 'fast' | 'normal' | 'slow'
export type RunLifecycleState = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'COMPLETED' | 'FAILED' | 'STOPPED'

export interface RunStatus {
  active: boolean
  runId: string | null
  dealPath: string | null
  state: RunLifecycleState
  mode: RunMode | null
  speed: RunSpeed | null
  pid: number | null
  startedAt: string | null
  endedAt: string | null
  exitCode: number | null
  error: string | null
}

export interface RunEventMessage {
  type: 'run'
  event: 'started' | 'state' | 'stopped' | 'exited' | 'error'
  runId: string | null
  state: RunLifecycleState
  mode?: RunMode | null
  speed?: RunSpeed | null
  timestamp: string
  details?: Record<string, unknown>
}

export interface StoryEvent {
  runId: string
  dealId: string
  seq: number
  ts: string
  kind: string
  phase?: string
  phaseLabel?: string
  agent?: string
  title?: string
  subtitle?: string
  summary?: string
  rationale?: string
  emphasis?: string
  verdict?: string
  redFlagCount?: number
  dataGapCount?: number
  inputs?: string[]
  impact?: string[]
  tags?: string[]
  [key: string]: unknown
}

export interface DocumentArtifact {
  docId: string
  runId: string
  dealId: string
  phase: string
  agent: string
  docType: string
  title: string
  path: string
  mime: string
  version: number
  summary: string
  dependsOn?: string[]
  tags?: string[]
  status?: string
  createdAt?: string
}

export type WebSocketMessage =
  | {
      type: 'initial'
      checkpoints?: Record<string, unknown>
      logs?: Record<string, string[]>
      events?: Record<string, unknown[]>
      documents?: Record<string, unknown>
    }
  | {
      type: 'checkpoint'
      path?: string
      data?: DealCheckpoint | AgentCheckpoint
    }
  | {
      type: 'log'
      path?: string
      lines?: string[]
    }
  | {
      type: 'event'
      path?: string
      event?: StoryEvent
    }
  | RunEventMessage

export interface StartRunRequestPayload {
  dealPath: string
  mode: RunMode
  speed: RunSpeed
  reset: boolean
  scenario?: string
  seed?: number
}
