import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  IconArrowUpRight,
  IconChevronRight,
  IconFileText,
  IconFolderPlus,
  IconSend,
  IconX,
} from '@tabler/icons-react'
import type {
  AgentConversationThread,
  ConversationActivity,
  ConversationMessage,
} from '../../types/conversations'
import ConversationPane from '../conversations/ConversationPane'
import type { ConversationPaneDocument } from '../conversations/ConversationPane'

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

export type AgentPanelDocument = ConversationPaneDocument

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
  agentId?: string
  agentName: string
  agentRole?: string
  task?: string
  taskSource?: string
  status: AgentRunStatus
  elapsedLabel?: string
  streamLines: AgentStreamLine[]
  output?: AgentOutput | null
  followUpSuggestions?: string[]
  onFollowUp?: (text: string, clientRequestId: string) => Promise<void>
  liveDispatch?: boolean
  notice?: string
  conversationMessages?: ConversationMessage[]
  conversationActivity?: ConversationActivity | null
  conversationActive?: boolean
  conversationLoading?: boolean
  conversationThreads?: AgentConversationThread[]
  selectedConversationThreadId?: string | null
  onSelectConversationThread?: (threadId: string) => void
  onNewConversation?: () => void
  onCancelConversation?: () => void
  onRetryConversation?: (turnId: string) => void
  documents?: AgentPanelDocument[]
  selectedDocumentIds?: string[]
  onToggleDocument?: (documentId: string) => void
  onClose: () => void
}

