import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_URL } from '../config'
import { postConversationMessageRequest } from '../lib/conversationRequests'
import type {
  AgentConversationThread,
  AgentConversationThreadDetail,
  ConversationActivity,
  ConversationAgentDescriptor,
  ConversationEvent,
  ConversationListResponse,
  ConversationMessage,
  ConversationRuntimeStatus,
  ConversationTurn,
  ConversationTurnAccepted,
  ConversationTurnStatus,
} from '../types/conversations'

interface ThreadViewState {
  messages: ConversationMessage[]
  turn: ConversationTurn | null
  activity: ConversationActivity | null
  threadUpdatedAt: string
}

const ACTIVE_TURN_STATUSES = new Set<ConversationTurnStatus>(['queued', 'reading', 'responding'])
const TERMINAL_TURN_STATUSES = new Set<ConversationTurnStatus>(['completed', 'failed', 'cancelled', 'interrupted'])
const TURN_STATUS_RANK: Record<ConversationTurnStatus, number> = {
  queued: 1,
  reading: 2,
  responding: 3,
  completed: 4,
  failed: 4,
  cancelled: 4,
  interrupted: 4,
}

const DEFAULT_CONVERSATION_RUNTIME: ConversationRuntimeStatus = {
  ready: true,
  installed: true,
  loggedIn: true,
  usingChatGpt: true,
  message: 'Codex / ChatGPT is ready.',
}

function mergeThreads(
  previous: AgentConversationThread[],
  incoming: AgentConversationThread[],
): AgentConversationThread[] {
  const byId = new Map(previous.map((thread) => [thread.threadId, thread]))
  for (const thread of incoming) {
    const current = byId.get(thread.threadId)
    if (!current || thread.updatedAt >= current.updatedAt) byId.set(thread.threadId, thread)
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function mergeMessages(previous: ConversationMessage[], incoming: ConversationMessage[]): ConversationMessage[] {
  const byId = new Map(previous.map((message) => [message.messageId, message]))
  for (const message of incoming) {
    const current = byId.get(message.messageId)
    const currentStamp = current?.completedAt ?? current?.createdAt ?? ''
    const incomingStamp = message.completedAt ?? message.createdAt
    if (!current || incomingStamp >= currentStamp) byId.set(message.messageId, message)
  }
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence)
}

function mergeTurn(current: ConversationTurn | null, incoming: ConversationTurn): ConversationTurn {
  if (!current || current.turnId !== incoming.turnId) return incoming
  if (TERMINAL_TURN_STATUSES.has(current.status)) return current
  return TURN_STATUS_RANK[incoming.status] >= TURN_STATUS_RANK[current.status] ? incoming : current
}

function emptyThreadView(): ThreadViewState {
  return { messages: [], turn: null, activity: null, threadUpdatedAt: '' }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || `Conversation request failed (${response.status})`)
  return payload
}

