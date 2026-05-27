import { useMemo } from 'react'
import type { StoryEvent } from '../../types/checkpoint'

// The feed's own tone vocabulary (adds "review" for human-attention events on top of the
// spine's done/live/blocked/idle). Maps to the shared .cre-dot-* status markers.
type FeedTone = 'done' | 'live' | 'blocked' | 'review' | 'idle'

const FEED_DOT: Record<FeedTone, string> = {
  done: 'cre-dot cre-dot-done',
  live: 'cre-dot cre-dot-live cre-dot-pulse',
  blocked: 'cre-dot cre-dot-blocked',
  review: 'cre-dot cre-dot-review',
  idle: 'cre-dot cre-dot-idle',
}

export function feedToneFromEvent(event: StoryEvent): FeedTone {
  const kind = String(event.kind ?? '').toLowerCase()
  const verdict = String(event.verdict ?? '').toUpperCase()
  if (kind.includes('fail') || kind.includes('error') || verdict === 'FAIL') return 'blocked'
  if (kind.includes('complete') || kind.includes('finished') || verdict === 'PASS') return 'done'
  if (event.requiresHuman || event.importance === 'critical') return 'review'
  if (kind.includes('start') || kind.includes('running') || kind.includes('progress')) return 'live'
  return 'idle'
}

function formatClock(ts: string | undefined): string {
  if (!ts) return ''
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function humanizeKind(kind: string | undefined): string {
  if (!kind) return 'activity'
  return kind.replace(/[_-]+/g, ' ')
}

function eventLabel(event: StoryEvent): string {
  return String(event.title || event.summary || humanizeKind(event.kind))
}

interface LiveFeedProps {
  storyEvents: StoryEvent[]
  limit?: number
}

/**
 * The war-room heartbeat: a newest-first chronological feed of every agent's activity,
 * sourced from the existing WebSocket story-event stream. Color appears only on the dot.
 */
export default function LiveFeed({ storyEvents, limit = 40 }: LiveFeedProps) {
  const rows = useMemo(() => {
    return [...storyEvents]
      .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))
      .slice(0, limit)
  }, [storyEvents, limit])

  return (
    <section data-testid="live-feed" aria-label="Live team feed">
      <p className="portal-kicker">Live Feed</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-gray-600">
          No team activity yet. Summon an agent or run a stage to watch the team work.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((event) => (
            <li
              key={`${event.runId}-${event.seq}`}
              data-testid="live-feed-row"
              data-agent={event.agent ?? ''}
              className="flex items-start gap-2 text-[11px] leading-5"
            >
              <span className={`${FEED_DOT[feedToneFromEvent(event)]} mt-1`} aria-hidden="true" />
              <span className="font-mono text-gray-600">{formatClock(event.ts)}</span>
              <span className="min-w-0">
                {event.agent && <span className="text-gray-200">{event.agent} </span>}
                <span className="text-gray-500">{eventLabel(event)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
