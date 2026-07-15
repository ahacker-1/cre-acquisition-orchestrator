import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  IconArrowUpRight,
  IconChevronRight,
  IconFileText,
  IconFolderPlus,
  IconSend,
  IconX,
} from '@tabler/icons-react'

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
        className="absolute inset-0 bg-[#02070a]/75 backdrop-blur-[2px]"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${agentName} agent`}
        tabIndex={-1}
        className="relative flex h-full w-[min(94vw,460px)] flex-col overflow-y-auto border-l border-white/[0.12] bg-[#0a151d] shadow-[-24px_0_80px_rgba(0,0,0,0.55)] focus:outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c98d61]">Agent workspace</p>
            <h2 className="mt-2 truncate font-serif text-2xl font-normal tracking-[-0.015em] text-[#f4f1ed]">
              {agentName}
            </h2>
            {agentRole && (
              <p className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-[#96a2aa]">{agentRole}</p>
            )}
          </div>
          <button
            type="button"
            data-testid="agent-panel-close"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-10 shrink-0 items-center justify-center border border-white/[0.1] text-[#a4afb6] transition-colors hover:border-white/[0.22] hover:bg-white/[0.03] hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#c98d61]"
          >
            <IconX size={18} stroke={1.4} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </header>

        {task && (
          <div className="border-b border-white/[0.08] px-6 py-5">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#7f8d97]">Task</p>
            <p className="mt-2 text-sm leading-6 text-[#eef1f2]">{task}</p>
            {taskSource && (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[#d39769]">
                <IconArrowUpRight size={13} stroke={1.5} aria-hidden="true" />
                {taskSource}
              </p>
            )}
          </div>
        )}

        <div className="border-b border-white/[0.08] px-6 py-5" data-testid="agent-panel-stream">
          <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.13em]">
            <span className="flex items-center gap-2 text-[#cbd2d7]">
              <span className={STATUS_DOT[status]} aria-hidden="true" />
              {STATUS_LABEL[status]}
            </span>
            {elapsedLabel && <span className="font-mono tabular-nums text-[#8c99a2]">{elapsedLabel}</span>}
          </div>
          {streamLines.length === 0 ? (
            <p className="mt-4 text-xs leading-5 text-[#8c99a2]">
              {status === 'queued' ? 'Queued — waiting to start.' : 'No activity recorded yet.'}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/[0.055]" role="log" aria-live="polite" aria-label="Agent reasoning, live">
              {streamLines.map((line) => (
                <li
                  key={line.id}
                  className={[
                    'flex gap-2 py-2.5 text-[11px] leading-5',
                    line.tone === 'current' ? 'text-white' : line.tone === 'done' ? 'text-[#6ecb8b]' : 'text-[#a4afb6]',
                  ].join(' ')}
                >
                  <IconChevronRight
                    size={13}
                    stroke={1.5}
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-[#6f7d87]"
                  />
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {output && (
          <div className="border-b border-white/[0.08] px-6 py-5" data-testid="agent-panel-output">
            <div className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.15em] text-[#69c98a]">
              <IconFileText size={14} stroke={1.5} aria-hidden="true" />
              <p>Output · {output.title}</p>
            </div>
            <dl className="mt-4 divide-y divide-white/[0.055] border-y border-white/[0.08]">
              {output.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 text-[11px] leading-5">
                  <dt className="text-[#82909a]">{row.label}</dt>
                  <dd className={row.impact ? 'text-[#e0ae69]' : 'text-[#dbe1e5]'}>{row.value}</dd>
                </div>
              ))}
            </dl>
            {(output.onOpenFull || output.onFile) && (
              <div className="mt-4 flex flex-wrap gap-4">
                {output.onOpenFull && (
                  <button
                    type="button"
                    data-testid="agent-panel-open-workpaper"
                    onClick={output.onOpenFull}
                    className="inline-flex min-h-9 items-center gap-1.5 border-b border-[#c98d61]/70 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#dba174] transition-colors hover:border-[#e5aa7b] hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#c98d61]"
                  >
                    Open full workpaper
                    <IconArrowUpRight size={13} stroke={1.5} aria-hidden="true" />
                  </button>
                )}
                {output.onFile && (
                  <button
                    type="button"
                    onClick={output.onFile}
                    className="inline-flex min-h-9 items-center gap-1.5 border-b border-white/[0.18] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#aeb8bf] transition-colors hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#c98d61]"
                  >
                    <IconFolderPlus size={13} stroke={1.5} aria-hidden="true" />
                    File to deal
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-auto px-6 py-5">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#7f8d97]">Give a follow-up</p>
          {!liveDispatch && (
            <p className="mt-2 text-[10px] leading-4 text-[#82909a]">
              Offline replay — switch to the Codex runtime (Advanced) to dispatch this agent live.
            </p>
          )}
          {notice && (
            <p
              className="mt-2 text-[10px] leading-4 text-[#e0ae69]"
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
                  className="min-h-8 border-b border-white/[0.16] py-1 text-left text-[10px] text-[#aeb8bf] transition-colors hover:border-[#c98d61] hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#c98d61] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={submitFollowUp}
            className="mt-3 flex min-h-[72px] items-center gap-3 border border-white/[0.14] bg-[#081219]/70 px-4 py-3 transition-colors focus-within:border-[#c98d61]/70"
          >
            <input
              data-testid="agent-followup-input"
              value={followUp}
              disabled={!liveDispatch || !onFollowUp}
              onChange={(event) => setFollowUp(event.target.value)}
              placeholder={`Tell ${agentName} what to do next…`}
              aria-label={`Tell ${agentName} what to do next`}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#eef1f2] placeholder:text-[#71808a] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              aria-label="Send follow-up"
              disabled={!liveDispatch || !onFollowUp || !followUp.trim()}
              className="inline-flex size-10 shrink-0 items-center justify-center border border-[#de9d6c] bg-[#a75f3c] text-white transition-colors hover:bg-[#b86c46] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#efb184] disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.035] disabled:text-[#66737c]"
            >
              <IconSend size={17} stroke={1.5} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
