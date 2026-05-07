import { useEffect, useMemo, useState, type ReactNode } from 'react'
import AgentTree from './AgentTree'
import CompletionPackage from './CompletionPackage'
import DecisionLog from './DecisionLog'
import DocumentWall from './DocumentWall'
import FinalReport from './FinalReport'
import FindingsPanel from './FindingsPanel'
import LogStream from './LogStream'
import PhaseDetail from './PhaseDetail'
import PipelineView from './PipelineView'
import StoryNarrative from './StoryNarrative'
import TimelineView from './TimelineView'
import WorkflowLauncher from './WorkflowLauncher'
import { useDealWorkspace } from '../hooks/useDealWorkspace'
import { useWorkflows } from '../hooks/useWorkflows'
import type {
  AgentCheckpoint,
  DealCheckpoint,
  DocumentArtifact,
  LogEntry,
  StoryEvent,
} from '../types/checkpoint'
import type { DealLibraryItem } from '../types/deals'
import type {
  DealCriteria,
  ExtractionField,
  ExtractionPreview,
  PhaseWorkspaceStatus,
  SourceDocument,
} from '../types/workspace'
import type { WorkflowLaunchResponse, WorkflowPreset } from '../types/workflows'

interface DealWorkspaceProps {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
  logEntries: LogEntry[]
  storyEvents: StoryEvent[]
  documentArtifacts: DocumentArtifact[]
  deals: DealLibraryItem[]
  initialTab?: WorkspaceTab
  onLaunchStarted?: (response: WorkflowLaunchResponse) => void
  onPresetSaved?: (preset: WorkflowPreset) => void
}

type WorkspaceTab =
  | 'overview'
  | 'underwriting'
  | 'due-diligence'
  | 'financing'
  | 'legal'
  | 'closing'
  | 'documents'
  | 'package'

const PHASE_WORKFLOW: Record<string, string> = {
  underwriting: 'underwriting-refresh',
  'due-diligence': 'quick-deal-screen',
  financing: 'financing-package',
  legal: 'legal-psa-review',
  closing: 'full-acquisition-review',
}

const DOCUMENT_LABELS: Record<string, string> = {
  rent_roll: 'Rent Roll',
  t12: 'T12',
  offering_memo: 'Offering Memo',
  inspection_report: 'Inspection',
  environmental: 'Environmental',
  title: 'Title',
  survey: 'Survey',
  loi: 'LOI',
  psa: 'PSA',
  insurance: 'Insurance',
  loan_documents: 'Loan Docs',
  closing_statement: 'Closing Statement',
  other: 'Other',
}

