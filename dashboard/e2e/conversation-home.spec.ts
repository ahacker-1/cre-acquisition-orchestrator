import {
  expect,
  test,
  type Page,
  type Route,
  type WebSocketRoute,
} from '@playwright/test'
import type {
  AgentConversationThread,
  AgentConversationThreadDetail,
  ConversationAgentDescriptor,
  ConversationEvent,
  ConversationMessage,
  ConversationTurn,
  CreateConversationRequest,
  SendConversationMessageRequest,
} from '../src/types/conversations'
import type { DealLibraryItem, DealRecordResponse } from '../src/types/deals'
import type { DealWorkspace, SourceDocument } from '../src/types/workspace'

// These tests exercise the real App -> ConversationHome -> ConversationPane stack. Only its
// external boundaries are replaced: deterministic REST responses and a Playwright-routed
// WebSocket. No request can reach the conversation manager or launch Codex.

const PRIMARY_DEAL_ID = 'DEAL-HOME-ALPHA'
const SECONDARY_DEAL_ID = 'DEAL-HOME-BETA'
const RENT_DOCUMENT_ID = 'doc-home-rent-roll'
const PSA_DOCUMENT_ID = 'doc-home-psa'
const EXISTING_RENT_THREAD_ID = 'thread-home-rent-existing'
const EXISTING_PSA_THREAD_ID = 'thread-home-psa-existing'
const NOW = '2099-08-01T14:00:00.000Z'

const AGENTS: ConversationAgentDescriptor[] = [
  {
    agentId: 'rent-roll-analyst',
    name: 'Rent Roll Analyst',
    phase: 'due-diligence',
    kind: 'specialist',
    promptPath: 'agents/due-diligence/rent-roll-analyst.md',
    inputs: ['rent roll document'],
    outputs: ['rent roll analysis'],
  },
  {
    agentId: 'psa-reviewer',
    name: 'PSA Reviewer',
    phase: 'legal',
    kind: 'specialist',
    promptPath: 'agents/legal/psa-reviewer.md',
    inputs: ['PSA document'],
    outputs: ['PSA analysis'],
  },
  {
    agentId: 'master-orchestrator',
    name: 'Master Orchestrator',
    phase: 'master',
    kind: 'orchestrator',
    promptPath: 'orchestrators/master-orchestrator.md',
    inputs: ['deal workspace'],
    outputs: ['coordinated analysis'],
  },
]

const PRIMARY_DEAL: DealLibraryItem = {
  dealId: PRIMARY_DEAL_ID,
  dealName: 'Harbor Point Apartments',
  kind: 'user',
  readOnly: false,
  saveState: 'ready',
  dealPath: `data/deals/${PRIMARY_DEAL_ID}/deal.json`,
  updatedAt: '2099-08-01T13:00:00.000Z',
  createdAt: '2099-07-20T13:00:00.000Z',
  city: 'Tampa',
  state: 'FL',
  address: '100 Harbor Point Drive',
  totalUnits: 96,
  askingPrice: 18_400_000,
  investmentStrategy: 'core-plus',
  pipelineStatus: 'ready',
}

const SECONDARY_DEAL: DealLibraryItem = {
  dealId: SECONDARY_DEAL_ID,
  dealName: 'Cedar Grove Commons',
  kind: 'user',
  readOnly: false,
  saveState: 'ready',
  dealPath: `data/deals/${SECONDARY_DEAL_ID}/deal.json`,
  updatedAt: '2099-07-30T13:00:00.000Z',
  createdAt: '2099-07-15T13:00:00.000Z',
  city: 'Austin',
  state: 'TX',
  address: '500 Cedar Grove Way',
  totalUnits: 72,
  askingPrice: 13_200_000,
  investmentStrategy: 'value-add',
  pipelineStatus: 'ready',
}

function sourceDocument(
  dealId: string,
  documentId: string,
  fileName: string,
  type: string,
  typeLabel: string,
  phase: string,
  phaseLabel: string,
): SourceDocument {
  return {
    documentId,
    fileName,
    storedName: `${documentId}.${type === 'rent_roll' ? 'xlsx' : 'pdf'}`,
    path: `data/deals/${dealId}/documents/${documentId}`,
    mime: type === 'rent_roll'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf',
    size: 2_048,
    type,
    typeLabel,
    phase,
    phaseLabel,
    status: 'parsed',
    extractionStatus: 'extracted',
    uploadedAt: NOW,
    extractedAt: NOW,
    sourceHash: `sha256-${documentId}`,
    summary: `${typeLabel} fixture for Conversation Desk E2E coverage.`,
  }
}

const PRIMARY_DOCUMENTS = [
  sourceDocument(
    PRIMARY_DEAL_ID,
    RENT_DOCUMENT_ID,
    'Harbor Point Rent Roll.xlsx',
    'rent_roll',
    'Rent Roll',
    'due-diligence',
    'Due Diligence',
  ),
  sourceDocument(
    PRIMARY_DEAL_ID,
    PSA_DOCUMENT_ID,
    'Harbor Point PSA.pdf',
    'psa',
    'Purchase Agreement',
    'legal',
    'Legal',
  ),
]

const SECONDARY_DOCUMENTS = [
  sourceDocument(
    SECONDARY_DEAL_ID,
    PSA_DOCUMENT_ID,
    'Cedar Grove PSA.pdf',
    'psa',
    'Purchase Agreement',
    'legal',
    'Legal',
  ),
]

