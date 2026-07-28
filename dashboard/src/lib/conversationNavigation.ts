export const CONVERSATION_QUERY_KEYS = {
  deal: 'deal',
  agent: 'agent',
  thread: 'thread',
} as const

export interface ConversationQuerySelection {
  dealId: string | null
  agentId: string | null
  threadId: string | null
}

export function readConversationQuerySelection(search: string): ConversationQuerySelection {
  const params = new URLSearchParams(search)
  return {
    dealId: params.get(CONVERSATION_QUERY_KEYS.deal),
    agentId: params.get(CONVERSATION_QUERY_KEYS.agent),
    threadId: params.get(CONVERSATION_QUERY_KEYS.thread),
  }
}

export function conversationPathForDeal(href: string, dealId: string): string {
  const url = new URL(href)
  if (url.searchParams.get(CONVERSATION_QUERY_KEYS.deal) !== dealId) {
    url.searchParams.set(CONVERSATION_QUERY_KEYS.deal, dealId)
    url.searchParams.delete(CONVERSATION_QUERY_KEYS.agent)
    url.searchParams.delete(CONVERSATION_QUERY_KEYS.thread)
  }
  return `${url.pathname}${url.search}${url.hash}`
}
