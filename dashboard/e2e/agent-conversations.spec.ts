import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AgentConversationThread,
  AgentConversationThreadDetail,
  ConversationAgentDescriptor,
  ConversationDocumentAttachment,
  ConversationMessage,
  ConversationTurn,
  SendConversationMessageRequest,
} from '../src/types/conversations'
import type { SourceDocument } from '../src/types/workspace'
import {
  cleanupDealArtifacts,
  dataRoot,
  focusStage,
  openWorkspaceFromRecentDeals,
  saveLaunchReadyDeal,
  stopActiveRun,
} from './helpers'

// Conversation E2E coverage deliberately replaces only the conversation REST surface. The
// dashboard, deal workspace, document manifest, routing, and panel all remain real; no Codex
// process is launched. The in-memory service below is durable for the lifetime of a test, so a
// browser reload has to recover the authoritative history through GET just like production.

const DEAL_ID = 'DEAL-2099-CONV-001'
const DEAL_NAME = 'Playwright Conversation Deal'
const RENT_DOCUMENT_ID = 'doc-conversation-rent-roll'
const PSA_DOCUMENT_ID = 'doc-conversation-psa'
const RENT_THREAD_ID = 'thread-rent-roll-main'
const RENT_PRIOR_THREAD_ID = 'thread-rent-roll-prior'
const PSA_THREAD_ID = 'thread-psa-main'
const BASE_TIME = '2099-07-01T12:00:00.000Z'

const ORCHESTRATORS = [
  'master-orchestrator',
  'due-diligence-orchestrator',
  'underwriting-orchestrator',
  'financing-orchestrator',
  'legal-orchestrator',
  'closing-orchestrator',
] as const

const SPECIALISTS_BY_PHASE = {
  'due-diligence': [
    'rent-roll-analyst',
    'opex-analyst',
    'physical-inspection',
    'market-study',
    'environmental-review',
    'legal-title-review',
    'tenant-credit',
  ],
  underwriting: ['financial-model-builder', 'scenario-analyst', 'ic-memo-writer'],
  financing: ['lender-outreach', 'quote-comparator', 'term-sheet-builder'],
  legal: [
    'psa-reviewer',
    'title-survey-reviewer',
    'estoppel-tracker',
    'loan-doc-reviewer',
    'insurance-coordinator',
    'transfer-doc-preparer',
  ],
  closing: ['closing-coordinator', 'funds-flow-manager'],
} as const

const INGESTION_AGENTS = [
  'document-orchestrator',
  'rent-roll-parser',
  'financials-parser',
  'offering-memo-parser',
] as const

