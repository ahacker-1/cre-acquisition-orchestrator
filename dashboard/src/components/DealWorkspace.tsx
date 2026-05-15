import { useEffect, useMemo, useState, type ReactNode } from 'react'
import AgentTree from './AgentTree'
import CompletionPackage from './CompletionPackage'
import DealCockpitSidebar from './DealCockpitSidebar'
import DecisionLog from './DecisionLog'
import DocumentWall from './DocumentWall'
import FinalReport from './FinalReport'
import FindingsPanel from './FindingsPanel'
import LogStream from './LogStream'
import MissionControl from './MissionControl'
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
  RuntimeProvider,
  StoryEvent,
} from '../types/checkpoint'
import type { DealLibraryItem } from '../types/deals'
import type {
  DealCriteria,
  DealProgressionGuide,
  DealProgressionSection,
  ExtractionField,
  ExtractionPreview,
  GuideChecklistStatus,
  LaunchReadinessResult,
  OperatorCommand,
  OperatorGuideAction,
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
  onOpenEditDetails?: (dealId: string) => void
  onLaunchStarted?: (response: WorkflowLaunchResponse) => void
  onPresetSaved?: (preset: WorkflowPreset) => void
}

type WorkspaceTab =
  | 'mission'
  | 'documents'
  | 'agents'
  | 'workpapers'
  | 'package'
  | 'advanced'
  | 'underwriting'
  | 'due-diligence'
  | 'financing'
  | 'legal'
  | 'closing'

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

const RUNTIME_OPTIONS: { value: RuntimeProvider; label: string }[] = [
  { value: 'simulation', label: 'Simulation' },
  { value: 'codex', label: 'Codex / ChatGPT' },
]

const CODEX_AGENT_LIMITS: { value: string; label: string }[] = [
  { value: '1', label: '1 agent' },
  { value: '2', label: '2 agents' },
  { value: '', label: 'All selected' },
]

const WORKFLOW_LABELS: Record<string, string> = {
  'full-acquisition-review': 'Full Acquisition Review',
  'quick-deal-screen': 'Quick Deal Screen',
  'underwriting-refresh': 'Underwriting Refresh',
  'financing-package': 'Financing Package',
  'legal-psa-review': 'Legal / PSA Review',
}

const FIELD_LABELS: Record<string, string> = {
  'property.totalUnits': 'Total Units',
  'financials.askingPrice': 'Asking Price',
  'financials.currentNOI': 'Current NOI',
  'financials.inPlaceOccupancy': 'Occupancy',
  'financing.targetLTV': 'Target LTV',
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
    status === 'missing' ||
    status === 'unsupported' ||
    status === 'parse_failed' ||
    status === 'parser-unavailable' ||
    status === 'rejected'
  ) return 'status-blocked'
  if (status === 'waived') return 'status-pending'
  if (status === 'in_review') return 'status-running'
  return 'status-pending'
}

function readinessStatusClass(status: string): string {
  if (status === 'ready' || status === 'complete' || status === 'completed') return 'status-complete'
  if (status === 'warning' || status === 'running') return 'status-running'
  if (status === 'blocked') return 'status-blocked'
  return 'status-pending'
}

function isCompleteStatus(status: string): boolean {
  return /^complete|completed$/i.test(status)
}

function checklistStatusLabel(status: GuideChecklistStatus): string {
  return status.replace(/_/g, ' ')
}

function isWorkspaceTab(value: string | undefined): value is WorkspaceTab {
  return Boolean(value) && [
    'mission',
    'documents',
    'agents',
    'workpapers',
    'package',
    'advanced',
    'underwriting',
    'due-diligence',
    'financing',
    'legal',
    'closing',
  ].includes(value as WorkspaceTab)
}

function workflowLabel(workflowId: string): string {
  return WORKFLOW_LABELS[workflowId] ?? displaySlug(workflowId)
}