function dealRecord(item: DealLibraryItem): DealRecordResponse {
  return {
    item,
    deal: {
      dealId: item.dealId,
      dealName: item.dealName,
      property: {
        address: item.address,
        city: item.city,
        state: item.state,
        zip: '00000',
        totalUnits: item.totalUnits,
        propertyType: 'multifamily',
      },
      financials: { askingPrice: item.askingPrice, currentNOI: 930_000, inPlaceOccupancy: 0.94 },
      financing: { targetLTV: 0.7 },
      investmentStrategy: item.investmentStrategy,
      notes: 'Conversation Desk Playwright fixture.',
    },
    validation: {
      valid: true,
      launchReady: true,
      issues: [],
      blockingIssues: [],
      warnings: [],
    },
    checkpoint: null,
  }
}

function workspaceFor(item: DealLibraryItem, documents: SourceDocument[]): DealWorkspace {
  const record = dealRecord(item)
  return {
    deal: record,
    criteria: {
      investmentStrategy: item.investmentStrategy ?? 'core-plus',
      targetHoldPeriod: 5,
      targetIRR: 0.15,
      targetEquityMultiple: 1.9,
      targetCashOnCash: 0.08,
      targetLTV: 0.7,
      estimatedRate: 0.061,
      loanTerm: 10,
      amortization: 30,
      loanType: 'Agency',
      riskTolerance: 'balanced',
      scenario: item.investmentStrategy === 'value-add' ? 'value-add' : 'core-plus',
      notes: '',
      updatedAt: NOW,
    },
    documents,
    approvedFields: { version: 1, dealId: item.dealId, updatedAt: NOW, fields: [] },
    phases: [
      {
        phaseKey: 'dueDiligence',
        phaseSlug: 'due-diligence',
        label: 'Due Diligence',
        summary: 'Review source documents.',
        workflowId: 'due-diligence-review',
        checklist: [],
        requiredDocuments: ['Rent Roll'],
        uploadedDocuments: documents.filter((document) => document.type === 'rent_roll').map((document) => document.documentId),
        missingDocuments: [],
        readiness: 'ready',
        agents: [{
          agentId: 'rent-roll-analyst',
          name: 'Rent Roll Analyst',
          critical: true,
          inputs: ['rent roll document'],
          outputs: ['rent roll analysis'],
        }],
        updatedAt: NOW,
      },
      {
        phaseKey: 'legal',
        phaseSlug: 'legal',
        label: 'Legal',
        summary: 'Review transaction documents.',
        workflowId: 'legal-review',
        checklist: [],
        requiredDocuments: ['Purchase Agreement'],
        uploadedDocuments: documents.filter((document) => document.type === 'psa').map((document) => document.documentId),
        missingDocuments: [],
        readiness: 'ready',
        agents: [{
          agentId: 'psa-reviewer',
          name: 'PSA Reviewer',
          critical: true,
          inputs: ['PSA document'],
          outputs: ['PSA analysis'],
        }],
        updatedAt: NOW,
      },
    ],
    launchReadiness: [],
    progressionGuide: { version: 1, sections: [] },
    operatorCommand: {
      activePhaseSlug: 'intake',
      activePhaseLabel: 'Intake',
      readiness: documents.length > 0 ? 'ready' : 'blocked',
      blockingCount: documents.length > 0 ? 0 : 1,
      warningCount: 0,
      completedChecklistCount: documents.length > 0 ? 1 : 0,
      totalChecklistCount: 1,
      recommendedAction: {
        title: documents.length > 0 ? 'Review source evidence' : 'Add source documents',
        detail: 'Continue through the acquisition workflow.',
        cta: 'Review intake',
        action: { type: 'open_tab', label: 'Review intake', target: 'documents' },
      },
      sourceCoverage: {
        sourceDocumentCount: documents.length,
        reviewQueueCount: 0,
        approvedFieldCount: 0,
        requiredApprovedFieldCount: 0,
        missingApprovedFieldCount: 0,
      },
    },
  }
}

function conversationThread(
  dealId: string,
  threadId: string,
  agentId: string,
  title: string,
  documentIds: string[],
  messageCount: number,
  updatedAt = NOW,
): AgentConversationThread {
  return {
    version: 1,
    threadId,
    dealId,
    agentId,
    title,
    runtime: 'codex',
    documentIds,
    status: 'idle',
    activeTurnId: null,
    messageCount,
    createdAt: NOW,
    updatedAt,
    lastMessageAt: messageCount > 0 ? updatedAt : null,
  }
}

function conversationMessage({
  dealId,
  threadId,
  agentId,
  messageId,
  turnId,
  sequence,
  role,
  content,
  documentIds,
  citations = [],
}: {
  dealId: string
  threadId: string
  agentId: string
  messageId: string
  turnId: string
  sequence: number
  role: ConversationMessage['role']
  content: string
  documentIds: string[]
  citations?: ConversationMessage['citations']
}): ConversationMessage {
  return {
    version: 1,
    messageId,
    threadId,
    dealId,
    agentId,
    turnId,
    sequence,
    role,
    content,
    status: 'complete',
    attachments: documentIds.map((documentId) => ({
      documentId,
      fileName: documentId === RENT_DOCUMENT_ID ? 'Harbor Point Rent Roll.xlsx' : 'Cedar Grove PSA.pdf',
      type: documentId === RENT_DOCUMENT_ID ? 'rent_roll' : 'psa',
      sourceHash: `sha256-${documentId}`,
      evidenceStatus: 'approved',
    })),
    citations,
    createdAt: NOW,
    completedAt: NOW,
  }
}

