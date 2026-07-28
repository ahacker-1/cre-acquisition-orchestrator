import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  IconArrowUpRight,
  IconFileText,
  IconFolderPlus,
  IconPaperclip,
  IconPlayerStop,
  IconPlus,
  IconRefresh,
  IconSend,
  IconX,
} from '@tabler/icons-react'
import { MAX_CONVERSATION_DOCUMENTS } from '../../types/conversations'
import {
  conversationSubmissionFor,
  type PendingConversationSubmission,
} from '../../lib/conversationRequests'
import type {
  AgentConversationThread,
  ConversationActivity,
  ConversationMessage,
} from '../../types/conversations'

export interface ConversationPaneDocument {
  documentId: string
  fileName: string
  typeLabel: string
}

export interface ConversationPaneOutput {
  title: string
  rows: Array<{
    label: string
    value: string
    impact?: boolean
  }>
  onOpenFull?: () => void
  onFile?: () => void
}

export interface ConversationPaneProps {
  variant: 'page' | 'dialog'
  agentId?: string
  agentName: string
  agentRole?: string
  dealName?: string
  messages: ConversationMessage[]
  activity?: ConversationActivity | null
  active?: boolean
  loading?: boolean
  threads?: AgentConversationThread[]
  selectedThreadId?: string | null
  onSelectThread?: (threadId: string) => void
  onNewThread?: () => void
  onCancel?: () => void
  onRetry?: (turnId: string) => void
  documents?: ConversationPaneDocument[]
  selectedDocumentIds?: string[]
  onToggleDocument?: (documentId: string) => void
  output?: ConversationPaneOutput | null
  followUpSuggestions?: string[]
  starterPrompts?: string[]
  onSend?: (text: string, clientRequestId: string) => Promise<void>
  liveDispatch?: boolean
  notice?: string
  onClose?: () => void
}

function evidenceLabel(value: string): string {
  if (value === 'approved') return 'Approved evidence'
  if (value === 'review-ready') return 'Review-ready'
  if (value === 'stale') return 'Stale source'
  return 'Unverified'
}

function messageTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const prefix = date.toDateString() === new Date().toDateString()
    ? 'Today'
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `${prefix}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

export default function ConversationPane({
  variant,
  agentId,
  agentName,
  agentRole,
  dealName,
  messages,
  activity,
  active = false,
  loading = false,
  threads = [],
  selectedThreadId,
  onSelectThread,
  onNewThread,
  onCancel,
  onRetry,
  documents = [],
  selectedDocumentIds = [],
  onToggleDocument,
  output,
  followUpSuggestions = [],
  starterPrompts = [],
  onSend,
  liveDispatch = false,
  notice,
  onClose,
}: ConversationPaneProps) {
  const [followUp, setFollowUp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const restoreFocusAfterTurnRef = useRef(false)
  const conversationContextEpochRef = useRef(0)
  const submittingRef = useRef(false)
  const pendingSubmissionRef = useRef<PendingConversationSubmission | null>(null)
  const previousConversationRef = useRef({ agentId, dealName, selectedThreadId })

  useEffect(() => {
    if (messages.length === 0 && !activity) {
      timelineRef.current?.scrollTo({ top: 0, behavior: 'auto' })
      return
    }
    const behavior: ScrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior })
  }, [activity, messages])

  useEffect(() => {
    const previous = previousConversationRef.current
    const continuesPendingThreadCreation = Boolean(
      submittingRef.current
      && previous.agentId === agentId
      && previous.dealName === dealName
      && !previous.selectedThreadId
      && selectedThreadId,
    )
    previousConversationRef.current = { agentId, dealName, selectedThreadId }
    if (continuesPendingThreadCreation) return

    conversationContextEpochRef.current += 1
    submittingRef.current = false
    pendingSubmissionRef.current = null
    setSubmitting(false)
    setFollowUp('')
    restoreFocusAfterTurnRef.current = false
  }, [agentId, dealName, selectedThreadId])

  useEffect(() => {
    if (active) {
      restoreFocusAfterTurnRef.current = true
      return
    }
    if (!restoreFocusAfterTurnRef.current || loading || !liveDispatch || !onSend) return

    restoreFocusAfterTurnRef.current = false
    const frame = window.requestAnimationFrame(() => composerRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [active, liveDispatch, loading, onSend])

  async function dispatchMessage(text: string): Promise<boolean> {
    if (!onSend || active || loading || submittingRef.current) return false
    const contextEpoch = conversationContextEpochRef.current
    const submission = conversationSubmissionFor(text, selectedDocumentIds, pendingSubmissionRef.current)
    pendingSubmissionRef.current = submission
    submittingRef.current = true
    setSubmitting(true)
    try {
      await onSend(text, submission.clientRequestId)
      const accepted = conversationContextEpochRef.current === contextEpoch
      if (accepted && pendingSubmissionRef.current === submission) pendingSubmissionRef.current = null
      return accepted
    } catch {
      return false
    } finally {
      if (conversationContextEpochRef.current === contextEpoch) {
        submittingRef.current = false
        setSubmitting(false)
      }
    }
  }

  function submitFollowUp(event: FormEvent): void {
    event.preventDefault()
    const trimmed = followUp.trim()
    if (!trimmed || !onSend || active || loading || submittingRef.current) return
    void dispatchMessage(trimmed).then((accepted) => {
      if (accepted) setFollowUp('')
    })
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  function stageStarterPrompt(prompt: string): void {
    setFollowUp(prompt)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  return (
    <div
      data-testid="conversation-pane"
      data-variant={variant}
      className={[
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0a151d]',
        variant === 'page' ? 'border border-white/[0.12]' : '',
      ].join(' ')}
    >
      <header className="shrink-0 border-b border-white/[0.08] px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c98d61]">
              Deal conversation
            </p>
            <h2 className="mt-2 truncate font-serif text-2xl font-normal tracking-[-0.015em] text-[#f4f1ed]">
              {agentName}
            </h2>
            {agentRole && <p className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-[#96a2aa]">{agentRole}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onNewThread && (
              <button
                type="button"
                data-testid="agent-thread-new"
                onClick={onNewThread}
                className="inline-flex min-h-10 items-center gap-1.5 border border-white/[0.1] px-3 text-[10px] uppercase tracking-[0.1em] text-[#cbd2d7] hover:border-[#c98d61]/70 hover:text-white"
              >
                <IconPlus size={14} aria-hidden="true" /> New thread
              </button>
            )}
            {onClose && (
              <button
                type="button"
                data-testid="agent-panel-close"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex size-10 items-center justify-center border border-white/[0.1] text-[#a4afb6] hover:border-white/[0.22] hover:text-white"
              >
                <IconX size={18} stroke={1.4} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {threads.length > 0 && (
          <label className="mt-4 block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#7f8d97]">
            Thread
            <select
              data-testid="agent-thread-list"
              value={selectedThreadId ?? ''}
              onChange={(event) => onSelectThread?.(event.target.value)}
              className="mt-1.5 w-full border border-white/[0.12] bg-[#081219] px-3 py-2 text-xs normal-case tracking-normal text-[#dbe1e5] focus:border-[#c98d61] focus:outline-none"
            >
              {threads.map((thread) => (
                <option key={thread.threadId} value={thread.threadId} data-testid={`agent-thread-${thread.threadId}`}>{thread.title}</option>
              ))}
            </select>
          </label>
        )}
      </header>

      <div
        ref={timelineRef}
        data-testid="conversation-timeline"
        className={variant === 'page'
          ? 'min-h-0 flex-1 overscroll-contain overflow-y-auto px-6 py-3 sm:px-9 lg:px-8'
          : 'min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6'}
        aria-live="polite"
        aria-busy={active || loading || submitting}
      >
        <div
          data-testid="agent-conversation"
          data-agent-id={agentId}
          data-thread-id={selectedThreadId ?? undefined}
        >
          {loading && messages.length === 0 ? (
            <p className="text-sm text-[#8c99a2]">Loading conversation…</p>
          ) : messages.length === 0 ? (
            variant === 'page' ? (
              <div data-testid="conversation-start" className="mx-auto w-full max-w-4xl py-2 sm:py-5 lg:py-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c98055]">Start here</p>
                <h3 className="mt-2 max-w-3xl font-serif text-2xl font-normal leading-tight tracking-[-0.025em] text-[#f1ede7] sm:text-3xl">
                  What do you want to know about {dealName ?? 'this deal'}?
                </h3>
                <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#929fa7] sm:block">
                  {documents.length > 0
                    ? `You’re speaking with ${agentName}. Ask in plain English and the answer will use this deal’s selected documents, show its sources, and stay here for follow-ups.`
                    : `You’re speaking with ${agentName}. Add source documents first so the specialist can answer with evidence and show exactly where it came from.`}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#929fa7] sm:hidden">
                  {documents.length > 0
                    ? 'Answers use the selected documents and cite their sources.'
                    : 'Add source documents first for evidence-backed answers.'}
                </p>
                {starterPrompts.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#77858e]">Try a starting question</p>
                    <div className="-mx-6 mt-2 flex snap-x gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
                      {starterPrompts.map((prompt, index) => (
                        <button
                          key={prompt}
                          type="button"
                          data-testid={`agent-starter-prompt-${index}`}
                          disabled={!liveDispatch || !onSend || submitting}
                          onClick={() => stageStarterPrompt(prompt)}
                          className="min-h-16 min-w-[260px] snap-start border border-white/[0.1] bg-white/[0.02] px-4 py-2.5 text-left text-xs leading-5 text-[#c4cdd2] transition-colors hover:border-[#c98055]/60 hover:bg-[#c98055]/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-0"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-white/[0.08] bg-white/[0.025] p-5">
                <p className="font-serif text-lg text-[#eef1f2]">Ask {agentName} about this deal.</p>
                <p className="mt-2 text-xs leading-5 text-[#8c99a2]">
                  The specialist will inspect the selected local documents, answer with source references, and retain context for follow-ups.
                </p>
              </div>
            )
          ) : (
            <ol className={variant === 'page' ? 'space-y-0' : 'space-y-4'}>
              {messages.map((message) => (
                <li
                  key={message.messageId}
                  data-testid={`conversation-message-${message.messageId}`}
                  data-role={message.role}
                  data-status={message.status}
                  className={variant === 'page'
                    ? message.role === 'user'
                      ? 'ml-auto max-w-[74%] border-b border-white/[0.1] py-1 text-right'
                      : 'border-b border-white/[0.1]'
                    : message.role === 'user' ? 'ml-10' : 'mr-6'}
                >
                  <div className={[
                    variant === 'page' ? 'px-0 py-6 text-sm leading-6' : 'border px-4 py-3 text-sm leading-6',
                    variant === 'page'
                      ? message.status === 'failed' || message.status === 'cancelled'
                        ? 'text-[#ead8c5]'
                        : message.role === 'user' ? 'text-[#f4f1ed]' : 'text-[#dbe1e5]'
                      : message.role === 'user'
                        ? 'border-[#c98d61]/35 bg-[#6f3f2a]/25 text-[#f4f1ed]'
                        : message.status === 'failed' || message.status === 'cancelled'
                          ? 'border-[#e0ae69]/30 bg-[#3c2a1a]/25 text-[#ead8c5]'
                          : 'border-white/[0.1] bg-white/[0.035] text-[#dbe1e5]',
                  ].join(' ')}>
                    {variant === 'page' && (
                      <p className={[
                        'mb-3 flex items-center gap-3 text-[11px] font-medium',
                        message.role === 'user' ? 'justify-end text-[#d18459]' : 'text-[#d18459]',
                      ].join(' ')}>
                        <span>{message.role === 'user' ? 'You' : agentName}</span>
                        <span className="font-normal text-[#7f8d96]">{messageTime(message.createdAt)}</span>
                      </p>
                    )}
                    <p className={[
                      'whitespace-pre-wrap',
                      variant === 'page' && message.role === 'assistant'
                        ? 'font-serif text-xl leading-8 tracking-[-0.01em] text-[#ece9e3]'
                        : '',
                    ].join(' ')}>{message.content}</p>
                    {message.citations.length > 0 && (
                      <div className={variant === 'page'
                        ? 'mt-5 space-y-0 border-t border-white/[0.08] pt-4'
                        : 'mt-3 space-y-2 border-t border-white/[0.08] pt-3'}>
                        <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#69c98a]">Sources</p>
                        {message.citations.map((citation) => (
                          <details
                            key={citation.citationId}
                            data-testid={`conversation-citation-${citation.citationId}`}
                            className={variant === 'page'
                              ? 'border border-b-0 border-white/[0.11] px-4 py-3 last:border-b'
                              : 'border-l border-[#69c98a]/40 pl-3'}
                          >
                            <summary className={variant === 'page'
                              ? 'cursor-pointer text-xs text-[#cbd2d7]'
                              : 'cursor-pointer text-[11px] text-[#cbd2d7]'}>
                              {citation.fileName} · {citation.location}
                            </summary>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[#91a099]">
                              {evidenceLabel(citation.evidenceStatus)}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#aeb8bf]">{citation.excerpt}</p>
                          </details>
                        ))}
                      </div>
                    )}
                    {(message.status === 'failed' || message.status === 'cancelled') && onRetry && (
                      <button
                        type="button"
                        data-testid={`conversation-retry-${message.turnId}`}
                        onClick={() => onRetry(message.turnId)}
                        className="mt-3 inline-flex items-center gap-1.5 border-b border-[#e0ae69]/60 text-[10px] uppercase tracking-[0.1em] text-[#e0ae69]"
                      >
                        <IconRefresh size={13} aria-hidden="true" /> Retry
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {active && activity && (
            <div
              data-testid="conversation-turn-status"
              role="status"
              className="mt-4 flex items-center gap-2 border border-[#c98d61]/20 bg-[#c98d61]/[0.05] px-4 py-3 text-xs text-[#d5b08f]"
            >
              <span className="cre-dot cre-dot-live cre-dot-pulse" aria-hidden="true" />
              {activity.label}
            </div>
          )}
        </div>
      </div>

      {output && (
        <details className="shrink-0 border-t border-white/[0.08] px-5 py-4 sm:px-6" data-testid="agent-panel-output">
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

      <div className="shrink-0 border-t border-white/[0.08] bg-[#09131a] px-5 py-3 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#7f8d97]">
            {variant === 'page' ? `3 · Ask ${agentName}` : `Message ${agentName}`}
          </p>
          {active && onCancel && (
            <button type="button" data-testid="conversation-cancel" onClick={onCancel} className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[#e0ae69]">
              <IconPlayerStop size={13} aria-hidden="true" /> Cancel turn
            </button>
          )}
        </div>
        {documents.length > 0 && (
          <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto lg:max-h-12" data-testid="conversation-document-picker">
            {documents.map((document) => {
              const selected = selectedDocumentIds.includes(document.documentId)
              const atDocumentLimit = selectedDocumentIds.length >= MAX_CONVERSATION_DOCUMENTS
              return (
                <button
                  key={document.documentId}
                  type="button"
                  data-testid={`conversation-document-option-${document.documentId}`}
                  aria-pressed={selected}
                  disabled={!selected && atDocumentLimit}
                  title={!selected && atDocumentLimit ? `A conversation can include at most ${MAX_CONVERSATION_DOCUMENTS} documents.` : undefined}
                  onClick={() => onToggleDocument?.(document.documentId)}
                  className={`inline-flex min-h-7 items-center gap-1 border px-2 text-[9px] ${selected ? 'border-[#c98d61]/70 bg-[#c98d61]/10 text-[#e2b28e]' : 'border-white/[0.1] text-[#82909a]'}`}
                >
                  <IconPaperclip size={11} aria-hidden="true" /> {document.fileName}
                </button>
              )
            })}
          </div>
        )}
        {!liveDispatch && !notice && (
          <p className="mt-2 text-[10px] leading-4 text-[#82909a]">Local conversations are unavailable.</p>
        )}
        {notice && <p className="mt-2 text-[10px] leading-4 text-[#e0ae69]" role="status" data-testid="agent-followup-notice">{notice}</p>}
        {followUpSuggestions.length > 0 && !active && (
          <div className="mt-2 flex flex-wrap gap-2">
            {followUpSuggestions.map((suggestion, index) => (
              <button key={suggestion} type="button" data-testid={`agent-followup-chip-${index}`} disabled={!liveDispatch || !onSend || loading || submitting} onClick={() => void dispatchMessage(suggestion)} className="min-h-8 border-b border-white/[0.16] py-1 text-left text-[10px] text-[#aeb8bf] disabled:opacity-40">
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={submitFollowUp}
          className="mt-2 flex min-h-16 items-end gap-3 border border-white/[0.14] bg-[#081219]/70 px-4 py-2 focus-within:border-[#c98d61]/70"
          data-testid="conversation-composer"
          aria-busy={active || loading || submitting}
        >
          <textarea
            ref={composerRef}
            data-testid="conversation-input"
            value={followUp}
            rows={2}
            disabled={!liveDispatch || !onSend || active || loading || submitting}
            onChange={(event) => setFollowUp(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={variant === 'page' && dealName ? `Ask about ${dealName}…` : `Ask ${agentName} about the deal…`}
            aria-label={dealName ? `Ask ${agentName} about ${dealName}` : `Tell ${agentName} what to do next`}
            className="max-h-32 min-w-0 flex-1 resize-none bg-transparent text-sm leading-5 text-[#eef1f2] placeholder:text-[#71808a] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            data-testid="conversation-send"
            aria-label="Send follow-up"
            disabled={!liveDispatch || !onSend || !followUp.trim() || active || loading || submitting}
            className="inline-flex size-10 shrink-0 items-center justify-center border border-[#de9d6c] bg-[#a75f3c] text-white disabled:border-white/[0.08] disabled:bg-white/[0.035] disabled:text-[#66737c]"
          >
            <IconSend size={17} stroke={1.5} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  )
}