function formatNumber(value: number | null | undefined, suffix = ''): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return `${value.toLocaleString()}${suffix}`
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return `${(value * 100).toFixed(1)}%`
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${value.toLocaleString()}`
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return '--'
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}

function statusClass(status: string): string {
  if (
    status === 'ready' ||
    status === 'complete' ||
    status === 'extracted' ||
    status === 'review_ready' ||
    status === 'approved' ||
    status === 'applied'
  ) {
    return 'status-complete'
  }
  if (status === 'partial' || status === 'uploaded' || status === 'parsed' || status === 'extraction-pending') {
    return 'status-running'
  }
  if (
    status === 'blocked' ||
    status === 'unsupported' ||
    status === 'parse_failed' ||
    status === 'parser-unavailable' ||
    status === 'rejected'
  ) return 'status-blocked'
  if (status === 'waived') return 'status-pending'
  return 'status-pending'
}

function fieldValue(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : String(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `${value.length} rows`
  if (value && typeof value === 'object') return JSON.stringify(value)
  return '--'
}

function sourceLabel(field: ExtractionField): string {
  const location = field.sourceRef?.location
  if (location?.sheet && location?.row) return `${location.sheet} row ${location.row}`
  if (location?.row) return `row ${location.row}`
  if (location?.line) return `line ${location.line}`
  if (location?.page) return `page ${location.page}`
  return field.source
}

function phaseFromCheckpoint(
  dealCheckpoint: DealCheckpoint,
  phase: PhaseWorkspaceStatus,
) {
  const direct = dealCheckpoint.phases[phase.phaseKey]
  if (direct) return direct
  const underscore = phase.phaseSlug.replace(/-/g, '_')
  return dealCheckpoint.phases[underscore]
}

function phaseProgress(dealCheckpoint: DealCheckpoint, phase: PhaseWorkspaceStatus): number {
  const runtimePhase = phaseFromCheckpoint(dealCheckpoint, phase)
  return Math.round(((runtimePhase?.progress ?? 0) > 1 ? runtimePhase?.progress ?? 0 : (runtimePhase?.progress ?? 0) * 100))
}

function applyNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function CriteriaPanel({
  criteria,
  onSave,
  working,
}: {
  criteria: DealCriteria
  onSave: (criteria: DealCriteria) => Promise<void>
  working: boolean
}) {
  const [draft, setDraft] = useState(criteria)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setDraft(criteria)
  }, [criteria])

  async function handleSave(): Promise<void> {
    await onSave(draft)
    setMessage('Criteria saved to this deal.')
  }

  return (
    <section className="portal-panel" data-testid="criteria-panel">
      <div className="portal-section-header">
        <div>
          <p className="portal-kicker">Deal Criteria</p>
          <h2 className="portal-title">Underwriting Specs</h2>
        </div>
        <button
          type="button"
          data-testid="criteria-save"
          disabled={working}
          onClick={() => void handleSave()}
          className="portal-button portal-button-primary"
        >
          {working ? 'Saving' : 'Save Criteria'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 mt-4">
        <label className="portal-field">
          <span>Strategy</span>
          <select
            value={draft.investmentStrategy}
            onChange={(event) => setDraft((current) => ({ ...current, investmentStrategy: event.target.value }))}
          >
            <option value="core">Core</option>
            <option value="core-plus">Core Plus</option>
            <option value="value-add">Value Add</option>
            <option value="opportunistic">Opportunistic</option>
          </select>
        </label>
        <label className="portal-field">
          <span>Scenario</span>
          <select
            data-testid="criteria-scenario"
            value={draft.scenario}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                scenario: event.target.value as DealCriteria['scenario'],
              }))
            }
          >
            <option value="core-plus">Core Plus</option>
            <option value="value-add">Value Add</option>
            <option value="distressed">Distressed</option>
          </select>
        </label>
        <label className="portal-field">
          <span>Risk Tolerance</span>
          <select
            value={draft.riskTolerance}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                riskTolerance: event.target.value as DealCriteria['riskTolerance'],
              }))
            }
          >
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </label>
        <label className="portal-field">
          <span>Hold Period</span>
          <input
            type="number"
            value={draft.targetHoldPeriod ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, targetHoldPeriod: applyNumber(event.target.value) }))}
          />
        </label>
        <label className="portal-field">
          <span>Target IRR</span>
          <input
            data-testid="criteria-target-irr"
            type="number"
            step="0.01"
            value={draft.targetIRR ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, targetIRR: applyNumber(event.target.value) }))}
          />
        </label>
        <label className="portal-field">
          <span>Equity Multiple</span>
          <input
            type="number"
            step="0.1"
            value={draft.targetEquityMultiple ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, targetEquityMultiple: applyNumber(event.target.value) }))}
          />
        </label>
        <label className="portal-field">
          <span>Target LTV</span>
          <input
            type="number"
            step="0.01"
            value={draft.targetLTV ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, targetLTV: applyNumber(event.target.value) }))}
          />
        </label>
        <label className="portal-field">
          <span>Rate</span>
          <input
            type="number"
            step="0.001"
            value={draft.estimatedRate ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, estimatedRate: applyNumber(event.target.value) }))}
          />
        </label>
      </div>

      <label className="portal-field mt-4">
        <span>Operator Notes</span>
        <textarea
          value={draft.notes}
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          rows={3}
          placeholder="Investment thesis, IC concerns, lender constraints, diligence focus."
        />
      </label>
      {message && <p className="mt-3 text-xs uppercase tracking-[0.18em] text-gray-400">{message}</p>}
    </section>
  )
}

function ExtractionPreviewPanel({
  extraction,
  onApply,
  working,
}: {
  extraction: ExtractionPreview | null
  onApply: (documentId: string, fieldIds: string[], allowConflicts?: boolean) => Promise<void>
  working: boolean
}) {
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([])
  const [confirmConflicts, setConfirmConflicts] = useState(false)

  useEffect(() => {
    setSelectedFieldIds([])
    setConfirmConflicts(false)
  }, [extraction])

  if (!extraction) {
    return (
      <div className="portal-panel">
        <p className="portal-kicker">Extraction Preview</p>
        <p className="text-sm text-gray-500 mt-3">
          Upload a CSV, TXT, or markdown source document and run extraction to preview approved deal inputs here.
        </p>
      </div>
    )
  }
  const selectedFields = extraction.fields.filter((field) => selectedFieldIds.includes(field.fieldId))
  const selectedConflictCount = selectedFields.filter((field) => field.conflict).length
  const canApply = selectedFieldIds.length > 0 && (selectedConflictCount === 0 || confirmConflicts)

  return (
    <div className="portal-panel" data-testid="extraction-preview">
      <div className="portal-section-header">
        <div>
          <p className="portal-kicker">Extraction Preview</p>
          <h3 className="portal-title">{extraction.fields.length} Fields Found</h3>
        </div>
        <span className={`status-badge ${statusClass(extraction.status)}`}>{extraction.status}</span>
      </div>
      {extraction.notes.length > 0 && (
        <p className="text-sm text-gray-400 mt-3">{extraction.notes[0]}</p>
      )}
      {extraction.error && (
        <p className="mt-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{extraction.error}</p>
      )}
      <div className="mt-4 space-y-2">
        {extraction.fields.length === 0 ? (
          <p className="text-sm text-gray-500">No apply-ready fields found for this document yet.</p>
        ) : (
          extraction.fields.map((field: ExtractionField) => {
            const blocked = Boolean(field.validationIssues?.length)
            return (
            <label key={field.fieldId} className="flex items-center gap-3 border border-white/10 bg-black px-3 py-3 text-sm">
              <input
                type="checkbox"
                data-testid={`extraction-field-${field.fieldId}`}
                data-field-path={field.path}
                className="h-4 w-4 accent-white"
                disabled={blocked}
                checked={selectedFieldIds.includes(field.fieldId)}
                onChange={(event) => {
                  setSelectedFieldIds((current) =>
                    event.target.checked
                      ? [...current, field.fieldId]
                      : current.filter((entry) => entry !== field.fieldId),
                  )
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-gray-200">
                  {field.label}
                  {field.conflict && <span className="status-badge status-running">conflict</span>}
                  {blocked && <span className="status-badge status-blocked">blocked</span>}
                </span>
                <span className="block font-mono text-xs text-gray-500">{field.path}</span>
                <span className="mt-1 block text-xs text-gray-500">
                  Source {sourceLabel(field)} / confidence {Math.round(field.confidence * 100)}%
                  {field.currentValue !== undefined ? ` / current ${fieldValue(field.currentValue)}` : ''}
                </span>
                {field.validationIssues?.map((issue) => (
                  <span key={issue} className="mt-1 block text-xs text-red-200">{issue}</span>
                ))}
              </span>
              <span className="text-right font-semibold text-white">{fieldValue(field.value)}</span>
            </label>
            )
          })
        )}
      </div>
      {selectedConflictCount > 0 && (
        <label className="mt-4 flex items-start gap-3 border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-sm text-amber-100">
          <input
            type="checkbox"
            data-testid="confirm-conflict-review"
            className="mt-0.5 h-4 w-4 accent-white"
            checked={confirmConflicts}
            onChange={(event) => setConfirmConflicts(event.target.checked)}
          />
          <span>
            I reviewed {selectedConflictCount} conflicting source-backed field
            {selectedConflictCount === 1 ? '' : 's'} and want to apply the selected value
            {selectedConflictCount === 1 ? '' : 's'}.
          </span>
        </label>
      )}
      <button
        type="button"
        data-testid="apply-extraction"
        disabled={working || extraction.fields.length === 0 || !canApply}
        onClick={() => void onApply(extraction.documentId, selectedFieldIds, selectedConflictCount > 0 && confirmConflicts)}
        className="portal-button portal-button-primary mt-4 w-full"
      >
        {selectedFieldIds.length === 0
          ? 'Select Fields To Apply'
          : selectedConflictCount > 0
            ? confirmConflicts
              ? `Apply ${selectedConflictCount} Reviewed Conflict${selectedConflictCount === 1 ? '' : 's'}`
              : 'Confirm Conflict Review'
            : 'Apply Selected Fields'}
      </button>
    </div>
  )
}

function DocumentIntakePanel({
  documents,
  extraction,
  working,
  onUpload,
  onExtract,
  onApply,
}: {
  documents: SourceDocument[]
  extraction: ExtractionPreview | null
  working: boolean
  onUpload: (file: File) => Promise<SourceDocument>
  onExtract: (documentId: string) => Promise<ExtractionPreview>
  onApply: (documentId: string, fieldIds: string[], allowConflicts?: boolean) => Promise<void>
}) {
  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      await onUpload(file)
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="portal-panel">
        <div className="portal-section-header">
          <div>
            <p className="portal-kicker">Local Document Intake</p>
            <h2 className="portal-title">Source Materials</h2>
          </div>
          <label className="portal-button portal-button-primary cursor-pointer">
            Upload Docs
            <input
              data-testid="source-document-upload"
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => void handleFiles(event.target.files)}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {documents.length === 0 ? (
            <div className="border border-dashed border-white/15 bg-black p-6 text-sm text-gray-500 lg:col-span-2">
              Upload rent rolls, T12s, offering memoranda, LOIs, PSA files, title, survey, loan documents, and closing materials.
            </div>
          ) : (
            documents.map((doc) => (
              <article key={doc.documentId} className="border border-white/10 bg-black p-4" data-testid={`source-document-${doc.type}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{doc.fileName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">
                      {doc.typeLabel} / {doc.phaseLabel}
                    </p>
                  </div>
                  <span className={`status-badge ${statusClass(doc.status)}`}>{doc.status}</span>
                </div>
                <p className="mt-3 text-xs text-gray-500">{formatFileSize(doc.size)} / {doc.mime}</p>
                <button
                  type="button"
                  data-testid={`extract-document-${doc.type}`}
                  disabled={working || doc.extractionStatus === 'extraction-pending'}
                  onClick={() => void onExtract(doc.documentId)}
                  className="portal-button portal-button-secondary mt-4 w-full"
                >
                  {doc.extractionStatus === 'extraction-pending' ? 'Extraction Pending' : 'Preview Extraction'}
                </button>
              </article>
            ))
          )}
        </div>
      </div>
      <ExtractionPreviewPanel extraction={extraction} working={working} onApply={onApply} />
    </section>
  )
}