function existingPsaDetail(): AgentConversationThreadDetail {
  const thread = conversationThread(
    SECONDARY_DEAL_ID,
    EXISTING_PSA_THREAD_ID,
    'psa-reviewer',
    'PSA deadline review',
    [PSA_DOCUMENT_ID],
    2,
    '2099-07-30T14:30:00.000Z',
  )
  return {
    thread,
    messages: [
      conversationMessage({
        dealId: SECONDARY_DEAL_ID,
        threadId: thread.threadId,
        agentId: thread.agentId,
        messageId: 'msg-home-psa-question',
        turnId: 'turn-home-psa-existing',
        sequence: 1,
        role: 'user',
        content: 'Which PSA date controls the inspection exit?',
        documentIds: [PSA_DOCUMENT_ID],
      }),
      conversationMessage({
        dealId: SECONDARY_DEAL_ID,
        threadId: thread.threadId,
        agentId: thread.agentId,
        messageId: 'msg-home-psa-answer',
        turnId: 'turn-home-psa-existing',
        sequence: 2,
        role: 'assistant',
        content: 'The inspection termination date is September 12.',
        documentIds: [PSA_DOCUMENT_ID],
        citations: [{
          citationId: 'cit-home-psa-section-4',
          documentId: PSA_DOCUMENT_ID,
          fileName: 'Cedar Grove PSA.pdf',
          location: 'page 18 · Section 4.2',
          excerpt: 'Buyer may terminate before 5:00 PM on September 12.',
          evidenceStatus: 'approved',
        }],
      }),
    ],
    activeTurn: null,
  }
}

function existingRentDetail(): AgentConversationThreadDetail {
  const thread = conversationThread(
    PRIMARY_DEAL_ID,
    EXISTING_RENT_THREAD_ID,
    'rent-roll-analyst',
    'Existing rent-roll review',
    [RENT_DOCUMENT_ID],
    2,
    '2099-08-01T13:30:00.000Z',
  )
  return {
    thread,
    messages: [
      conversationMessage({
        dealId: PRIMARY_DEAL_ID,
        threadId: EXISTING_RENT_THREAD_ID,
        agentId: 'rent-roll-analyst',
        messageId: 'msg-home-rent-existing-question',
        turnId: 'turn-home-rent-existing',
        sequence: 1,
        role: 'user',
        content: 'Which rent-roll item needs attention?',
        documentIds: [RENT_DOCUMENT_ID],
      }),
      conversationMessage({
        dealId: PRIMARY_DEAL_ID,
        threadId: EXISTING_RENT_THREAD_ID,
        agentId: 'rent-roll-analyst',
        messageId: 'msg-home-rent-existing-answer',
        turnId: 'turn-home-rent-existing',
        sequence: 2,
        role: 'assistant',
        content: 'The largest loss-to-lease row needs attention first.',
        documentIds: [RENT_DOCUMENT_ID],
      }),
    ],
    activeTurn: null,
  }
}

interface HomeHarnessOptions {
  deals?: DealLibraryItem[]
  noDocuments?: boolean
  conversationsEnabled?: boolean
  createDelayMs?: number
  createFailureMessage?: string
}

interface CapturedCreate {
  dealId: string
  body: CreateConversationRequest
}

interface CapturedSend {
  dealId: string
  threadId: string
  body: SendConversationMessageRequest
}

class ConversationHomeHarness {
  readonly createRequests: CapturedCreate[] = []
  readonly sendRequests: CapturedSend[] = []
  readonly unhandledRequests: string[] = []
  readonly detailsByDeal = new Map<string, Map<string, AgentConversationThreadDetail>>()
  readonly catalogDelays = new Map<string, number>()
  readonly detailDelays = new Map<string, number>()
  readonly detailRequests: Array<{ dealId: string; threadId: string }> = []
  enabled: boolean
  private socket: WebSocketRoute | null = null
  private lastAccepted: { dealId: string; threadId: string; turn: ConversationTurn } | null = null
  private mutationSequence = 0
  private eventSequence = 0

  constructor(
    readonly page: Page,
    readonly deals: DealLibraryItem[],
    readonly documentsByDeal: Map<string, SourceDocument[]>,
    conversationsEnabled: boolean,
    readonly createDelayMs: number,
    readonly createFailureMessage: string | null,
  ) {
    this.enabled = conversationsEnabled
    for (const deal of deals) this.detailsByDeal.set(deal.dealId, new Map())
    if (deals.some((deal) => deal.dealId === SECONDARY_DEAL_ID)) {
      const detail = existingPsaDetail()
      this.detailsByDeal.get(SECONDARY_DEAL_ID)?.set(detail.thread.threadId, detail)
    }
  }

  static async install(page: Page, options: HomeHarnessOptions = {}): Promise<ConversationHomeHarness> {
    const deals = options.deals ?? [PRIMARY_DEAL, SECONDARY_DEAL]
    const documentsByDeal = new Map<string, SourceDocument[]>()
    for (const deal of deals) {
      const documents = options.noDocuments
        ? []
        : deal.dealId === PRIMARY_DEAL_ID
          ? PRIMARY_DOCUMENTS
          : SECONDARY_DOCUMENTS
      documentsByDeal.set(deal.dealId, documents)
    }
    const harness = new ConversationHomeHarness(
      page,
      deals,
      documentsByDeal,
      options.conversationsEnabled ?? true,
      options.createDelayMs ?? 0,
      options.createFailureMessage ?? null,
    )
    await harness.installRoutes()
    return harness
  }

  private async installRoutes(): Promise<void> {
    await this.page.routeWebSocket(/\/ws$/, (socket) => {
      this.socket = socket
      setTimeout(() => {
        socket.send(JSON.stringify({
          type: 'initial',
          checkpoints: {},
          logs: {},
          events: {},
          documents: {},
        }))
      }, 0)
    })

    await this.page.route('**/api/**', async (route) => {
      await this.handleApiRoute(route)
    })
  }

  private async json(route: Route, status: number, payload: unknown): Promise<void> {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
  }

  private deal(dealId: string): DealLibraryItem | undefined {
    return this.deals.find((candidate) => candidate.dealId === dealId)
  }

