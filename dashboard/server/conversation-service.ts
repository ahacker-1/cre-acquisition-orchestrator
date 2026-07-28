import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs'
import { basename, dirname, join } from 'path'
import { createHash, randomUUID } from 'crypto'
import { MAX_CONVERSATION_DOCUMENTS } from '../src/types/conversations'
import type {
  AgentConversationThread,
  AgentConversationThreadDetail,
  ConversationAgentDescriptor,
  ConversationEvent,
  ConversationListResponse,
  ConversationMessage,
  ConversationTurn,
  CreateConversationRequest,
} from '../src/types/conversations'
import {
  getDealWorkspace,
  getSourceExtraction,
  type ExtractionPreview,
  type ServiceContext,
  type SourceDocument,
} from './workspace-service'

interface StoredConversationThread extends AgentConversationThread {
  codexSessionId: string | null
  codexEvidenceFingerprint?: string | null
  nextMessageSequence: number
}

export interface ConversationEvidenceDocument {
  documentId: string
  fileName: string
  type: string
  typeLabel: string
  status: SourceDocument['status']
  extractionStatus: SourceDocument['extractionStatus']
  path: string
  sourceHash?: string
  lifecycleReason?: string
  summary?: string
  extraction: ExtractionPreview | null
}

export interface ConversationEvidenceBundle {
  dealId: string
  dealName: string
  agent: ConversationAgentDescriptor
  deal: Record<string, unknown>
  criteria: Record<string, unknown>
  approvedFields: unknown[]
  documents: ConversationEvidenceDocument[]
  capturedAt: string
}

function safeId(value: string, label: string): string {
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

export function normalizeConversationDocumentIds(documentIds: string[]): string[] {
  const normalized = Array.from(new Set(documentIds.map((documentId) => {
    if (typeof documentId !== 'string') throw new Error('Invalid document ID')
    return safeId(documentId, 'document ID')
  })))
  if (normalized.length > MAX_CONVERSATION_DOCUMENTS) {
    throw new Error(`A conversation can include at most ${MAX_CONVERSATION_DOCUMENTS} documents`)
  }
  return normalized
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function displayName(agentId: string): string {
  return agentId.replace(/[-_.]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeTitle(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, 120)
  return normalized || fallback
}

function conversationRoot(context: ServiceContext, dealId: string): string {
  return join(context.dataRoot, 'deals', safeId(dealId, 'deal ID'), 'conversations')
}

function threadRoot(context: ServiceContext, dealId: string, threadId: string): string {
  return join(conversationRoot(context, dealId), safeId(threadId, 'thread ID'))
}

function metadataPath(context: ServiceContext, dealId: string, threadId: string): string {
  return join(threadRoot(context, dealId, threadId), 'conversation.json')
}

function messagesPath(context: ServiceContext, dealId: string, threadId: string): string {
  return join(threadRoot(context, dealId, threadId), 'messages.ndjson')
}

function eventsPath(context: ServiceContext, dealId: string, threadId: string): string {
  return join(threadRoot(context, dealId, threadId), 'events.ndjson')
}

function turnPath(context: ServiceContext, dealId: string, threadId: string, turnId: string): string {
  return join(turnsDir(context, dealId, threadId), `${safeId(turnId, 'turn ID')}.json`)
}

function turnsDir(context: ServiceContext, dealId: string, threadId: string): string {
  return join(threadRoot(context, dealId, threadId), 'turns')
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  ensureDir(dirname(path))
  const tempPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tempPath, path)
}

function appendNdjson(path: string, value: unknown): void {
  ensureDir(dirname(path))
  appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf8')
}

function readNdjson<T>(path: string): T[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T]
      } catch {
        return []
      }
    })
}

function toPublicThread(stored: StoredConversationThread): AgentConversationThread {
  const {
    codexSessionId: _session,
    codexEvidenceFingerprint: _evidenceFingerprint,
    nextMessageSequence: _sequence,
    ...thread
  } = stored
  return thread
}

