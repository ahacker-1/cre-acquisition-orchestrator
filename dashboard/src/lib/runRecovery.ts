import { API_URL } from '../config'
import type { AgentCheckpoint, DealCheckpoint, StoryEvent } from '../types/checkpoint'

// W72: Operator-visible partial-failure recovery.
//
// A run is "partial" when the lifecycle finished but one or more specialist agents
// failed. We surface those failed agents from every signal the dashboard already
// receives offline — live agent checkpoints, the deal checkpoint's per-phase agent
// statuses, and `agent_failed` story events — and offer a one-click re-run that only
// re-executes the failed agents via the run API (`codexRerunFailed` + `codexRerunRunId`).

export interface FailedAgentSummary {
  agentName: string
  phase: string
  reason?: string
}

function titleize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()
}

function normalizeAgentKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Collect failed agents from the live agent checkpoints, the deal checkpoint's
 * per-phase agent statuses, and `agent_failed` story events. De-duplicated by
 * normalized agent name so the same failure reported by multiple signals is shown once.
 */
export function collectFailedAgents(
  dealCheckpoint: DealCheckpoint | null,
  agentCheckpoints: Map<string, AgentCheckpoint>,
  storyEvents: StoryEvent[],
): FailedAgentSummary[] {
  const byKey = new Map<string, FailedAgentSummary>()

  const record = (agentName: string, phase: string, reason?: string) => {
    const key = normalizeAgentKey(agentName)
    if (!key) return
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.reason && reason) existing.reason = reason
      return
    }
    byKey.set(key, { agentName: titleize(agentName), phase, reason })
  }

  for (const agent of agentCheckpoints.values()) {
    if (agent.status === 'failed') {
      const reason = agent.errors?.find((entry) => entry.message)?.message
      record(agent.agentName, agent.phase || 'unknown', reason)
    }
  }

  if (dealCheckpoint) {
    for (const [phaseKey, phase] of Object.entries(dealCheckpoint.phases)) {
      const statuses = phase.agentStatuses || {}
      for (const [agentName, status] of Object.entries(statuses)) {
        if (typeof status === 'string' && status.toLowerCase() === 'failed') {
          record(agentName, phaseKey, undefined)
        }
      }
    }
  }

  for (const event of storyEvents) {
    if (event.kind === 'agent_failed') {
      const agentName =
        (typeof event.agent === 'string' && event.agent) ||
        (typeof event.fromAgent === 'string' && event.fromAgent) ||
        ''
      if (!agentName) continue
      const reason =
        (typeof event.summary === 'string' && event.summary) ||
        (typeof event.title === 'string' && event.title) ||
        undefined
      record(agentName, typeof event.phase === 'string' ? event.phase : 'unknown', reason)
    }
  }

  return [...byKey.values()]
}

/**
 * The codex run id whose failed agents should be re-run. Prefer the run id carried by
 * an `agent_failed` story event (so the manifest with `failedAgents` can be reused),
 * falling back to the most recent run id seen in the deal's story events and finally
 * the checkpoint run id when replaying a completed/partial run from disk.
 */
export function recoveryRunId(storyEvents: StoryEvent[], dealCheckpoint?: DealCheckpoint | null): string | null {
  const failedEvent = [...storyEvents].reverse().find((event) => event.kind === 'agent_failed' && event.runId)
  if (failedEvent?.runId) return failedEvent.runId
  const anyEvent = [...storyEvents].reverse().find((event) => Boolean(event.runId))
  return anyEvent?.runId ?? dealCheckpoint?.runId ?? null
}

export interface RetryFailedAgentsRequest {
  dealPath: string
  runId: string
  workflowId?: string
  scenario?: string
}

export interface RetryFailedAgentsResult {
  runId?: string
  status?: string
  [key: string]: unknown
}

export type RetryFailedAgentsFetch = (
  input: string,
  init: RequestInit,
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

export interface RetryFailedAgentsOptions {
  fetchImpl?: RetryFailedAgentsFetch
}

/**
 * Re-run only the failed agents from a prior codex run. Backward-compatible with the
 * run API: sets `codexRerunFailed` + `codexRerunRunId` so the runner reuses the prior
 * run's manifest and re-executes its `failedAgents` only.
 */
export async function retryFailedAgents(
  request: RetryFailedAgentsRequest,
  options: RetryFailedAgentsOptions = {},
): Promise<RetryFailedAgentsResult> {
  const fetchImpl = options.fetchImpl ?? (fetch as RetryFailedAgentsFetch)
  const response = await fetchImpl(`${API_URL}/api/run/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dealPath: request.dealPath,
      mode: 'live',
      speed: 'normal',
      reset: false,
      runtimeProvider: 'codex',
      workflowId: request.workflowId,
      scenario: request.scenario ?? 'core-plus',
      // Keep web search on for the re-run so retried agents have the same capability as the
      // (default-on) original run rather than silently losing outside-fact lookups.
      codexSearch: true,
      codexRerunFailed: true,
      codexRerunRunId: request.runId,
    }),
  })
  const payload = (await response.json().catch(() => ({}))) as RetryFailedAgentsResult & { error?: string }
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to retry failed agents')
  }
  return payload
}