  private async handleApiRoute(route: Route): Promise<void> {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname

    if (method === 'GET' && path === '/api/run/status') {
      await this.json(route, 200, {
        active: false,
        runId: null,
        dealPath: null,
        state: 'IDLE',
        mode: null,
        speed: null,
        error: null,
      })
      return
    }

    if (method === 'GET' && path === '/api/deals') {
      await this.json(route, 200, { deals: this.deals, suggestedDealId: this.deals[0]?.dealId ?? 'DEAL-2099-001' })
      return
    }

    if (method === 'GET' && path === '/api/workflows') {
      await this.json(route, 200, { version: 1, defaultWorkflowId: 'full-acquisition-review', workflows: [] })
      return
    }

    if (method === 'GET' && path === '/api/workflow-presets') {
      await this.json(route, 200, { presets: [] })
      return
    }

    const conversationMatch = path.match(/^\/api\/deals\/([^/]+)\/conversations(.*)$/)
    if (conversationMatch) {
      const dealId = decodeURIComponent(conversationMatch[1])
      await this.handleConversationRoute(route, dealId, conversationMatch[2])
      return
    }

    const workspaceMatch = path.match(/^\/api\/deals\/([^/]+)\/workspace$/)
    if (method === 'GET' && workspaceMatch) {
      const dealId = decodeURIComponent(workspaceMatch[1])
      const deal = this.deal(dealId)
      if (!deal) {
        await this.json(route, 404, { error: 'Deal not found' })
        return
      }
      await this.json(route, 200, workspaceFor(deal, this.documentsByDeal.get(dealId) ?? []))
      return
    }

    const dealMatch = path.match(/^\/api\/deals\/([^/]+)$/)
    if (method === 'GET' && dealMatch) {
      const deal = this.deal(decodeURIComponent(dealMatch[1]))
      await this.json(route, deal ? 200 : 404, deal ? dealRecord(deal) : { error: 'Deal not found' })
      return
    }

    this.unhandledRequests.push(`${method} ${path}`)
    await this.json(route, 404, { error: `Unhandled test API route: ${method} ${path}` })
  }

  private async handleConversationRoute(route: Route, dealId: string, suffix: string): Promise<void> {
    const request = route.request()
    const method = request.method()
    const details = this.detailsByDeal.get(dealId) ?? new Map<string, AgentConversationThreadDetail>()
    if (!this.detailsByDeal.has(dealId)) this.detailsByDeal.set(dealId, details)

    if (method === 'GET' && suffix === '') {
      const delay = this.catalogDelays.get(dealId) ?? 0
      if (delay > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, delay))
      await this.json(route, 200, {
        enabled: this.enabled,
        runtime: {
          ready: this.enabled,
          installed: this.enabled,
          loggedIn: this.enabled,
          usingChatGpt: this.enabled,
          version: 'test',
          message: this.enabled ? 'Codex / ChatGPT is ready.' : 'Agent conversations are disabled in this test runtime.',
        },
        agents: AGENTS,
        threads: [...details.values()].map((detail) => detail.thread),
      })
      return
    }

