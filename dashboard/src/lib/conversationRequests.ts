export interface PendingConversationSubmission {
  content: string
  documentIds: string[]
  clientRequestId: string
}

type ClientRequestIdFactory = () => string
type ConversationFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface ConversationMessagePost {
  url: string
  content: string
  documentIds?: string[]
  clientRequestId: string
}

export function conversationSubmissionFor(
  content: string,
  documentIds: readonly string[],
  previous: PendingConversationSubmission | null,
  createClientRequestId: ClientRequestIdFactory = () => globalThis.crypto.randomUUID(),
): PendingConversationSubmission {
  const normalizedDocumentIds = [...new Set(documentIds)].sort()
  if (
    previous?.content === content
    && previous.documentIds.length === normalizedDocumentIds.length
    && previous.documentIds.every((documentId, index) => documentId === normalizedDocumentIds[index])
  ) {
    return previous
  }
  return { content, documentIds: normalizedDocumentIds, clientRequestId: createClientRequestId() }
}

export async function postConversationMessageRequest(
  input: ConversationMessagePost,
  fetchImpl: ConversationFetch = fetch,
): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: input.content,
      documentIds: input.documentIds,
      clientRequestId: input.clientRequestId,
    }),
  }

  try {
    return await fetchImpl(input.url, init)
  } catch {
    // A dropped response is indistinguishable from a dropped request. Replaying once with the
    // same durable identity lets the server return the original acceptance without a second turn.
    return fetchImpl(input.url, init)
  }
}