function agentDisplayName(agentId: string): string {
  const acronyms: Record<string, string> = { psa: 'PSA', ic: 'IC', opex: 'OpEx' }
  return agentId
    .split('-')
    .map((part) => acronyms[part] ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function buildAgentDirectory(): ConversationAgentDescriptor[] {
  const descriptors: ConversationAgentDescriptor[] = ORCHESTRATORS.map((agentId) => ({
    agentId,
    name: agentDisplayName(agentId),
    phase: agentId === 'master-orchestrator' ? 'master' : agentId.replace(/-orchestrator$/, ''),
    kind: 'orchestrator',
    promptPath: `orchestrators/${agentId}.md`,
    inputs: ['deal workspace'],
    outputs: ['coordinated analysis'],
  }))

  for (const [phase, agentIds] of Object.entries(SPECIALISTS_BY_PHASE)) {
    for (const agentId of agentIds) {
      descriptors.push({
        agentId,
        name: agentDisplayName(agentId),
        phase,
        kind: 'specialist',
        promptPath: `agents/${phase}/${agentId}.md`,
        inputs: agentId === 'rent-roll-analyst' ? ['rent roll document'] : ['deal workspace'],
        outputs: [`${agentDisplayName(agentId)} analysis`],
      })
    }
  }

  for (const agentId of INGESTION_AGENTS) {
    descriptors.push({
      agentId,
      name: agentDisplayName(agentId),
      phase: 'ingestion',
      kind: 'ingestion',
      promptPath: `agents/ingestion/${agentId}.md`,
      inputs: ['incoming deal documents'],
      outputs: ['structured source data'],
    })
  }

  return descriptors
}

const AGENT_DIRECTORY = buildAgentDirectory()

function seedConversationDocuments(): SourceDocument[] {
  const dealRoot = join(dataRoot, 'deals', DEAL_ID)
  const documentsRoot = join(dealRoot, 'documents')
  mkdirSync(documentsRoot, { recursive: true })

  const rentPath = join(documentsRoot, `${RENT_DOCUMENT_ID}.xlsx`)
  const psaPath = join(documentsRoot, `${PSA_DOCUMENT_ID}.pdf`)
  writeFileSync(rentPath, 'Playwright deterministic rent roll evidence')
  writeFileSync(psaPath, '%PDF-1.4\nPlaywright deterministic PSA evidence\n')

  const documents: SourceDocument[] = [
    {
      documentId: RENT_DOCUMENT_ID,
      fileName: '2026 Rent Roll.xlsx',
      storedName: `${RENT_DOCUMENT_ID}.xlsx`,
      path: rentPath,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 43,
      type: 'rent_roll',
      typeLabel: 'Rent Roll',
      phase: 'due-diligence',
      phaseLabel: 'Due Diligence',
      status: 'parsed',
      extractionStatus: 'extracted',
      uploadedAt: BASE_TIME,
      extractedAt: BASE_TIME,
      sourceHash: 'sha256-playwright-rent-roll',
      summary: 'Deterministic rent roll for conversation coverage.',
    },
    {
      documentId: PSA_DOCUMENT_ID,
      fileName: 'Purchase and Sale Agreement.pdf',
      storedName: `${PSA_DOCUMENT_ID}.pdf`,
      path: psaPath,
      mime: 'application/pdf',
      size: 50,
      type: 'psa',
      typeLabel: 'Purchase Agreement',
      phase: 'legal',
      phaseLabel: 'Legal',
      status: 'parsed',
      extractionStatus: 'extracted',
      uploadedAt: BASE_TIME,
      extractedAt: BASE_TIME,
      sourceHash: 'sha256-playwright-psa',
      summary: 'Deterministic PSA for conversation isolation coverage.',
    },
  ]

  writeFileSync(
    join(dealRoot, 'document-manifest.json'),
    JSON.stringify({ version: 1, dealId: DEAL_ID, documents }, null, 2),
  )
  return documents
}

function attachment(documentId: string): ConversationDocumentAttachment {
  const isRentRoll = documentId === RENT_DOCUMENT_ID
  return {
    documentId,
    fileName: isRentRoll ? '2026 Rent Roll.xlsx' : 'Purchase and Sale Agreement.pdf',
    type: isRentRoll ? 'rent_roll' : 'psa',
    sourceHash: isRentRoll ? 'sha256-playwright-rent-roll' : 'sha256-playwright-psa',
    evidenceStatus: 'approved',
  }
}

function thread(
  threadId: string,
  agentId: string,
  title: string,
  documentIds: string[],
  messageCount: number,
  updatedAt = BASE_TIME,
): AgentConversationThread {
  return {
    version: 1,
    threadId,
    dealId: DEAL_ID,
    agentId,
    title,
    runtime: 'codex',
    documentIds,
    status: 'idle',
    activeTurnId: null,
    messageCount,
    createdAt: BASE_TIME,
    updatedAt,
    lastMessageAt: messageCount > 0 ? updatedAt : null,
  }
}

function message({
  messageId,
  threadId,
  agentId,
  turnId,
  sequence,
  role,
  content,
  documentIds = [],
  status = 'complete',
  citations = [],
}: {
  messageId: string
  threadId: string
  agentId: string
  turnId: string
  sequence: number
  role: ConversationMessage['role']
  content: string
  documentIds?: string[]
  status?: ConversationMessage['status']
  citations?: ConversationMessage['citations']
}): ConversationMessage {
  return {
    version: 1,
    messageId,
    threadId,
    dealId: DEAL_ID,
    agentId,
    turnId,
    sequence,
    role,
    content,
    status,
    attachments: documentIds.map(attachment),
    citations,
    createdAt: BASE_TIME,
    completedAt: BASE_TIME,
  }
}

interface CapturedMessagePost {
  threadId: string
  body: SendConversationMessageRequest
}

interface ConversationHarness {
  details: Map<string, AgentConversationThreadDetail>
  detailDelays: Map<string, number>
  messagePosts: CapturedMessagePost[]
  cancelledTurns: Array<{ threadId: string; turnId: string }>
}

function buildConversationHarness(mode: 'history' | 'active-cancel'): ConversationHarness {
  const rentMessages: ConversationMessage[] = mode === 'active-cancel'
    ? [
        message({
          messageId: 'msg-cancel-request',
          threadId: RENT_THREAD_ID,
          agentId: 'rent-roll-analyst',
          turnId: 'turn-cancel-1',
          sequence: 1,
          role: 'user',
          content: 'Recheck the delinquent units before I proceed.',
          documentIds: [RENT_DOCUMENT_ID],
        }),
      ]
    : [
        message({
          messageId: 'msg-rent-question',
          threadId: RENT_THREAD_ID,
          agentId: 'rent-roll-analyst',
          turnId: 'turn-rent-1',
          sequence: 1,
          role: 'user',
          content: 'What does the rent roll say about loss to lease?',
          documentIds: [RENT_DOCUMENT_ID],
        }),
        message({
          messageId: 'msg-rent-answer',
          threadId: RENT_THREAD_ID,
          agentId: 'rent-roll-analyst',
          turnId: 'turn-rent-1',
          sequence: 2,
          role: 'assistant',
          content: 'The cited unit is 11.8% below the current market rent.',
          documentIds: [RENT_DOCUMENT_ID],
          citations: [
            {
              citationId: 'cit-rent-row-12',
              documentId: RENT_DOCUMENT_ID,
              fileName: '2026 Rent Roll.xlsx',
              location: 'Sheet Rent Roll · row 12 · column Current Rent',
              excerpt: 'Unit 2B has $1,825 in-place rent against $2,070 market rent.',
              evidenceStatus: 'approved',
            },
          ],
        }),
      ]

  const rentThread = thread(
    RENT_THREAD_ID,
    'rent-roll-analyst',
    'Loss to lease review',
    [RENT_DOCUMENT_ID],
    rentMessages.length,
    '2099-07-01T12:04:00.000Z',
  )
  let activeTurn: ConversationTurn | null = null
  if (mode === 'active-cancel') {
    activeTurn = {
      version: 1,
      turnId: 'turn-cancel-1',
      threadId: RENT_THREAD_ID,
      dealId: DEAL_ID,
      agentId: 'rent-roll-analyst',
      requestMessageId: 'msg-cancel-request',
      status: 'responding',
      createdAt: BASE_TIME,
      startedAt: BASE_TIME,
    }
    rentThread.status = 'active'
    rentThread.activeTurnId = activeTurn.turnId
  }

  const priorThread = thread(
    RENT_PRIOR_THREAD_ID,
    'rent-roll-analyst',
    'Prior occupancy check',
    [RENT_DOCUMENT_ID],
    2,
    '2099-06-30T12:00:00.000Z',
  )
  const psaThread = thread(
    PSA_THREAD_ID,
    'psa-reviewer',
    'PSA deadline review',
    [PSA_DOCUMENT_ID],
    2,
    '2099-06-29T12:00:00.000Z',
  )

  return {
    details: new Map<string, AgentConversationThreadDetail>([
      [RENT_THREAD_ID, { thread: rentThread, messages: rentMessages, activeTurn }],
      [
        RENT_PRIOR_THREAD_ID,
        {
          thread: priorThread,
          messages: [
            message({
              messageId: 'msg-prior-question',
              threadId: RENT_PRIOR_THREAD_ID,
              agentId: 'rent-roll-analyst',
              turnId: 'turn-prior-1',
              sequence: 1,
              role: 'user',
              content: 'Was the prior occupancy calculation source-backed?',
              documentIds: [RENT_DOCUMENT_ID],
            }),
            message({
              messageId: 'msg-prior-answer',
              threadId: RENT_PRIOR_THREAD_ID,
              agentId: 'rent-roll-analyst',
              turnId: 'turn-prior-1',
              sequence: 2,
              role: 'assistant',
              content: 'Yes. The prior occupancy check used the same uploaded rent roll.',
              documentIds: [RENT_DOCUMENT_ID],
            }),
          ],
          activeTurn: null,
        },
      ],
      [
        PSA_THREAD_ID,
        {
          thread: psaThread,
          messages: [
            message({
              messageId: 'msg-psa-question',
              threadId: PSA_THREAD_ID,
              agentId: 'psa-reviewer',
              turnId: 'turn-psa-1',
              sequence: 1,
              role: 'user',
              content: 'Which PSA deadline needs attention?',
              documentIds: [PSA_DOCUMENT_ID],
            }),
            message({
              messageId: 'msg-psa-answer',
              threadId: PSA_THREAD_ID,
              agentId: 'psa-reviewer',
              turnId: 'turn-psa-1',
              sequence: 2,
              role: 'assistant',
              content: 'The inspection termination deadline is the next legal milestone.',
              documentIds: [PSA_DOCUMENT_ID],
            }),
          ],
          activeTurn: null,
        },
      ],
    ]),
    detailDelays: new Map(),
    messagePosts: [],
    cancelledTurns: [],
  }
}

async function installConversationRoutes(page: Page, harness: ConversationHarness): Promise<void> {
  const collectionPath = `/api/deals/${DEAL_ID}/conversations`
  let mutationCount = 0

  async function fulfillJson(route: Parameters<Parameters<Page['route']>[1]>[0], status: number, payload: unknown) {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
  }

  await page.route(`**${collectionPath}**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const suffix = path.slice(collectionPath.length)
    const method = request.method()

    if (method === 'GET' && suffix === '') {
      await fulfillJson(route, 200, {
        enabled: true,
        runtime: {
          ready: true,
          installed: true,
          loggedIn: true,
          usingChatGpt: true,
          version: 'test',
          message: 'Codex / ChatGPT is ready.',
        },
        threads: [...harness.details.values()].map((detail) => detail.thread),
        agents: AGENT_DIRECTORY,
      })
      return
    }

    const detailMatch = suffix.match(/^\/([^/]+)$/)
    if (method === 'GET' && detailMatch) {
      const threadId = decodeURIComponent(detailMatch[1])
      const delay = harness.detailDelays.get(threadId) ?? 0
      if (delay > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, delay))
      const detail = harness.details.get(threadId)
      await fulfillJson(route, detail ? 200 : 404, detail ?? { error: 'Conversation thread not found' })
      return
    }

    if (method === 'POST' && suffix === '') {
      const body = request.postDataJSON() as { agentId: string; title?: string; documentIds?: string[] }
      mutationCount += 1
      const threadId = `thread-created-${mutationCount}`
      const created: AgentConversationThreadDetail = {
        thread: thread(
          threadId,
          body.agentId,
          body.title || `${agentDisplayName(body.agentId)} conversation`,
          body.documentIds ?? [],
          0,
          `2099-07-01T13:00:0${mutationCount}.000Z`,
        ),
        messages: [],
        activeTurn: null,
      }
      harness.details.set(threadId, created)
      await fulfillJson(route, 201, created)
      return
    }

    const messageMatch = suffix.match(/^\/([^/]+)\/messages$/)
    if (method === 'POST' && messageMatch) {
      const threadId = decodeURIComponent(messageMatch[1])
      const detail = harness.details.get(threadId)
      if (!detail) {
        await fulfillJson(route, 404, { error: 'Conversation thread not found' })
        return
      }

      const body = request.postDataJSON() as SendConversationMessageRequest
      harness.messagePosts.push({ threadId, body })
      mutationCount += 1
      const turnId = `turn-post-${mutationCount}`
      const requestMessage = message({
        messageId: `msg-post-${mutationCount}`,
        threadId,
        agentId: detail.thread.agentId,
        turnId,
        sequence: detail.messages.length + 1,
        role: 'user',
        content: body.content,
        documentIds: body.documentIds ?? [],
      })
      const completedReply = message({
        messageId: `msg-post-answer-${mutationCount}`,
        threadId,
        agentId: detail.thread.agentId,
        turnId,
        sequence: detail.messages.length + 2,
        role: 'assistant',
        content: 'This follow-up was restored from authoritative conversation history.',
        documentIds: body.documentIds ?? [],
      })
      detail.messages.push(requestMessage, completedReply)
      detail.thread.messageCount = detail.messages.length
      detail.thread.updatedAt = `2099-07-01T13:10:0${mutationCount}.000Z`
      detail.thread.lastMessageAt = detail.thread.updatedAt
      detail.thread.status = 'idle'
      detail.thread.activeTurnId = null
      detail.activeTurn = null

      const acceptedThread = { ...detail.thread, status: 'active' as const, activeTurnId: turnId }
      const acceptedTurn: ConversationTurn = {
        version: 1,
        turnId,
        threadId,
        dealId: DEAL_ID,
        agentId: detail.thread.agentId,
        requestMessageId: requestMessage.messageId,
        status: 'queued',
        createdAt: BASE_TIME,
      }
      await fulfillJson(route, 202, { thread: acceptedThread, message: requestMessage, turn: acceptedTurn })
      return
    }

    const cancelMatch = suffix.match(/^\/([^/]+)\/turns\/([^/]+)\/cancel$/)
    if (method === 'POST' && cancelMatch) {
      const threadId = decodeURIComponent(cancelMatch[1])
      const turnId = decodeURIComponent(cancelMatch[2])
      const detail = harness.details.get(threadId)
      if (!detail) {
        await fulfillJson(route, 404, { error: 'Conversation thread not found' })
        return
      }

      harness.cancelledTurns.push({ threadId, turnId })
      if (!detail.messages.some((entry) => entry.role === 'assistant' && entry.turnId === turnId)) {
        detail.messages.push(message({
          messageId: `msg-cancelled-${turnId}`,
          threadId,
          agentId: detail.thread.agentId,
          turnId,
          sequence: detail.messages.length + 1,
          role: 'assistant',
          content: 'Turn cancelled by the operator. The original request remains available to retry.',
          documentIds: detail.thread.documentIds,
          status: 'cancelled',
        }))
      }
      detail.thread.status = 'idle'
      detail.thread.activeTurnId = null
      detail.thread.messageCount = detail.messages.length
      detail.activeTurn = null
      const cancelledTurn: ConversationTurn = {
        version: 1,
        turnId,
        threadId,
        dealId: DEAL_ID,
        agentId: detail.thread.agentId,
        requestMessageId: detail.messages.find((entry) => entry.role === 'user' && entry.turnId === turnId)?.messageId ?? '',
        status: 'cancelled',
        createdAt: BASE_TIME,
        completedAt: BASE_TIME,
      }
      await fulfillJson(route, 202, { turn: cancelledTurn })
      return
    }

    await fulfillJson(route, 404, { error: `Unhandled mocked conversation route: ${method} ${path}` })
  })
}

async function openConversationWorkspace(page: Page): Promise<void> {
  await openWorkspaceFromRecentDeals(page, DEAL_ID, DEAL_NAME)
  await expect(page.getByTestId('team-summon')).toContainText('Summon any of 31 agents')
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(DEAL_ID)
  await stopActiveRun(request)
  await saveLaunchReadyDeal(request, DEAL_ID, DEAL_NAME)
  seedConversationDocuments()
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupDealArtifacts(DEAL_ID)
})

test('summons all 31 agents and keeps cited specialist threads durable and isolated', async ({ page }) => {
  const harness = buildConversationHarness('history')
  await installConversationRoutes(page, harness)
  await openConversationWorkspace(page)

  await page.getByTestId('team-summon').click()
  const directory = page.getByTestId('agent-directory')
  const directoryDialog = directory.getByRole('dialog', { name: 'Agent directory' })
  await expect(directoryDialog).toBeVisible()
  await expect(directoryDialog).toHaveAttribute('aria-modal', 'true')
  await expect(directory.locator('[data-testid^="agent-directory-item-"]')).toHaveCount(31)
  await expect(directory.getByTestId('agent-directory-item-master-orchestrator')).toContainText('Master Orchestrator')

  await page.keyboard.press('Escape')
  await expect(directory).toBeHidden()
  await expect(page.getByTestId('team-summon')).toBeFocused()
  await page.getByTestId('team-summon').click()

  const directorySearch = directory.getByTestId('agent-directory-search')
  await expect(directorySearch).toBeFocused()
  await directorySearch.fill('rent roll analyst')
  await expect(directory.locator('[data-testid^="agent-directory-item-"]')).toHaveCount(1)
  await directory.getByTestId('agent-directory-item-rent-roll-analyst').click()

  const panelDialog = page.getByTestId('agent-panel-dialog')
  await expect(panelDialog).toBeVisible()
  await expect(panelDialog).toHaveAttribute('role', 'dialog')
  await expect(panelDialog).toHaveAttribute('aria-modal', 'true')
  await expect(panelDialog).toHaveAttribute('aria-label', 'Rent Roll Analyst agent')

  const rentConversation = page.getByTestId('agent-conversation')
  await expect(rentConversation).toHaveAttribute('data-agent-id', 'rent-roll-analyst')
  await expect(rentConversation).toHaveAttribute('data-thread-id', RENT_THREAD_ID)
  await expect(page.getByTestId('agent-thread-list')).toHaveValue(RENT_THREAD_ID)
  await expect(page.getByTestId(`agent-thread-${RENT_THREAD_ID}`)).toHaveCount(1)
  await expect(page.getByTestId(`agent-thread-${RENT_PRIOR_THREAD_ID}`)).toHaveCount(1)
  await expect(page.getByTestId('conversation-message-msg-rent-question')).toHaveAttribute('data-role', 'user')
  await expect(page.getByTestId('conversation-message-msg-rent-answer')).toHaveAttribute('data-role', 'assistant')

  const citation = page.getByTestId('conversation-citation-cit-rent-row-12')
  await expect(citation).toContainText('2026 Rent Roll.xlsx')
  await expect(citation).toContainText('Sheet Rent Roll · row 12 · column Current Rent')
  await citation.locator('summary').click()
  await expect(citation).toContainText('Approved evidence')
  await expect(citation).toContainText('Unit 2B has $1,825 in-place rent')

  const threadList = page.getByTestId('agent-thread-list')
  harness.detailDelays.set(RENT_PRIOR_THREAD_ID, 250)
  await threadList.selectOption(RENT_PRIOR_THREAD_ID)
  await threadList.selectOption(RENT_THREAD_ID)
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', RENT_THREAD_ID)
  await page.waitForTimeout(300)
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', RENT_THREAD_ID)
  await expect(page.getByTestId('conversation-timeline')).toContainText('11.8% below')
  await expect(page.getByTestId('conversation-timeline')).not.toContainText('prior occupancy check')
  harness.detailDelays.delete(RENT_PRIOR_THREAD_ID)
  await threadList.selectOption(RENT_PRIOR_THREAD_ID)
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', RENT_PRIOR_THREAD_ID)
  await expect(page.getByTestId('conversation-timeline')).toContainText('prior occupancy check used the same uploaded rent roll')
  await expect(page.getByTestId('conversation-timeline')).not.toContainText('11.8% below')
  await threadList.selectOption(RENT_THREAD_ID)
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', RENT_THREAD_ID)

  const psaDocumentOption = page.getByTestId(`conversation-document-option-${PSA_DOCUMENT_ID}`)
  await expect(page.getByTestId(`conversation-document-option-${RENT_DOCUMENT_ID}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(psaDocumentOption).toHaveAttribute('aria-pressed', 'false')
  await psaDocumentOption.click()
  await expect(psaDocumentOption).toHaveAttribute('aria-pressed', 'true')

  const composer = page.getByTestId('conversation-composer')
  const input = page.getByTestId('conversation-input')
  await expect(composer).toBeVisible()
  await expect(input).toBeEnabled()
  await expect(input).toHaveAccessibleName('Tell Rent Roll Analyst what to do next')
  await input.fill('Compare the delinquent units with the PSA representations.')
  await page.getByTestId('conversation-send').click()
  await expect.poll(() => harness.messagePosts.length).toBe(1)
  expect(harness.messagePosts[0].threadId).toBe(RENT_THREAD_ID)
  expect(harness.messagePosts[0].body.content).toBe('Compare the delinquent units with the PSA representations.')
  expect(harness.messagePosts[0].body.documentIds).toEqual([RENT_DOCUMENT_ID, PSA_DOCUMENT_ID])
  expect(harness.messagePosts[0].body.clientRequestId).toEqual(expect.any(String))
  await expect(page.getByText('Compare the delinquent units with the PSA representations.')).toBeVisible()

  await page.getByTestId('agent-panel-close').click()
  await page.getByTestId('team-summon').click()
  await page.getByTestId('agent-directory-search').fill('psa reviewer')
  await page.getByTestId('agent-directory-item-psa-reviewer').click()
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-agent-id', 'psa-reviewer')
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', PSA_THREAD_ID)
  await expect(page.getByTestId('conversation-timeline')).toContainText('inspection termination deadline')
  await expect(page.getByTestId('conversation-timeline')).not.toContainText('11.8% below')
  await expect(page.getByTestId('conversation-timeline')).not.toContainText('delinquent units with the PSA')
  await page.getByTestId('agent-panel-close').click()

  // The mock service survives a browser reload. Reopening from the real stage rail must reload the
  // same thread ID and the complete server-side history, including the just-posted follow-up.
  await page.reload()
  await openConversationWorkspace(page)
  await focusStage(page, 'diligence')
  const rentRailButton = page.getByTestId('team-agent-rent-roll-analyst')
  await rentRailButton.click()
  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', RENT_THREAD_ID)
  await expect(page.getByTestId('conversation-timeline')).toContainText('What does the rent roll say about loss to lease?')
  await expect(page.getByTestId('conversation-timeline')).toContainText('Compare the delinquent units with the PSA representations.')
  await expect(page.getByTestId('conversation-timeline')).toContainText('restored from authoritative conversation history')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('agent-panel')).toBeHidden()
})

test('persists a cancelled turn across reload and retries the original request', async ({ page }) => {
  const harness = buildConversationHarness('active-cancel')
  await installConversationRoutes(page, harness)
  await openConversationWorkspace(page)
  await focusStage(page, 'diligence')
  await page.getByTestId('team-agent-rent-roll-analyst').click()

  await expect(page.getByTestId('agent-conversation')).toHaveAttribute('data-thread-id', RENT_THREAD_ID)
  await expect(page.getByTestId('conversation-cancel')).toBeVisible()
  await expect(page.getByTestId('conversation-input')).toBeDisabled()
  await page.getByTestId('conversation-cancel').click()
  await expect.poll(() => harness.cancelledTurns).toEqual([
    { threadId: RENT_THREAD_ID, turnId: 'turn-cancel-1' },
  ])
  await expect(page.getByTestId('conversation-message-msg-cancelled-turn-cancel-1')).toHaveAttribute('data-status', 'cancelled')
  await expect(page.getByTestId('conversation-input')).toBeEnabled()

  await page.reload()
  await openConversationWorkspace(page)
  await focusStage(page, 'diligence')
  await page.getByTestId('team-agent-rent-roll-analyst').click()

  const cancelledMessage = page.getByTestId('conversation-message-msg-cancelled-turn-cancel-1')
  await expect(cancelledMessage).toHaveAttribute('data-role', 'assistant')
  await expect(cancelledMessage).toHaveAttribute('data-status', 'cancelled')
  await expect(cancelledMessage).toContainText('Turn cancelled by the operator')
  const retry = page.getByTestId('conversation-retry-turn-cancel-1')
  await expect(retry).toBeVisible()
  await expect(retry).toHaveAccessibleName('Retry')
  await retry.click()

  await expect.poll(() => harness.messagePosts.length).toBe(1)
  expect(harness.messagePosts[0]).toMatchObject({
    threadId: RENT_THREAD_ID,
    body: {
      content: 'Recheck the delinquent units before I proceed.',
      documentIds: [RENT_DOCUMENT_ID],
    },
  })
  await expect(page.getByText('Recheck the delinquent units before I proceed.')).toHaveCount(2)
})