    if (method === 'POST' && suffix === '') {
      const body = request.postDataJSON() as CreateConversationRequest
      this.createRequests.push({ dealId, body })
      if (this.createFailureMessage) {
        await this.json(route, 500, { error: this.createFailureMessage })
        return
      }
      this.mutationSequence += 1
      const threadId = `thread-home-created-${this.mutationSequence}`
      const thread = conversationThread(
        dealId,
        threadId,
        body.agentId,
        body.title ?? `${AGENTS.find((agent) => agent.agentId === body.agentId)?.name ?? body.agentId} conversation`,
        body.documentIds ?? [],
        0,
        `2099-08-01T14:0${this.mutationSequence}:00.000Z`,
      )
      const detail: AgentConversationThreadDetail = { thread, messages: [], activeTurn: null }
      details.set(threadId, detail)
      if (this.createDelayMs > 0) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, this.createDelayMs))
      }
      await this.json(route, 201, detail)
      return
    }

    const messageMatch = suffix.match(/^\/([^/]+)\/messages$/)
    if (method === 'POST' && messageMatch) {
      const threadId = decodeURIComponent(messageMatch[1])
      const detail = details.get(threadId)
      if (!detail) {
        await this.json(route, 404, { error: 'Conversation thread not found' })
        return
      }
      const body = request.postDataJSON() as SendConversationMessageRequest
      this.sendRequests.push({ dealId, threadId, body })
      this.mutationSequence += 1
      const turnId = `turn-home-send-${this.mutationSequence}`
      const requestMessage = conversationMessage({
        dealId,
        threadId,
        agentId: detail.thread.agentId,
        messageId: `msg-home-user-${this.mutationSequence}`,
        turnId,
        sequence: detail.messages.length + 1,
        role: 'user',
        content: body.content,
        documentIds: body.documentIds ?? [],
      })
      const acceptedThread = {
        ...detail.thread,
        status: 'active' as const,
        activeTurnId: turnId,
        messageCount: detail.messages.length + 1,
        updatedAt: `2099-08-01T15:0${this.mutationSequence}:00.000Z`,
        lastMessageAt: `2099-08-01T15:0${this.mutationSequence}:00.000Z`,
      }
      const acceptedTurn: ConversationTurn = {
        version: 1,
        turnId,
        threadId,
        dealId,
        agentId: detail.thread.agentId,
        requestMessageId: requestMessage.messageId,
        status: 'queued',
        createdAt: NOW,
      }
      detail.thread = acceptedThread
      detail.messages.push(requestMessage)
      detail.activeTurn = acceptedTurn
      this.lastAccepted = { dealId, threadId, turn: acceptedTurn }
      await this.json(route, 202, { thread: acceptedThread, message: requestMessage, turn: acceptedTurn })
      return
    }

    const detailMatch = suffix.match(/^\/([^/]+)$/)
    if (method === 'GET' && detailMatch) {
      const threadId = decodeURIComponent(detailMatch[1])
      this.detailRequests.push({ dealId, threadId })
      const delay = this.detailDelays.get(threadId) ?? 0
      if (delay > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, delay))
      const detail = details.get(threadId)
      await this.json(route, detail ? 200 : 404, detail ?? { error: 'Conversation thread not found' })
      return
    }

    this.unhandledRequests.push(`${method} /api/deals/${dealId}/conversations${suffix}`)
    await this.json(route, 404, { error: 'Unhandled conversation test route' })
  }

  private async sendEvent(event: ConversationEvent): Promise<void> {
    await expect.poll(() => this.socket).not.toBeNull()
    this.socket?.send(JSON.stringify({ type: 'conversation', event }))
  }

  async emitReading(label = 'Reading the selected source documents'): Promise<void> {
    const accepted = this.lastAccepted
    if (!accepted) throw new Error('No accepted turn is available for a live event')
    const detail = this.detailsByDeal.get(accepted.dealId)?.get(accepted.threadId)
    if (!detail) throw new Error('Accepted thread is missing')
    this.eventSequence += 1
    const readingTurn: ConversationTurn = { ...accepted.turn, status: 'reading', startedAt: NOW }
    detail.activeTurn = readingTurn
    await this.sendEvent({
      eventId: `event-home-reading-${this.eventSequence}`,
      seq: this.eventSequence,
      dealId: accepted.dealId,
      threadId: accepted.threadId,
      agentId: detail.thread.agentId,
      turnId: accepted.turn.turnId,
      createdAt: `2099-08-01T16:0${this.eventSequence}:00.000Z`,
      thread: detail.thread,
      turn: readingTurn,
      activity: { kind: 'reading', label },
    })
  }

  async emitCompletedAnswer(): Promise<void> {
    const accepted = this.lastAccepted
    if (!accepted) throw new Error('No accepted turn is available for completion')
    const detail = this.detailsByDeal.get(accepted.dealId)?.get(accepted.threadId)
    if (!detail) throw new Error('Accepted thread is missing')
    this.eventSequence += 1
    const assistantMessage = conversationMessage({
      dealId: accepted.dealId,
      threadId: accepted.threadId,
      agentId: detail.thread.agentId,
      messageId: 'msg-home-live-cited-answer',
      turnId: accepted.turn.turnId,
      sequence: detail.messages.length + 1,
      role: 'assistant',
      content: 'The cited unit is 9.4% below the current market rent.',
      documentIds: [RENT_DOCUMENT_ID],
      citations: [{
        citationId: 'cit-home-rent-row-14',
        documentId: RENT_DOCUMENT_ID,
        fileName: 'Harbor Point Rent Roll.xlsx',
        location: 'Sheet Rent Roll · row 14 · Current Rent',
        excerpt: 'Unit 3C is at $1,740 versus $1,920 market rent.',
        evidenceStatus: 'approved',
      }],
    })
    const completedTurn: ConversationTurn = {
      ...accepted.turn,
      responseMessageId: assistantMessage.messageId,
      status: 'completed',
      startedAt: NOW,
      completedAt: NOW,
    }
    const completedThread: AgentConversationThread = {
      ...detail.thread,
      status: 'idle',
      activeTurnId: null,
      messageCount: detail.messages.length + 1,
      updatedAt: `2099-08-01T17:0${this.eventSequence}:00.000Z`,
      lastMessageAt: `2099-08-01T17:0${this.eventSequence}:00.000Z`,
    }
    detail.thread = completedThread
    detail.messages.push(assistantMessage)
    detail.activeTurn = null
    await this.sendEvent({
      eventId: `event-home-completed-${this.eventSequence}`,
      seq: this.eventSequence,
      dealId: accepted.dealId,
      threadId: accepted.threadId,
      agentId: completedThread.agentId,
      turnId: accepted.turn.turnId,
      createdAt: `2099-08-01T17:0${this.eventSequence}:00.000Z`,
      thread: completedThread,
      message: assistantMessage,
      turn: completedTurn,
      activity: { kind: 'completed', label: 'Answer complete' },
    })
  }
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function openHome(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await expect(page.getByText('Connected')).toBeVisible()
  await expect(page.getByTestId('conversation-home')).toBeVisible()
}

async function chooseSpecialist(page: Page, agentId: string): Promise<void> {
  const trigger = page.getByTestId('conversation-home-agent-select')
  await trigger.click()
  await expect(page.getByTestId('conversation-home-agent-menu')).toBeVisible()
  await page.getByTestId(`conversation-home-agent-option-${agentId}`).click()
  await expect(trigger).toHaveAttribute('data-value', agentId)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
}