function readStoredThread(context: ServiceContext, dealId: string, threadId: string): StoredConversationThread {
  const path = metadataPath(context, dealId, threadId)
  if (!existsSync(path)) throw new Error(`Conversation not found: ${threadId}`)
  const stored = readJson<StoredConversationThread | null>(path, null)
  if (!stored || stored.threadId !== threadId || stored.dealId !== dealId) {
    throw new Error(`Conversation is invalid: ${threadId}`)
  }
  return stored
}

function writeStoredThread(context: ServiceContext, stored: StoredConversationThread): void {
  writeJsonAtomic(metadataPath(context, stored.dealId, stored.threadId), stored)
}

function threadIds(context: ServiceContext, dealId: string): string[] {
  const root = conversationRoot(context, dealId)
  if (!existsSync(root)) return []
  return readdirSync(root).filter((entry) => {
    try {
      return statSync(join(root, entry)).isDirectory() && existsSync(metadataPath(context, dealId, entry))
    } catch {
      return false
    }
  })
}

function readRegistry(context: ServiceContext): Record<string, unknown> {
  return readJson<Record<string, unknown>>(join(context.projectRoot, 'config', 'agent-registry.json'), {})
}

export function listConversationAgents(context: ServiceContext): ConversationAgentDescriptor[] {
  const registry = readRegistry(context)
  const descriptors: ConversationAgentDescriptor[] = []
  for (const [agentId, promptPath] of Object.entries(asObject(registry.orchestrators))) {
    if (typeof promptPath !== 'string') continue
    descriptors.push({
      agentId,
      name: displayName(agentId),
      phase: 'orchestration',
      kind: 'orchestrator',
      promptPath,
      inputs: [],
      outputs: [],
    })
  }
  for (const [phase, rawAgents] of Object.entries(asObject(registry.agents))) {
    for (const [agentId, rawAgent] of Object.entries(asObject(rawAgents))) {
      const agent = asObject(rawAgent)
      if (typeof agent.file !== 'string') continue
      descriptors.push({
        agentId,
        name: displayName(agentId),
        phase: typeof agent.phase === 'string' ? agent.phase : phase,
        kind: phase === 'ingestion' ? 'ingestion' : 'specialist',
        promptPath: agent.file,
        inputs: asStringArray(agent.inputs),
        outputs: asStringArray(agent.outputs),
      })
    }
  }
  return descriptors.sort((a, b) => a.agentId.localeCompare(b.agentId))
}

export function getConversationAgent(context: ServiceContext, agentId: string): ConversationAgentDescriptor {
  const safeAgentId = safeId(agentId, 'agent ID')
  const agent = listConversationAgents(context).find((entry) => entry.agentId === safeAgentId)
  if (!agent) throw new Error(`Unknown agent: ${safeAgentId}`)
  return agent
}

export function conversationTitleFromMessage(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 72) return normalized || 'New conversation'
  return `${normalized.slice(0, 69).trimEnd()}…`
}

function publicThreadWithDerivedTitle(
  context: ServiceContext,
  stored: StoredConversationThread,
): AgentConversationThread {
  const thread = toPublicThread(stored)
  if (stored.messageCount === 0) return thread
  const agent = getConversationAgent(context, stored.agentId)
  if (stored.title !== `${agent.name} conversation`) return thread
  const firstQuestion = listConversationMessages(context, stored.dealId, stored.threadId)
    .find((message) => message.role === 'user')
  return firstQuestion ? { ...thread, title: conversationTitleFromMessage(firstQuestion.content) } : thread
}

