import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  IconArrowUpRight,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconLoader2,
  IconMessages,
  IconPlus,
  IconSearch,
  IconUpload,
} from '@tabler/icons-react'
import ConversationPane, {
  type ConversationPaneDocument,
} from './conversations/ConversationPane'
import { useAgentConversations } from '../hooks/useAgentConversations'
import { useDealWorkspace } from '../hooks/useDealWorkspace'
import {
  CONVERSATION_QUERY_KEYS,
  readConversationQuerySelection,
  type ConversationQuerySelection,
} from '../lib/conversationNavigation'
import {
  MAX_CONVERSATION_DOCUMENTS,
  type AgentConversationThread,
  type ConversationAgentDescriptor,
  type ConversationEvent,
} from '../types/conversations'
import type { DealLibraryItem } from '../types/deals'
import type { SourceDocument } from '../types/workspace'

export interface ConversationHomeProps {
  deals: DealLibraryItem[]
  dealsLoading: boolean
  dealsError: string | null
  conversationEvents: ConversationEvent[]
  connected: boolean
  initialDealId?: string | null
  onOpenWorkspace: (dealId: string) => void
  onOpenAdvanced: () => void
  onNewDeal: () => void
}

interface RestoreLoadToken {
  dealId: string
  threadId: string
  selectionEpoch: number
}

const REVIEW_DOCUMENT_STATUSES = new Set<SourceDocument['status']>([
  'parse_failed',
  'parser-unavailable',
  'unsupported',
  'review_ready',
  'rejected',
  'extraction-pending',
])

const EMPTY_SOURCE_DOCUMENTS: SourceDocument[] = []

function humanizeWorkspaceError(message: string | null): string | null {
  if (!message) return null
  if (/Applied extraction would make the deal invalid/i.test(message)) {
    return 'Some extracted values need review before they can be applied. Open the workspace to resolve the flagged fields.'
  }
  return message
}

function readQuerySelection(): ConversationQuerySelection {
  if (typeof window === 'undefined') return { dealId: null, agentId: null, threadId: null }
  return readConversationQuerySelection(window.location.search)
}

function writeQuerySelection(selection: ConversationQuerySelection, mode: 'push' | 'replace'): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const key of Object.values(CONVERSATION_QUERY_KEYS)) url.searchParams.delete(key)
  if (selection.dealId) url.searchParams.set(CONVERSATION_QUERY_KEYS.deal, selection.dealId)
  if (selection.agentId) url.searchParams.set(CONVERSATION_QUERY_KEYS.agent, selection.agentId)
  if (selection.threadId) url.searchParams.set(CONVERSATION_QUERY_KEYS.thread, selection.threadId)
  const next = `${url.pathname}${url.search}${url.hash}`
  if (mode === 'push') window.history.pushState(null, '', next)
  else window.history.replaceState(null, '', next)
}

