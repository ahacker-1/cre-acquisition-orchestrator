import type { StageId } from './stageModel'

// A command-bar suggestion. `intent` is a routing key resolved in Phase 3 (intentRouting):
//   "agent:<id>"     → summon that single agent
//   "workflow:<id>"  → launch that workflow
//   "<action>"       → a dashboard action (re-extract, assemble package, etc.)
export interface CommandSuggestion {
  label: string
  intent: string
}

const SUGGESTIONS_BY_STAGE: Record<StageId, CommandSuggestion[]> = {
  intake: [
    { label: 'Re-read all documents', intent: 'reextract-all' },
    { label: 'Check for missing documents', intent: 'check-missing-docs' },
  ],
  diligence: [
    { label: 'Flag the biggest risks', intent: 'workflow:quick-deal-screen' },
    { label: 'Check tenant concentration', intent: 'agent:tenant-credit' },
    { label: 'Analyze the rent roll', intent: 'agent:rent-roll-analyst' },
  ],
  underwriting: [
    { label: 'Refresh the model', intent: 'agent:financial-model-builder' },
    { label: 'Stress-test the exit cap', intent: 'agent:scenario-analyst' },
    { label: 'Draft the IC memo', intent: 'agent:ic-memo-writer' },
  ],
  financing: [
    { label: 'Compare financing paths', intent: 'workflow:financing-package' },
    { label: 'Draft a term sheet', intent: 'agent:term-sheet-builder' },
  ],
  legal: [
    { label: 'Find legal blockers', intent: 'workflow:legal-psa-review' },
    { label: 'Review the PSA', intent: 'agent:psa-reviewer' },
  ],
  closing: [
    { label: 'Build the closing checklist', intent: 'agent:closing-coordinator' },
    { label: 'Prepare the funds flow', intent: 'agent:funds-flow-manager' },
  ],
  ic: [
    { label: 'Assemble the IC package', intent: 'assemble-package' },
    { label: 'Summarize the recommendation', intent: 'agent:ic-memo-writer' },
  ],
}

export function suggestionsForStage(stageId: StageId): CommandSuggestion[] {
  return SUGGESTIONS_BY_STAGE[stageId] ?? []
}
