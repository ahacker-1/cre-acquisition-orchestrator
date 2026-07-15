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
      <div className="flex items-center gap-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#aeb8bf]">Live team</p>
        <span className="cre-dot cre-dot-done" aria-hidden="true" />
      </div>
      {rows.length === 0 ? (
        <p className="mt-5 max-w-[28ch] text-xs leading-5 text-[#9aa6ae]">
          No team activity yet. Summon an agent or run a stage to watch the team work.
        </p>
      ) : (
        <ul
          className="mt-5 divide-y divide-white/[0.06] border-y border-white/[0.08]"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Team activity, newest first"
        >
          {rows.map((event) => (
            <li
              key={`${event.runId}-${event.seq}`}
              data-testid="live-feed-row"
              data-agent={event.agent ?? ''}
              className="grid grid-cols-[auto_42px_minmax(0,1fr)] items-start gap-2 py-3 text-[11px] leading-5"
            >
              <span className={`${FEED_DOT[feedToneFromEvent(event)]} mt-1.5`} aria-hidden="true" />
              <span className="font-mono text-[10px] tabular-nums text-[#82909a]">{formatClock(event.ts)}</span>
              <span className="min-w-0">
                {event.agent && <span className="text-[#dbe1e5]">{event.agent} </span>}
                <span className="text-[#98a4ac]">{eventLabel(event)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
