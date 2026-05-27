import { useCallback, useState } from 'react'
import { API_URL } from '../config'
import type { RuntimeProvider } from '../types/checkpoint'
import type { WorkflowLaunchResponse } from '../types/workflows'

// Phase 3 / A1 — single-agent dispatch.
//
// Phase 0 reality (DEAL-WORKSPACE-REDESIGN-PLAN.md): real single-agent dispatch is CODEX-ONLY.
// The offline `orchestrate.js` simulation has no per-agent flag, so:
//   - OFFLINE (simulation / no live run): dispatch is a NO-OP that returns a notice telling the
//     operator to switch to the Codex runtime. The panel still shows the agent's already-recorded
//     work (replay) via buildAgentPanelView — no new run is started.
//   - CODEX: POST a one-agent codex run (codexAgents:[agentName], codexMaxAgents:1, reset:false)
//     to the full-acquisition-review workflow (its '*' wildcard contains every agent).

// The workflow whose wildcard phase plan contains every agent — so any single agent can be
// dispatched into it without the agent being missing from the selected workflow.
export const DISPATCH_WORKFLOW_ID = 'full-acquisition-review'

export interface DispatchResult {
  status: 'dispatched' | 'offline-noop' | 'error'
  notice: string
  runId?: string
}

export interface DispatchAgentOptions {
  dealId: string
  runtimeProvider: RuntimeProvider
  // Injectable for tests; defaults to global fetch.
  fetchImpl?: typeof fetch
}

const OFFLINE_NOTICE =
  'Offline replay — switch to the Codex runtime (Advanced) to dispatch this agent live.'

/**
 * Pure dispatch core (no React) so it can be unit-tested with a mocked fetch. Codex runtime →
 * launches a one-agent codex run; simulation → no-op with a notice.
 */
export async function requestAgentDispatch(
  agentName: string,
  task: string | undefined,
  options: DispatchAgentOptions,
): Promise<DispatchResult> {
  const { dealId, runtimeProvider } = options
  if (runtimeProvider !== 'codex') {
    // Offline-first: never start a run; the recorded work is already on screen.
    return { status: 'offline-noop', notice: OFFLINE_NOTICE }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(
      `${API_URL}/api/workflows/${encodeURIComponent(DISPATCH_WORKFLOW_ID)}/launch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId,
          scenario: 'core-plus',
          speed: 'fast',
          mode: 'live',
          runtimeProvider: 'codex',
          reset: false,
          codexAgents: [agentName],
          codexMaxAgents: 1,
          // A follow-up task is recorded as a note on the run snapshot.
          ...(task ? { notes: task } : {}),
          requireSourceBackedInputs: true,
        }),
      },
    )
    const payload = (await response.json()) as WorkflowLaunchResponse & {
      error?: string
      readiness?: { blockers?: string[] }
    }
    if (!response.ok) {
      // The most common (and otherwise cryptic) failure: the deal's critical fields aren't yet
      // source-backed, so a live review is gated. Turn the terse server error into a clear next
      // step — drop the source docs so intake auto-fills them, then summon again.
      if (payload.error === 'Workflow launch readiness blocked') {
        const blockers = Array.isArray(payload.readiness?.blockers) ? payload.readiness.blockers : []
        const detail = blockers.length > 0 ? ` (${blockers.join('; ')})` : ''
        return {
          status: 'error',
          notice: `${agentName} needs source-backed deal inputs before a live run${detail}. Drop the rent roll, T-12, or offering memo so the team can auto-fill them, then summon again.`,
        }
      }
      return { status: 'error', notice: payload.error || 'Failed to dispatch agent' }
    }
    return {
      status: 'dispatched',
      notice: `Dispatched ${agentName} live (run ${payload.runId}).`,
      runId: payload.runId,
    }
  } catch (err) {
    return { status: 'error', notice: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Hook wrapper around requestAgentDispatch. Exposes `dispatchAgent(agentName, task?)`, the last
 * dispatch notice, and a `dispatching` flag. The per-agent event stream is NOT owned here — the
 * AgentPanel derives it from the existing WebSocket feed via buildAgentPanelView (Hook 3 is a
 * client-side selector, no separate subscription).
 */
export function useAgentDispatch(dealId: string, runtimeProvider: RuntimeProvider) {
  const [dispatching, setDispatching] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const dispatchAgent = useCallback(
    async (agentName: string, task?: string): Promise<DispatchResult> => {
      setDispatching(true)
      try {
        const result = await requestAgentDispatch(agentName, task, { dealId, runtimeProvider })
        setNotice(result.notice)
        return result
      } finally {
        setDispatching(false)
      }
    },
    [dealId, runtimeProvider],
  )

  return { dispatchAgent, dispatching, notice }
}