export function listConversationThreads(context: ServiceContext, dealId: string): Omit<ConversationListResponse, 'enabled'> {
  const safeDealId = safeId(dealId, 'deal ID')
  getDealWorkspace(context, safeDealId)
  const threads = threadIds(context, safeDealId)
    .flatMap((threadId) => {
      try {
        const stored = readStoredThread(context, safeDealId, threadId)
        return [publicThreadWithDerivedTitle(context, stored)]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { threads, agents: listConversationAgents(context) }
}

export function getConversationThread(
  context: ServiceContext,
  dealId: string,
  threadId: string,
): AgentConversationThreadDetail {
  const safeDealId = safeId(dealId, 'deal ID')
  const safeThreadId = safeId(threadId, 'thread ID')
  const stored = readStoredThread(context, safeDealId, safeThreadId)
  const activeTurn = stored.activeTurnId
    ? readJson<ConversationTurn | null>(turnPath(context, safeDealId, safeThreadId, stored.activeTurnId), null)
    : null
  return {
    thread: publicThreadWithDerivedTitle(context, stored),
    messages: listConversationMessages(context, safeDealId, safeThreadId),
    activeTurn,
  }
}

export function createConversationThread(
  context: ServiceContext,
  dealId: string,
  request: CreateConversationRequest,
): AgentConversationThreadDetail {
  const safeDealId = safeId(dealId, 'deal ID')
  const workspace = getDealWorkspace(context, safeDealId)
  const agent = getConversationAgent(context, request.agentId)
  const allowedDocumentIds = new Set(workspace.documents.map((document) => document.documentId))
  const requestedDocumentIds = Array.isArray(request.documentIds)
    ? normalizeConversationDocumentIds(request.documentIds)
    : []
  const documentIds = requestedDocumentIds.length > 0
    ? requestedDocumentIds
    : normalizeConversationDocumentIds(
        workspace.documents
          .slice(0, MAX_CONVERSATION_DOCUMENTS)
          .map((document) => document.documentId),
      )
  const unknownDocument = documentIds.find((documentId) => !allowedDocumentIds.has(documentId))
  if (unknownDocument) throw new Error(`Document not found: ${unknownDocument}`)
  const now = new Date().toISOString()
  const stored: StoredConversationThread = {
    version: 1,
    threadId: randomUUID(),
    dealId: safeDealId,
    agentId: agent.agentId,
    title: normalizeTitle(request.title, `${agent.name} conversation`),
    runtime: 'codex',
    documentIds,
    codexSessionId: null,
    codexEvidenceFingerprint: null,
    status: 'idle',
    activeTurnId: null,
    messageCount: 0,
    nextMessageSequence: 1,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  }
  writeStoredThread(context, stored)
  return { thread: toPublicThread(stored), messages: [], activeTurn: null }
}

export function patchConversationThread(
  context: ServiceContext,
  dealId: string,
  threadId: string,
  patch: Partial<Pick<StoredConversationThread,
    'title' | 'documentIds' | 'codexSessionId' | 'codexEvidenceFingerprint' | 'status' | 'activeTurnId' | 'lastMessageAt'
  >>,
): AgentConversationThread {
  const stored = readStoredThread(context, safeId(dealId, 'deal ID'), safeId(threadId, 'thread ID'))
  const documentIds = patch.documentIds
    ? normalizeConversationDocumentIds(patch.documentIds)
    : stored.documentIds
  const next: StoredConversationThread = {
    ...stored,
    ...patch,
    documentIds,
    threadId: stored.threadId,
    dealId: stored.dealId,
    agentId: stored.agentId,
    version: 1,
    updatedAt: new Date().toISOString(),
  }
  writeStoredThread(context, next)
  return toPublicThread(next)
}

export function getConversationSessionId(context: ServiceContext, dealId: string, threadId: string): string | null {
  return readStoredThread(context, safeId(dealId, 'deal ID'), safeId(threadId, 'thread ID')).codexSessionId
}

export function getConversationSessionState(
  context: ServiceContext,
  dealId: string,
  threadId: string,
): { sessionId: string | null; evidenceFingerprint: string | null } {
  const stored = readStoredThread(context, safeId(dealId, 'deal ID'), safeId(threadId, 'thread ID'))
  return {
    sessionId: stored.codexSessionId,
    evidenceFingerprint: stored.codexEvidenceFingerprint ?? null,
  }
}

export function persistConversationMessage(
  context: ServiceContext,
  input: Omit<ConversationMessage, 'sequence'> & { sequence?: number },
): ConversationMessage {
  const stored = readStoredThread(context, input.dealId, input.threadId)
  if (stored.agentId !== input.agentId) throw new Error('Conversation message agent does not match its thread')
  const existing = listConversationMessages(context, input.dealId, input.threadId)
    .find((message) => message.messageId === input.messageId)
  const message: ConversationMessage = {
    ...input,
    sequence: input.sequence ?? existing?.sequence ?? stored.nextMessageSequence,
  }
  appendNdjson(messagesPath(context, input.dealId, input.threadId), message)
  const next: StoredConversationThread = {
    ...stored,
    messageCount: existing ? stored.messageCount : stored.messageCount + 1,
    nextMessageSequence: existing ? stored.nextMessageSequence : Math.max(stored.nextMessageSequence, message.sequence + 1),
    lastMessageAt: message.createdAt,
    updatedAt: new Date().toISOString(),
  }
  writeStoredThread(context, next)
  return message
}

export function findMessageByClientRequestId(
  context: ServiceContext,
  dealId: string,
  threadId: string,
  clientRequestId: string,
): ConversationMessage | null {
  return listConversationMessages(context, dealId, threadId)
    .find((message) => message.clientRequestId === clientRequestId) ?? null
}

export function listConversationMessages(context: ServiceContext, dealId: string, threadId: string): ConversationMessage[] {
  const records = readNdjson<ConversationMessage>(messagesPath(context, dealId, threadId))
  const latest = new Map<string, ConversationMessage>()
  const order: string[] = []
  for (const record of records) {
    if (!record?.messageId || record.threadId !== threadId || record.dealId !== dealId) continue
    if (!latest.has(record.messageId)) order.push(record.messageId)
    latest.set(record.messageId, record)
  }
  return order
    .flatMap((messageId) => latest.get(messageId) ? [latest.get(messageId)!] : [])
    .sort((a, b) => a.sequence - b.sequence)
}

export function saveConversationTurn(context: ServiceContext, turn: ConversationTurn): ConversationTurn {
  readStoredThread(context, turn.dealId, turn.threadId)
  writeJsonAtomic(turnPath(context, turn.dealId, turn.threadId, turn.turnId), turn)
  return turn
}

export function getConversationTurn(
  context: ServiceContext,
  dealId: string,
  threadId: string,
  turnId: string,
): ConversationTurn {
  readStoredThread(context, dealId, threadId)
  const stored = readJson<ConversationTurn | null>(turnPath(context, dealId, threadId, turnId), null)
  if (!stored) throw new Error(`Conversation turn not found: ${turnId}`)
  return stored
}

export function listConversationTurns(
  context: ServiceContext,
  dealId: string,
  threadId: string,
): ConversationTurn[] {
  readStoredThread(context, dealId, threadId)
  const directory = turnsDir(context, dealId, threadId)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .flatMap((entry) => {
      const turn = readJson<ConversationTurn | null>(join(directory, entry.name), null)
      return turn && turn.dealId === dealId && turn.threadId === threadId ? [turn] : []
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function appendConversationEvent(
  context: ServiceContext,
  event: Omit<ConversationEvent, 'eventId' | 'seq' | 'createdAt'> & Partial<Pick<ConversationEvent, 'createdAt'>>,
): ConversationEvent {
  readStoredThread(context, event.dealId, event.threadId)
  const path = eventsPath(context, event.dealId, event.threadId)
  const seq = readNdjson<ConversationEvent>(path).length + 1
  const persisted: ConversationEvent = {
    ...event,
    eventId: randomUUID(),
    seq,
    createdAt: event.createdAt ?? new Date().toISOString(),
  }
  appendNdjson(path, persisted)
  return persisted
}

export function buildConversationEvidenceBundle(
  context: ServiceContext,
  dealId: string,
  agentId: string,
  documentIds: string[],
): ConversationEvidenceBundle {
  const workspace = getDealWorkspace(context, safeId(dealId, 'deal ID'))
  const agent = getConversationAgent(context, agentId)
  const selectedDocumentIds = normalizeConversationDocumentIds(
    documentIds.length > 0 ? documentIds : workspace.documents.map((doc) => doc.documentId),
  )
  const selectedIds = new Set(selectedDocumentIds)
  const documents = workspace.documents
    .filter((document) => selectedIds.has(document.documentId))
    .map((document): ConversationEvidenceDocument => {
      let extraction: ExtractionPreview | null = null
      try {
        extraction = getSourceExtraction(context, dealId, document.documentId)
      } catch {
        extraction = null
      }
      return {
        documentId: document.documentId,
        fileName: document.fileName,
        type: document.type,
        typeLabel: document.typeLabel,
        status: document.status,
        extractionStatus: document.extractionStatus,
        path: document.path,
        sourceHash: document.sourceHash,
        lifecycleReason: document.lifecycleReason,
        summary: document.summary,
        extraction,
      }
    })
  if (documents.length !== selectedIds.size) {
    const availableIds = new Set(workspace.documents.map((document) => document.documentId))
    const missing = [...selectedIds].find((documentId) => !availableIds.has(documentId))
    if (missing) throw new Error(`Document not found: ${missing}`)
  }
  return {
    dealId,
    dealName: workspace.deal.item.dealName,
    agent,
    deal: workspace.deal.deal,
    criteria: workspace.criteria as unknown as Record<string, unknown>,
    approvedFields: workspace.approvedFields.fields,
    documents,
    capturedAt: new Date().toISOString(),
  }
}

export function conversationEvidenceFingerprint(bundle: ConversationEvidenceBundle): string {
  const evidenceIdentity = bundle.documents
    .map((document) => ({
      documentId: document.documentId,
      sourceHash: document.sourceHash ?? null,
      extractionSourceHash: document.extraction?.sourceHash ?? null,
    }))
    .sort((a, b) => a.documentId.localeCompare(b.documentId))
  return createHash('sha256').update(JSON.stringify(evidenceIdentity)).digest('hex')
}

function repairConversationMessageMetadata(
  context: ServiceContext,
  stored: StoredConversationThread,
  messages: ConversationMessage[],
): StoredConversationThread {
  const maxSequence = messages.reduce((max, message) => (
    Number.isSafeInteger(message.sequence) && message.sequence >= 0
      ? Math.max(max, message.sequence)
      : max
  ), 0)
  const nextMessageSequence = Math.max(1, maxSequence + 1)
  if (stored.messageCount === messages.length && stored.nextMessageSequence === nextMessageSequence) {
    return stored
  }
  const repaired: StoredConversationThread = {
    ...stored,
    messageCount: messages.length,
    nextMessageSequence,
    updatedAt: new Date().toISOString(),
  }
  writeStoredThread(context, repaired)
  return repaired
}

export function reconcileConversationThread(
  context: ServiceContext,
  dealId: string,
  threadId: string,
): AgentConversationThread | null {
  let stored = readStoredThread(context, dealId, threadId)
  const messages = listConversationMessages(context, dealId, threadId)
  stored = repairConversationMessageMetadata(context, stored, messages)
  const turns = listConversationTurns(context, dealId, threadId)
  const turnsById = new Map(turns.map((turn) => [turn.turnId, turn]))
  const now = new Date().toISOString()
  let recovered = false

  for (const message of messages) {
    if (message.role !== 'user' || turnsById.has(message.turnId)) continue
    const turn = saveConversationTurn(context, {
      version: 1,
      turnId: message.turnId,
      threadId,
      dealId,
      agentId: stored.agentId,
      requestMessageId: message.messageId,
      status: 'interrupted',
      createdAt: message.createdAt,
      completedAt: now,
      error: {
        code: 'ACCEPTANCE_INTERRUPTED',
        message: 'The local service stopped while accepting this turn.',
        retryable: true,
      },
    })
    turnsById.set(turn.turnId, turn)
    recovered = true
  }

  for (const turn of turnsById.values()) {
    if (!['queued', 'reading', 'responding'].includes(turn.status)) continue
    turnsById.set(turn.turnId, saveConversationTurn(context, {
      ...turn,
      status: 'interrupted',
      completedAt: now,
      error: {
        code: 'SERVER_RESTARTED',
        message: 'The local server restarted during this turn.',
        retryable: true,
      },
    }))
    recovered = true
  }

  if (!recovered && !stored.activeTurnId && stored.status !== 'queued' && stored.status !== 'active') {
    return null
  }

  const refreshedMessages = listConversationMessages(context, dealId, threadId)
  for (const turn of turnsById.values()) {
    if (turn.status !== 'interrupted') continue
    const existingAssistant = refreshedMessages.find((message) => message.turnId === turn.turnId && message.role === 'assistant')
    if (existingAssistant) {
      turnsById.set(turn.turnId, saveConversationTurn(context, {
        ...turn,
        responseMessageId: existingAssistant.messageId,
      }))
      if (existingAssistant.status !== 'failed' && existingAssistant.status !== 'cancelled') {
        persistConversationMessage(context, {
          ...existingAssistant,
          content: 'This answer was interrupted before it could be committed safely. Retry the turn to regenerate it.',
          status: 'failed',
          citations: [],
          confidence: 'low',
          unanswered: true,
          followUpSuggestions: [],
          completedAt: now,
          error: turn.error?.message ?? 'The local service stopped before completing the turn record.',
        })
      }
      continue
    }
    const request = refreshedMessages.find((message) => message.messageId === turn.requestMessageId)
    persistConversationMessage(context, {
      version: 1,
      messageId: randomUUID(),
      threadId,
      dealId,
      agentId: stored.agentId,
      turnId: turn.turnId,
      role: 'assistant',
      content: 'This turn was interrupted when the local conversation service stopped. You can retry it.',
      status: 'failed',
      attachments: [],
      citations: [],
      createdAt: now,
      completedAt: now,
      inReplyTo: request?.messageId,
      error: turn.error?.message,
    })
  }

  const latestTurn = [...turnsById.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const recoveredStatus = latestTurn?.status === 'completed' || latestTurn?.status === 'cancelled'
    ? 'idle'
    : 'failed'
  return patchConversationThread(context, dealId, threadId, {
    status: recoveredStatus,
    activeTurnId: null,
    // A stopped turn may already have advanced the remote session even though its local terminal
    // records were incomplete. Retry from the durable transcript instead of resuming ambiguous
    // model state. Normal completed threads retain their resumable session.
    codexSessionId: recoveredStatus === 'failed' ? null : stored.codexSessionId,
    lastMessageAt: stored.lastMessageAt ?? now,
  })
}

export function reconcileInterruptedConversations(context: ServiceContext): AgentConversationThread[] {
  const dealsRoot = join(context.dataRoot, 'deals')
  if (!existsSync(dealsRoot)) return []
  const recovered: AgentConversationThread[] = []
  for (const dealId of readdirSync(dealsRoot)) {
    let ids: string[] = []
    try {
      ids = threadIds(context, dealId)
    } catch {
      continue
    }
    for (const threadId of ids) {
      try {
        const thread = reconcileConversationThread(context, dealId, threadId)
        if (thread) recovered.push(thread)
      } catch {
        // A malformed conversation must not prevent the local API from starting.
      }
    }
  }
  return recovered
}