function displaySlug(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function dealSubtitle(deal: DealLibraryItem): string {
  const place = [deal.city, deal.state].filter(Boolean).join(', ')
  const units = typeof deal.totalUnits === 'number' && deal.totalUnits > 0
    ? `${deal.totalUnits.toLocaleString()} units`
    : null
  return [place || 'Location pending', units].filter(Boolean).join('  ·  ')
}

function formatThreadTime(value: string | null): string {
  if (!value) return 'New conversation'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function threadStatus(thread: AgentConversationThread): string {
  if (thread.status === 'active' || thread.status === 'queued') return 'Active now'
  if (thread.status === 'failed') return 'Needs attention'
  return formatThreadTime(thread.lastMessageAt ?? thread.updatedAt)
}

function agentRole(agent: ConversationAgentDescriptor | null): string | undefined {
  if (!agent) return undefined
  return `${displaySlug(agent.phase)} · ${displaySlug(agent.kind)}`
}

function documentMatchesAgent(agentId: string, document: SourceDocument): boolean {
  const evidence = `${document.type} ${document.typeLabel} ${document.fileName}`.toLowerCase()
  if (/rent-roll|tenant-credit/.test(agentId)) return /rent.?roll|tenant|lease/.test(evidence)
  if (/psa|legal|title|estoppel|insurance|loan-doc|transfer-doc/.test(agentId)) {
    return /psa|purchase|legal|title|survey|estoppel|insurance|loan|closing/.test(evidence)
  }
  if (/financial|opex|underwriting|scenario|ic-memo/.test(agentId)) {
    return /t-?12|financial|operating|offering|rent.?roll|income|expense/.test(evidence)
  }
  if (/financing|lender|quote|term-sheet/.test(agentId)) return /loan|lender|quote|term|financ/.test(evidence)
  if (/environmental/.test(agentId)) return /environment|phase.?i|esa/.test(evidence)
  if (/physical/.test(agentId)) return /inspection|physical|condition/.test(evidence)
  if (/parser|document-orchestrator|master-orchestrator/.test(agentId)) return true
  return false
}

function defaultDocumentIds(agentId: string, documents: SourceDocument[]): string[] {
  const relevant = documents.filter((document) => documentMatchesAgent(agentId, document))
  const source = relevant.length > 0 ? relevant : documents.slice(0, 8)
  return source.slice(0, MAX_CONVERSATION_DOCUMENTS).map((document) => document.documentId)
}

function hasDraftDocumentSelection(current: Record<string, string[]>, agentId: string): boolean {
  return Object.prototype.hasOwnProperty.call(current, agentId)
}

function chooseDefaultAgent(
  agents: ConversationAgentDescriptor[],
  threads: AgentConversationThread[],
  documents: SourceDocument[],
): string | null {
  const latestThreadAgent = threads.find((thread) => agents.some((agent) => agent.agentId === thread.agentId))?.agentId
  if (latestThreadAgent) return latestThreadAgent
  const hasRentRoll = documents.some((document) => /rent.?roll/i.test(`${document.type} ${document.typeLabel} ${document.fileName}`))
  if (hasRentRoll && agents.some((agent) => agent.agentId === 'rent-roll-analyst')) return 'rent-roll-analyst'
  const hasPsa = documents.some((document) => /psa|purchase.?agreement/i.test(`${document.type} ${document.typeLabel} ${document.fileName}`))
  if (hasPsa && agents.some((agent) => agent.agentId === 'psa-reviewer')) return 'psa-reviewer'
  return agents.find((agent) => agent.kind === 'specialist')?.agentId
    ?? agents.find((agent) => agent.agentId === 'master-orchestrator')?.agentId
    ?? agents[0]?.agentId
    ?? null
}

function starterPrompts(agentId: string): string[] {
  if (/rent-roll|tenant-credit/.test(agentId)) {
    return [
      'Summarize current occupancy, vacancies, and the biggest rent-roll risks.',
      'Which leases or tenants should I investigate first?',
      'What does not reconcile in the rent roll?',
    ]
  }
  if (/psa|legal|title|estoppel|insurance|loan-doc|transfer-doc/.test(agentId)) {
    return [
      'Summarize the biggest legal and closing risks in this deal.',
      'Which deadlines, obligations, or missing documents need attention?',
      'What should I verify with counsel next?',
    ]
  }
  if (/financial|opex|underwriting|scenario|ic-memo/.test(agentId)) {
    return [
      'Summarize the biggest financial risks in this deal.',
      'What does not reconcile across the financial source documents?',
      'Which assumptions have the greatest impact on value?',
    ]
  }
  return [
    'Summarize the biggest risks in this deal.',
    'What does not reconcile across the source documents?',
    'What should I verify next?',
  ]
}

function ThreadIcon({ thread }: { thread: AgentConversationThread }) {
  const className = thread.status === 'active' || thread.status === 'queued'
    ? 'text-[#d18459]'
    : 'text-[#8d9aa2]'
  if (/financial|opex|scenario|underwriting/i.test(thread.agentId)) {
    return <IconChartBar size={25} stroke={1.35} className={className} aria-hidden="true" />
  }
  if (/legal|psa|title|document/i.test(thread.agentId)) {
    return <IconFileText size={24} stroke={1.35} className={className} aria-hidden="true" />
  }
  return <IconMessages size={25} stroke={1.35} className={className} aria-hidden="true" />
}

interface SpecialistPickerProps {
  agents: ConversationAgentDescriptor[]
  loading: boolean
  selectedAgentId: string | null
  onSelect: (agentId: string) => void
}

function SpecialistPicker({
  agents,
  loading,
  selectedAgentId,
  onSelect,
}: SpecialistPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeAgentId, setActiveAgentId] = useState<string | null>(selectedAgentId)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listboxId = 'conversation-home-agent-listbox'

  const selectedAgent = agents.find((agent) => agent.agentId === selectedAgentId) ?? null
  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return agents
    return agents.filter((agent) => (
      `${agent.name} ${agent.agentId} ${agent.phase} ${agent.kind}`.toLowerCase().includes(normalizedQuery)
    ))
  }, [agents, query])

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false)
    setQuery('')
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const openMenu = useCallback((preferredAgentId?: string | null) => {
    if (agents.length === 0) return
    setActiveAgentId(preferredAgentId ?? selectedAgentId ?? agents[0]?.agentId ?? null)
    setOpen(true)
  }, [agents, selectedAgentId])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => searchRef.current?.focus())

    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [closeMenu, open])

  useEffect(() => {
    if (!open) return
    if (filteredAgents.some((agent) => agent.agentId === activeAgentId)) return
    setActiveAgentId(filteredAgents[0]?.agentId ?? null)
  }, [activeAgentId, filteredAgents, open])

  useEffect(() => {
    if (!open) setActiveAgentId(selectedAgentId)
  }, [open, selectedAgentId])

  function chooseAgent(agentId: string): void {
    if (agentId !== selectedAgentId) onSelect(agentId)
    closeMenu(true)
  }

  function moveActive(direction: 1 | -1): void {
    if (filteredAgents.length === 0) return
    const currentIndex = filteredAgents.findIndex((agent) => agent.agentId === activeAgentId)
    const nextIndex = currentIndex < 0
      ? direction === 1 ? 0 : filteredAgents.length - 1
      : (currentIndex + direction + filteredAgents.length) % filteredAgents.length
    setActiveAgentId(filteredAgents[nextIndex].agentId)
    requestAnimationFrame(() => {
      document.getElementById(`conversation-home-agent-option-${filteredAgents[nextIndex].agentId}`)
        ?.scrollIntoView({ block: 'nearest' })
    })
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActiveAgentId(
        event.key === 'Home'
          ? filteredAgents[0]?.agentId ?? null
          : filteredAgents[filteredAgents.length - 1]?.agentId ?? null,
      )
      return
    }
    if (event.key === 'Enter' && activeAgentId) {
      event.preventDefault()
      chooseAgent(activeAgentId)
    }
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(event.key === 'ArrowDown' ? selectedAgentId : agents[agents.length - 1]?.agentId)
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative mt-1 w-full max-w-[34rem]"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu()
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        data-testid="conversation-home-agent-select"
        data-value={selectedAgentId ?? ''}
        aria-labelledby="conversation-home-specialist-label conversation-home-specialist-value"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={agents.length === 0}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={handleTriggerKeyDown}
        className="group flex min-h-12 w-full items-center justify-between gap-4 border border-transparent px-2 text-left outline-none transition-colors hover:border-white/[0.12] hover:bg-white/[0.025] focus-visible:border-[#d08359] focus-visible:ring-2 focus-visible:ring-[#d08359]/25 disabled:cursor-not-allowed disabled:text-[#6f7b83]"
      >
        <span id="conversation-home-specialist-value" className="min-w-0 truncate font-serif text-2xl font-normal tracking-[-0.02em] text-[#eeeae3] sm:text-3xl">
          {selectedAgent?.name ?? (loading ? 'Loading specialists…' : 'Choose a specialist')}
        </span>
        <IconChevronDown
          size={20}
          stroke={1.4}
          className={`shrink-0 text-[#aab3b9] transition-transform ${open ? 'rotate-180 text-[#d08359]' : 'group-hover:text-white'}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          data-testid="conversation-home-agent-menu"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-[80] w-full min-w-[18rem] overflow-hidden border border-white/[0.16] bg-[#0a151d] shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        >
          <div className="border-b border-white/[0.1] p-3">
            <div className="flex items-center gap-2 border border-white/[0.12] bg-[#101e27] px-3 focus-within:border-[#d08359]/70 focus-within:ring-2 focus-within:ring-[#d08359]/15">
              <IconSearch size={17} stroke={1.5} className="shrink-0 text-[#81909a]" aria-hidden="true" />
              <input
                ref={searchRef}
                data-testid="conversation-home-agent-search"
                role="combobox"
                aria-label="Search deal-team roles"
                aria-controls={listboxId}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={activeAgentId ? `conversation-home-agent-option-${activeAgentId}` : undefined}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={`Search ${agents.length} deal-team roles`}
                className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-[#edf0f1] outline-none placeholder:text-[#6f7d86]"
              />
              <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-[#687781]">Esc</span>
            </div>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-labelledby="conversation-home-specialist-label"
            className="max-h-[min(24rem,58dvh)] overflow-y-auto overscroll-contain p-2"
          >
            {filteredAgents.length === 0 ? (
              <p className="px-3 py-7 text-center text-sm text-[#81909a]">No deal-team roles match “{query.trim()}”.</p>
            ) : filteredAgents.map((agent) => {
              const selected = agent.agentId === selectedAgentId
              const active = agent.agentId === activeAgentId
              return (
                <button
                  key={agent.agentId}
                  id={`conversation-home-agent-option-${agent.agentId}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={selected}
                  data-testid={`conversation-home-agent-option-${agent.agentId}`}
                  onMouseMove={() => setActiveAgentId(agent.agentId)}
                  onClick={() => chooseAgent(agent.agentId)}
                  className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left outline-none transition-colors ${
                    selected
                      ? 'bg-[#d08359]/14 text-white'
                      : active
                        ? 'bg-white/[0.07] text-white'
                        : 'text-[#d9dee1] hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[17px] leading-5">{agent.name}</span>
                    <span className="mt-1 block truncate text-[9px] uppercase tracking-[0.13em] text-[#7f8d96]">{agentRole(agent)}</span>
                  </span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center border ${selected ? 'border-[#d08359]/60 bg-[#d08359]/20 text-[#e5a17a]' : 'border-transparent text-transparent'}`}>
                    <IconCheck size={15} stroke={2} aria-hidden="true" />
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.1] px-4 py-2 text-[9px] uppercase tracking-[0.12em] text-[#687781]">
            <span>{filteredAgents.length} deal-team role{filteredAgents.length === 1 ? '' : 's'}</span>
            <span>↑↓ Navigate · Enter Select</span>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingHome() {
  return (
    <section
      data-testid="conversation-home-loading"
      className="grid min-h-[calc(100dvh-69px)] animate-pulse border-y border-white/[0.1] bg-[#0b151d] lg:h-[calc(100dvh-69px)] lg:grid-cols-[300px_minmax(0,1fr)]"
      aria-label="Loading deal conversations"
    >
      <div className="border-b border-white/[0.1] p-7 lg:border-b-0 lg:border-r">
        <div className="h-3 w-28 bg-white/[0.08]" />
        <div className="mt-6 h-24 bg-white/[0.045]" />
        <div className="mt-4 h-20 bg-white/[0.035]" />
      </div>
      <div className="p-8 lg:p-12">
        <div className="h-3 w-24 bg-white/[0.08]" />
        <div className="mt-5 h-11 w-72 max-w-full bg-white/[0.06]" />
        <div className="mt-12 h-80 border border-white/[0.08] bg-white/[0.025]" />
      </div>
    </section>
  )
}

export default function ConversationHome({
  deals,
  dealsLoading,
  dealsError,
  conversationEvents,
  connected,
  initialDealId = null,
  onOpenWorkspace,
  onOpenAdvanced,
  onNewDeal,
}: ConversationHomeProps) {
  const initialQueryRef = useRef<ConversationQuerySelection>(readQuerySelection())
  const [selectedDealId, setSelectedDealId] = useState<string | null>(
    () => initialQueryRef.current.dealId ?? initialDealId,
  )
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    () => initialQueryRef.current.agentId,
  )
  const [restoreRequest, setRestoreRequest] = useState<ConversationQuerySelection | null>(() => {
    const selection = initialQueryRef.current
    return selection.dealId || selection.agentId || selection.threadId ? selection : null
  })
  const [documentIdsByThread, setDocumentIdsByThread] = useState<Record<string, string[]>>({})
  const [draftDocumentIdsByAgent, setDraftDocumentIdsByAgent] = useState<Record<string, string[]>>({})
  const [selectionBusy, setSelectionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const selectionEpochRef = useRef(0)
  const restoreInFlightThreadRef = useRef<RestoreLoadToken | null>(null)
  const selectedDealIdRef = useRef(selectedDealId)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  selectedDealIdRef.current = selectedDealId

  const sortedDeals = useMemo(
    () => [...deals].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'user' ? -1 : 1
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    }),
    [deals],
  )
  const onlySampleDeals = sortedDeals.length > 0 && sortedDeals.every((deal) => deal.kind === 'sample')
  const selectedDeal = sortedDeals.find((deal) => deal.dealId === selectedDealId) ?? null
  const visibleDeals = useMemo(() => {
    if (!selectedDeal) return sortedDeals.slice(0, 3)
    return [selectedDeal, ...sortedDeals.filter((deal) => deal.dealId !== selectedDeal.dealId)].slice(0, 3)
  }, [selectedDeal, sortedDeals])
  const {
    workspace,
    loading: workspaceLoading,
    working: workspaceWorking,
    error: workspaceError,
    uploadDocument,
  } = useDealWorkspace(selectedDealId, { autoExtract: true })
  const workspaceForSelectedDeal = workspace?.deal.item.dealId === selectedDealId ? workspace : null
  const documents = workspaceForSelectedDeal?.documents ?? EMPTY_SOURCE_DOCUMENTS
  const conversations = useAgentConversations(selectedDealId ?? '', conversationEvents, connected)

  const selectedAgent = conversations.agents.find((agent) => agent.agentId === selectedAgentId) ?? null
  const threadsForAgent = selectedAgentId
    ? conversations.threads.filter((thread) => thread.agentId === selectedAgentId)
    : []
  const visibleThread = conversations.selectedThread?.agentId === selectedAgentId
    ? conversations.selectedThread
    : null
  const visibleMessages = visibleThread ? conversations.messages : []
  const visibleActiveTurn = visibleThread && conversations.activeTurn?.threadId === visibleThread.threadId
    ? conversations.activeTurn
    : null
  const rawSelectedDocumentIds = selectedAgentId
    ? visibleThread
      ? documentIdsByThread[visibleThread.threadId] ?? visibleThread.documentIds
      : draftDocumentIdsByAgent[selectedAgentId] ?? defaultDocumentIds(selectedAgentId, documents)
    : []
  const availableDocumentIds = useMemo(
    () => new Set(documents.map((document) => document.documentId)),
    [documents],
  )
  const selectedDocumentIds = rawSelectedDocumentIds.filter((documentId) => availableDocumentIds.has(documentId))
  const paneDocuments: ConversationPaneDocument[] = documents.map((document) => ({
    documentId: document.documentId,
    fileName: document.fileName,
    typeLabel: document.typeLabel,
  }))
  const latestAssistantMessage = [...visibleMessages].reverse().find((message) => message.role === 'assistant')
  const followUpSuggestions = latestAssistantMessage?.followUpSuggestions ?? []
  const unavailableDocumentCount = rawSelectedDocumentIds.length - selectedDocumentIds.length
  const reviewDocumentCount = documents.filter((document) => REVIEW_DOCUMENT_STATUSES.has(document.status)).length
  const codexReady = conversations.runtime.ready
  const canLiveChat = Boolean(
    conversations.enabled
      && codexReady
      && connected
      && documents.length > 0
      && selectedDocumentIds.length > 0
      && unavailableDocumentCount === 0,
  )

  const recordThreadDocuments = useCallback((thread: AgentConversationThread) => {
    setDocumentIdsByThread((current) => ({
      ...current,
      [thread.threadId]: workspaceForSelectedDeal
        ? thread.documentIds.filter((documentId) => availableDocumentIds.has(documentId))
        : [...thread.documentIds],
    }))
  }, [availableDocumentIds, workspaceForSelectedDeal])

  const loadThread = useCallback(async (
    thread: AgentConversationThread,
    updateHistory: boolean,
  ): Promise<void> => {
    if (updateHistory) {
      restoreInFlightThreadRef.current = null
      setRestoreRequest(null)
    }
    const epoch = ++selectionEpochRef.current
    setSelectionBusy(true)
    setSelectedAgentId(thread.agentId)
    setActionError(null)
    if (updateHistory) {
      writeQuerySelection({ dealId: selectedDealId, agentId: thread.agentId, threadId: thread.threadId }, 'push')
    }
    try {
      const detail = await conversations.loadThread(thread.threadId)
      if (selectionEpochRef.current === epoch) recordThreadDocuments(detail.thread)
    } catch (cause) {
      if (selectionEpochRef.current === epoch) {
        setActionError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (selectionEpochRef.current === epoch) setSelectionBusy(false)
    }
  }, [conversations, recordThreadDocuments, selectedDealId])

  const selectAgent = useCallback((agentId: string, updateHistory: boolean) => {
    selectionEpochRef.current += 1
    if (updateHistory) {
      restoreInFlightThreadRef.current = null
      setRestoreRequest(null)
    }
    setSelectedAgentId(agentId)
    setActionError(null)
    setSelectionBusy(false)
    conversations.startNewConversation()
    setDraftDocumentIdsByAgent((current) => {
      if (hasDraftDocumentSelection(current, agentId)) return current
      const defaults = defaultDocumentIds(agentId, documents)
      return defaults.length > 0 ? { ...current, [agentId]: defaults } : current
    })
    if (updateHistory) {
      writeQuerySelection({ dealId: selectedDealId, agentId, threadId: null }, 'push')
    }
  }, [conversations, documents, selectedDealId])

  const selectDeal = useCallback((dealId: string, updateHistory: boolean) => {
    selectionEpochRef.current += 1
    restoreInFlightThreadRef.current = null
    selectedDealIdRef.current = dealId
    setSelectedDealId(dealId)
    setSelectedAgentId(null)
    setRestoreRequest(null)
    setDocumentIdsByThread({})
    setDraftDocumentIdsByAgent({})
    setSelectionBusy(false)
    setActionError(null)
    if (updateHistory) writeQuerySelection({ dealId, agentId: null, threadId: null }, 'push')
  }, [])

  useEffect(() => {
    if (dealsLoading) return
    if (sortedDeals.length === 0) {
      if (selectedDealId !== null) {
        selectionEpochRef.current += 1
        restoreInFlightThreadRef.current = null
        selectedDealIdRef.current = null
        setSelectedDealId(null)
        setSelectedAgentId(null)
        setDocumentIdsByThread({})
        setDraftDocumentIdsByAgent({})
      }
      setRestoreRequest(null)
      return
    }
    if (selectedDealId && sortedDeals.some((deal) => deal.dealId === selectedDealId)) return
    const fallback = initialDealId && sortedDeals.some((deal) => deal.dealId === initialDealId)
      ? initialDealId
      : sortedDeals[0].dealId
    selectionEpochRef.current += 1
    restoreInFlightThreadRef.current = null
    selectedDealIdRef.current = fallback
    setSelectedDealId(fallback)
    setSelectedAgentId(null)
    setDocumentIdsByThread({})
    setDraftDocumentIdsByAgent({})
    setRestoreRequest((request) => request?.dealId && request.dealId !== fallback ? null : request)
  }, [dealsLoading, initialDealId, selectedDealId, sortedDeals])

  useEffect(() => {
    function handlePopState(): void {
      const selection = readQuerySelection()
      const nextDealId = selection.dealId ?? initialDealId
      const dealChanged = selectedDealIdRef.current !== nextDealId
      selectionEpochRef.current += 1
      restoreInFlightThreadRef.current = null
      selectedDealIdRef.current = nextDealId
      if (dealChanged) {
        setDocumentIdsByThread({})
        setDraftDocumentIdsByAgent({})
      }
      setRestoreRequest(selection)
      setSelectedDealId(nextDealId)
      setSelectedAgentId(selection.agentId)
      setSelectionBusy(false)
      setActionError(null)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [initialDealId])

  useEffect(() => {
    if (!restoreRequest || dealsLoading || !selectedDealId || !selectedDeal) return
    if (conversations.catalogDealId !== selectedDealId) return
    if (conversations.loading) return
    const requestedThread = restoreRequest.threadId
      ? conversations.threads.find((thread) => thread.threadId === restoreRequest.threadId)
      : null
    const requestedAgentId = requestedThread?.agentId
      ?? (restoreRequest.agentId && conversations.agents.some((agent) => agent.agentId === restoreRequest.agentId)
        ? restoreRequest.agentId
        : null)
    const fallbackAgentId = requestedAgentId
      ?? chooseDefaultAgent(conversations.agents, conversations.threads, documents)
    if (!fallbackAgentId) {
      setRestoreRequest(null)
      setSelectedAgentId(null)
      return
    }
    if (requestedThread) {
      const activeRestore = restoreInFlightThreadRef.current
      if (activeRestore?.dealId === selectedDealId && activeRestore.threadId === requestedThread.threadId) return
      const restoreToken: RestoreLoadToken = {
        dealId: selectedDealId,
        threadId: requestedThread.threadId,
        selectionEpoch: selectionEpochRef.current + 1,
      }
      restoreInFlightThreadRef.current = restoreToken
      void loadThread(requestedThread, false).finally(() => {
        if (restoreInFlightThreadRef.current !== restoreToken) return
        restoreInFlightThreadRef.current = null
        if (
          selectedDealIdRef.current !== restoreToken.dealId
          || selectionEpochRef.current !== restoreToken.selectionEpoch
        ) return
        setRestoreRequest(null)
      })
      return
    }
    setRestoreRequest(null)
    selectAgent(fallbackAgentId, false)
  }, [
    conversations.agents,
    conversations.catalogDealId,
    conversations.loading,
    conversations.threads,
    dealsLoading,
    documents,
    loadThread,
    restoreRequest,
    selectAgent,
    selectedDeal,
    selectedDealId,
  ])

  useEffect(() => {
    if (restoreRequest || dealsLoading || !selectedDealId || conversations.loading) return
    if (conversations.catalogDealId !== selectedDealId) return
    if (selectedAgentId && conversations.agents.some((agent) => agent.agentId === selectedAgentId)) return
    const next = chooseDefaultAgent(conversations.agents, conversations.threads, documents)
    if (next) selectAgent(next, false)
  }, [
    conversations.agents,
    conversations.catalogDealId,
    conversations.loading,
    conversations.threads,
    dealsLoading,
    documents,
    restoreRequest,
    selectAgent,
    selectedAgentId,
    selectedDealId,
  ])

  useEffect(() => {
    if (restoreRequest || dealsLoading) return
    writeQuerySelection({
      dealId: selectedDealId,
      agentId: selectedAgentId,
      threadId: visibleThread?.threadId ?? null,
    }, 'replace')
  }, [dealsLoading, restoreRequest, selectedAgentId, selectedDealId, visibleThread?.threadId])

  useEffect(() => {
    if (!selectedAgentId || visibleThread) return
    setDraftDocumentIdsByAgent((current) => {
      if (hasDraftDocumentSelection(current, selectedAgentId)) return current
      const defaults = defaultDocumentIds(selectedAgentId, documents)
      return defaults.length > 0 ? { ...current, [selectedAgentId]: defaults } : current
    })
  }, [documents, selectedAgentId, visibleThread])

  async function createThread(): Promise<AgentConversationThread | null> {
    if (!selectedDealId || !selectedAgentId) return null
    const dealId = selectedDealId
    const agentId = selectedAgentId
    const documentIds = [...selectedDocumentIds]
    const epoch = ++selectionEpochRef.current
    setSelectionBusy(true)
    setActionError(null)
    try {
      const detail = await conversations.createThread(agentId, documentIds)
      if (selectionEpochRef.current !== epoch) return null
      recordThreadDocuments(detail.thread)
      writeQuerySelection({
        dealId,
        agentId,
        threadId: detail.thread.threadId,
      }, 'push')
      return detail.thread
    } catch (cause) {
      if (selectionEpochRef.current === epoch) {
        setActionError(cause instanceof Error ? cause.message : String(cause))
        throw cause
      }
      return null
    } finally {
      if (selectionEpochRef.current === epoch) setSelectionBusy(false)
    }
  }

  function startNewThread(): void {
    if (!selectedAgentId) return
    selectionEpochRef.current += 1
    restoreInFlightThreadRef.current = null
    setRestoreRequest(null)
    conversations.startNewConversation()
    setSelectionBusy(false)
    setActionError(null)
    setDraftDocumentIdsByAgent((current) => {
      if (hasDraftDocumentSelection(current, selectedAgentId)) return current
      const defaults = defaultDocumentIds(selectedAgentId, documents)
      return defaults.length > 0 ? { ...current, [selectedAgentId]: defaults } : current
    })
    writeQuerySelection({ dealId: selectedDealId, agentId: selectedAgentId, threadId: null }, 'push')
  }

  async function sendMessage(text: string, clientRequestId: string): Promise<void> {
    if (!selectedAgentId || !canLiveChat) return
    let requestEpoch = selectionEpochRef.current
    setActionError(null)
    try {
      let thread = visibleThread
      if (!thread) thread = await createThread()
      if (!thread) return
      requestEpoch = selectionEpochRef.current
      await conversations.sendMessageToThread(thread.threadId, text, selectedDocumentIds, clientRequestId)
    } catch (cause) {
      if (selectionEpochRef.current === requestEpoch) {
        setActionError(cause instanceof Error ? cause.message : String(cause))
      }
      throw cause
    }
  }

  function toggleDocument(documentId: string): void {
    if (!selectedAgentId) return
    if (visibleThread) {
      setDocumentIdsByThread((current) => {
        const existing = (current[visibleThread.threadId] ?? visibleThread.documentIds)
          .filter((id) => availableDocumentIds.has(id))
        const next = existing.includes(documentId)
          ? existing.filter((id) => id !== documentId)
          : [...existing, documentId].slice(0, MAX_CONVERSATION_DOCUMENTS)
        return { ...current, [visibleThread.threadId]: next }
      })
      return
    }
    setDraftDocumentIdsByAgent((current) => {
      const existing = (current[selectedAgentId] ?? defaultDocumentIds(selectedAgentId, documents))
        .filter((id) => availableDocumentIds.has(id))
      const next = existing.includes(documentId)
        ? existing.filter((id) => id !== documentId)
        : [...existing, documentId].slice(0, MAX_CONVERSATION_DOCUMENTS)
      return { ...current, [selectedAgentId]: next }
    })
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    if (selectedDeal?.readOnly) {
      setActionError('Sample deals are read-only. Create a new deal before uploading source documents.')
      return
    }
    setActionError(null)
    try {
      for (const file of files) await uploadDocument(file)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (dealsLoading && sortedDeals.length === 0) return <LoadingHome />

  if (sortedDeals.length === 0) {
    return (
      <section
        data-testid="conversation-home-empty"
        className="flex min-h-[calc(100dvh-69px)] items-center justify-center border-y border-white/[0.1] bg-[#0b151d] px-6 py-16 text-center"
      >
        <div className="max-w-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c98055]">Deal conversations</p>
          <h2 className="mt-5 font-serif text-4xl font-normal tracking-[-0.025em] text-[#f2efe9] sm:text-5xl">
            Start with a deal.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-[#94a0a8]">
            Add a source package, then choose the specialist you want to talk with. Every conversation stays scoped to that deal and its evidence.
          </p>
          {dealsError && <p className="mt-4 text-sm text-[#df8378]" role="alert">{dealsError}</p>}
          <button
            type="button"
            data-testid="conversation-home-empty-new-deal"
            onClick={onNewDeal}
            className="mt-8 inline-flex min-h-12 items-center gap-3 bg-[#b87345] px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#09141b] hover:bg-[#ca8656]"
          >
            <IconPlus size={17} aria-hidden="true" /> New deal
          </button>
        </div>
      </section>
    )
  }

  const notice = actionError
    ?? conversations.error
    ?? humanizeWorkspaceError(workspaceError)
    ?? (!connected ? 'Connection lost. Conversation history remains available while the app reconnects.' : null)
    ?? (!conversations.enabled ? 'Agent conversations are currently unavailable. Open the full workspace to continue working with this deal.' : null)
    ?? (!codexReady ? conversations.runtime.message : null)
    ?? (selectedDeal?.readOnly ? 'This is a read-only sample. You can explore its evidence and conversations; create your own deal to upload files.' : null)
    ?? (unavailableDocumentCount > 0 ? `${unavailableDocumentCount} source document${unavailableDocumentCount === 1 ? ' is' : 's are'} no longer available. Choose current sources before sending.` : null)
    ?? (documents.length === 0 ? 'No source documents are attached yet. Add documents for source-backed answers.' : null)
    ?? (selectedDocumentIds.length === 0 ? 'Choose at least one source document before sending.' : null)
    ?? undefined

  return (
    <section
      data-testid="conversation-home"
      className="grid min-h-[calc(100dvh-69px)] min-w-0 grid-cols-[minmax(0,1fr)] border-y border-white/[0.1] bg-[#0b151d] lg:h-[calc(100dvh-69px)] lg:min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden"
    >
      <aside
        data-testid="conversation-home-sidebar"
        className="flex min-h-0 min-w-0 flex-col border-b border-white/[0.1] bg-[#0a141c] lg:border-b-0 lg:border-r"
        aria-label="Deal context and recent conversations"
      >
        <div className="min-w-0 px-4 py-4 sm:px-7 sm:py-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-5 xl:px-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c98055]">1 · Choose a deal</p>
          {onlySampleDeals && (
            <div
              data-testid="conversation-home-first-run-choice"
              className="mt-3 border border-[#d08359]/30 bg-[#d08359]/[0.06] px-3 py-3 text-[11px] leading-5 text-[#b9c2c8]"
            >
              <p><span className="font-semibold text-[#efc29f]">First time here?</span> Explore a sample safely or upload your own deal.</p>
              <button type="button" onClick={onNewDeal} className="mt-2 inline-flex min-h-9 items-center gap-2 border-b border-[#d08359]/60 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#e2a77d]">
                <IconPlus size={14} aria-hidden="true" /> Upload my first deal
              </button>
            </div>
          )}
          <label className="mt-3 block lg:hidden">
            <span className="sr-only">Choose a deal</span>
            <select
              data-testid="conversation-home-deal-select-mobile"
              aria-label="Choose a deal"
              value={selectedDealId ?? ''}
              onChange={(event) => selectDeal(event.target.value, true)}
              className="min-h-12 w-full border border-[#d08359]/55 bg-[#101c24] px-3 font-serif text-lg text-[#e6e3dd] outline-none focus:border-[#d08359]"
            >
              {sortedDeals.map((deal) => (
                <option key={deal.dealId} value={deal.dealId}>
                  {deal.dealName}{deal.kind === 'sample' ? ' — Sample' : ''}
                </option>
              ))}
            </select>
          </label>
          <div
            className="mt-4 hidden min-w-0 lg:mx-0 lg:block lg:w-full lg:max-w-full lg:space-y-1 lg:overflow-visible lg:px-0 lg:pb-0"
            data-testid="conversation-home-deal-list"
          >
            {visibleDeals.map((deal) => {
              const selected = deal.dealId === selectedDealId
              return (
                <button
                  key={deal.dealId}
                  type="button"
                  data-testid={`conversation-home-deal-${deal.dealId}`}
                  aria-pressed={selected}
                  onClick={() => selectDeal(deal.dealId, true)}
                  className={[
                    'group flex min-h-[76px] w-full min-w-[280px] snap-start items-center justify-between gap-4 border-b px-4 py-3 text-left transition-colors lg:min-h-[76px] lg:min-w-0 lg:py-3',
                    selected
                      ? 'border border-[#d08359] bg-[#111d25] shadow-[inset_2px_0_0_#d08359]'
                      : 'border-x border-t border-x-transparent border-t-transparent border-b-white/[0.1] hover:bg-white/[0.025]',
                  ].join(' ')}
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate font-serif text-xl text-[#e6e3dd]">{deal.dealName}</span>
                      {deal.kind === 'sample' && (
                        <span className="shrink-0 border border-[#7e8b94]/35 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8d9aa2]">Sample</span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-xs text-[#929da5]">{dealSubtitle(deal)}</span>
                  </span>
                  <IconChevronRight size={20} stroke={1.35} className="shrink-0 text-[#a9b2b8] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              )
            })}
          </div>

          <div className="mt-7 lg:mt-11">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.12] pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c98055]">
                Recent conversations{selectedDeal ? ` — ${selectedDeal.dealName}` : ''}
              </p>
              {conversations.loading && <IconLoader2 size={14} className="animate-spin text-[#7f8b93]" aria-label="Loading threads" />}
            </div>
            <div
              data-testid="conversation-home-thread-list"
              className="-mx-4 flex w-[calc(100%+2rem)] min-w-0 max-w-[calc(100%+2rem)] snap-x gap-3 overflow-x-auto px-4 sm:-mx-7 sm:w-[calc(100%+3.5rem)] sm:max-w-[calc(100%+3.5rem)] sm:px-7 lg:mx-0 lg:block lg:w-full lg:max-w-full lg:overflow-visible lg:px-0"
            >
              {conversations.threads.length === 0 ? (
                <p className="w-full border-b border-white/[0.1] px-3 py-6 text-xs leading-5 text-[#71808a]">
                  No conversations yet. Your first question will start one.
                </p>
              ) : conversations.threads.slice(0, 10).map((thread) => {
                const agent = conversations.agents.find((candidate) => candidate.agentId === thread.agentId)
                const selected = visibleThread?.threadId === thread.threadId
                const status = threadStatus(thread)
                return (
                  <button
                    key={thread.threadId}
                    type="button"
                    data-testid={`conversation-home-thread-${thread.threadId}`}
                    aria-pressed={selected}
                    onClick={() => void loadThread(thread, true)}
                    className={[
                      'group flex min-h-[90px] w-full min-w-[280px] snap-start items-center gap-4 border-b border-white/[0.11] px-4 py-4 text-left transition-colors lg:min-w-0',
                      selected ? 'bg-white/[0.035] shadow-[inset_2px_0_0_#d08359]' : 'hover:bg-white/[0.025]',
                    ].join(' ')}
                  >
                    <span className="shrink-0"><ThreadIcon thread={thread} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-[18px] text-[#e6e3dd]">{thread.title}</span>
                      <span className={`mt-1 block truncate text-xs ${status === 'Active now' ? 'text-[#82bd79]' : thread.status === 'failed' ? 'text-[#df8378]' : 'text-[#849198]'}`}>
                        {agent?.name ? `${agent.name} · ${status}` : status}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          {dealsError && <p className="mt-5 text-xs leading-5 text-[#df8378]" role="alert">{dealsError}</p>}
        </div>

        <div className="hidden shrink-0 border-t border-white/[0.12] px-7 py-6 lg:block">
          <button
            type="button"
            data-testid="conversation-home-new-deal"
            onClick={onNewDeal}
            className="inline-flex min-h-10 items-center gap-3 text-[11px] font-medium uppercase tracking-[0.1em] text-[#d5875d] hover:text-[#efaa7f]"
          >
            <IconPlus size={20} stroke={1.4} aria-hidden="true" /> New deal
          </button>
        </div>
      </aside>

      <div
        role="region"
        aria-label="Deal specialist conversation"
        data-testid="conversation-home-main"
        className="flex min-h-[460px] min-w-0 flex-col bg-[#0d1820] sm:min-h-[560px] lg:min-h-0"
      >
        <header className="shrink-0 border-b border-white/[0.1] px-5 py-3 sm:px-7 sm:py-4 lg:px-8">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span id="conversation-home-specialist-label" className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c98055]">2 · Choose a specialist</span>
              <SpecialistPicker
                agents={conversations.agents}
                loading={conversations.loading}
                selectedAgentId={selectedAgentId}
                onSelect={(agentId) => selectAgent(agentId, true)}
              />
              {selectedAgent && <span className="mt-1 block text-[9px] uppercase tracking-[0.14em] text-[#7f8d96]">{agentRole(selectedAgent)}</span>}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              {visibleThread && (
                <button
                  type="button"
                  data-testid="conversation-home-new-thread"
                  disabled={!canLiveChat || selectionBusy}
                  onClick={startNewThread}
                  className="inline-flex min-h-11 items-center gap-2 border border-white/[0.12] px-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#aeb8bf] hover:border-[#d08359]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconPlus size={15} aria-hidden="true" /> New thread
                </button>
              )}
              <button
                type="button"
                data-testid="conversation-home-open-workspace"
                disabled={!selectedDealId}
                onClick={() => selectedDealId && onOpenWorkspace(selectedDealId)}
                aria-label="Open full workspace"
                className="inline-flex min-h-11 items-center gap-2 border border-white/[0.14] px-3 text-xs text-[#dce1e4] hover:border-white/[0.3] hover:text-white disabled:opacity-40 sm:px-4 sm:text-sm"
              >
                <IconArrowUpRight size={17} stroke={1.45} aria-hidden="true" />
                <span className="sm:hidden">Workspace</span>
                <span className="hidden sm:inline">Open full workspace</span>
              </button>
            </div>
          </div>
        </header>

        {workspaceLoading && !workspaceForSelectedDeal ? (
          <div data-testid="conversation-home-workspace-loading" className="flex min-h-0 flex-1 items-center justify-center text-sm text-[#7f8d96]">
            <IconLoader2 size={18} className="mr-2 animate-spin" aria-hidden="true" /> Loading deal evidence…
          </div>
        ) : !selectedAgent ? (
          <div data-testid="conversation-home-no-agent" className="flex min-h-0 flex-1 items-center justify-center px-6 py-16 text-center">
            <div className="max-w-lg">
              <IconMessages size={34} stroke={1.2} className="mx-auto text-[#73818a]" aria-hidden="true" />
              <h2 className="mt-5 font-serif text-3xl text-[#ece9e3]">Choose someone on the deal team.</h2>
              <p className="mt-3 text-sm leading-6 text-[#87949c]">
                Pick a specialist above to start a source-backed conversation or resume their latest thread.
              </p>
              {!conversations.enabled && (
                <p data-testid="conversation-home-disabled" className="mt-4 text-xs text-[#dfb565]">
                  Agent conversations are currently unavailable. The full lifecycle workspace is still available.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              data-testid={documents.length === 0 ? 'conversation-home-no-documents' : 'conversation-home-deal-status'}
              className={`mx-5 mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2 border px-3 py-2 text-xs sm:mx-7 ${
                selectedDeal?.readOnly || documents.length === 0 || reviewDocumentCount > 0 || !codexReady
                  ? 'border-[#dfb565]/25 bg-[#2b2519]/95 text-[#d7c39a]'
                  : 'border-white/[0.1] bg-white/[0.018] text-[#9eabb3]'
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium text-[#e3e0da]">
                  {selectedDeal?.readOnly ? 'Read-only sample' : selectedDeal?.saveState === 'ready' ? 'Deal ready' : 'Deal draft'}
                </span>
                <span>
                  {documents.length === 0
                    ? 'No source documents yet'
                    : `${documents.length} source${documents.length === 1 ? '' : 's'}`}
                </span>
                {reviewDocumentCount > 0 && (
                  <span className="text-[#e0ae69]">
                    {reviewDocumentCount} {reviewDocumentCount === 1 ? 'needs' : 'need'} review
                  </span>
                )}
                {documents.length > 0 && reviewDocumentCount === 0 && <span className="text-[#82bd79]">Evidence ready</span>}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {selectedDeal?.readOnly ? (
                  <button type="button" onClick={onNewDeal} className="inline-flex min-h-8 items-center gap-2 border-b border-[#d7a66e]/50 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#e1b37f]">
                    <IconPlus size={14} aria-hidden="true" /> Create my deal
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="conversation-home-upload-documents"
                    disabled={workspaceWorking}
                    onClick={() => uploadInputRef.current?.click()}
                    className="inline-flex min-h-8 items-center gap-2 border-b border-[#d7a66e]/50 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#e1b37f] disabled:opacity-40"
                  >
                    <IconUpload size={14} aria-hidden="true" /> {workspaceWorking ? 'Adding…' : documents.length > 0 ? 'Add more documents' : 'Add documents'}
                  </button>
                )}
                {reviewDocumentCount > 0 && selectedDealId && (
                  <button type="button" data-testid="conversation-home-review-sources" onClick={() => onOpenWorkspace(selectedDealId)} className="min-h-8 border-b border-white/[0.2] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#dce1e4]">
                    Review sources
                  </button>
                )}
                {!codexReady && (
                  <button type="button" data-testid="conversation-home-setup-codex" onClick={onOpenAdvanced} className="min-h-8 border-b border-white/[0.2] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#dce1e4]">
                    Set up ChatGPT
                  </button>
                )}
              </div>
            </div>
            <input
              ref={uploadInputRef}
              data-testid="conversation-home-upload-input"
              type="file"
              multiple
              aria-label="Add source documents to this deal"
              tabIndex={-1}
              disabled={selectedDeal?.readOnly}
              className="sr-only"
              onChange={(event) => void handleUpload(event)}
            />
            <div className="flex min-h-0 flex-1 overflow-hidden [&>div>header]:hidden [&>div]:border-0">
              <ConversationPane
                variant="page"
                agentId={selectedAgent.agentId}
                agentName={selectedAgent.name}
                agentRole={agentRole(selectedAgent)}
                dealName={selectedDeal?.dealName}
                messages={visibleMessages}
                activity={visibleThread ? conversations.activity : null}
                active={Boolean(visibleActiveTurn)}
                loading={selectionBusy || conversations.loading || conversations.sending}
                threads={threadsForAgent}
                selectedThreadId={visibleThread?.threadId ?? null}
                onSelectThread={(threadId) => {
                  const thread = threadsForAgent.find((candidate) => candidate.threadId === threadId)
                  if (thread) void loadThread(thread, true)
                }}
                onNewThread={visibleThread ? startNewThread : undefined}
                onCancel={() => void conversations.cancelTurn().catch((cause) => setActionError(cause instanceof Error ? cause.message : String(cause)))}
                onRetry={(turnId) => void conversations.retryTurn(turnId).catch((cause) => setActionError(cause instanceof Error ? cause.message : String(cause)))}
                documents={paneDocuments}
                selectedDocumentIds={selectedDocumentIds}
                onToggleDocument={toggleDocument}
                followUpSuggestions={followUpSuggestions}
                starterPrompts={documents.length > 0 ? starterPrompts(selectedAgent.agentId) : []}
                onSend={sendMessage}
                liveDispatch={canLiveChat}
                notice={notice}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
