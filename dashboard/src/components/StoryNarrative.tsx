import { useMemo } from 'react'
import type { StoryEvent } from '../types/checkpoint'

interface StoryNarrativeProps {
  storyEvents: StoryEvent[]
  compact?: boolean
}

function eventTone(kind: string): { dot: string; text: string } {
  if (kind === 'run_completed' || kind === 'phase_completed' || kind === 'agent_completed') {
    return { dot: 'bg-cre-success', text: 'text-cre-success' }
  }
  if (kind === 'agent_failed' || kind === 'phase_failed' || kind === 'run_error') {
    return { dot: 'bg-cre-danger', text: 'text-cre-danger' }
  }
  if (kind === 'agent_dependency' || kind === 'human_input_required') {
    return { dot: 'bg-cre-warning', text: 'text-cre-warning' }
  }
  if (kind === 'agent_handoff' || kind === 'phase_handoff' || kind === 'agent_message' || kind === 'agent_review') {
    return { dot: 'bg-cre-info', text: 'text-cre-info' }
  }
  if (kind === 'decision_made' || kind === 'milestone') {
    return { dot: 'bg-cre-warning', text: 'text-cre-warning' }
  }
  return { dot: 'bg-cre-info', text: 'text-cre-info' }
}

function prettyTs(value: string): string {
  const t = Date.parse(value)
  if (!Number.isFinite(t)) return value
  return new Date(t).toLocaleTimeString('en-US', { hour12: false })
}

function textField(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function eventKindLabel(event: StoryEvent): string {
  const labels: Record<string, string> = {
    run_started: 'Mission opened',
    phase_started: 'Workstream activated',
    agent_started: 'Agent started work',
    agent_completed: 'Workpaper filed',
    document_created: 'Artifact produced',
    agent_handoff: 'Context handed off',
    phase_handoff: 'Workstream handoff',
    agent_message: 'Agent update',
    agent_review: 'Peer review',
    agent_dependency: 'Dependency raised',
    human_input_required: 'Operator needed',
    decision_made: 'Decision logged',
    milestone: 'Milestone reached',
    phase_completed: 'Workstream completed',
    run_completed: 'Mission completed',
  }
  return labels[event.kind] || event.kind.replace(/_/g, ' ')
}

function eventLabel(event: StoryEvent): string {
  if (event.kind === 'agent_handoff' || event.kind === 'phase_handoff') {
    const from = textField(event.fromAgent || event.fromPhase || event.agent || event.phaseLabel, 'Team')
    const to = textField(event.toAgent || event.toPhase, 'Next team')
    return `${from} handed off to ${to}`
  }
  if (event.kind === 'agent_message') {
    const from = textField(event.fromAgent || event.agent, 'Agent')
    const to = textField(event.toAgent, 'team')
    return `${from} updated ${to}`
  }
  if (event.kind === 'agent_dependency') {
    return typeof event.summary === 'string' && event.summary
      ? event.summary
      : 'Agent dependency requires attention'
  }
  if (typeof event.title === 'string' && event.title.length > 0) return event.title
  if (typeof event.agent === 'string' && event.kind.startsWith('agent_')) {
    return `${event.agent} ${event.kind.replace('agent_', '').replace(/_/g, ' ')}`
  }
  if (typeof event.phaseLabel === 'string' && event.phaseLabel.length > 0) {
    return `${event.phaseLabel} ${event.kind.replace('phase_', '').replace(/_/g, ' ')}`
  }
  return event.kind.replace(/_/g, ' ')
}

export default function StoryNarrative({ storyEvents, compact = false }: StoryNarrativeProps) {
  const orderedEvents = useMemo(() => {
    const events = [...storyEvents].sort((a, b) => a.seq - b.seq)
    return compact ? events.slice(-6) : events
  }, [compact, storyEvents])

  if (orderedEvents.length === 0) {
    return (
      <div className="card flex items-center justify-center h-64 text-center">
        <div>
          <p className="text-gray-400">The room is quiet. Start orchestration and the live agent feed will show workpapers, handoffs, blockers, and decisions as they happen.</p>
          <p className="text-xs text-gray-600 mt-1">
            The next specialist move will appear here as soon as the team starts working.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {compact ? 'Latest Agent Moves' : 'Live Deal Team Feed'}
      </h3>
      <div className="space-y-3">
        {orderedEvents.map((event) => {
          const tone = eventTone(event.kind)
          return (
            <div key={`${event.runId}-${event.seq}`} className="rounded-lg border border-cre-border bg-black/20 p-3">
              <div className="flex items-center gap-2 text-xs mb-1">
                <span className={`inline-block w-2 h-2 rounded-full ${tone.dot}`} />
                <span className={`${tone.text} font-semibold uppercase tracking-wider`}>{eventKindLabel(event)}</span>
                <span className="text-gray-600 ml-auto">{prettyTs(event.ts)}</span>
              </div>
              <p className="text-sm text-gray-200">{eventLabel(event)}</p>
              {typeof event.subtitle === 'string' && event.subtitle.length > 0 && <p className="text-xs text-gray-500 mt-1">{event.subtitle}</p>}
              {typeof event.summary === 'string' && event.summary.length > 0 && <p className="text-xs text-gray-500 mt-1">{event.summary}</p>}
              <div className="flex gap-3 text-xs text-gray-600 mt-2 flex-wrap">
                {typeof event.phase === 'string' && event.phase.length > 0 && <span>Workstream: {event.phase}</span>}
                {typeof event.agent === 'string' && event.agent.length > 0 && <span>Team member: {event.agent}</span>}
                {typeof event.verdict === 'string' && event.verdict.length > 0 && <span>Verdict: {event.verdict}</span>}
                {typeof event.redFlagCount === 'number' && <span>Risks: {event.redFlagCount}</span>}
                {typeof event.dataGapCount === 'number' && <span>Missing evidence: {event.dataGapCount}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
