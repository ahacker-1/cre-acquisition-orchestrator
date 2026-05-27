import type {
  AgentCheckpoint,
  DocumentArtifact,
  StoryEvent,
} from '../types/checkpoint'
import type {
  AgentOutput,
  AgentRunStatus,
  AgentStreamLine,
} from '../components/workspace/AgentPanel'

// Hook 3 (per-agent live stream): a CLIENT-SIDE selector over the existing WebSocket data.
// Agent checkpoints are keyed by the kebab agent id (`agentName`), and every story event /
// document artifact carries that same id in `agent` / `fromAgent`. So one agent's view is just
// a filter of those three feeds — no server change (Phase 0 finding, Hook 3 = REUSE).

export interface AgentPanelView {
  status: AgentRunStatus
  streamLines: AgentStreamLine[]
  output: AgentOutput | null
  elapsedLabel?: string
}

export interface AgentViewSources {
  agentCheckpoints: Map<string, AgentCheckpoint>
  storyEvents: StoryEvent[]
  documentArtifacts: DocumentArtifact[]
  // Optional: open the agent's full workpaper by path (wired by the frame).
  onOpenWorkpaper?: (path: string) => void
  // Optional: "file to deal" affordance (live/codex only — offline replay leaves it undefined).
  onFile?: () => void
}

// AgentCheckpoint.status is already normalized to lowercase by useCheckpointData
// (COMPLETE -> complete, in_progress -> running). Map it to the panel's run status.
export function checkpointStatusToRunStatus(status: string | undefined): AgentRunStatus {
  switch (status) {
    case 'running':
      return 'working'
    case 'complete':
      return 'done'
    case 'failed':
      return 'failed'
    case 'pending':
    case 'skipped':
    default:
      return 'queued'
  }
}

// Kinds that mark an agent's work as finished (latest such line renders as 'done').
const COMPLETION_KINDS = new Set(['agent_completed', 'agent_failed', 'document_created'])

// Replay fallback: when no per-agent checkpoint is in hand (e.g. a manually-opened saved deal,
// where the dashboard passes recorded story events + artifacts but not the live checkpoint map),
// infer the agent's run status from its recorded story events so the panel still reflects "done"
// / "failed" instead of defaulting to "queued".
export function inferStatusFromEvents(
  agentName: string,
  storyEvents: StoryEvent[],
): AgentRunStatus | undefined {
  const mine = storyEvents.filter((event) => event.agent === agentName || event.fromAgent === agentName)
  if (mine.length === 0) return undefined
  if (mine.some((event) => event.kind === 'agent_failed')) return 'failed'
  if (mine.some((event) => event.kind === 'agent_completed' || event.kind === 'document_created')) return 'done'
  return 'working'
}

function streamLineText(event: StoryEvent): string {
  const title = typeof event.title === 'string' ? event.title.trim() : ''
  if (title) return title
  const summary = typeof event.summary === 'string' ? event.summary.trim() : ''
  if (summary) return summary
  return event.kind
}

// Build the agent's reasoning stream from its story events, oldest-first (by seq). The latest
// line is toned 'current' while the agent is still working; a completion line is toned 'done'.
export function buildAgentStreamLines(
  agentName: string,
  storyEvents: StoryEvent[],
  status: AgentRunStatus,
): AgentStreamLine[] {
  const mine = storyEvents
    .filter((event) => event.agent === agentName || event.fromAgent === agentName)
    .slice()
    .sort((a, b) => {
      if (a.seq !== b.seq) return a.seq - b.seq
      return a.ts.localeCompare(b.ts)
    })

  return mine.map((event, index) => {
    const isLast = index === mine.length - 1
    const isCompletion = COMPLETION_KINDS.has(event.kind)
    let tone: AgentStreamLine['tone'] = 'normal'
    if (isCompletion) {
      tone = 'done'
    } else if (isLast && status === 'working') {
      tone = 'current'
    } else if (isLast && status === 'done') {
      tone = 'done'
    }
    return {
      // seq is unique per run; suffix the index so two events that share a seq still get
      // distinct React keys.
      id: `${event.runId}:${event.seq}:${index}`,
      text: streamLineText(event),
      tone,
    }
  })
}

