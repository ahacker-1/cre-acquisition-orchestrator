export type ConversationRuntime = 'codex'

export const MAX_CONVERSATION_DOCUMENTS = 24

export type ConversationThreadStatus =
  | 'idle'
  | 'queued'
  | 'active'
  | 'failed'

export type ConversationMessageRole = 'user' | 'assistant' | 'system'

export type ConversationMessageStatus =
  | 'complete'
  | 'partial'
  | 'failed'
  | 'cancelled'

export type ConversationTurnStatus =
  | 'queued'
  | 'reading'
  | 'responding'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type ConversationConfidence = 'high' | 'medium' | 'low' | 'unknown'

export type ConversationEvidenceStatus =
  | 'approved'
  | 'review-ready'
  | 'unverified'
  | 'stale'

export interface ConversationCitation {
  citationId: string
  documentId: string
  fileName: string
  location: string
  excerpt: string
  evidenceStatus: ConversationEvidenceStatus
}

export interface ConversationDocumentAttachment {
  documentId: string
  fileName: string
  type: string
  sourceHash?: string
  evidenceStatus: ConversationEvidenceStatus
}

export interface ConversationMessage {
  version: 1
  messageId: string
  threadId: string
  dealId: string
  agentId: string
  turnId: string
  sequence: number
  role: ConversationMessageRole
  content: string
  status: ConversationMessageStatus
  attachments: ConversationDocumentAttachment[]
  citations: ConversationCitation[]
  createdAt: string
  completedAt?: string
  inReplyTo?: string
  clientRequestId?: string
  confidence?: ConversationConfidence
  unanswered?: boolean
  followUpSuggestions?: string[]
  error?: string
}

export interface AgentConversationThread {
  version: 1
  threadId: string
  dealId: string
  agentId: string
  title: string
  runtime: ConversationRuntime
  documentIds: string[]
  status: ConversationThreadStatus
  activeTurnId: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
  lastMessageAt: string | null
}

export interface AgentConversationThreadDetail {
  thread: AgentConversationThread
  messages: ConversationMessage[]
  activeTurn?: ConversationTurn | null
}

export interface ConversationTurn {
  version: 1
  turnId: string
  threadId: string
  dealId: string
  agentId: string
  requestMessageId: string
  responseMessageId?: string
  status: ConversationTurnStatus
  retryOfTurnId?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

export interface ConversationAgentDescriptor {
  agentId: string
  name: string
  phase: string
  kind: 'orchestrator' | 'specialist' | 'ingestion'
  promptPath: string
  inputs: string[]
  outputs: string[]
}

export type ConversationActivityKind =
  | 'queued'
  | 'reading'
  | 'analyzing'
  | 'tool'
  | 'answering'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'session-reset'

export interface ConversationActivity {
  kind: ConversationActivityKind
  label: string
  detail?: string
}

export interface ConversationEvent {
  eventId: string
  seq: number
  dealId: string
  threadId: string
  agentId: string
  turnId?: string
  createdAt: string
  activity?: ConversationActivity
  thread?: AgentConversationThread
  message?: ConversationMessage
  turn?: ConversationTurn
}

export interface ConversationWebSocketMessage {
  type: 'conversation'
  event: ConversationEvent
}

export interface ConversationListResponse {
  enabled: boolean
  runtime?: ConversationRuntimeStatus
  threads: AgentConversationThread[]
  agents: ConversationAgentDescriptor[]
}

export interface ConversationRuntimeStatus {
  ready: boolean
  installed: boolean
  loggedIn: boolean
  usingChatGpt: boolean
  version?: string | null
  message: string
}

export interface CreateConversationRequest {
  agentId: string
  title?: string
  documentIds?: string[]
}

export interface SendConversationMessageRequest {
  content: string
  documentIds?: string[]
  clientRequestId?: string
}

export interface ConversationTurnAccepted {
  thread: AgentConversationThread
  message: ConversationMessage
  turn: ConversationTurn
}
