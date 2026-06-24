import { useEffect, useRef, useState, type FormEvent } from 'react'

export type AgentRunStatus = 'queued' | 'working' | 'done' | 'failed'

export interface AgentStreamLine {
  id: string
  text: string
  tone?: 'normal' | 'current' | 'done'
}

export interface AgentOutputRow {
  label: string
  value: string
  impact?: boolean
}

export interface AgentOutput {
  title: string
  rows: AgentOutputRow[]
  onOpenFull?: () => void
  onFile?: () => void
}

const STATUS_DOT: Record<AgentRunStatus, string> = {
  queued: 'cre-dot cre-dot-idle',
  working: 'cre-dot cre-dot-live cre-dot-pulse',
  done: 'cre-dot cre-dot-done',
  failed: 'cre-dot cre-dot-blocked',
}

const STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: 'queued',
  working: 'working',
  done: 'done',
  failed: 'failed',
}

interface AgentPanelProps {
  open: boolean
  agentName: string
  agentRole?: string
  task?: string
  taskSource?: string
  status: AgentRunStatus
  elapsedLabel?: string
  streamLines: AgentStreamLine[]
  output?: AgentOutput | null
  followUpSuggestions?: string[]
  onFollowUp?: (text: string) => void
  /** Live (Codex) allows on-demand follow-up dispatch; offline is a read/replay of recorded work. */
  liveDispatch?: boolean
  /** A declined/failed live follow-up dispatch notice, surfaced in the follow-up area. */
  notice?: string
  onClose: () => void
}

/**
 * The unit of working with ONE agent: the task it was given, its live (or replayed) reasoning,
 * the workpaper it produced, and a follow-up box to keep tasking it. Slides in over a dimmed
 * workspace; the live feed keeps running behind it.
 */
export default function AgentPanel({
  open,
  agentName,
  agentRole,
  task,
  taskSource,
  status,
  elapsedLabel,
  streamLines,
  output,
  followUpSuggestions = [],
  onFollowUp,
  liveDispatch = false,
  notice,
  onClose,
}: AgentPanelProps) {
  const [followUp, setFollowUp] = useState('')
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Dialog a11y: focus the panel on open, restore focus to the opener on close, close on
  // Escape, and trap Tab focus inside the panel so keyboard users can't wander behind the scrim.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  function submitFollowUp(event: FormEvent): void {
    event.preventDefault()
    const trimmed = followUp.trim()
    if (!trimmed || !onFollowUp) return
    onFollowUp(trimmed)
    setFollowUp('')
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="agent-panel">
      {/* Scrim — dims the workspace; the live feed keeps running underneath. */}
      <button
        type="button"
        aria-label="Close agent panel"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${agentName} agent`}
        tabIndex={-1}
        className="relative flex h-full w-[min(94vw,400px)] flex-col overflow-y-auto border-l border-white/15 bg-cre-surface shadow-[-18px_0_50px_rgba(0,0,0,0.6)] focus:outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-serif text-xl font-semibold text-white">{agentName}</h2>
            {agentRole && (
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-cre-live">{agentRole}</p>
            )}
          </div>
          <button
            type="button"
            data-testid="agent-panel-close"
            onClick={onClose}
            className="shrink-0 border border-white/10 px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </header>

        {task && (
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-[9.5px] uppercase tracking-[0.14em] text-gray-600">Task</p>
            <p className="mt-1 text-sm text-white">{task}</p>
            {taskSource && <p className="mt-1 text-[10px] text-cre-live">↳ {taskSource}</p>}
          </div>
        )}

        <div className="border-b border-white/10 px-4 py-3" data-testid="agent-panel-stream">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-2 text-gray-300">
              <span className={STATUS_DOT[status]} aria-hidden="true" />
              {STATUS_LABEL[status]}
            </span>
            {elapsedLabel && <span className="font-mono text-gray-500">{elapsedLabel}</span>}
          </div>
          {streamLines.length === 0 ? (
            <p className="mt-3 text-xs text-gray-600">
              {status === 'queued' ? 'Queued — waiting to start.' : 'No activity recorded yet.'}
            </p>
          ) : (
            <ul className="mt-3 space-y-1" role="log" aria-live="polite" aria-label="Agent reasoning, live">
              {streamLines.map((line) => (
                <li
                  key={line.id}
                  className={[
                    'text-[11px] leading-5',
                    line.tone === 'current' ? 'text-white' : line.tone === 'done' ? 'text-cre-done' : 'text-gray-400',
                  ].join(' ')}
                >
                  <span className="text-gray-600" aria-hidden="true">▸ </span>
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {output && (
          <div className="border-b border-white/10 bg-cre-success/[0.04] px-4 py-3" data-testid="agent-panel-output">
            <p className="text-[9.5px] uppercase tracking-[0.14em] text-cre-done">Output · {output.title}</p>
            <dl className="mt-2 space-y-1.5">
              {output.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-[11px]">
                  <dt className="text-gray-600">{row.label}</dt>
                  <dd className={row.impact ? 'text-cre-warning' : 'text-gray-200'}>{row.value}</dd>
                </div>
              ))}
            </dl>
            {(output.onOpenFull || output.onFile) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {output.onOpenFull && (
                  <button
                    type="button"
                    data-testid="agent-panel-open-workpaper"
                    onClick={output.onOpenFull}
                    className="border border-cre-live/50 px-3 py-1 text-[11px] text-cre-live hover:bg-white/5"
                  >
                    Open full workpaper
                  </button>
                )}
                {output.onFile && (
                  <button
                    type="button"
                    onClick={output.onFile}
                    className="border border-white/20 px-3 py-1 text-[11px] text-gray-300 hover:border-white/40 hover:text-white"
                  >
                    File to deal
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-auto px-4 py-3">
          <p className="text-[9.5px] uppercase tracking-[0.14em] text-gray-600">Give a follow-up</p>
          {!liveDispatch && (
            <p className="mt-1 text-[10px] leading-4 text-gray-600">
              Offline replay — switch to the Codex runtime (Advanced) to dispatch this agent live.
            </p>
          )}
          {notice && (
            <p
              className="mt-1 text-[10px] leading-4 text-cre-warning"
              role="status"
              data-testid="agent-followup-notice"
            >
              {notice}
            </p>
          )}
          {followUpSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {followUpSuggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  data-testid={`agent-followup-chip-${index}`}
                  disabled={!liveDispatch || !onFollowUp}
                  onClick={() => onFollowUp?.(suggestion)}
                  className="border border-white/15 px-2.5 py-1 text-[11px] text-gray-300 hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submitFollowUp} className="mt-2 flex items-center gap-2 border border-white/20 px-3 py-2 focus-within:border-white/40">
            <span className="text-cre-live" aria-hidden="true">▸</span>
            <input
              data-testid="agent-followup-input"
              value={followUp}
              disabled={!liveDispatch || !onFollowUp}
              onChange={(event) => setFollowUp(event.target.value)}
              placeholder={`Tell ${agentName} what to do next…`}
              aria-label={`Tell ${agentName} what to do next`}
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none disabled:opacity-50"
            />
          </form>
        </div>
      </div>
    </div>
  )
}
