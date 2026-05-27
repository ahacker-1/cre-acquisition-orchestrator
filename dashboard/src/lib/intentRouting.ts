import type { StageId } from './stageModel'
import type { CommandSuggestion } from './commandModel'

// Command-bar routing v1 (spec §8 / ledger A2): a deterministic, static intent map — no LLM
// router. A suggestion chip carries an explicit `intent` ("agent:<id>" / "workflow:<id>" /
// "<action>") which we resolve directly; free text is matched against a documented keyword map.

export type RouteResult =
  | { kind: 'agent'; agentId: string }
  | { kind: 'workflow'; workflowId: string }
  | { kind: 'advanced' }

export interface RouteContext {
  // The stage-relevant suggestion set (from commandModel.suggestionsForStage) — lets a typed
  // phrase that matches a chip's label resolve to that chip's intent.
  suggestions?: CommandSuggestion[]
}

// Resolve an explicit suggestion intent string ("agent:<id>" / "workflow:<id>" / a plain action).
// Plain actions (re-extract, assemble-package, …) are not single-agent dispatch nor a workflow
// launch, so they fall back to the Advanced drawer in v1.
export function routeIntentString(intent: string): RouteResult {
  const trimmed = intent.trim()
  if (trimmed.startsWith('agent:')) {
    const agentId = trimmed.slice('agent:'.length).trim()
    if (agentId) return { kind: 'agent', agentId }
  }
  if (trimmed.startsWith('workflow:')) {
    const workflowId = trimmed.slice('workflow:'.length).trim()
    if (workflowId) return { kind: 'workflow', workflowId }
  }
  return { kind: 'advanced' }
}

// Documented free-text keyword map. Ordered: the FIRST matching rule wins, so put more specific
// phrases before broader ones. Every agentId here is a real entry in config/agent-registry.json;
// every workflowId is a real entry in config/workflows.json.
interface KeywordRule {
  pattern: RegExp
  result: RouteResult
}

// Patterns use word-START boundaries (\b before a stem) but NOT a trailing \b after stems like
// "financ" / "underwrit" — so "financing"/"underwriting" still match the stem.
const KEYWORD_RULES: KeywordRule[] = [
  // Underwriting / model
  { pattern: /\b(model|pro ?forma|underwrit|refresh the model)/i, result: { kind: 'agent', agentId: 'financial-model-builder' } },
  { pattern: /\b(stress|sensitivit|exit cap|scenario)/i, result: { kind: 'agent', agentId: 'scenario-analyst' } },
  // IC memo / committee
  { pattern: /\b(ic memo|committee|investment memo|recommendation)/i, result: { kind: 'agent', agentId: 'ic-memo-writer' } },
  // Diligence specialists
  { pattern: /\b(rent[ -]?roll|unit mix)/i, result: { kind: 'agent', agentId: 'rent-roll-analyst' } },
  { pattern: /\b(tenant|concentration|credit)/i, result: { kind: 'agent', agentId: 'tenant-credit' } },
  // Legal / PSA → workflow
  { pattern: /\b(legal|psa|purchase agreement|title|estoppel)/i, result: { kind: 'workflow', workflowId: 'legal-psa-review' } },
  // Financing / lender → workflow
  { pattern: /\b(financ|lender|debt|loan|term sheet|quote)/i, result: { kind: 'workflow', workflowId: 'financing-package' } },
  // Closing
  { pattern: /\b(closing checklist|funds flow|close the deal|closing)/i, result: { kind: 'agent', agentId: 'closing-coordinator' } },
  // Broad screens
  { pattern: /\b(screen|biggest risk|go.?no.?go|flag the)/i, result: { kind: 'workflow', workflowId: 'quick-deal-screen' } },
]

// Try to resolve free text against the stage's own suggestion labels first (so "Refresh the
// model" routes exactly like the chip would), then the documented keyword map.
export function routeFreeText(text: string, context: RouteContext = {}): RouteResult {
  const trimmed = text.trim()
  if (!trimmed) return { kind: 'advanced' }

  // Exact-ish match against a stage suggestion label resolves to that chip's intent.
  const normalized = trimmed.toLowerCase()
  const matchedSuggestion = (context.suggestions ?? []).find(
    (suggestion) => suggestion.label.toLowerCase() === normalized,
  )
  if (matchedSuggestion) return routeIntentString(matchedSuggestion.intent)

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(trimmed)) return rule.result
  }
  return { kind: 'advanced' }
}

/**
 * Route a command-bar entry to a single-agent summon, a workflow launch, or the Advanced drawer.
 *
 * - An explicit suggestion intent ("agent:<id>" / "workflow:<id>" / action) is resolved directly.
 * - Free text is matched against the stage's suggestion labels, then a documented keyword map.
 * - Anything unrecognized falls back to `{ kind: 'advanced' }` (open the power-user drawer).
 *
 * `stageId` is accepted for future stage-specific routing; v1 routing is stage-independent beyond
 * the suggestion-label match (the suggestions themselves are already stage-scoped by the caller).
 */
export function routeIntent(
  text: string,
  _stageId: StageId,
  context: RouteContext = {},
): RouteResult {
  const trimmed = text.trim()
  // A raw intent token (chip click passes the intent string straight through).
  if (trimmed.startsWith('agent:') || trimmed.startsWith('workflow:')) {
    return routeIntentString(trimmed)
  }
  return routeFreeText(trimmed, context)
}