function PhaseWorkspaceView({
  dealCheckpoint,
  agentCheckpoints,
  phase,
  documents,
  onChecklist,
  onLaunch,
  launching,
}: {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
  phase: PhaseWorkspaceStatus
  documents: SourceDocument[]
  onChecklist: (phaseSlug: string, checklist: Record<string, 'pending' | 'complete'>) => Promise<unknown>
  onLaunch: (phaseSlug: string) => Promise<void>
  launching: boolean
}) {
  const runtimePhase = phaseFromCheckpoint(dealCheckpoint, phase)
  const phaseDocs = documents.filter((doc) => doc.phase === phase.phaseSlug)
  const coverage = phase.requiredDocuments.length === 0
    ? 100
    : Math.round((phase.uploadedDocuments.length / phase.requiredDocuments.length) * 100)

  async function toggleChecklist(itemId: string, complete: boolean): Promise<void> {
    await onChecklist(phase.phaseSlug, { [itemId]: complete ? 'complete' : 'pending' })
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <div className="portal-panel">
          <div className="portal-section-header">
            <div>
              <p className="portal-kicker">{phase.label}</p>
              <h2 className="portal-title">Agent Playbook</h2>
            </div>
            <span className={`status-badge ${statusClass(phase.readiness)}`}>{phase.readiness}</span>
          </div>
          <p className="mt-3 text-sm text-gray-400">{phase.summary}</p>
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="portal-stat">
              <strong>{coverage}%</strong>
              <span>Doc Coverage</span>
            </div>
            <div className="portal-stat">
              <strong>{phase.agents.length}</strong>
              <span>Agents</span>
            </div>
            <div className="portal-stat">
              <strong>{phaseProgress(dealCheckpoint, phase)}%</strong>
              <span>Runtime</span>
            </div>
          </div>
          <button
            type="button"
            data-testid={`phase-launch-${phase.phaseSlug}`}
            disabled={launching}
            onClick={() => void onLaunch(phase.phaseSlug)}
            className="portal-button portal-button-primary mt-5 w-full"
          >
            {launching ? 'Launching Workflow' : 'Run Phase Workflow'}
          </button>
        </div>

        <div className="portal-panel">
          <p className="portal-kicker">Checklist</p>
          <div className="mt-3 space-y-2">
            {phase.checklist.map((item) => (
              <label key={item.id} className="flex items-center gap-3 border border-white/10 bg-black px-3 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-white"
                  checked={item.status === 'complete'}
                  onChange={(event) => void toggleChecklist(item.id, event.target.checked)}
                />
                <span className="text-sm text-gray-300">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="portal-panel">
          <p className="portal-kicker">Required Documents</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {phase.requiredDocuments.map((type) => (
              <span
                key={type}
                className={`status-badge ${
                  phase.uploadedDocuments.includes(type) ? 'status-complete' : 'status-pending'
                }`}
              >
                {DOCUMENT_LABELS[type] ?? type}
              </span>
            ))}
          </div>
          {phaseDocs.length > 0 && (
            <div className="mt-4 space-y-2">
              {phaseDocs.map((doc) => (
                <div key={doc.documentId} className="flex items-center justify-between gap-3 border border-white/10 bg-black px-3 py-2 text-sm">
                  <span className="truncate text-gray-300">{doc.fileName}</span>
                  <span className={`status-badge ${statusClass(doc.status)}`}>{doc.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {runtimePhase && (
          <PhaseDetail
            phase={runtimePhase}
            phaseName={phase.label}
            agentCheckpoints={agentCheckpoints}
          />
        )}
        <div className="portal-panel">
          <p className="portal-kicker">Agents</p>
          <div className="mt-3 space-y-2">
            {phase.agents.map((agent) => (
              <article key={agent.agentId} className="border border-white/10 bg-black p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{agent.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">
                      {agent.critical ? 'Critical Path' : 'Support Agent'}
                    </p>
                  </div>
                  <span className="status-badge status-pending">{agent.outputs.length} outputs</span>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Inputs: {agent.inputs.join(', ') || 'Deal data'}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Overview({
  dealCheckpoint,
  workspace,
  criteria,
  documents,
  children,
}: {
  dealCheckpoint: DealCheckpoint
  workspace: ReturnType<typeof useDealWorkspace>['workspace']
  criteria: DealCriteria | null
  documents: SourceDocument[]
  children: ReactNode
}) {
  const phases = workspace?.phases ?? []
  const readyCount = phases.filter((phase) => phase.readiness === 'ready').length
  const sourceDocCount = documents.length
  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-4">
        <div className="portal-stat portal-stat-large">
          <strong>{formatNumber(dealCheckpoint.property.totalUnits)}</strong>
          <span>Units</span>
        </div>
        <div className="portal-stat portal-stat-large">
          <strong>{formatCurrency(dealCheckpoint.property.askingPrice)}</strong>
          <span>Asking Price</span>
        </div>
        <div className="portal-stat portal-stat-large">
          <strong>{readyCount}/{phases.length || 5}</strong>
          <span>Phase Ready</span>
        </div>
        <div className="portal-stat portal-stat-large">
          <strong>{sourceDocCount}</strong>
          <span>Source Docs</span>
        </div>
      </section>
      {criteria && (
        <section className="portal-panel">
          <div className="portal-section-header">
            <div>
              <p className="portal-kicker">Current Spec</p>
              <h2 className="portal-title">{criteria.scenario} / {criteria.riskTolerance}</h2>
            </div>
            <span className="status-badge status-complete">Local First</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="portal-metric"><span>Target IRR</span><strong>{formatPercent(criteria.targetIRR)}</strong></div>
            <div className="portal-metric"><span>Equity Multiple</span><strong>{formatNumber(criteria.targetEquityMultiple, 'x')}</strong></div>
            <div className="portal-metric"><span>Target LTV</span><strong>{formatPercent(criteria.targetLTV)}</strong></div>
            <div className="portal-metric"><span>Rate</span><strong>{formatPercent(criteria.estimatedRate)}</strong></div>
          </div>
        </section>
      )}
      {children}
    </div>
  )
}

export default function DealWorkspace({
  dealCheckpoint,
  agentCheckpoints,
  logEntries,
  storyEvents,
  documentArtifacts,
  deals,
  initialTab = 'overview',
  onLaunchStarted,
  onPresetSaved,
}: DealWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab)
  const {
    workspace,
    loading,
    working,
    error,
    lastExtraction,
    saveCriteria,
    uploadDocument,
    extractDocument,
    applyExtraction,
    savePhaseChecklist,
    refreshWorkspace,
  } = useDealWorkspace(dealCheckpoint.dealId)
  const { launchWorkflow, launchingWorkflowId } = useWorkflows()
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [dealCheckpoint.dealId, initialTab])

  const phaseTabs = workspace?.phases ?? []
  const activePhase = phaseTabs.find((phase) => phase.phaseSlug === activeTab)
  const criteria = workspace?.criteria ?? null
  const documents = workspace?.documents ?? []

  const navItems = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      ...phaseTabs.map((phase) => ({ id: phase.phaseSlug, label: phase.label })),
      { id: 'documents', label: 'Documents' },
      { id: 'package', label: 'Package' },
    ] as { id: WorkspaceTab | string; label: string }[],
    [phaseTabs],
  )

  async function handlePhaseLaunch(phaseSlug: string): Promise<void> {
    const workflowId = PHASE_WORKFLOW[phaseSlug] ?? 'full-acquisition-review'
    try {
      const response = await launchWorkflow(workflowId, {
        dealId: dealCheckpoint.dealId,
        scenario: criteria?.scenario ?? 'core-plus',
        speed: 'fast',
        mode: 'live',
        reset: false,
        notes: criteria?.notes,
      })
      const sourceCount = response.inputSnapshot?.sourceCoverage?.sourceDocumentCount
      setLaunchMessage(
        `Workflow launched: ${workflowId}${
          typeof sourceCount === 'number' ? ` / ${sourceCount} source docs captured` : ''
        }`,
      )
      onLaunchStarted?.(response)
    } catch (err) {
      setLaunchMessage(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleWorkspaceLaunch(response: WorkflowLaunchResponse): Promise<void> {
    await refreshWorkspace()
    onLaunchStarted?.(response)
  }

  return (
    <div className="portal-shell" data-testid="operator-deal-hub">
      <section className="portal-hero">
        <div>
          <p className="portal-kicker">Operator Deal Hub</p>
          <h1>{dealCheckpoint.dealName}</h1>
          <p>
            Upload source materials first, approve extracted deal inputs, lock underwriting criteria, then run agent workflows from one local cockpit.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="hub-upload-docs-button"
              className="portal-button portal-button-primary"
              onClick={() => setActiveTab('documents')}
            >
              Upload Source Docs
            </button>
            <button
              type="button"
              className="portal-button portal-button-secondary"
              onClick={() => setActiveTab('overview')}
            >
              Review Criteria
            </button>
          </div>
        </div>
        <div className="portal-hero-meta">
          <span>{dealCheckpoint.dealId}</span>
          <span>{dealCheckpoint.workflowName || 'Workflow Ready'}</span>
          <span>{dealCheckpoint.status}</span>
        </div>
      </section>

      {(error || launchMessage) && (
        <div className="border border-white/10 bg-black px-4 py-3 text-sm text-gray-300">
          {error || launchMessage}
        </div>
      )}

      <nav className="portal-nav" aria-label="Deal workspace sections">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`workspace-tab-${item.id}`}
            onClick={() => setActiveTab(item.id as WorkspaceTab)}
            className={activeTab === item.id ? 'active' : ''}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading && <div className="portal-panel text-sm text-gray-500">Loading workspace...</div>}

      {!loading && activeTab === 'overview' && (
        <Overview
          dealCheckpoint={dealCheckpoint}
          workspace={workspace}
          criteria={criteria}
          documents={documents}
        >
          {criteria && (
            <CriteriaPanel
              criteria={criteria}
              working={working}
              onSave={saveCriteria}
            />
          )}
          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.72fr)]">
            <PipelineView dealCheckpoint={dealCheckpoint} agentCheckpoints={agentCheckpoints} />
            <WorkflowLauncher
              deals={deals}
              initialDealId={dealCheckpoint.dealId}
              onLaunchStarted={(response) => void handleWorkspaceLaunch(response)}
              onPresetSaved={onPresetSaved}
              compact
            />
          </section>
        </Overview>
      )}

      {!loading && activePhase && (
        <PhaseWorkspaceView
          dealCheckpoint={dealCheckpoint}
          agentCheckpoints={agentCheckpoints}
          phase={activePhase}
          documents={documents}
          onChecklist={savePhaseChecklist}
          onLaunch={handlePhaseLaunch}
          launching={launchingWorkflowId !== null}
        />
      )}

      {!loading && activeTab === 'documents' && (
        <div className="space-y-4">
          <DocumentIntakePanel
            documents={documents}
            extraction={lastExtraction}
            working={working}
            onUpload={uploadDocument}
            onExtract={extractDocument}
            onApply={applyExtraction}
          />
          <DocumentWall documentArtifacts={documentArtifacts} />
        </div>
      )}

      {!loading && activeTab === 'package' && (
        <div className="space-y-4">
          <CompletionPackage
            dealCheckpoint={dealCheckpoint}
            storyEvents={storyEvents}
            documentArtifacts={documentArtifacts}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <FindingsPanel dealCheckpoint={dealCheckpoint} agentCheckpoints={agentCheckpoints} />
            <DecisionLog storyEvents={storyEvents} />
          </div>
          <StoryNarrative storyEvents={storyEvents} />
          <TimelineView dealCheckpoint={dealCheckpoint} agentCheckpoints={agentCheckpoints} />
          {logEntries.length > 0 && <LogStream logEntries={logEntries} />}
          {/^complete$/i.test(dealCheckpoint.status) && <FinalReport dealCheckpoint={dealCheckpoint} />}
          <AgentTree dealCheckpoint={dealCheckpoint} agentCheckpoints={agentCheckpoints} />
        </div>
      )}
    </div>
  )
}