test('uses the Conversation Desk as home and lazily creates a cited live thread', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page)
  await openHome(page)

  await expect(page.getByTestId('drop-zone-hero')).toHaveCount(0)
  await expect(page.getByTestId(`conversation-home-deal-${PRIMARY_DEAL_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('conversation-home-agent-select')).toHaveAttribute('data-value', 'rent-roll-analyst')
  await expect(page.getByTestId('conversation-home-thread-list')).toContainText('No conversations yet')
  await expect(page.getByText('1 · Choose a deal', { exact: true })).toBeVisible()
  await expect(page.getByText('2 · Choose a specialist', { exact: true })).toBeVisible()
  await expect(page.getByText('3 · Ask Rent Roll Analyst', { exact: true })).toBeVisible()

  const conversation = page.getByTestId('agent-conversation')
  await expect(conversation).toHaveAttribute('data-agent-id', 'rent-roll-analyst')
  expect(await conversation.getAttribute('data-thread-id')).toBeNull()
  const conversationStart = page.getByTestId('conversation-start')
  await expect(conversationStart).toBeVisible()
  await expect(conversationStart).toContainText('What do you want to know about Harbor Point Apartments?')
  const starterPrompts = page.locator('[data-testid^="agent-starter-prompt-"]')
  await expect(starterPrompts).toHaveCount(3)

  // Starter prompts stage editable text and focus the composer. They do not create a thread or
  // send anything until the operator explicitly submits.
  const firstStarter = page.getByTestId('agent-starter-prompt-0')
  const input = page.getByTestId('conversation-input')
  await firstStarter.click()
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('Summarize current occupancy, vacancies, and the biggest rent-roll risks.')
  await input.press('End')
  await input.type(' Focus on the largest exposure.')
  await expect(input).toHaveValue('Summarize current occupancy, vacancies, and the biggest rent-roll risks. Focus on the largest exposure.')
  expect(harness.createRequests).toEqual([])
  expect(harness.sendRequests).toEqual([])

  // Deal and specialist selection remain independent. Neither selection may eagerly create a
  // durable thread or resume the latest one; the first send is the creation boundary.
  await page.getByTestId(`conversation-home-deal-${SECONDARY_DEAL_ID}`).click()
  await expect(page.getByTestId(`conversation-home-deal-${SECONDARY_DEAL_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(input).toHaveValue('')
  await chooseSpecialist(page, 'master-orchestrator')
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-agent-id', 'master-orchestrator')
  expect(await page.getByTestId('agent-conversation').getAttribute('data-thread-id')).toBeNull()
  await input.fill('Coordinate the full deal review.')
  await chooseSpecialist(page, 'psa-reviewer')
  await expect(input).toHaveValue('')
  expect(await page.getByTestId('agent-conversation').getAttribute('data-thread-id')).toBeNull()
  await expect(page.getByTestId('conversation-start')).toBeVisible()
  await expect(page.getByTestId('conversation-timeline')).not.toContainText('inspection termination date is September 12')
  await page.getByTestId(`conversation-home-deal-${PRIMARY_DEAL_ID}`).click()
  await chooseSpecialist(page, 'rent-roll-analyst')
  await chooseSpecialist(page, 'master-orchestrator')
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-agent-id', 'master-orchestrator')
  await chooseSpecialist(page, 'rent-roll-analyst')
  expect(harness.createRequests).toEqual([])

  await expect(page.getByTestId(`conversation-document-option-${RENT_DOCUMENT_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId(`conversation-document-option-${PSA_DOCUMENT_ID}`)).toHaveAttribute('aria-pressed', 'false')
  await expect(input).toBeEnabled()
  await input.fill('Where is the largest loss to lease?')
  await page.getByTestId('conversation-send').click()

  await expect.poll(() => harness.createRequests.length).toBe(1)
  expect(harness.createRequests[0]).toEqual({
    dealId: PRIMARY_DEAL_ID,
    body: { agentId: 'rent-roll-analyst', documentIds: [RENT_DOCUMENT_ID] },
  })
  await expect.poll(() => harness.sendRequests.length).toBe(1)
  expect(harness.sendRequests[0]).toMatchObject({
    dealId: PRIMARY_DEAL_ID,
    threadId: 'thread-home-created-1',
    body: {
      content: 'Where is the largest loss to lease?',
      documentIds: [RENT_DOCUMENT_ID],
    },
  })
  expect(harness.sendRequests[0].body.clientRequestId).toEqual(expect.any(String))
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', 'thread-home-created-1')
  await expect(page).toHaveURL(new RegExp(`deal=${PRIMARY_DEAL_ID}.*agent=rent-roll-analyst.*thread=thread-home-created-1`))
  await expect(page.getByText('Where is the largest loss to lease?')).toBeVisible()

  await harness.emitReading()
  await expect(page.getByTestId('conversation-turn-status')).toContainText('Reading the selected source documents')
  await harness.emitCompletedAnswer()
  const assistant = page.getByTestId('conversation-message-msg-home-live-cited-answer')
  await expect(assistant).toHaveAttribute('data-role', 'assistant')
  await expect(assistant).toContainText('9.4% below the current market rent')
  await expect(input).toBeFocused()
  const citation = page.getByTestId('conversation-citation-cit-home-rent-row-14')
  await expect(citation).toContainText('Harbor Point Rent Roll.xlsx')
  await expect(citation).toContainText('Sheet Rent Roll · row 14 · Current Rent')
  await citation.locator('summary').click()
  await expect(citation).toContainText('Approved evidence')
  await expect(citation).toContainText('Unit 3C is at $1,740 versus $1,920 market rent')
  await expect(page.getByTestId('conversation-home-thread-thread-home-created-1')).toBeVisible()
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('keeps the specialist picker searchable, keyboard accessible, and contained', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page)
  await openHome(page)

  const trigger = page.getByTestId('conversation-home-agent-select')
  await expect(trigger).toHaveAccessibleName(/Choose a specialist Rent Roll Analyst/i)
  await trigger.focus()
  await trigger.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  const menu = page.getByTestId('conversation-home-agent-menu')
  const search = page.getByTestId('conversation-home-agent-search')
  await expect(menu).toBeVisible()
  await expect(search).toBeFocused()
  await search.fill('psa')
  const psaReviewer = page.getByTestId('conversation-home-agent-option-psa-reviewer')
  await expect(psaReviewer).toBeVisible()
  await expect(page.getByRole('option')).toHaveCount(1)
  await expect(search).toHaveAttribute('aria-activedescendant', 'conversation-home-agent-option-psa-reviewer')
  await search.press('Enter')
  await expect(trigger).toHaveAttribute('data-value', 'psa-reviewer')
  await expect(trigger).toBeFocused()
  await expect(menu).toHaveCount(0)
  await expect(page).toHaveURL(/agent=psa-reviewer/)

  await trigger.press('ArrowDown')
  await expect(search).toBeFocused()
  await search.press('End')
  await expect(search).toHaveAttribute('aria-activedescendant', 'conversation-home-agent-option-master-orchestrator')
  await search.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('data-value', 'psa-reviewer')
  await expect(menu).toHaveCount(0)

  expect(harness.createRequests).toEqual([])
  expect(harness.sendRequests).toEqual([])
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('ignores a delayed thread creation after the operator changes deals', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page, { createDelayMs: 250 })
  await openHome(page)

  const input = page.getByTestId('conversation-input')
  await input.fill('Create this only for the deal that is still selected.')
  await page.getByTestId('conversation-send').click()
  await expect.poll(() => harness.createRequests.length).toBe(1)

  await page.getByTestId(`conversation-home-deal-${SECONDARY_DEAL_ID}`).click()
  await expect(page.getByTestId(`conversation-home-deal-${SECONDARY_DEAL_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(350)

  expect(harness.createRequests[0]?.dealId).toBe(PRIMARY_DEAL_ID)
  expect(harness.sendRequests).toEqual([])
  await expect(page).toHaveURL(new RegExp(`deal=${SECONDARY_DEAL_ID}`))
  expect(new URL(page.url()).searchParams.get('thread')).toBeNull()
  await expect(page.getByTestId('agent-conversation')).not.toHaveAttribute('data-thread-id', 'thread-home-created-1')
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('preserves the composer draft when lazy thread creation fails', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page, {
    createFailureMessage: 'The conversation thread could not be created.',
  })
  await openHome(page)

  const input = page.getByTestId('conversation-input')
  const draft = 'Keep this question available so I can retry it.'
  await input.fill(draft)
  await page.getByTestId('conversation-send').click()

  await expect.poll(() => harness.createRequests.length).toBe(1)
  await expect(page.getByTestId('agent-followup-notice')).toContainText('The conversation thread could not be created.')
  await expect(input).toBeEnabled()
  await expect(input).toHaveValue(draft)
  expect(harness.sendRequests).toEqual([])
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('keeps a newer popstate thread restore when an older detail request finishes first', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page)
  const primaryDetail = existingRentDetail()
  harness.detailsByDeal.get(PRIMARY_DEAL_ID)?.set(primaryDetail.thread.threadId, primaryDetail)
  harness.detailDelays.set(EXISTING_RENT_THREAD_ID, 200)
  harness.catalogDelays.set(SECONDARY_DEAL_ID, 500)

  await openHome(page, `/?deal=${PRIMARY_DEAL_ID}&agent=rent-roll-analyst&thread=${EXISTING_RENT_THREAD_ID}`)
  await expect.poll(() => harness.detailRequests.some((request) => (
    request.dealId === PRIMARY_DEAL_ID && request.threadId === EXISTING_RENT_THREAD_ID
  ))).toBe(true)

  const newerPath = `/?deal=${SECONDARY_DEAL_ID}&agent=psa-reviewer&thread=${EXISTING_PSA_THREAD_ID}`
  await page.evaluate((path) => {
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, newerPath)

  await expect(page.getByTestId(`conversation-home-deal-${SECONDARY_DEAL_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', EXISTING_PSA_THREAD_ID)
  await expect(page.getByTestId('conversation-timeline')).toContainText('inspection termination date is September 12')
  expect(new URL(page.url()).searchParams.get('thread')).toBe(EXISTING_PSA_THREAD_ID)
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('restores deal and thread URLs, responds to popstate, and moves between home and workspace', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page)
  const restoredPath = `/?deal=${SECONDARY_DEAL_ID}&agent=psa-reviewer&thread=${EXISTING_PSA_THREAD_ID}`
  await openHome(page, restoredPath)

  await expect(page.getByTestId(`conversation-home-deal-${SECONDARY_DEAL_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('conversation-home-agent-select')).toHaveAttribute('data-value', 'psa-reviewer')
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', EXISTING_PSA_THREAD_ID)
  await expect(page.getByTestId('conversation-timeline')).toContainText('inspection termination date is September 12')

  // New thread is a client-side fresh state. It clears the active history but remains lazy until
  // the first send. The recent-thread card is the explicit way to resume that exact history.
  await page.getByTestId('conversation-home-new-thread').click()
  expect(await page.getByTestId('agent-conversation').getAttribute('data-thread-id')).toBeNull()
  await expect(page.getByTestId('conversation-start')).toBeVisible()
  await expect(page.getByTestId('conversation-timeline')).not.toContainText('inspection termination date is September 12')
  const input = page.getByTestId('conversation-input')
  await input.fill('This draft belongs to a new thread.')
  expect(new URL(page.url()).searchParams.get('thread')).toBeNull()
  expect(harness.createRequests).toEqual([])
  expect(harness.sendRequests).toEqual([])
  await page.getByTestId(`conversation-home-thread-${EXISTING_PSA_THREAD_ID}`).click()
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', EXISTING_PSA_THREAD_ID)
  await expect(input).toHaveValue('')
  await expect(page.getByTestId('conversation-timeline')).toContainText('inspection termination date is September 12')

  await page.getByTestId(`conversation-home-deal-${PRIMARY_DEAL_ID}`).click()
  await expect(page).toHaveURL(new RegExp(`deal=${PRIMARY_DEAL_ID}`))
  await expect(page.getByTestId(`conversation-home-deal-${PRIMARY_DEAL_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await expect(page.getByTestId(`conversation-home-deal-${SECONDARY_DEAL_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-agent-id', 'psa-reviewer')
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', EXISTING_PSA_THREAD_ID)
  await expect(page.getByTestId('conversation-timeline')).toContainText('Which PSA date controls the inspection exit?')

  await page.getByTestId('conversation-home-open-workspace').click()
  await expect(page.getByTestId('workspace-frame')).toBeVisible()
  await expect(page.getByTestId('header-conversations-button')).toHaveAccessibleName('Back to conversations')
  await page.getByTestId('header-conversations-button').click()
  await expect(page.getByTestId('conversation-home')).toBeVisible()
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', EXISTING_PSA_THREAD_ID)

  await page.getByTestId('conversation-home-new-deal').click()
  await expect(page.getByTestId('drop-zone-hero')).toBeVisible()
  await expect(page.getByTestId('conversation-home')).toHaveCount(0)
  await page.getByTestId('back-to-conversations').click()
  await expect(page.getByTestId('conversation-home')).toBeVisible()
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', EXISTING_PSA_THREAD_ID)
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('resets agent document drafts when popstate returns to another deal', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page)
  await openHome(page)

  await expect(page.getByTestId('conversation-home-agent-select')).toHaveAttribute('data-value', 'rent-roll-analyst')
  await expect(page.getByTestId(`conversation-document-option-${RENT_DOCUMENT_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId(`conversation-document-option-${PSA_DOCUMENT_ID}`)).toHaveAttribute('aria-pressed', 'false')

  await page.getByTestId(`conversation-home-deal-${SECONDARY_DEAL_ID}`).click()
  await chooseSpecialist(page, 'rent-roll-analyst')
  await expect(page.getByTestId(`conversation-document-option-${PSA_DOCUMENT_ID}`)).toHaveAttribute('aria-pressed', 'true')

  await page.goBack()
  await expect(page.getByTestId(`conversation-home-deal-${SECONDARY_DEAL_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await expect(page.getByTestId(`conversation-home-deal-${PRIMARY_DEAL_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('conversation-home-agent-select')).toHaveAttribute('data-value', 'rent-roll-analyst')
  await expect(page.getByTestId(`conversation-document-option-${RENT_DOCUMENT_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId(`conversation-document-option-${PSA_DOCUMENT_ID}`)).toHaveAttribute('aria-pressed', 'false')
  expect(harness.sendRequests).toEqual([])
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('shows an empty Conversation Desk before routing New Deal to the uploader', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page, { deals: [] })
  await page.goto('/')
  await expect(page.getByText('Connected')).toBeVisible()
  const empty = page.getByTestId('conversation-home-empty')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText('Start with a deal')
  await expect(page.getByTestId('drop-zone-hero')).toHaveCount(0)
  await page.getByTestId('conversation-home-empty-new-deal').click()
  await expect(page.getByTestId('drop-zone-hero')).toBeVisible()
  await page.getByTestId('back-to-conversations').click()
  await expect(page.getByTestId('conversation-home-empty')).toBeVisible()
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('keeps the no-document and conversations-disabled states actionable', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page, {
    deals: [PRIMARY_DEAL],
    noDocuments: true,
  })
  await openHome(page)

  const noDocuments = page.getByTestId('conversation-home-no-documents')
  await expect(noDocuments).toBeVisible()
  await expect(noDocuments).toContainText('No source documents yet')
  await expect(page.getByTestId('conversation-home-upload-documents')).toBeVisible()
  await expect(page.getByTestId('conversation-input')).toBeDisabled()

  harness.enabled = false
  await page.reload()
  await expect(page.getByTestId('conversation-home')).toBeVisible()
  await expect(page.getByTestId('conversation-home-no-documents')).toBeVisible()
  await expect(page.getByTestId('conversation-input')).toBeDisabled()
  await expect(page.getByTestId('conversation-home-new-thread')).toHaveCount(0)
  await expect(page.getByTestId('agent-followup-notice')).toContainText('Agent conversations are currently unavailable')
  await expect(page.getByTestId('conversation-home-open-workspace')).toBeEnabled()
  expect(harness.createRequests).toEqual([])
  expect(harness.sendRequests).toEqual([])
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('keeps the Conversation Desk and composer usable without page overflow @mobile', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)
  const harness = await ConversationHomeHarness.install(page)
  await openHome(page, `/?deal=${SECONDARY_DEAL_ID}&agent=psa-reviewer&thread=${EXISTING_PSA_THREAD_ID}`)

  const recentThreads = page.getByTestId('conversation-home-thread-list')
  const existingThread = page.getByTestId(`conversation-home-thread-${EXISTING_PSA_THREAD_ID}`)
  await expect(recentThreads).toBeVisible()
  await expect(existingThread).toBeVisible()
  await page.getByTestId('conversation-home-new-thread').click()
  await expect(page.getByTestId('agent-conversation')).not.toHaveAttribute('data-thread-id', EXISTING_PSA_THREAD_ID)
  await existingThread.click()
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', EXISTING_PSA_THREAD_ID)

  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  const layout = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth + 1)
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth + 1)

  await page.getByTestId('conversation-home-agent-select').click()
  const menu = page.getByTestId('conversation-home-agent-menu')
  await expect(menu).toBeVisible()
  const menuBox = await menu.boundingBox()
  expect(menuBox).not.toBeNull()
  expect(menuBox!.x).toBeGreaterThanOrEqual(0)
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1)
  await page.getByTestId('conversation-home-agent-search').press('Escape')
  await expect(menu).toHaveCount(0)

  const composer = page.getByTestId('conversation-composer')
  await composer.scrollIntoViewIfNeeded()
  await expect(composer).toBeVisible()
  const box = await composer.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1)

  const input = page.getByTestId('conversation-input')
  await expect(input).toBeEnabled()
  await input.fill('Confirm the mobile follow-up flow.')
  await page.getByTestId('conversation-send').click()
  await expect.poll(() => harness.sendRequests.length).toBe(1)
  expect(harness.sendRequests[0]).toMatchObject({
    dealId: SECONDARY_DEAL_ID,
    threadId: EXISTING_PSA_THREAD_ID,
    body: {
      content: 'Confirm the mobile follow-up flow.',
      documentIds: [PSA_DOCUMENT_ID],
    },
  })
  await expect(page.getByText('Confirm the mobile follow-up flow.')).toBeVisible()
  expect(harness.unhandledRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})