export default function AgentPanel({
  open,
  agentId,
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
  conversationMessages,
  conversationActivity,
  conversationActive = false,
  conversationLoading = false,
  conversationThreads = [],
  selectedConversationThreadId,
  onSelectConversationThread,
  onNewConversation,
  onCancelConversation,
  onRetryConversation,
  documents = [],
  selectedDocumentIds = [],
  onToggleDocument,
  onClose,
}: AgentPanelProps) {
  const [followUp, setFollowUp] = useState('')
  const panelRef = useRef<HTMLDivElement | null>(null)
  const conversationMode = conversationMessages !== undefined

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
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
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  function submitFollowUp(event: FormEvent): void {
    event.preventDefault()
    const trimmed = followUp.trim()
    if (!trimmed || !onFollowUp || conversationActive) return
    void onFollowUp(trimmed, crypto.randomUUID())
    setFollowUp('')
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  if (conversationMode) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end" data-testid="agent-panel">
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
          data-testid="agent-panel-dialog"
          className="relative flex h-full w-full flex-col border-l border-white/[0.12] bg-[#0a151d] shadow-[-24px_0_80px_rgba(0,0,0,0.55)] focus:outline-none sm:w-[min(96vw,640px)]"
        >
          <ConversationPane
            variant="dialog"
            agentId={agentId}
            agentName={agentName}
            agentRole={agentRole}
            messages={conversationMessages}
            activity={conversationActivity}
            active={conversationActive}
            loading={conversationLoading}
            threads={conversationThreads}
            selectedThreadId={selectedConversationThreadId}
            onSelectThread={onSelectConversationThread}
            onNewThread={onNewConversation}
            onCancel={onCancelConversation}
            onRetry={onRetryConversation}
            documents={documents}
            selectedDocumentIds={selectedDocumentIds}
            onToggleDocument={onToggleDocument}
            output={output}
            followUpSuggestions={followUpSuggestions}
            onSend={onFollowUp}
            liveDispatch={liveDispatch}
            notice={notice}
            onClose={onClose}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="agent-panel">
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
        data-testid="agent-panel-dialog"
        className="relative flex h-full w-full flex-col border-l border-white/[0.12] bg-[#0a151d] shadow-[-24px_0_80px_rgba(0,0,0,0.55)] focus:outline-none sm:w-[min(96vw,640px)]"
      >
        <header className="shrink-0 border-b border-white/[0.08] px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c98d61]">
                Agent workspace
              </p>
              <h2 className="mt-2 truncate font-serif text-2xl font-normal tracking-[-0.015em] text-[#f4f1ed]">
                {agentName}
              </h2>
              {agentRole && <p className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-[#96a2aa]">{agentRole}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                data-testid="agent-panel-close"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex size-10 items-center justify-center border border-white/[0.1] text-[#a4afb6] hover:border-white/[0.22] hover:text-white"
              >
                <IconX size={18} stroke={1.4} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
            {task && (
              <div className="border-b border-white/[0.08] px-6 py-5">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#7f8d97]">Task</p>
                <p className="mt-2 text-sm leading-6 text-[#eef1f2]">{task}</p>
                {taskSource && (
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[#d39769]">
                    <IconArrowUpRight size={13} stroke={1.5} aria-hidden="true" /> {taskSource}
                  </p>
                )}
              </div>
            )}
            <div className="border-b border-white/[0.08] px-6 py-5" data-testid="agent-panel-stream">
              <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.13em]">
                <span className="flex items-center gap-2 text-[#cbd2d7]"><span className={STATUS_DOT[status]} />{STATUS_LABEL[status]}</span>
                {elapsedLabel && <span className="font-mono tabular-nums text-[#8c99a2]">{elapsedLabel}</span>}
              </div>
              {streamLines.length === 0 ? (
                <p className="mt-4 text-xs leading-5 text-[#8c99a2]">{status === 'queued' ? 'Queued — waiting to start.' : 'No activity recorded yet.'}</p>
              ) : (
                <ul className="mt-4 divide-y divide-white/[0.055]" role="log" aria-live="polite">
                  {streamLines.map((line) => (
                    <li key={line.id} className={`flex gap-2 py-2.5 text-[11px] leading-5 ${line.tone === 'done' ? 'text-[#6ecb8b]' : line.tone === 'current' ? 'text-white' : 'text-[#a4afb6]'}`}>
                      <IconChevronRight size={13} className="mt-1 shrink-0 text-[#6f7d87]" aria-hidden="true" />
                      <span>{line.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
        </div>

        {output && (
          <details className="shrink-0 border-t border-white/[0.08] px-5 py-4 sm:px-6" open data-testid="agent-panel-output">
            <summary className="flex cursor-pointer items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.15em] text-[#69c98a]">
              <IconFileText size={14} aria-hidden="true" /> Filed output · {output.title}
            </summary>
            <dl className="mt-4 divide-y divide-white/[0.055] border-y border-white/[0.08]">
              {output.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2.5 text-[11px] leading-5">
                  <dt className="text-[#82909a]">{row.label}</dt>
                  <dd className={row.impact ? 'text-[#e0ae69]' : 'text-[#dbe1e5]'}>{row.value}</dd>
                </div>
              ))}
            </dl>
            {output.onOpenFull && (
              <button type="button" data-testid="agent-panel-open-workpaper" onClick={output.onOpenFull} className="mt-4 inline-flex items-center gap-1.5 border-b border-[#c98d61]/70 text-[10px] uppercase tracking-[0.1em] text-[#dba174]">
                Open full workpaper <IconArrowUpRight size={13} aria-hidden="true" />
              </button>
            )}
            {output.onFile && (
              <button type="button" onClick={output.onFile} className="ml-5 mt-4 inline-flex items-center gap-1.5 border-b border-white/[0.18] text-[10px] uppercase tracking-[0.1em] text-[#aeb8bf]">
                <IconFolderPlus size={13} aria-hidden="true" /> File to deal
              </button>
            )}
          </details>
        )}

        <div className="shrink-0 border-t border-white/[0.08] bg-[#09131a] px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#7f8d97]">
              Give a follow-up
            </p>
          </div>
          {!liveDispatch && (
            <p className="mt-2 text-[10px] leading-4 text-[#82909a]">
              Offline replay — switch to the Codex runtime (Advanced) to dispatch this agent live.
            </p>
          )}
          {notice && <p className="mt-2 text-[10px] leading-4 text-[#e0ae69]" role="status" data-testid="agent-followup-notice">{notice}</p>}
          {followUpSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {followUpSuggestions.map((suggestion, index) => (
                <button key={suggestion} type="button" data-testid={`agent-followup-chip-${index}`} disabled={!liveDispatch || !onFollowUp} onClick={() => void onFollowUp?.(suggestion, crypto.randomUUID())} className="min-h-8 border-b border-white/[0.16] py-1 text-left text-[10px] text-[#aeb8bf] disabled:opacity-40">
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submitFollowUp} className="mt-3 flex min-h-[72px] items-end gap-3 border border-white/[0.14] bg-[#081219]/70 px-4 py-3 focus-within:border-[#c98d61]/70" data-testid="conversation-composer">
            <textarea
              data-testid="agent-followup-input"
              value={followUp}
              rows={2}
              disabled={!liveDispatch || !onFollowUp}
              onChange={(event) => setFollowUp(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={`Ask ${agentName} about the deal…`}
              aria-label={`Tell ${agentName} what to do next`}
              className="max-h-32 min-w-0 flex-1 resize-none bg-transparent text-sm leading-5 text-[#eef1f2] placeholder:text-[#71808a] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              aria-label="Send follow-up"
              disabled={!liveDispatch || !onFollowUp || !followUp.trim()}
              className="inline-flex size-10 shrink-0 items-center justify-center border border-[#de9d6c] bg-[#a75f3c] text-white disabled:border-white/[0.08] disabled:bg-white/[0.035] disabled:text-[#66737c]"
            >
              <IconSend size={17} stroke={1.5} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