export function useAgentConversations(
  dealId: string,
  liveEvents: ConversationEvent[],
  connected: boolean,
) {
  const [enabled, setEnabled] = useState(false)
  const [runtime, setRuntime] = useState<ConversationRuntimeStatus>(DEFAULT_CONVERSATION_RUNTIME)
  const [agents, setAgents] = useState<ConversationAgentDescriptor[]>([])
  const [threads, setThreads] = useState<AgentConversationThread[]>([])
  const [catalogDealId, setCatalogDealId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [threadViews, setThreadViews] = useState<Record<string, ThreadViewState>>({})
  const [loadingThreadIds, setLoadingThreadIds] = useState<Set<string>>(new Set())
  const [sendingThreadIds, setSendingThreadIds] = useState<Set<string>>(new Set())
  const [pendingRequests, setPendingRequests] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const seenEventIds = useRef(new Set<string>())
  const lastEventSequence = useRef(new Map<string, number>())
  const selectionEpoch = useRef(0)
  const selectedThreadIdRef = useRef<string | null>(null)
  const dealIdRef = useRef(dealId)
  const wasConnected = useRef(connected)
  dealIdRef.current = dealId
  selectedThreadIdRef.current = selectedThreadId

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  )
  const selectedView = selectedThreadId ? threadViews[selectedThreadId] : undefined
  const messages = selectedView?.messages ?? []
  const latestTurn = selectedView?.turn ?? null
  const activeTurn = latestTurn && ACTIVE_TURN_STATUSES.has(latestTurn.status) ? latestTurn : null
  const activity = selectedView?.activity ?? null
  const loading = selectedThreadId
    ? loadingThreadIds.has(selectedThreadId)
    : pendingRequests > 0
  const sending = selectedThreadId ? sendingThreadIds.has(selectedThreadId) : false

  const applyDetail = useCallback((detail: AgentConversationThreadDetail) => {
    setThreads((previous) => mergeThreads(previous, [detail.thread]))
    setThreadViews((previous) => {
      const current = previous[detail.thread.threadId] ?? emptyThreadView()
      const incomingIsCurrent = !current.threadUpdatedAt || detail.thread.updatedAt >= current.threadUpdatedAt
      let turn = current.turn
      let nextActivity = current.activity
      if (incomingIsCurrent) {
        if (detail.activeTurn) {
          turn = mergeTurn(current.turn, detail.activeTurn)
        } else if (!current.turn || !TERMINAL_TURN_STATUSES.has(current.turn.status)) {
          turn = null
          nextActivity = null
        }
      }
      return {
        ...previous,
        [detail.thread.threadId]: {
          messages: mergeMessages(current.messages, detail.messages),
          turn,
          activity: nextActivity,
          threadUpdatedAt: incomingIsCurrent ? detail.thread.updatedAt : current.threadUpdatedAt,
        },
      }
    })
  }, [])

  const refreshThreads = useCallback(async (): Promise<ConversationListResponse | null> => {
    if (!dealId) return null
    const requestDealId = dealId
    setPendingRequests((count) => count + 1)
    try {
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(requestDealId)}/conversations`)
      const payload = await parseResponse<ConversationListResponse>(response)
      if (dealIdRef.current !== requestDealId) return payload
      setEnabled(payload.enabled)
      setRuntime(payload.runtime ?? DEFAULT_CONVERSATION_RUNTIME)
      setAgents(payload.agents)
      setThreads((previous) => mergeThreads(previous, payload.threads))
      setCatalogDealId(requestDealId)
      setError(null)
      return payload
    } catch (cause) {
      if (dealIdRef.current === requestDealId) {
        setCatalogDealId(requestDealId)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      return null
    } finally {
      setPendingRequests((count) => Math.max(0, count - 1))
    }
  }, [dealId])

  const fetchThread = useCallback(async (
    threadId: string,
    select: boolean,
  ): Promise<AgentConversationThreadDetail> => {
    const requestDealId = dealId
    if (select) {
      selectionEpoch.current += 1
      setSelectedThreadId(threadId)
    }
    setLoadingThreadIds((current) => new Set(current).add(threadId))
    try {
      const response = await fetch(
        `${API_URL}/api/deals/${encodeURIComponent(requestDealId)}/conversations/${encodeURIComponent(threadId)}`,
      )
      const detail = await parseResponse<AgentConversationThreadDetail>(response)
      if (dealIdRef.current === requestDealId) {
        applyDetail(detail)
        if (selectedThreadIdRef.current === threadId || select) setError(null)
      }
      return detail
    } catch (cause) {
      if (dealIdRef.current === requestDealId && selectedThreadIdRef.current === threadId) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      throw cause
    } finally {
      setLoadingThreadIds((current) => {
        const next = new Set(current)
        next.delete(threadId)
        return next
      })
    }
  }, [applyDetail, dealId])

  const loadThread = useCallback(
    (threadId: string) => fetchThread(threadId, true),
    [fetchThread],
  )

  const startNewConversation = useCallback((): void => {
    selectionEpoch.current += 1
    setSelectedThreadId(null)
    setError(null)
  }, [])

  const createThread = useCallback(async (
    agentId: string,
    documentIds: string[] = [],
    title?: string,
  ): Promise<AgentConversationThreadDetail> => {
    if (!enabled) throw new Error('Agent conversations are currently unavailable.')
    const requestDealId = dealId
    const requestEpoch = ++selectionEpoch.current
    setSelectedThreadId(null)
    setPendingRequests((count) => count + 1)
    try {
      const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(requestDealId)}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, documentIds, title }),
      })
      const detail = await parseResponse<AgentConversationThreadDetail>(response)
      if (dealIdRef.current === requestDealId) {
        applyDetail(detail)
        if (selectionEpoch.current === requestEpoch) {
          setSelectedThreadId(detail.thread.threadId)
          setError(null)
        }
      }
      return detail
    } catch (cause) {
      if (dealIdRef.current === requestDealId && selectionEpoch.current === requestEpoch) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      throw cause
    } finally {
      setPendingRequests((count) => Math.max(0, count - 1))
    }
  }, [applyDetail, dealId, enabled])

  const openAgent = useCallback(async (
    agentId: string,
    documentIds: string[] = [],
    forceNew = false,
  ): Promise<AgentConversationThreadDetail> => {
    const latest = !forceNew
      ? threads.find((thread) => thread.agentId === agentId)
      : undefined
    if (latest) return loadThread(latest.threadId)
    return createThread(agentId, documentIds)
  }, [createThread, loadThread, threads])

  const sendMessageToThread = useCallback(async (
    threadId: string,
    content: string,
    documentIds?: string[],
    clientRequestId: string = crypto.randomUUID(),
  ): Promise<ConversationTurnAccepted> => {
    const requestDealId = dealId
    setSendingThreadIds((current) => new Set(current).add(threadId))
    try {
      const response = await postConversationMessageRequest({
        url: `${API_URL}/api/deals/${encodeURIComponent(requestDealId)}/conversations/${encodeURIComponent(threadId)}/messages`,
        content,
        documentIds,
        clientRequestId,
      })
      const accepted = await parseResponse<ConversationTurnAccepted>(response)
      if (dealIdRef.current === requestDealId) {
        setThreads((previous) => mergeThreads(previous, [accepted.thread]))
        setThreadViews((previous) => {
          const current = previous[threadId] ?? emptyThreadView()
          const turn = mergeTurn(current.turn, accepted.turn)
          const acceptedStillCurrent = turn.turnId === accepted.turn.turnId && turn.status === accepted.turn.status
          return {
            ...previous,
            [threadId]: {
              messages: mergeMessages(current.messages, [accepted.message]),
              turn,
              activity: acceptedStillCurrent
                ? { kind: 'queued', label: 'Queued for the specialist' }
                : current.activity,
              threadUpdatedAt: accepted.thread.updatedAt >= current.threadUpdatedAt
                ? accepted.thread.updatedAt
                : current.threadUpdatedAt,
            },
          }
        })
        if (selectedThreadIdRef.current === threadId) setError(null)
      }
      return accepted
    } catch (cause) {
      if (dealIdRef.current === requestDealId && selectedThreadIdRef.current === threadId) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      throw cause
    } finally {
      setSendingThreadIds((current) => {
        const next = new Set(current)
        next.delete(threadId)
        return next
      })
    }
  }, [dealId])

  const sendMessage = useCallback(async (
    content: string,
    documentIds?: string[],
    clientRequestId: string = crypto.randomUUID(),
  ): Promise<ConversationTurnAccepted> => {
    const threadId = selectedThreadIdRef.current
    if (!threadId) throw new Error('Open an agent conversation before sending a message.')
    return sendMessageToThread(threadId, content, documentIds, clientRequestId)
  }, [sendMessageToThread])

  const cancelTurn = useCallback(async (): Promise<void> => {
    const threadId = selectedThreadIdRef.current
    const turn = threadId ? threadViews[threadId]?.turn : null
    if (!threadId || !turn || !ACTIVE_TURN_STATUSES.has(turn.status)) return
    const response = await fetch(
      `${API_URL}/api/deals/${encodeURIComponent(dealId)}/conversations/${encodeURIComponent(threadId)}/turns/${encodeURIComponent(turn.turnId)}/cancel`,
      { method: 'POST' },
    )
    const payload = await parseResponse<{ turn: ConversationTurn }>(response)
    setThreadViews((previous) => {
      const current = previous[threadId] ?? emptyThreadView()
      return { ...previous, [threadId]: { ...current, turn: mergeTurn(current.turn, payload.turn) } }
    })
    for (const delay of [0, 75, 150, 300]) {
      if (delay > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, delay))
      const detail = await fetchThread(threadId, false)
      if (!detail.activeTurn) break
    }
  }, [dealId, fetchThread, threadViews])

  const retryTurn = useCallback(async (turnId: string): Promise<void> => {
    const threadId = selectedThreadIdRef.current
    const request = threadId
      ? (threadViews[threadId]?.messages ?? []).find((message) => message.turnId === turnId && message.role === 'user')
      : undefined
    if (!threadId || !request) throw new Error('The original message for this turn is unavailable.')
    await sendMessageToThread(threadId, request.content, request.attachments.map((attachment) => attachment.documentId))
  }, [sendMessageToThread, threadViews])

  useEffect(() => {
    selectionEpoch.current += 1
    setCatalogDealId(null)
    setEnabled(false)
    setRuntime(DEFAULT_CONVERSATION_RUNTIME)
    setAgents([])
    setThreads([])
    setSelectedThreadId(null)
    setThreadViews({})
    setLoadingThreadIds(new Set())
    setSendingThreadIds(new Set())
    setError(null)
    seenEventIds.current.clear()
    lastEventSequence.current.clear()
    void refreshThreads()
  }, [dealId, refreshThreads])

  useEffect(() => {
    for (const event of liveEvents) {
      if (event.dealId !== dealId || seenEventIds.current.has(event.eventId)) continue
      const previousSequence = lastEventSequence.current.get(event.threadId) ?? 0
      if (event.seq <= previousSequence) continue
      lastEventSequence.current.set(event.threadId, event.seq)
      seenEventIds.current.add(event.eventId)
      if (seenEventIds.current.size > 1_000) {
        seenEventIds.current = new Set([...seenEventIds.current].slice(-500))
      }
      if (event.thread) setThreads((previous) => mergeThreads(previous, [event.thread!]))
      setThreadViews((previous) => {
        const current = previous[event.threadId] ?? emptyThreadView()
        const turn = event.turn ? mergeTurn(current.turn, event.turn) : current.turn
        return {
          ...previous,
          [event.threadId]: {
            messages: event.message ? mergeMessages(current.messages, [event.message]) : current.messages,
            turn,
            activity: event.activity ?? current.activity,
            threadUpdatedAt: event.thread && event.thread.updatedAt >= current.threadUpdatedAt
              ? event.thread.updatedAt
              : current.threadUpdatedAt,
          },
        }
      })
    }
  }, [dealId, liveEvents])

  useEffect(() => {
    const reconnected = connected && !wasConnected.current
    wasConnected.current = connected
    if (!reconnected || !selectedThreadId) return
    void fetchThread(selectedThreadId, false).catch(() => undefined)
  }, [connected, fetchThread, selectedThreadId])

  return {
    catalogDealId,
    enabled,
    runtime,
    agents,
    threads,
    selectedThread,
    selectedThreadId,
    messages,
    activeTurn,
    activity,
    loading,
    sending,
    error,
    refreshThreads,
    loadThread,
    startNewConversation,
    openAgent,
    createThread,
    sendMessage,
    sendMessageToThread,
    cancelTurn,
    retryTurn,
  }
}
