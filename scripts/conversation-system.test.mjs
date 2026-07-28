import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveUserDeal } from '../dashboard/server/deal-service.ts'
import {
  buildCodexConversationInvocation,
  createCodexConversationExecutor,
  ConversationExecutionError,
  ConversationManager,
  ConversationManagerError,
} from '../dashboard/server/conversation-manager.ts'
import {
  createConversationThread,
  getConversationAgent,
  getConversationSessionId,
  getConversationThread,
  getConversationTurn,
  listConversationAgents,
  listConversationThreads,
  patchConversationThread,
  persistConversationMessage,
  reconcileConversationThread,
  saveConversationTurn,
} from '../dashboard/server/conversation-service.ts'
import { extractSourceDocument, saveSourceDocument } from '../dashboard/server/workspace-service.ts'
import { MAX_CONVERSATION_DOCUMENTS } from '../dashboard/src/types/conversations.ts'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tempRoot = mkdtempSync(join(tmpdir(), 'cre-conversation-system-'))
const context = {
  dataRoot: join(tempRoot, 'data'),
  statusDir: join(tempRoot, 'data', 'status'),
  projectRoot,
}

function csvDocument(fileName, rows) {
  return {
    fileName,
    mime: 'text/csv',
    contentBase64: Buffer.from(rows, 'utf8').toString('base64'),
  }
}

function waitFor(predicate, label, timeoutMs = 5_000) {
  const startedAt = Date.now()
  return new Promise((resolvePromise, rejectPromise) => {
    const poll = () => {
      try {
        const result = predicate()
        if (result) {
          resolvePromise(result)
          return
        }
      } catch (error) {
        rejectPromise(error)
        return
      }
      if (Date.now() - startedAt >= timeoutMs) {
        rejectPromise(new Error(`Timed out waiting for ${label}`))
        return
      }
      setTimeout(poll, 10)
    }
    poll()
  })
}

function snapshotDealSourceFiles(dealId) {
  const dealRoot = join(context.dataRoot, 'deals', dealId)
  const snapshot = {}
  const visit = (directory, relativeDirectory = '') => {
    for (const name of readdirSync(directory).sort()) {
      if (!relativeDirectory && name === 'conversations') continue
      const filePath = join(directory, name)
      const relativePath = join(relativeDirectory, name)
      if (statSync(filePath).isDirectory()) {
        visit(filePath, relativePath)
        continue
      }
      snapshot[relativePath] = createHash('sha256').update(readFileSync(filePath)).digest('hex')
    }
  }
  visit(dealRoot)
  return snapshot
}

function unansweredResult(sessionId, answer = 'No source-backed answer was requested by this regression test.') {
  return {
    sessionId,
    response: {
      answer,
      citations: [],
      confidence: 'low',
      unanswered: true,
      followUpSuggestions: [],
    },
  }
}

const executions = []
const fakeExecutor = (request, onActivity) => {
  let resolveResult
  let rejectResult
  let settled = false
  const result = new Promise((resolvePromise, rejectPromise) => {
    resolveResult = resolvePromise
    rejectResult = rejectPromise
  })
  const execution = {
    request,
    resolve(value) {
      if (settled) return
      settled = true
      onActivity({ kind: 'answering', label: 'Preparing deterministic test response' })
      resolveResult(value)
    },
    reject(error) {
      if (settled) return
      settled = true
      onActivity({ kind: 'answering', label: 'Preparing deterministic failed response' })
      rejectResult(error)
    },
    cancel() {
      if (settled) return
      settled = true
      rejectResult(new ConversationExecutionError('Cancelled by deterministic test.', 'cancelled', true))
    },
  }
  executions.push(execution)
  return { result, cancel: execution.cancel }
}

let manager