function displaySlug(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_.]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function fieldLabel(path: string): string {
  return FIELD_LABELS[path] ?? displaySlug(path)
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
  const selectableFields = extraction.fields.filter((field) => !field.validationIssues?.length)
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
      {extraction.fields.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="select-all-safe-fields"
            className="portal-button portal-button-secondary min-h-9 px-3 py-1"
            onClick={() => setSelectedFieldIds(selectableFields.map((field) => field.fieldId))}
            disabled={selectableFields.length === 0}
          >
            Select Apply-Ready Fields
          </button>
          <button
            type="button"
            data-testid="clear-selected-fields"
            className="portal-button portal-button-secondary min-h-9 px-3 py-1"
            disabled={selectedFieldIds.length === 0}
            onClick={() => setSelectedFieldIds([])}
          >
            Clear
          </button>
          <span className="text-xs font-semibold uppercase text-gray-500">
            {selectedFieldIds.length}/{selectableFields.length} selected
          </span>
        </div>
      )}
      {selectedFields.length > 0 && (
        <div className="mt-4 border border-white/10 bg-black p-3" data-testid="selected-field-change-summary">
          <p className="text-xs font-semibold uppercase text-gray-500">Deal data changes</p>
          <div className="mt-3 space-y-2">
            {selectedFields.slice(0, 5).map((field) => (
              <div key={field.fieldId} className="grid gap-2 text-xs md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <span className="font-semibold text-gray-300">{field.label}</span>
                <span className="min-w-0 text-gray-500">
                  <span className="break-words">{field.currentValue !== undefined ? fieldValue(field.currentValue) : 'empty'}</span>
                  <span className="px-2 text-gray-700">to</span>
                  <span className="break-words text-white">{fieldValue(field.value)}</span>
                </span>
              </div>
            ))}
            {selectedFields.length > 5 && (
              <p className="text-xs text-gray-500">+ {selectedFields.length - 5} more selected changes</p>
            )}
          </div>
        </div>
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

function OperatorCommandBar({
  command,
  onAction,
  hasRuntimeEvidence = false,
  isCompleteRun = false,
}: {
  command: OperatorCommand | null | undefined
  onAction: (action: OperatorGuideAction) => void
  hasRuntimeEvidence?: boolean
  isCompleteRun?: boolean
}) {
  if (!command) {
    return (
      <section className="portal-panel" data-testid="operator-command-bar">
        <p className="text-sm text-gray-500">Loading operator command...</p>
      </section>
    )
  }

  const isSampleEvidence = hasRuntimeEvidence && command.recommendedAction.title.toLowerCase().includes('upload')
  const progressLabel = isSampleEvidence ? 'sample run' : `${command.completedChecklistCount}/${command.totalChecklistCount}`
  const sourceLabel = isSampleEvidence && command.sourceCoverage.requiredApprovedFieldCount > 0
    ? 'sample'
    : command.sourceCoverage.requiredApprovedFieldCount > 0
      ? `${Math.max(0, command.sourceCoverage.requiredApprovedFieldCount - command.sourceCoverage.missingApprovedFieldCount)}/${command.sourceCoverage.requiredApprovedFieldCount}`
      : '--'
  const displayedReadiness = isSampleEvidence && isCompleteRun
    ? 'complete'
    : isSampleEvidence && command.readiness === 'blocked'
      ? 'running'
      : command.readiness
  const displayedPhaseLabel = isSampleEvidence && isCompleteRun ? 'Simulation complete' : command.activePhaseLabel
  const displayedTitle = isSampleEvidence && isCompleteRun
    ? 'Sample evidence produced a committee-ready package.'
    : isSampleEvidence
      ? 'Sample evidence is driving the active run.'
      : command.recommendedAction.title
  const displayedDetail = isSampleEvidence && isCompleteRun
    ? 'The completed simulation used the sample evidence bundle. Upload live source documents when you want to replace it with a real deal package.'
    : isSampleEvidence
      ? 'The demo team is already coordinating from the sample evidence bundle. Upload documents when you want to swap in a real source package.'
      : command.recommendedAction.detail
  const displayedCta = isSampleEvidence ? 'Review Outputs' : command.recommendedAction.cta
  const displayedBlockingCount = isSampleEvidence && isCompleteRun ? 0 : command.blockingCount

  return (
    <section className="portal-panel" data-testid="operator-command-bar">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="portal-kicker">Operator Command</p>
            <span className={`status-badge ${statusClass(displayedReadiness)}`}>{displayedReadiness}</span>
            <span className="status-badge status-pending">{displayedPhaseLabel}</span>
          </div>
          <h2 className="mt-2 font-serif text-2xl font-semibold leading-tight text-white">
            {displayedTitle}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-400">{displayedDetail}</p>
        </div>
        <button
          type="button"
          className="portal-button portal-button-primary w-full xl:w-auto"
          data-testid="operator-command-primary-action"
          onClick={() => onAction(command.recommendedAction.action)}
        >
          {displayedCta}
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="portal-metric">
          <span>Checklist</span>
          <strong>{progressLabel}</strong>
        </div>
        <div className="portal-metric">
          <span>Blockers</span>
          <strong>{displayedBlockingCount}</strong>
        </div>
        <div className="portal-metric">
          <span>Warnings</span>
          <strong>{command.warningCount}</strong>
        </div>
        <div className="portal-metric">
          <span>Source inputs</span>
          <strong>{sourceLabel}</strong>
        </div>
        <div className="portal-metric">
          <span>Review queue</span>
          <strong>{command.sourceCoverage.reviewQueueCount}</strong>
        </div>
      </div>
    </section>
  )
}

function GuideChecklistItem({
  section,
  item,
  onAction,
  onChecklist,
}: {
  section: DealProgressionSection
  item: PhaseWorkspaceStatus['checklist'][number]
  onAction: (action: OperatorGuideAction) => void
  onChecklist: (phaseSlug: string, checklist: Record<string, GuideChecklistStatus>, notes?: Record<string, string>) => Promise<unknown>
}) {
  const [note, setNote] = useState(item.note ?? '')
  const isClosed = item.status === 'complete' || item.status === 'waived'

  async function saveStatus(status: GuideChecklistStatus): Promise<void> {
    await onChecklist(section.phaseSlug, { [item.id]: status }, { [item.id]: note })
  }

  return (
    <article className="border border-white/10 bg-black p-3" data-testid={`guide-checklist-${item.id}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`status-badge ${statusClass(item.status)}`}>{checklistStatusLabel(item.status)}</span>
            <span className="status-badge status-pending">{item.priority}</span>
            <span className="status-badge status-pending">{item.category}</span>
          </div>
          <h4 className="mt-3 text-sm font-semibold text-white">{item.label}</h4>
          <p className="mt-2 text-sm leading-6 text-gray-400">{item.whyItMatters}</p>
          <div className="mt-3 grid gap-2 text-xs text-gray-500 lg:grid-cols-2">
            <p><span className="font-semibold text-gray-400">Evidence:</span> {item.evidenceRequired}</p>
            <p><span className="font-semibold text-gray-400">Unlocks:</span> {item.unlocks}</p>
            <p><span className="font-semibold text-gray-400">Status:</span> {item.statusReason}</p>
            <p><span className="font-semibold text-gray-400">Source:</span> {item.source}</p>
          </div>
          {(item.missingDocuments.length > 0 || item.missingFields.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.missingDocuments.map((type) => (
                <span key={type} className="status-badge status-blocked">{DOCUMENT_LABELS[type] ?? displaySlug(type)}</span>
              ))}
              {item.missingFields.map((field) => (
                <span key={field} className="status-badge status-blocked">{fieldLabel(field)}</span>
              ))}
            </div>
          )}
        </div>
        <div className="grid shrink-0 gap-2 md:w-48">
          <button
            type="button"
            className="portal-button portal-button-secondary w-full"
            onClick={() => onAction(item.recommendedAction)}
          >
            {item.recommendedAction.label}
          </button>
          <button
            type="button"
            className="portal-button portal-button-primary w-full"
            disabled={item.status === 'complete'}
            data-testid={`guide-complete-${item.id}`}
            onClick={() => void saveStatus('complete')}
          >
            Mark Complete
          </button>
          <button
            type="button"
            className="portal-button portal-button-secondary w-full"
            disabled={item.status === 'waived'}
            data-testid={`guide-waive-${item.id}`}
            onClick={() => void saveStatus('waived')}
          >
            Waive / Defer
          </button>
          {isClosed && (
            <button
              type="button"
              className="portal-button portal-button-secondary w-full"
              data-testid={`guide-reopen-${item.id}`}
              onClick={() => void saveStatus('missing')}
            >
              Reopen
            </button>
          )}
        </div>
      </div>
      <label className="portal-field mt-3">
        <span>Operator note or waiver reason</span>
        <input
          data-testid={`guide-note-${item.id}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Short reason, owner, or follow-up path"
        />
      </label>
    </article>
  )
}

function DealProgressionGuideView({
  guide,
  activeTab,
  onOpenSection,
  onAction,
  onChecklist,
}: {
  guide: DealProgressionGuide | null | undefined
  activeTab: WorkspaceTab
  onOpenSection: (phaseSlug: string) => void
  onAction: (action: OperatorGuideAction) => void
  onChecklist: (phaseSlug: string, checklist: Record<string, GuideChecklistStatus>, notes?: Record<string, string>) => Promise<unknown>
}) {
  const sections = guide?.sections ?? []

  return (
    <section className="space-y-4" data-testid="deal-progression-guide">
      <div className="portal-panel">
        <div className="portal-section-header">
          <div>
            <p className="portal-kicker">Deal Progression Guide</p>
            <h2 className="portal-title">What is needed next</h2>
          </div>
          <span className="status-badge status-pending">Guide v{guide?.version ?? 1}</span>
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-400">
          The guide combines required documents, source-backed fields, operator judgment, and workflow readiness so the deal can move from intake to package review without guessing what is missing.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {sections.map((section) => (
          <button
            key={section.phaseSlug}
            type="button"
            className={`border border-white/10 bg-black p-4 text-left transition-colors hover:border-white/40 ${
              activeTab === section.phaseSlug ? 'border-white/50' : ''
            }`}
            data-testid={`guide-section-card-${section.phaseSlug}`}
            onClick={() => onOpenSection(section.runtimePhase ? section.phaseSlug : 'guide')}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">{section.label}</p>
                <p className="mt-2 text-sm text-gray-300">{section.summary}</p>
              </div>
              <span className={`status-badge ${statusClass(section.readiness)}`}>{section.readiness}</span>
            </div>
            <div className="mt-3 progress-bar">
              <div className="progress-fill bg-white" style={{ width: `${section.progress}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <span className="border border-white/10 px-2 py-2 text-gray-500">{section.progress}% done</span>
              <span className="border border-white/10 px-2 py-2 text-gray-500">{section.blockingCount} blockers</span>
              <span className="border border-white/10 px-2 py-2 text-gray-500">{section.warningCount} warnings</span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {sections.map((section) => (
          <section key={section.phaseSlug} className="portal-panel" data-testid={`guide-section-${section.phaseSlug}`}>
            <div className="portal-section-header">
              <div>
                <p className="portal-kicker">{section.label}</p>
                <h3 className="portal-title">Checklist and help guide</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`status-badge ${statusClass(section.readiness)}`}>{section.readiness}</span>
                {section.workflowId && <span className="status-badge status-pending">{workflowLabel(section.workflowId)}</span>}
              </div>
            </div>
            {section.requiredDocuments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {section.requiredDocuments.map((type) => (
                  <span
                    key={type}
                    className={`status-badge ${
                      section.uploadedDocuments.includes(type) ? 'status-complete' : 'status-blocked'
                    }`}
                  >
                    {DOCUMENT_LABELS[type] ?? displaySlug(type)}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 grid gap-3">
              {section.checklist.map((item) => (
                <GuideChecklistItem
                  key={item.id}
                  section={section}
                  item={item}
                  onAction={onAction}
                  onChecklist={onChecklist}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
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
  runtimeProvider,
  onRuntimeProviderChange,
  codexMaxAgents,
  onCodexMaxAgentsChange,
  codexConcurrency,
  onCodexConcurrencyChange,
}: {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
  phase: PhaseWorkspaceStatus
  documents: SourceDocument[]
  onChecklist: (phaseSlug: string, checklist: Record<string, GuideChecklistStatus>, notes?: Record<string, string>) => Promise<unknown>
  onLaunch: (phaseSlug: string) => Promise<void>
  launching: boolean
  runtimeProvider: RuntimeProvider
  onRuntimeProviderChange: (runtimeProvider: RuntimeProvider) => void
  codexMaxAgents: number | null
  onCodexMaxAgentsChange: (maxAgents: number | null) => void
  codexConcurrency: number
  onCodexConcurrencyChange: (concurrency: number) => void
}) {
  const runtimePhase = phaseFromCheckpoint(dealCheckpoint, phase)
  const phaseDocs = documents.filter((doc) => doc.phase === phase.phaseSlug)
  const isCodexRun = runtimeProvider === 'codex'
  const coverage = phase.requiredDocuments.length === 0
    ? 100
    : Math.round((phase.uploadedDocuments.length / phase.requiredDocuments.length) * 100)

  async function toggleChecklist(itemId: string, complete: boolean): Promise<void> {
    await onChecklist(phase.phaseSlug, { [itemId]: complete ? 'complete' : 'missing' })
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
          <div className="mt-4 grid gap-3">
            <label className="portal-field">
              <span>Runtime</span>
              <select
                data-testid={`phase-runtime-provider-select-${phase.phaseSlug}`}
                value={runtimeProvider}
                onChange={(event) => onRuntimeProviderChange(event.target.value as RuntimeProvider)}
              >
                {RUNTIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {isCodexRun && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="portal-field">
                  <span>Codex Agents</span>
                  <select
                    data-testid={`phase-codex-agent-limit-select-${phase.phaseSlug}`}
                    value={typeof codexMaxAgents === 'number' && codexMaxAgents > 0 ? String(codexMaxAgents) : ''}
                    onChange={(event) =>
                      onCodexMaxAgentsChange(event.target.value === '' ? null : Number(event.target.value))
                    }
                  >
                    {CODEX_AGENT_LIMITS.map((option) => (
                      <option key={option.value || 'all'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="portal-field">
                  <span>Codex Concurrency</span>
                  <input
                    data-testid={`phase-codex-concurrency-input-${phase.phaseSlug}`}
                    type="number"
                    min={1}
                    max={4}
                    value={codexConcurrency}
                    onChange={(event) => onCodexConcurrencyChange(Math.max(1, Number(event.target.value) || 1))}
                  />
                </label>
              </div>
            )}
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

function OperatorBriefing({
  workspace,
  documents,
  onOpenDocuments,
  onFocusWorkflowLauncher,
  onOpenPhase,
  onOpenEditDetails,
}: {
  workspace: ReturnType<typeof useDealWorkspace>['workspace']
  documents: SourceDocument[]
  onOpenDocuments: () => void
  onFocusWorkflowLauncher: () => void
  onOpenPhase: (phaseSlug: string) => void
  onOpenEditDetails: () => void
}) {
  const phases = workspace?.phases ?? []
  const readiness = workspace?.launchReadiness ?? []
  const fullReview = readiness.find((entry) => entry.workflowId === 'full-acquisition-review') ?? readiness[0]
  const readyPhase = phases.find((phase) => phase.readiness === 'ready')
  const phaseWithMissingDocs = phases.find((phase) => phase.missingDocuments.length > 0)
  const readyPhaseCount = phases.filter((phase) => phase.readiness === 'ready').length
  const reviewReadyCount = documents.filter((doc) => doc.status === 'review_ready').length
  const extractionQueueCount = documents.filter((doc) =>
    doc.extractionStatus === 'not-started' ||
    doc.extractionStatus === 'extraction-pending' ||
    doc.extractionStatus === 'parser-unavailable' ||
    doc.extractionStatus === 'parse_failed'
  ).length
  const sourceCoverage = fullReview?.sourceCoverage
  const requiredSourceCount = sourceCoverage?.requiredApprovedFieldCount ?? 0
  const approvedRequiredSourceCount = Math.max(
    0,
    requiredSourceCount - (sourceCoverage?.missingApprovedFieldCount ?? 0),
  )
  const missingFieldLabels = (fullReview?.missingApprovedFields ?? []).map(fieldLabel)
  const missingDocLabels = phaseWithMissingDocs?.missingDocuments.slice(0, 4).map((type) => DOCUMENT_LABELS[type] ?? displaySlug(type)) ?? []
  const bestRunnable = readiness.find((entry) => entry.status === 'ready') ?? readiness.find((entry) => entry.status === 'warning')

  const nextAction = (() => {
    if (!workspace) {
      return {
        title: 'Load the workspace package.',
        detail: 'The cockpit is reading deal criteria, source documents, and workflow readiness.',
        cta: 'Loading',
        onClick: () => undefined,
      }
    }
    if ((fullReview?.blockers.length ?? 0) > 0) {
      return {
        title: 'Fix launch-blocking deal fields.',
        detail: fullReview?.blockers[0] ?? 'The saved deal is not launch-ready yet.',
        cta: 'Edit Details',
        onClick: onOpenEditDetails,
      }
    }
    if (documents.length === 0) {
      return {
        title: 'Upload the first source package.',
        detail: 'Start with the rent roll, T12, and offering memo so the model has operator-grade inputs.',
        cta: 'Upload Documents',
        onClick: onOpenDocuments,
      }
    }
    if (reviewReadyCount > 0) {
      return {
        title: 'Review extracted fields before launch.',
        detail: `${reviewReadyCount} document${reviewReadyCount === 1 ? '' : 's'} can be approved into source-backed deal inputs.`,
        cta: 'Review Fields',
        onClick: onOpenDocuments,
      }
    }
    if (extractionQueueCount > 0) {
      return {
        title: 'Run or resolve the extraction queue.',
        detail: `${extractionQueueCount} uploaded document${extractionQueueCount === 1 ? '' : 's'} still need extraction or operator review.`,
        cta: 'Open Documents',
        onClick: onOpenDocuments,
      }
    }
    if (missingFieldLabels.length > 0) {
      return {
        title: 'Source-back the remaining launch inputs.',
        detail: `Still missing: ${missingFieldLabels.slice(0, 3).join(', ')}${missingFieldLabels.length > 3 ? '...' : ''}.`,
        cta: 'Open Documents',
        onClick: onOpenDocuments,
      }
    }
    if (readyPhase) {
      return {
        title: `${readyPhase.label} is ready for agent work.`,
        detail: 'Open the phase playbook to confirm checklist status or run its scoped workflow.',
        cta: `Open ${readyPhase.label}`,
        onClick: () => onOpenPhase(readyPhase.phaseSlug),
      }
    }
    if (bestRunnable) {
      return {
        title: `${workflowLabel(bestRunnable.workflowId)} is runnable with current inputs.`,
        detail: 'Review runtime options, scenario, speed, and notes before launching.',
        cta: 'Launch Workflow',
        onClick: onFocusWorkflowLauncher,
      }
    }
    return {
      title: 'Complete the minimum source package.',
      detail: missingDocLabels.length > 0
        ? `Missing documents: ${missingDocLabels.join(', ')}.`
        : 'Review criteria and source documents before starting agent workflows.',
      cta: 'Open Documents',
      onClick: onOpenDocuments,
    }
  })()

  return (
    <section className="portal-panel" data-testid="operator-briefing">
      <div className="portal-section-header">
        <div>
          <p className="portal-kicker">Operator Briefing</p>
          <h2 className="portal-title">Launch Readiness</h2>
        </div>
        <span className={`status-badge ${readinessStatusClass(fullReview?.status ?? 'pending')}`}>
          {fullReview?.status ?? 'pending'}
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
        <div className="border border-white/10 bg-black p-4" data-testid="operator-next-action">
          <p className="text-xs font-semibold uppercase text-gray-500">Best next move</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{nextAction.title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-400">{nextAction.detail}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="portal-button portal-button-primary"
              onClick={nextAction.onClick}
              disabled={!workspace}
            >
              {nextAction.cta}
            </button>
            <button
              type="button"
              className="portal-button portal-button-secondary"
              onClick={onFocusWorkflowLauncher}
            >
              Workflow Launcher
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="portal-metric" data-testid="source-backed-input-score">
            <span>Source-backed inputs</span>
            <strong>{requiredSourceCount > 0 ? `${approvedRequiredSourceCount}/${requiredSourceCount}` : '--'}</strong>
          </div>
          <div className="portal-metric">
            <span>Review queue</span>
            <strong>{reviewReadyCount + extractionQueueCount}</strong>
          </div>
          <div className="portal-metric">
            <span>Phase ready</span>
            <strong>{readyPhaseCount}/{phases.length || 5}</strong>
          </div>
        </div>
      </div>

      {(fullReview || missingDocLabels.length > 0) && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {(fullReview?.blockers ?? []).slice(0, 2).map((blocker) => (
            <div key={blocker} className="border border-cre-warning/30 bg-cre-warning/10 px-3 py-3 text-sm text-cre-warning">
              {blocker}
            </div>
          ))}
          {(fullReview?.warnings ?? []).slice(0, 2).map((warning) => (
            <div key={warning} className="border border-white/10 bg-black px-3 py-3 text-sm text-gray-400">
              {warning}
            </div>
          ))}
          {missingDocLabels.length > 0 && (
            <div className="border border-white/10 bg-black px-3 py-3 text-sm text-gray-400">
              Missing phase docs: {missingDocLabels.join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {readiness.map((entry: LaunchReadinessResult) => (
          <article
            key={entry.workflowId}
            className="border border-white/10 bg-black p-3"
            data-testid={`workflow-readiness-${entry.workflowId}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">{workflowLabel(entry.workflowId)}</h3>
              <span className={`status-badge ${readinessStatusClass(entry.status)}`}>{entry.status}</span>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              {entry.sourceCoverage.missingApprovedFieldCount === 0
                ? 'Required source fields approved'
                : `${entry.sourceCoverage.missingApprovedFieldCount} source field${entry.sourceCoverage.missingApprovedFieldCount === 1 ? '' : 's'} missing`}
            </p>
            {(entry.blockers[0] || entry.warnings[0]) && (
              <p className="mt-2 line-clamp-2 text-xs text-gray-500">
                {entry.blockers[0] || entry.warnings[0]}
              </p>
            )}
          </article>
        ))}
        {readiness.length === 0 && (
          <div className="border border-white/10 bg-black p-4 text-sm text-gray-500 md:col-span-2 xl:col-span-5">
            Readiness checks will appear once the workspace service returns workflow metadata.
          </div>
        )}
      </div>
    </section>
  )
}

function Overview({
  dealCheckpoint,
  workspace,
  criteria,
  documents,
  onOpenDocuments,
  onFocusWorkflowLauncher,
  onOpenPhase,
  onOpenEditDetails,
  children,
}: {
  dealCheckpoint: DealCheckpoint
  workspace: ReturnType<typeof useDealWorkspace>['workspace']
  criteria: DealCriteria | null
  documents: SourceDocument[]
  onOpenDocuments: () => void
  onFocusWorkflowLauncher: () => void
  onOpenPhase: (phaseSlug: string) => void
  onOpenEditDetails: () => void
  children: ReactNode
}) {
  const phases = workspace?.phases ?? []
  const readyCount = phases.filter((phase) => phase.readiness === 'ready').length
  const sourceDocCount = documents.length
  return (
    <div className="space-y-4">
      <OperatorBriefing
        workspace={workspace}
        documents={documents}
        onOpenDocuments={onOpenDocuments}
        onFocusWorkflowLauncher={onFocusWorkflowLauncher}
        onOpenPhase={onOpenPhase}
        onOpenEditDetails={onOpenEditDetails}
      />
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
  initialTab,
  onOpenEditDetails,
  onLaunchStarted,
  onPresetSaved,
}: DealWorkspaceProps) {
  const initialDefaultTab: WorkspaceTab = initialTab ?? (
    /^running|starting|in_progress$/i.test(dealCheckpoint.status)
      ? 'mission'
      : /^complete|completed$/i.test(dealCheckpoint.status)
        ? 'package'
        : 'documents'
  )
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialDefaultTab)
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
  const [phaseRuntimeProvider, setPhaseRuntimeProvider] = useState<RuntimeProvider>('simulation')
  const [phaseCodexMaxAgents, setPhaseCodexMaxAgents] = useState<number | null>(1)
  const [phaseCodexConcurrency, setPhaseCodexConcurrency] = useState(1)

  useEffect(() => {
    setActiveTab(initialTab ?? (
      /^running|starting|in_progress$/i.test(dealCheckpoint.status)
        ? 'mission'
        : /^complete|completed$/i.test(dealCheckpoint.status)
          ? 'package'
          : 'documents'
    ))
  }, [dealCheckpoint.dealId, dealCheckpoint.status, initialTab])

  const phaseTabs = workspace?.phases ?? []
  const activePhase = phaseTabs.find((phase) => phase.phaseSlug === activeTab)
  const criteria = workspace?.criteria ?? null
  const documents = workspace?.documents ?? []

  const navItems = useMemo(
    () => [
      { id: 'mission', label: 'Command' },
      { id: 'documents', label: 'Evidence' },
      { id: 'agents', label: 'Deal Team' },
      { id: 'workpapers', label: 'Workpapers' },
      { id: 'package', label: 'IC Package' },
      { id: 'advanced', label: 'Controls' },
    ] as { id: WorkspaceTab; label: string }[],
    [],
  )

  async function handlePhaseLaunch(phaseSlug: string): Promise<void> {
    const workflowId = PHASE_WORKFLOW[phaseSlug] ?? 'full-acquisition-review'
    try {
      const response = await launchWorkflow(workflowId, {
        dealId: dealCheckpoint.dealId,
        scenario: criteria?.scenario ?? 'core-plus',
        speed: 'fast',
        mode: 'live',
        runtimeProvider: phaseRuntimeProvider,
        reset: false,
        codexMaxAgents: phaseRuntimeProvider === 'codex' ? phaseCodexMaxAgents : undefined,
        codexConcurrency: phaseRuntimeProvider === 'codex' ? phaseCodexConcurrency : undefined,
        requireSourceBackedInputs: true,
        notes: criteria?.notes,
      })
      const sourceCount = response.inputSnapshot?.sourceCoverage?.sourceDocumentCount
      setLaunchMessage(
        `Workflow launched: ${workflowId} / ${phaseRuntimeProvider}${
          typeof sourceCount === 'number' ? ` / ${sourceCount} source docs captured` : ''
        }${response.outputPath ? ` / output ${response.outputPath}` : ''}`,
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

  async function handleUploadFiles(files: File[]): Promise<void> {
    for (const file of files) {
      await uploadDocument(file)
    }
  }

  async function handleExtractDocuments(targetDocuments: SourceDocument[]): Promise<void> {
    for (const document of targetDocuments) {
      await extractDocument(document.documentId)
    }
  }

  function focusWorkflowLauncher(): void {
    setActiveTab('advanced')
    window.requestAnimationFrame(() => {
      document.getElementById('workspace-workflow-launcher')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function handleGuideAction(action: OperatorGuideAction): void {
    if (action.type === 'edit_details') {
      onOpenEditDetails?.(dealCheckpoint.dealId)
      return
    }
    if (action.type === 'review_package') {
      setActiveTab('package')
      return
    }
    if (action.type === 'upload_documents') {
      setActiveTab('documents')
      return
    }
    if (action.type === 'launch_workflow') {
      if (action.target === 'guide' || action.target === 'overview') {
        setActiveTab('mission')
        return
      }
      if (isWorkspaceTab(action.target) && action.target !== 'documents' && action.target !== 'package') {
        setActiveTab(action.target)
        return
      }
      focusWorkflowLauncher()
      return
    }
    if (action.target === 'guide' || action.target === 'overview') {
      setActiveTab('mission')
      return
    }
    if (isWorkspaceTab(action.target)) {
      setActiveTab(action.target)
    }
  }

  return (
    <div className="portal-shell" data-testid="operator-deal-hub">
      <section className="portal-hero">
        <div>
          <p className="portal-kicker">Agentic Acquisition Workspace</p>
          <h1>{dealCheckpoint.dealName}</h1>
          <p>
            Source documents, specialist workpapers, diligence blockers, financing paths, and committee-ready
            outputs in one controlled acquisition record.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="hub-upload-docs-button"
              className="portal-button portal-button-primary"
              onClick={() => setActiveTab('documents')}
            >
              Add Source Material
            </button>
            <button
              type="button"
              className="portal-button portal-button-secondary"
              onClick={() => setActiveTab('mission')}
            >
              Open Command
            </button>
          </div>
        </div>
        <div className="portal-hero-meta">
          <span>{dealCheckpoint.dealId}</span>
          <span>{dealCheckpoint.workflowName || 'Workflow Ready'}</span>
          <span>{dealCheckpoint.status}</span>
        </div>
      </section>

      <OperatorCommandBar
        command={workspace?.operatorCommand}
        onAction={handleGuideAction}
        hasRuntimeEvidence={dealCheckpoint.status !== 'pending' && (storyEvents.length > 0 || documentArtifacts.length > 0)}
        isCompleteRun={isCompleteStatus(dealCheckpoint.status)}
      />

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

      {!loading && (
        <section className={`grid gap-5 ${activeTab === 'mission' ? '' : 'xl:grid-cols-[minmax(0,1fr)_320px]'}`}>
          <div className="min-w-0 space-y-4">
            {activeTab === 'mission' && (
              <MissionControl
                dealCheckpoint={dealCheckpoint}
                agentCheckpoints={agentCheckpoints}
                storyEvents={storyEvents}
                documentArtifacts={documentArtifacts}
                documents={documents}
                workspace={workspace}
                onOpenDocuments={() => setActiveTab('documents')}
                onOpenAgents={() => setActiveTab('agents')}
                onOpenWorkpapers={() => setActiveTab('workpapers')}
                onOpenPackage={() => setActiveTab('package')}
                onOpenAdvanced={focusWorkflowLauncher}
              />
            )}

            {activeTab === 'documents' && (
              <div className="space-y-4">
                <DocumentIntakePanel
                  documents={documents}
                  extraction={lastExtraction}
                  working={working}
                  onUpload={uploadDocument}
                  onExtract={extractDocument}
                  onApply={applyExtraction}
                />
              </div>
            )}

            {activeTab === 'agents' && (
              <AgentTree
                dealCheckpoint={dealCheckpoint}
                agentCheckpoints={agentCheckpoints}
                plannedPhases={workspace?.phases}
              />
            )}

            {activeTab === 'workpapers' && (
              <DocumentWall documentArtifacts={documentArtifacts} />
            )}

            {activeTab === 'package' && (
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
                {/^complete$/i.test(dealCheckpoint.status) && <FinalReport dealCheckpoint={dealCheckpoint} />}
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="space-y-4">
                <Overview
                  dealCheckpoint={dealCheckpoint}
                  workspace={workspace}
                  criteria={criteria}
                  documents={documents}
                  onOpenDocuments={() => setActiveTab('documents')}
                  onFocusWorkflowLauncher={focusWorkflowLauncher}
                  onOpenPhase={(phaseSlug) => setActiveTab(phaseSlug as WorkspaceTab)}
                  onOpenEditDetails={() => onOpenEditDetails?.(dealCheckpoint.dealId)}
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
                    <div id="workspace-workflow-launcher" data-testid="workspace-workflow-launcher">
                      <WorkflowLauncher
                        deals={deals}
                        initialDealId={dealCheckpoint.dealId}
                        launchReadiness={workspace?.launchReadiness}
                        defaultRequireSourceBackedInputs
                        lockDealSelection
                        onLaunchStarted={(response) => void handleWorkspaceLaunch(response)}
                        onPresetSaved={onPresetSaved}
                        compact
                      />
                    </div>
                  </section>
                </Overview>
                <DealProgressionGuideView
                  guide={workspace?.progressionGuide}
                  activeTab={activeTab}
                  onOpenSection={(phaseSlug) => setActiveTab(phaseSlug as WorkspaceTab)}
                  onAction={handleGuideAction}
                  onChecklist={savePhaseChecklist}
                />
                <StoryNarrative storyEvents={storyEvents} />
                <TimelineView dealCheckpoint={dealCheckpoint} agentCheckpoints={agentCheckpoints} />
                {logEntries.length > 0 && <LogStream logEntries={logEntries} />}
              </div>
            )}

            {activePhase && (
              <PhaseWorkspaceView
                dealCheckpoint={dealCheckpoint}
                agentCheckpoints={agentCheckpoints}
                phase={activePhase}
                documents={documents}
                onChecklist={savePhaseChecklist}
                onLaunch={handlePhaseLaunch}
                launching={launchingWorkflowId !== null}
                runtimeProvider={phaseRuntimeProvider}
                onRuntimeProviderChange={setPhaseRuntimeProvider}
                codexMaxAgents={phaseCodexMaxAgents}
                onCodexMaxAgentsChange={setPhaseCodexMaxAgents}
                codexConcurrency={phaseCodexConcurrency}
                onCodexConcurrencyChange={setPhaseCodexConcurrency}
              />
            )}
          </div>

          {activeTab !== 'mission' && (
            <DealCockpitSidebar
              workspace={workspace}
              documents={documents}
              dealCheckpoint={dealCheckpoint}
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab === 'overview' || tab === 'guide' ? 'advanced' : tab as WorkspaceTab)}
              onUploadFiles={(files) => void handleUploadFiles(files)}
              onExtractDocuments={(targetDocuments) => void handleExtractDocuments(targetDocuments)}
              onOpenEditDetails={() => onOpenEditDetails?.(dealCheckpoint.dealId)}
            />
          )}
        </section>
      )}
    </div>
  )
}
