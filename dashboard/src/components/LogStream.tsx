import { useState, useEffect, useRef, useMemo } from 'react'
import type { LogEntry } from '../types/checkpoint'

interface LogStreamProps {
  logEntries: LogEntry[]
}

type CategoryFilter = LogEntry['category']

const ALL_CATEGORIES: CategoryFilter[] = [
  'ACTION',
  'FINDING',
  'INFO',
  'PHASE',
  'ERROR',
  'DATA_GAP',
  'COMPLETE',
]

const CATEGORY_CLASSES: Record<CategoryFilter, string> = {
  ACTION: 'log-action',
  FINDING: 'log-finding',
  INFO: 'log-action',
  PHASE: 'log-finding',
  ERROR: 'log-error',
  DATA_GAP: 'log-data-gap',
  COMPLETE: 'log-complete',
}

const CATEGORY_LABEL_COLORS: Record<CategoryFilter, string> = {
  ACTION: 'text-cre-info',
  FINDING: 'text-cre-success',
  INFO: 'text-blue-300',
  PHASE: 'text-purple-300',
  ERROR: 'text-cre-danger',
  DATA_GAP: 'text-cre-warning',
  COMPLETE: 'text-gray-100',
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp)
    return d.toLocaleTimeString('en-US', { hour12: false })
  } catch {
    return timestamp
  }
}

export default function LogStream({ logEntries }: LogStreamProps) {
  const [autoScroll, setAutoScroll] = useState(true)
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [enabledCategories, setEnabledCategories] = useState<Set<CategoryFilter>>(
    new Set(ALL_CATEGORIES)
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  // Unique agent names for dropdown
  const agentNames = useMemo(() => {
    const names = new Set<string>()
    for (const entry of logEntries) {
      names.add(entry.agent)
    }
    return Array.from(names).sort()
  }, [logEntries])

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return logEntries.filter((entry) => {
      if (agentFilter !== 'all' && entry.agent !== agentFilter) return false
      if (!enabledCategories.has(entry.category)) return false
      return true
    })
  }, [logEntries, agentFilter, enabledCategories])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredEntries, autoScroll])

  const toggleCategory = (cat: CategoryFilter) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Filter controls */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-cre-border bg-cre-surface flex-wrap">
        {/* Agent filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="logstream-agent-filter" className="text-xs text-gray-500 uppercase tracking-wider">Agent</label>
          <select
            id="logstream-agent-filter"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="bg-cre-bg border border-cre-border rounded px-2 py-1 text-sm text-gray-300 outline-none focus:border-cre-accent"
          >
            <option value="all">All Agents</option>
            {agentNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Category toggles */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 uppercase tracking-wider">Show</label>
          {ALL_CATEGORIES.map((cat) => (
            <label key={cat} className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledCategories.has(cat)}
                onChange={() => toggleCategory(cat)}
                className="accent-cre-accent rounded"
              />
              <span className={`text-xs font-medium ${CATEGORY_LABEL_COLORS[cat]}`}>
                {cat.replace('_', ' ')}
              </span>
            </label>
          ))}
        </div>

        {/* Auto-scroll toggle */}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={() => setAutoScroll(!autoScroll)}
              className="accent-cre-accent rounded"
            />
            <span className="text-xs text-gray-400">Auto-scroll</span>
          </label>
          <span className="text-xs text-gray-600">
            {filteredEntries.length} / {logEntries.length} entries
          </span>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Agent log stream"
        className="h-[500px] overflow-y-auto bg-black/40 font-mono"
        onScroll={() => {
          if (!scrollRef.current) return
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
          const isAtBottom = scrollHeight - scrollTop - clientHeight < 40
          if (!isAtBottom && autoScroll) {
            setAutoScroll(false)
          }
        }}
      >
        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            {logEntries.length === 0
              ? 'Waiting for log entries...'
              : 'No entries match current filters'}
          </div>
        ) : (
          filteredEntries.map((entry, i) => (
            <div
              key={i}
              className={`log-entry ${CATEGORY_CLASSES[entry.category]} hover:bg-white/5`}
            >
              <span className="text-gray-600">{formatTime(entry.timestamp)}</span>{' '}
              <span className="text-gray-500">[{entry.agent}]</span>{' '}
              <span className="font-semibold">[{entry.category}]</span>{' '}
              <span>{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