try {
  const fakeCodexBin = join(tempRoot, 'fake-codex-bin')
  const fakeCodexHome = join(tempRoot, 'fake-codex-home')
  const invocationWorkingDirectory = mkdtempSync(join(tempRoot, 'isolated-invocation-'))
  mkdirSync(fakeCodexBin, { recursive: true })
  mkdirSync(fakeCodexHome, { recursive: true })
  const fakeCodexPath = join(fakeCodexBin, 'codex')
  const fakeCodexCapturePath = join(fakeCodexBin, 'capture.json')
  writeFileSync(fakeCodexPath, `#!/usr/bin/env node
const { dirname, join } = require('node:path')
const { writeFileSync } = require('node:fs')
let prompt = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { prompt += chunk })
process.stdin.on('end', () => {
  const args = process.argv.slice(2)
  const resumeIndex = args.indexOf('resume')
  const sessionId = resumeIndex >= 0 ? args[resumeIndex + 1] : 'isolated-contract-session'
  writeFileSync(join(dirname(process.argv[1]), 'capture.json'), JSON.stringify({
    args,
    cwd: process.cwd(),
    env: process.env,
    prompt,
  }, null, 2))
  const response = JSON.stringify({
    answer: 'No source-backed answer was requested by this invocation-contract test.',
    citations: [],
    confidence: 'low',
    unanswered: true,
    followUpSuggestions: [],
  })
  console.log(JSON.stringify({ type: 'thread.started', thread_id: sessionId }))
  console.log(JSON.stringify({ type: 'turn.started' }))
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: response } }))
  console.log(JSON.stringify({ type: 'turn.completed' }))
})
`, 'utf8')
  chmodSync(fakeCodexPath, 0o755)

  const previousEnvironment = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CODEX_HOME: process.env.CODEX_HOME,
    CONVERSATION_TEST_SECRET: process.env.CONVERSATION_TEST_SECRET,
  }
  try {
    process.env.PATH = [fakeCodexBin, dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter)
    process.env.HOME = join(tempRoot, 'must-not-be-inherited-home')
    process.env.CODEX_HOME = fakeCodexHome
    process.env.CONVERSATION_TEST_SECRET = 'must-not-reach-codex'
    const contractRequest = {
      projectRoot,
      workingDirectory: invocationWorkingDirectory,
      schemaPath: join(projectRoot, 'schemas', 'agent-conversation-response.schema.json'),
      prompt: 'Analyze only the embedded evidence. Do not invoke tools.',
      expectedSessionId: null,
      timeoutMs: 5_000,
    }
    const invocation = buildCodexConversationInvocation(contractRequest)
    assert.equal(invocation.command, 'codex')
    assert.equal(invocation.options.shell, false, 'the real executor never crosses a shell command boundary')
    assert.equal(invocation.options.cwd, invocationWorkingDirectory)
    assert.equal(invocation.options.env.HOME, invocationWorkingDirectory, 'HOME is isolated per execution')
    assert.equal(invocation.options.env.CODEX_HOME, fakeCodexHome, 'only the persistent auth/session store is retained')
    assert.equal(invocation.options.env.CONVERSATION_TEST_SECRET, undefined, 'unapproved environment values are stripped')

    const executor = createCodexConversationExecutor()
    const firstContractResult = await executor(contractRequest, () => undefined).result
    assert.equal(firstContractResult.sessionId, 'isolated-contract-session')
    const firstCapture = JSON.parse(readFileSync(fakeCodexCapturePath, 'utf8'))
    const disabledFeatures = firstCapture.args.flatMap((arg, index, args) => arg === '--disable' ? [args[index + 1]] : [])
    for (const feature of [
      'shell_tool',
      'unified_exec',
      'apps',
      'plugins',
      'browser_use',
      'computer_use',
      'standalone_web_search',
      'multi_agent',
      'hooks',
    ]) {
      assert.equal(disabledFeatures.includes(feature), true, `${feature} is disabled for document conversations`)
    }
    assert.equal(firstCapture.args.includes('--search'), false, 'native web search is never enabled')
    assert.equal(firstCapture.args.includes('--enable'), false, 'the isolated invocation enables no optional capability')
    assert.equal(firstCapture.args[firstCapture.args.indexOf('--cd') + 1], invocationWorkingDirectory)
    assert.equal(firstCapture.args[firstCapture.args.indexOf('--sandbox') + 1], 'read-only')
    assert.equal(firstCapture.args.includes('--skip-git-repo-check'), true)
    assert.equal(firstCapture.args.includes('--ignore-user-config'), true)
    assert.equal(firstCapture.args.includes('--ignore-rules'), true)
    assert.equal(firstCapture.args.includes('approval_policy="never"'), true)
    assert.equal(firstCapture.args.includes('sandbox_mode="read-only"'), true)
    assert.equal(firstCapture.args.includes('shell_environment_policy.inherit="none"'), true)
    assert.equal(firstCapture.cwd, realpathSync(invocationWorkingDirectory))
    assert.equal(firstCapture.env.HOME, invocationWorkingDirectory)
    assert.equal(firstCapture.env.CODEX_HOME, fakeCodexHome)
    assert.equal(firstCapture.env.CONVERSATION_TEST_SECRET, undefined)
    assert.equal(firstCapture.prompt, contractRequest.prompt, 'the prompt is delivered over stdin')

    const resumedContractResult = await executor({
      ...contractRequest,
      expectedSessionId: firstContractResult.sessionId,
      prompt: 'Continue the isolated evidence conversation.',
    }, () => undefined).result
    assert.equal(resumedContractResult.sessionId, firstContractResult.sessionId, 'capability isolation preserves explicit session resume')
    const resumedCapture = JSON.parse(readFileSync(fakeCodexCapturePath, 'utf8'))
    const resumeIndex = resumedCapture.args.indexOf('resume')
    assert.equal(resumedCapture.args[resumeIndex + 1], firstContractResult.sessionId)
    assert.equal(resumedCapture.args[resumeIndex + 2], '-')
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }

  const registryAgents = listConversationAgents(context)
  assert.equal(registryAgents.length, 31, 'all 31 registry agents are available to conversations')
  assert.equal(new Set(registryAgents.map((agent) => agent.agentId)).size, 31, 'registry agent IDs are unique')
  for (const descriptor of registryAgents) {
    assert.deepEqual(
      getConversationAgent(context, descriptor.agentId),
      descriptor,
      `${descriptor.agentId} resolves through the conversation registry`,
    )
    assert.equal(
      existsSync(join(projectRoot, descriptor.promptPath)),
      true,
      `${descriptor.agentId} resolves to an existing role guide`,
    )
  }

  const baseDeal = JSON.parse(readFileSync(join(projectRoot, 'config', 'deal.json'), 'utf8'))
  const firstDealId = 'conversation-test-alpha'
  const secondDealId = 'conversation-test-beta'
  saveUserDeal(context, {
    deal: { ...baseDeal, dealId: firstDealId, dealName: 'Conversation Test Alpha' },
    mode: 'draft',
  })
  saveUserDeal(context, {
    deal: { ...baseDeal, dealId: secondDealId, dealName: 'Conversation Test Beta' },
    mode: 'draft',
  })

  const firstDocument = saveSourceDocument(context, firstDealId, csvDocument(
    'alpha-rent-roll.csv',
    'Unit,Status,Monthly Rent\n101,Occupied,1200\n102,Vacant,1250\n',
  )).document
  const occupancyDocument = saveSourceDocument(context, firstDealId, csvDocument(
    'alpha-occupancy-rent-roll.csv',
    [
      'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status',
      '101,1BR/1BA,720,1300,1200,Occupied',
      '102,1BR/1BA,720,1300,0,Vacant',
      '',
    ].join('\n'),
  )).document
  const secondDocument = saveSourceDocument(context, secondDealId, csvDocument(
    'beta-psa.csv',
    'Section,Term\nDeposit,50000\nClosing,2026-10-01\n',
  )).document
  extractSourceDocument(context, firstDealId, firstDocument.documentId)
  extractSourceDocument(context, firstDealId, occupancyDocument.documentId)
  extractSourceDocument(context, secondDealId, secondDocument.documentId)
  const secondDealManifestPath = join(context.dataRoot, 'deals', secondDealId, 'document-manifest.json')
  const secondDealManifest = JSON.parse(readFileSync(secondDealManifestPath, 'utf8'))
  const approvedSecondDocument = secondDealManifest.documents.find(
    (document) => document.documentId === secondDocument.documentId,
  )
  assert.ok(approvedSecondDocument, 'the approved-evidence regression document exists in the manifest')
  approvedSecondDocument.status = 'approved'
  writeFileSync(secondDealManifestPath, `${JSON.stringify(secondDealManifest, null, 2)}\n`, 'utf8')

  assert.throws(
    () => createConversationThread(context, firstDealId, {
      agentId: 'not-a-registry-agent',
      documentIds: [firstDocument.documentId],
    }),
    /Unknown agent/,
    'an unregistered agent cannot own a conversation',
  )
  assert.throws(
    () => createConversationThread(context, firstDealId, {
      agentId: 'rent-roll-analyst',
      documentIds: ['unknown-document'],
    }),
    /Document not found/,
    'a thread cannot attach an unknown document',
  )

  const firstThread = createConversationThread(context, firstDealId, {
    agentId: 'rent-roll-analyst',
    title: 'Alpha rent roll review',
    documentIds: [firstDocument.documentId],
  })
  const secondThread = createConversationThread(context, secondDealId, {
    agentId: 'psa-reviewer',
    title: 'Beta PSA review',
    documentIds: [secondDocument.documentId],
  })
  const firstDealSourcesBeforeTurns = snapshotDealSourceFiles(firstDealId)
  const secondDealSourcesBeforeTurns = snapshotDealSourceFiles(secondDealId)

  assert.deepEqual(
    listConversationThreads(context, firstDealId).threads.map((thread) => thread.threadId),
    [firstThread.thread.threadId],
    'the first deal lists only its own conversation',
  )
  assert.deepEqual(
    listConversationThreads(context, secondDealId).threads.map((thread) => thread.threadId),
    [secondThread.thread.threadId],
    'the second deal lists only its own conversation',
  )

  const reloadedContext = { ...context }
  assert.deepEqual(
    getConversationThread(reloadedContext, firstDealId, firstThread.thread.threadId),
    firstThread,
    'the first thread reloads from persisted state',
  )
  assert.deepEqual(
    getConversationThread(reloadedContext, secondDealId, secondThread.thread.threadId),
    secondThread,
    'the second thread reloads independently from persisted state',
  )
  assert.throws(
    () => getConversationThread(context, secondDealId, firstThread.thread.threadId),
    /Conversation not found/,
    'a thread ID cannot cross deal boundaries',
  )
  assert.throws(
    () => getConversationThread(context, firstDealId, secondThread.thread.threadId),
    /Conversation not found/,
    'deal isolation is enforced in both directions',
  )

  const appendCrashThread = createConversationThread(context, firstDealId, {
    agentId: 'market-study',
    title: 'Append crash metadata repair test',
    documentIds: [firstDocument.documentId],
  })
  const appendCrashRoot = join(
    context.dataRoot,
    'deals',
    firstDealId,
    'conversations',
    appendCrashThread.thread.threadId,
  )
  const appendCrashMetadataPath = join(appendCrashRoot, 'conversation.json')
  const appendCrashMetadata = JSON.parse(readFileSync(appendCrashMetadataPath, 'utf8'))
  const appendCrashCreatedAt = new Date().toISOString()
  appendFileSync(join(appendCrashRoot, 'messages.ndjson'), `${JSON.stringify({
    version: 1,
    messageId: 'append-crash-user-message',
    threadId: appendCrashThread.thread.threadId,
    dealId: firstDealId,
    agentId: appendCrashThread.thread.agentId,
    turnId: 'append-crash-turn',
    sequence: appendCrashMetadata.nextMessageSequence,
    role: 'user',
    content: 'Recover after the message append succeeded but its metadata write did not.',
    status: 'complete',
    attachments: [],
    citations: [],
    createdAt: appendCrashCreatedAt,
    completedAt: appendCrashCreatedAt,
    clientRequestId: 'append-crash-client-request',
  })}\n`, 'utf8')
  reconcileConversationThread(context, firstDealId, appendCrashThread.thread.threadId)
  const appendCrashRecovered = getConversationThread(context, firstDealId, appendCrashThread.thread.threadId)
  const appendCrashRepairedMetadata = JSON.parse(readFileSync(appendCrashMetadataPath, 'utf8'))
  assert.equal(appendCrashRecovered.thread.messageCount, 2, 'recovery recounts both durable messages')
  assert.deepEqual(
    appendCrashRecovered.messages.map((message) => message.sequence),
    [1, 2],
    'the recovery assistant receives a sequence after the orphaned user message',
  )
  assert.equal(appendCrashRepairedMetadata.nextMessageSequence, 3, 'recovery advances the durable sequence cursor')

  const orphanThread = createConversationThread(context, firstDealId, {
    agentId: 'market-study',
    title: 'Crash reconciliation test',
    documentIds: [firstDocument.documentId],
  })
  persistConversationMessage(context, {
    version: 1,
    messageId: 'orphan-user-message',
    threadId: orphanThread.thread.threadId,
    dealId: firstDealId,
    agentId: orphanThread.thread.agentId,
    turnId: 'orphan-turn',
    role: 'user',
    content: 'Reconcile this accepted message after an interrupted multi-file write.',
    status: 'complete',
    attachments: [],
    citations: [],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    clientRequestId: 'orphan-client-request',
  })
  const recoveredOrphan = reconcileConversationThread(context, firstDealId, orphanThread.thread.threadId)
  assert.equal(recoveredOrphan?.status, 'failed', 'startup reconciliation marks an orphaned acceptance for retry')
  assert.equal(
    getConversationTurn(context, firstDealId, orphanThread.thread.threadId, 'orphan-turn').status,
    'interrupted',
    'startup reconciliation reconstructs the missing turn record',
  )
  assert.equal(
    getConversationTurn(context, firstDealId, orphanThread.thread.threadId, 'orphan-turn').error?.retryable,
    true,
    'an interrupted acceptance remains explicitly retryable',
  )
  assert.equal(
    getConversationThread(context, firstDealId, orphanThread.thread.threadId).messages.at(-1)?.status,
    'failed',
    'startup reconciliation creates a visible retryable assistant failure',
  )

  const partialCompletionThread = createConversationThread(context, firstDealId, {
    agentId: 'opex-analyst',
    title: 'Partial completion crash test',
    documentIds: [firstDocument.documentId],
  })
  const partialRequest = persistConversationMessage(context, {
    version: 1,
    messageId: 'partial-completion-user',
    threadId: partialCompletionThread.thread.threadId,
    dealId: firstDealId,
    agentId: partialCompletionThread.thread.agentId,
    turnId: 'partial-completion-turn',
    role: 'user',
    content: 'Simulate a crash after the assistant append but before terminal turn persistence.',
    status: 'complete',
    attachments: [],
    citations: [],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    clientRequestId: 'partial-completion-request',
  })
  saveConversationTurn(context, {
    version: 1,
    turnId: partialRequest.turnId,
    threadId: partialRequest.threadId,
    dealId: partialRequest.dealId,
    agentId: partialRequest.agentId,
    requestMessageId: partialRequest.messageId,
    status: 'responding',
    createdAt: partialRequest.createdAt,
    startedAt: partialRequest.createdAt,
  })
  patchConversationThread(context, firstDealId, partialCompletionThread.thread.threadId, {
    status: 'active',
    activeTurnId: partialRequest.turnId,
    codexSessionId: 'ambiguous-partial-session',
  })
  const uncommittedAssistant = persistConversationMessage(context, {
    version: 1,
    messageId: 'partial-completion-assistant',
    threadId: partialRequest.threadId,
    dealId: partialRequest.dealId,
    agentId: partialRequest.agentId,
    turnId: partialRequest.turnId,
    role: 'assistant',
    content: 'This answer must not remain complete across the simulated crash window.',
    status: 'complete',
    attachments: [],
    citations: [],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    inReplyTo: partialRequest.messageId,
  })
  reconcileConversationThread(context, firstDealId, partialCompletionThread.thread.threadId)
  const reconciledPartial = getConversationThread(context, firstDealId, partialCompletionThread.thread.threadId)
  const reconciledPartialTurn = getConversationTurn(
    context,
    firstDealId,
    partialCompletionThread.thread.threadId,
    partialRequest.turnId,
  )
  assert.equal(reconciledPartialTurn.status, 'interrupted')
  assert.equal(reconciledPartialTurn.error?.retryable, true)
  assert.equal(reconciledPartialTurn.responseMessageId, uncommittedAssistant.messageId)
  assert.equal(reconciledPartial.messages.at(-1)?.status, 'failed')
  assert.match(reconciledPartial.messages.at(-1)?.content ?? '', /Retry the turn/i)
  assert.equal(
    getConversationSessionId(context, firstDealId, partialCompletionThread.thread.threadId),
    null,
    'recovery discards remote session state that advanced without a durable local terminal state',
  )

  const recoveryExecutionStart = executions.length
  const recoveryManager = new ConversationManager({
    context,
    projectRoot,
    onEvent: () => undefined,
    executor: fakeExecutor,
    maxConcurrent: 1,
    turnTimeoutMs: 30_000,
  })
  try {
    const replayedInterruptedAcceptance = recoveryManager.enqueue(firstDealId, orphanThread.thread.threadId, {
      content: 'This replay must return the durable interrupted acceptance.',
      clientRequestId: 'orphan-client-request',
    })
    assert.equal(replayedInterruptedAcceptance.turn.status, 'interrupted')
    assert.equal(executions.length, recoveryExecutionStart, 'an idempotent replay never reruns an interrupted acceptance')

    const retryAccepted = recoveryManager.enqueue(firstDealId, orphanThread.thread.threadId, {
      content: 'Retry the recovered turn with a new request identity.',
      clientRequestId: 'orphan-client-request-retry',
    })
    assert.equal(executions.length, recoveryExecutionStart + 1, 'a new request can retry after crash recovery')
    recoveryManager.cancel(firstDealId, orphanThread.thread.threadId, retryAccepted.turn.turnId)
    await waitFor(
      () => getConversationThread(context, firstDealId, orphanThread.thread.threadId).thread.activeTurnId === null,
      'the recovered-turn retry cancellation',
    )
  } finally {
    await recoveryManager.shutdown()
    executions.splice(recoveryExecutionStart)
  }

  manager = new ConversationManager({
    context,
    projectRoot,
    onEvent: () => undefined,
    executor: fakeExecutor,
    maxConcurrent: 1,
    maxQueued: 1,
    turnTimeoutMs: 30_000,
  })

  const firstAccepted = manager.enqueue(firstDealId, firstThread.thread.threadId, {
    content: 'What does the selected rent roll show?',
    clientRequestId: 'alpha-request-1',
  })
  assert.equal(executions.length, 1, 'the injected executor receives the first turn')
  assert.equal(executions[0].request.expectedSessionId, null, 'the first turn starts a new session')
  assert.match(executions[0].request.prompt, /alpha-rent-roll\.csv/)
  assert.equal(existsSync(executions[0].request.workingDirectory), true, 'the isolated turn root exists only while the executor is active')
  assert.equal(
    resolve(executions[0].request.workingDirectory).startsWith(`${resolve(projectRoot)}${sep}`),
    false,
    'the executor working root is outside the repository',
  )
  assert.equal(
    executions[0].request.prompt.includes(firstDocument.path),
    false,
    'the selected evidence prompt does not disclose the source document filesystem path',
  )

  const replayed = manager.enqueue(firstDealId, firstThread.thread.threadId, {
    content: 'This replay body must not create a second turn.',
    clientRequestId: 'alpha-request-1',
  })
  assert.equal(replayed.message.messageId, firstAccepted.message.messageId, 'a replay returns the original message')
  assert.equal(replayed.turn.turnId, firstAccepted.turn.turnId, 'a replay returns the original turn')
  assert.equal(executions.length, 1, 'a replay does not invoke the executor twice')
  assert.equal(
    getConversationThread(context, firstDealId, firstThread.thread.threadId).messages
      .filter((message) => message.clientRequestId === 'alpha-request-1').length,
    1,
    'retrying after a lost response persists only one user message for the client request ID',
  )

  assert.throws(
    () => manager.enqueue(firstDealId, firstThread.thread.threadId, {
      content: 'Start another turn before the first one completes.',
      clientRequestId: 'alpha-request-conflict',
    }),
    (error) => error instanceof ConversationManagerError
      && error.statusCode === 409
      && error.code === 'TURN_ACTIVE',
    'only one turn can be active in a thread',
  )
  assert.throws(
    () => manager.enqueue(secondDealId, firstThread.thread.threadId, {
      content: 'Try to use an Alpha thread from the Beta deal.',
      clientRequestId: 'cross-deal-request',
    }),
    /Conversation not found/,
    'message routing also rejects a cross-deal thread ID',
  )

  executions[0].resolve({
    sessionId: 'stable-test-session',
    response: {
      answer: 'The selected rent roll has two units, including one occupied unit.',
      citations: [{
        documentId: firstDocument.documentId,
        location: 'Rows 2-3',
        excerpt: '101,Occupied,1200',
      }],
      confidence: 'high',
      unanswered: false,
      followUpSuggestions: ['Review the vacant unit.'],
    },
  })

  const firstCompleted = await waitFor(() => {
    const detail = getConversationThread(context, firstDealId, firstThread.thread.threadId)
    return detail.thread.status === 'idle' && detail.messages.length === 2 ? detail : null
  }, 'the first cited response')
  assert.equal(firstCompleted.messages[1].role, 'assistant')
  assert.equal(firstCompleted.messages[1].citations.length, 1)
  assert.equal(firstCompleted.messages[1].citations[0].documentId, firstDocument.documentId)
  assert.match(firstCompleted.messages[1].citations[0].location, /row 2/i)
  assert.notEqual(
    firstCompleted.messages[1].citations[0].excerpt,
    '101,Occupied,1200',
    'the model-provided excerpt is never returned directly',
  )
  assert.match(
    firstCompleted.messages[1].citations[0].excerpt,
    /Unit:\s*101.*Status:\s*Occupied.*Monthly Rent:\s*1200/i,
    'the returned excerpt is reconstructed from the server-owned row evidence',
  )
  assert.equal(firstCompleted.messages[1].unanswered, false)
  assert.equal(existsSync(executions[0].request.workingDirectory), false, 'the isolated turn root is removed after completion')
  assert.equal(
    getConversationSessionId(context, firstDealId, firstThread.thread.threadId),
    'stable-test-session',
    'the executor session is persisted with the thread',
  )
  assert.equal(
    getConversationThread(context, secondDealId, secondThread.thread.threadId).messages.length,
    0,
    'the other persisted thread remains isolated from Alpha messages',
  )

  manager.enqueue(firstDealId, firstThread.thread.threadId, {
    content: 'What is the occupied unit rent?',
    clientRequestId: 'alpha-request-2',
  })
  assert.equal(executions.length, 2)
  assert.equal(
    executions[1].request.expectedSessionId,
    'stable-test-session',
    'a follow-up resumes the persisted session',
  )
  executions[1].resolve({
    sessionId: 'stable-test-session',
    response: {
      answer: 'The occupied unit shows monthly rent of $1,200.',
      citations: [{
        documentId: firstDocument.documentId,
        location: 'Row 2, Monthly Rent column',
        excerpt: '101,Occupied,1200',
      }],
      confidence: 'high',
      unanswered: false,
      followUpSuggestions: [],
    },
  })
  await waitFor(() => {
    const detail = getConversationThread(context, firstDealId, firstThread.thread.threadId)
    return detail.thread.status === 'idle' && detail.messages.length === 4 ? detail : null
  }, 'the session-backed follow-up')
  assert.equal(
    getConversationSessionId(context, firstDealId, firstThread.thread.threadId),
    'stable-test-session',
    'the follow-up preserves the stable session ID',
  )

  const occupancyThread = createConversationThread(context, firstDealId, {
    agentId: 'rent-roll-analyst',
    title: 'Computed occupancy citation regression',
    documentIds: [occupancyDocument.documentId],
  })
  manager.enqueue(firstDealId, occupancyThread.thread.threadId, {
    content: 'Summarize current occupancy from the selected rent roll and cite the source.',
    clientRequestId: 'alpha-request-computed-occupancy',
  })
  assert.equal(executions.length, 3)
  const occupancyMetricsExcerpt = 'rows: 2; occupied: 1; footerRowsExcluded: 0'
  assert.match(
    executions[2].request.prompt,
    /copy one complete citationCandidates\[\]\.excerpt value exactly/i,
    'the prompt tells the specialist to copy a server-issued citation candidate',
  )
  assert.equal(
    executions[2].request.prompt.includes(occupancyMetricsExcerpt),
    true,
    'the selected rent roll exposes its exact extraction-metrics citation candidate',
  )
  executions[2].resolve({
    sessionId: 'stable-test-session',
    response: {
      answer: 'Current physical occupancy is 50%: 1 of 2 units is occupied and 1 is vacant.',
      citations: [{
        documentId: occupancyDocument.documentId,
        location: 'extraction metrics',
        excerpt: occupancyMetricsExcerpt,
      }],
      confidence: 'high',
      unanswered: false,
      followUpSuggestions: [],
    },
  })
  const occupancyCompleted = await waitFor(() => {
    const detail = getConversationThread(context, firstDealId, occupancyThread.thread.threadId)
    return detail.thread.status === 'idle' && detail.messages.length === 2 ? detail : null
  }, 'the computed occupancy response')
  const occupancyAnswer = occupancyCompleted.messages.at(-1)
  assert.equal(occupancyAnswer.content, 'Current physical occupancy is 50%: 1 of 2 units is occupied and 1 is vacant.')
  assert.equal(occupancyAnswer.citations.length, 1)
  assert.equal(occupancyAnswer.citations[0].location, 'extraction metrics')
  assert.equal(occupancyAnswer.citations[0].excerpt, occupancyMetricsExcerpt)
  assert.equal(occupancyAnswer.unanswered, false, 'a computed answer remains answered when its exact metrics candidate verifies')

  manager.enqueue(firstDealId, firstThread.thread.threadId, {
    content: 'Answer using the model citation allow-list.',
    clientRequestId: 'alpha-request-forged-citation',
  })
  assert.equal(executions.length, 4)
  executions[3].resolve({
    sessionId: 'stable-test-session',
    response: {
      answer: 'This claim is backed only by a forged document ID.',
      citations: [{
        documentId: secondDocument.documentId,
        location: 'Imaginary page 99',
        excerpt: 'Forged evidence',
      }],
      confidence: 'high',
      unanswered: false,
      followUpSuggestions: [],
    },
  })
  const forgedCompleted = await waitFor(() => {
    const detail = getConversationThread(context, firstDealId, firstThread.thread.threadId)
    return detail.thread.status === 'idle' && detail.messages.length === 6 ? detail : null
  }, 'the forged-citation response')
  const forgedAnswer = forgedCompleted.messages.at(-1)
  assert.equal(forgedAnswer.citations.length, 0, 'a citation outside the selected deal evidence is dropped')
  assert.equal(forgedAnswer.unanswered, true, 'an answer without a valid citation is marked unanswered')
  assert.equal(forgedAnswer.confidence, 'low')
  assert.equal(
    forgedAnswer.content,
    'I could not verify a source-backed answer from the selected deal documents.',
    'the unsupported model claim is not persisted as the operator-facing answer',
  )

  manager.enqueue(firstDealId, firstThread.thread.threadId, {
    content: 'Reject a fabricated excerpt even when the document ID is valid.',
    clientRequestId: 'alpha-request-fabricated-excerpt',
  })
  const fabricatedExecution = executions.at(-1)
  fabricatedExecution.resolve({
    sessionId: 'stable-test-session',
    response: {
      answer: 'This answer cites text that is not in the selected document.',
      citations: [
        {
          documentId: firstDocument.documentId,
          location: 'Page 999',
          excerpt: '101 million in imaginary liabilities',
        },
        {
          documentId: firstDocument.documentId,
          location: 'Page 998',
          excerpt: '101 occupied 1200 million in imaginary liabilities',
        },
        {
          documentId: firstDocument.documentId,
          location: 'Rows 2-3, Status column',
          excerpt: 'Unit 101 — Occupied; Unit 102 — Vacant',
        },
      ],
      confidence: 'high',
      unanswered: false,
      followUpSuggestions: [],
    },
  })
  const fabricatedCompleted = await waitFor(() => {
    const detail = getConversationThread(context, firstDealId, firstThread.thread.threadId)
    return detail.thread.status === 'idle' && detail.messages.length === 8 ? detail : null
  }, 'the fabricated-excerpt response')
  assert.equal(
    fabricatedCompleted.messages.at(-1).citations.length,
    0,
    'forged text and a synthesized multi-row excerpt remain outside the exact candidate allow-list',
  )
  assert.equal(fabricatedCompleted.messages.at(-1).unanswered, true)
  assert.equal(
    fabricatedCompleted.messages.at(-1).content,
    'I could not verify a source-backed answer from the selected deal documents.',
  )

  const cancellationAccepted = manager.enqueue(firstDealId, firstThread.thread.threadId, {
    content: 'Keep this turn pending so cancellation can be verified.',
    clientRequestId: 'alpha-request-cancel',
  })
  assert.equal(executions.length, 6)
  assert.throws(
    () => manager.cancel(secondDealId, firstThread.thread.threadId, cancellationAccepted.turn.turnId),
    /Conversation not found/,
    'a wrong-deal cancellation cannot reach another deal\'s queued or active turn',
  )
  manager.cancel(firstDealId, firstThread.thread.threadId, cancellationAccepted.turn.turnId)

  const cancelledDetail = await waitFor(() => {
    const detail = getConversationThread(context, firstDealId, firstThread.thread.threadId)
    const turn = getConversationTurn(
      context,
      firstDealId,
      firstThread.thread.threadId,
      cancellationAccepted.turn.turnId,
    )
    return turn.status === 'cancelled' && detail.thread.activeTurnId === null ? { detail, turn } : null
  }, 'durable cancellation state')
  assert.equal(cancelledDetail.detail.thread.status, 'idle')
  assert.equal(cancelledDetail.turn.status, 'cancelled')
  assert.equal(cancelledDetail.detail.messages.at(-1).status, 'cancelled')

  const cancellationReload = getConversationThread(
    { ...context },
    firstDealId,
    firstThread.thread.threadId,
  )
  assert.equal(cancellationReload.thread.activeTurnId, null, 'reload does not resurrect the cancelled turn')
  assert.equal(cancellationReload.messages.at(-1).status, 'cancelled', 'cancelled terminal state survives reload')
  assert.equal(
    getConversationSessionId(context, firstDealId, firstThread.thread.threadId),
    null,
    'cancellation discards remote session state that may include the omitted turn',
  )

  const queuedThread = createConversationThread(context, firstDealId, {
    agentId: 'physical-inspection',
    documentIds: [firstDocument.documentId],
  })
  const overflowThread = createConversationThread(context, firstDealId, {
    agentId: 'tenant-credit',
    documentIds: [firstDocument.documentId],
  })
  const activeBeforeQueueTest = executions.length
  const queueActiveAccepted = manager.enqueue(secondDealId, secondThread.thread.threadId, {
    content: 'Hold the active worker while queue bounds are tested.',
    clientRequestId: 'queue-active-request',
  })
  assert.equal(
    queueActiveAccepted.message.attachments[0]?.evidenceStatus,
    'approved',
    'approved source documents remain approved in conversation attachments',
  )
  await waitFor(() => executions.length === activeBeforeQueueTest + 1, 'the queue-bound active turn')
  manager.enqueue(firstDealId, queuedThread.thread.threadId, {
    content: 'Wait in the single allowed queue slot.',
    clientRequestId: 'queue-pending-request',
  })
  assert.throws(
    () => manager.enqueue(firstDealId, overflowThread.thread.threadId, {
      content: 'This request must not exceed the queue bound.',
      clientRequestId: 'queue-overflow-request',
    }),
    (error) => error instanceof ConversationManagerError
      && error.statusCode === 503
      && error.code === 'QUEUE_FULL',
    'the pending queue has an explicit hard cap',
  )

  await manager.shutdown()
  manager = undefined
  const shutdownActive = getConversationThread(context, secondDealId, secondThread.thread.threadId)
  const shutdownQueued = getConversationThread(context, firstDealId, queuedThread.thread.threadId)
  assert.equal(shutdownActive.thread.activeTurnId, null, 'shutdown terminalizes the active turn')
  assert.equal(shutdownActive.messages.at(-1)?.status, 'cancelled')
  assert.equal(shutdownQueued.thread.activeTurnId, null, 'shutdown terminalizes the queued turn')
  assert.equal(shutdownQueued.messages.at(-1)?.status, 'cancelled')

  const regressionExecutionStart = executions.length
  const regressionManager = new ConversationManager({
    context,
    projectRoot,
    onEvent: () => undefined,
    executor: fakeExecutor,
    maxConcurrent: 1,
    maxQueued: 4,
    turnTimeoutMs: 30_000,
  })
  try {
    const normalizedThread = createConversationThread(context, firstDealId, {
      agentId: 'tenant-credit',
      documentIds: [firstDocument.documentId],
    })
    const normalizedAccepted = regressionManager.enqueue(firstDealId, normalizedThread.thread.threadId, {
      content: 'Normalize duplicate document IDs before accepting this request.',
      documentIds: Array(MAX_CONVERSATION_DOCUMENTS + 1).fill(firstDocument.documentId),
      clientRequestId: 'normalized-document-request',
    })
    assert.deepEqual(
      normalizedAccepted.thread.documentIds,
      [firstDocument.documentId],
      'duplicate document IDs are canonicalized before durable acceptance',
    )
    assert.equal(
      getConversationThread(context, firstDealId, normalizedThread.thread.threadId).messages.length,
      1,
      'the canonicalized request creates exactly one durable user message',
    )
    regressionManager.cancel(firstDealId, normalizedThread.thread.threadId, normalizedAccepted.turn.turnId)
    await waitFor(
      () => getConversationThread(context, firstDealId, normalizedThread.thread.threadId).thread.activeTurnId === null,
      'canonicalized request cancellation',
    )

    const scopeThread = createConversationThread(context, firstDealId, {
      agentId: 'rent-roll-analyst',
      documentIds: [firstDocument.documentId],
    })
    regressionManager.enqueue(firstDealId, scopeThread.thread.threadId, {
      content: 'Start a retained session with the first document.',
      documentIds: [firstDocument.documentId],
      clientRequestId: 'scope-session-first',
    })
    let scopeExecution = executions.at(-1)
    assert.equal(scopeExecution.request.expectedSessionId, null)
    scopeExecution.resolve(unansweredResult('scope-session'))
    await waitFor(
      () => getConversationThread(context, firstDealId, scopeThread.thread.threadId).messages.length === 2,
      'initial scope session completion',
    )

    regressionManager.enqueue(firstDealId, scopeThread.thread.threadId, {
      content: 'Resume with the exact same evidence scope.',
      documentIds: [firstDocument.documentId],
      clientRequestId: 'scope-session-same-evidence',
    })
    scopeExecution = executions.at(-1)
    assert.equal(scopeExecution.request.expectedSessionId, 'scope-session', 'unchanged evidence resumes the retained session')
    scopeExecution.resolve(unansweredResult('scope-session'))
    await waitFor(
      () => getConversationThread(context, firstDealId, scopeThread.thread.threadId).messages.length === 4,
      'same-scope session completion',
    )

    regressionManager.enqueue(firstDealId, scopeThread.thread.threadId, {
      content: 'Switch to a different selected document.',
      documentIds: [occupancyDocument.documentId],
      clientRequestId: 'scope-session-different-document',
    })
    scopeExecution = executions.at(-1)
    assert.equal(scopeExecution.request.expectedSessionId, null, 'changing document scope starts a clean session')
    scopeExecution.resolve(unansweredResult('scope-session-occupancy'))
    await waitFor(
      () => getConversationThread(context, firstDealId, scopeThread.thread.threadId).messages.length === 6,
      'changed-scope session completion',
    )

    const manifestPath = join(context.dataRoot, 'deals', firstDealId, 'document-manifest.json')
    const originalManifest = readFileSync(manifestPath, 'utf8')
    const changedManifest = JSON.parse(originalManifest)
    const changedDocument = changedManifest.documents.find((document) => document.documentId === occupancyDocument.documentId)
    assert.ok(changedDocument, 'the fingerprint regression document is present in the manifest')
    changedDocument.sourceHash = `${changedDocument.sourceHash}-changed`
    let changedHashExecution
    writeFileSync(manifestPath, JSON.stringify(changedManifest, null, 2), 'utf8')
    try {
      regressionManager.enqueue(firstDealId, scopeThread.thread.threadId, {
        content: 'Use the same document ID after its evidence hash changes.',
        documentIds: [occupancyDocument.documentId],
        clientRequestId: 'scope-session-changed-hash',
      })
      changedHashExecution = executions.at(-1)
      assert.equal(changedHashExecution.request.expectedSessionId, null, 'changed evidence hashes start a clean session')
    } finally {
      writeFileSync(manifestPath, originalManifest, 'utf8')
    }
    changedHashExecution.resolve(unansweredResult('scope-session-rehashed'))
    await waitFor(
      () => getConversationThread(context, firstDealId, scopeThread.thread.threadId).messages.length === 8,
      'changed-hash session completion',
    )

    const failureThread = createConversationThread(context, firstDealId, {
      agentId: 'opex-analyst',
      documentIds: [firstDocument.documentId],
    })
    regressionManager.enqueue(firstDealId, failureThread.thread.threadId, {
      content: 'Establish a session before a post-start failure.',
      clientRequestId: 'failed-session-first',
    })
    let failureExecution = executions.at(-1)
    failureExecution.resolve(unansweredResult('failed-turn-session'))
    await waitFor(
      () => getConversationThread(context, firstDealId, failureThread.thread.threadId).messages.length === 2,
      'pre-failure session completion',
    )
    regressionManager.enqueue(firstDealId, failureThread.thread.threadId, {
      content: 'Fail after this retained turn starts.',
      clientRequestId: 'failed-session-second',
    })
    failureExecution = executions.at(-1)
    assert.equal(failureExecution.request.expectedSessionId, 'failed-turn-session')
    failureExecution.reject(new ConversationExecutionError('Deterministic post-start failure.', 'invalid_response', true, false))
    await waitFor(() => {
      const detail = getConversationThread(context, firstDealId, failureThread.thread.threadId)
      return detail.thread.status === 'failed' && detail.thread.activeTurnId === null
    }, 'post-start failure terminalization')
    assert.equal(
      getConversationSessionId(context, firstDealId, failureThread.thread.threadId),
      null,
      'a failed post-start turn discards ambiguous retained session state',
    )
  } finally {
    await regressionManager.shutdown()
    executions.splice(regressionExecutionStart)
  }
  assert.deepEqual(
    snapshotDealSourceFiles(firstDealId),
    firstDealSourcesBeforeTurns,
    'conversation turns do not modify the first deal source-of-truth files',
  )
  assert.deepEqual(
    snapshotDealSourceFiles(secondDealId),
    secondDealSourcesBeforeTurns,
    'conversation turns do not modify the second deal source-of-truth files',
  )
  console.log('[conversation-system-test] PASS')
} finally {
  if (manager) await manager.shutdown()
  rmSync(tempRoot, { recursive: true, force: true })
  assert.equal(existsSync(tempRoot), false, 'the exact mkdtemp test root is removed')
}