function formatVerdict(verdict: string): string {
  return verdict.replace(/_/g, ' ')
}

// Build the agent's output card from its filed workpaper (DocumentArtifact) plus the structured
// outputs on its checkpoint (finding / impact / caveats / verdict). If the agent has filed no
// workpaper, there is no output to show yet (returns null).
export function buildAgentOutput(
  agentName: string,
  documentArtifacts: DocumentArtifact[],
  checkpoint: AgentCheckpoint | undefined,
  options: { onOpenWorkpaper?: (path: string) => void; onFile?: () => void } = {},
): AgentOutput | null {
  // Prefer a `workpaper` doc; fall back to the agent's most recent artifact of any type.
  const mine = documentArtifacts.filter((doc) => doc.agent === agentName)
  if (mine.length === 0) return null
  const workpaper =
    mine.find((doc) => doc.docType === 'workpaper') ??
    mine.slice().sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0]

  const rows: AgentOutput['rows'] = []
  const outputs = checkpoint?.outputs

  // Summary: prefer the checkpoint's analytic summary, else the artifact's.
  const summary =
    (typeof outputs?.summary === 'string' && outputs.summary.trim()) ||
    (typeof workpaper.summary === 'string' && workpaper.summary.trim()) ||
    ''
  if (summary) rows.push({ label: 'Summary', value: summary })

  // Verdict (if any) is impact-weighted.
  if (outputs?.verdict) {
    rows.push({ label: 'Verdict', value: formatVerdict(String(outputs.verdict)), impact: true })
  }

  // Top finding (the first structured finding, if distinct from the summary).
  const firstFinding = outputs?.findings?.find(
    (finding) => typeof finding === 'string' && finding.trim() && finding.trim() !== summary,
  )
  if (firstFinding) rows.push({ label: 'Finding', value: firstFinding.trim() })

  // Red flags / data gaps surface as caveats (impact-weighted), if present.
  const caveats: string[] = []
  if (checkpoint?.redFlags?.length) {
    caveats.push(`${checkpoint.redFlags.length} red flag${checkpoint.redFlags.length === 1 ? '' : 's'}`)
  }
  if (checkpoint?.dataGaps?.length) {
    caveats.push(`${checkpoint.dataGaps.length} data gap${checkpoint.dataGaps.length === 1 ? '' : 's'}`)
  }
  if (caveats.length > 0) {
    rows.push({ label: 'Caveats', value: caveats.join(' · '), impact: true })
  }

  // Always give at least one row so the output card is meaningful even for a bare workpaper.
  if (rows.length === 0) {
    rows.push({ label: 'Summary', value: workpaper.title })
  }

  return {
    title: workpaper.title,
    rows,
    onOpenFull:
      workpaper.path && options.onOpenWorkpaper
        ? () => options.onOpenWorkpaper?.(workpaper.path)
        : undefined,
    onFile: options.onFile,
  }
}

/**
 * Assemble the full AgentPanel data feed for one agent from the existing checkpoint/event/artifact
 * data. Pure: same inputs -> same view. Used by both offline replay (recorded work) and the live
 * Codex path (the WS feed updates the same three sources, so the same selector drives both).
 */
export function buildAgentPanelView(
  agentName: string,
  sources: AgentViewSources,
): AgentPanelView {
  const checkpoint = sources.agentCheckpoints.get(agentName)
  // Prefer the checkpoint's status; if there's no checkpoint, fall back to what the recorded
  // story events imply (replay of a saved deal), else 'queued'.
  const status = checkpoint
    ? checkpointStatusToRunStatus(checkpoint.status)
    : inferStatusFromEvents(agentName, sources.storyEvents) ?? 'queued'
  const streamLines = buildAgentStreamLines(agentName, sources.storyEvents, status)
  const output = buildAgentOutput(agentName, sources.documentArtifacts, checkpoint, {
    onOpenWorkpaper: sources.onOpenWorkpaper,
    onFile: sources.onFile,
  })
  return { status, streamLines, output }
}
