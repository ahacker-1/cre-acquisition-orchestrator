import { Suspense, lazy, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import AgentTree from './AgentTree'
import DecisionLog from './DecisionLog'
import DocumentWall from './DocumentWall'
import FinalReport from './FinalReport'
import FindingsPanel from './FindingsPanel'
import GuidedDemoTour from './GuidedDemoTour'
import LogStream from './LogStream'
import PhaseDetail from './PhaseDetail'
import PipelineView from './PipelineView'
import StoryNarrative from './StoryNarrative'
import TimelineView from './TimelineView'
import { useDealWorkspace } from '../hooks/useDealWorkspace'
import { useWorkflows, LaunchValidationError } from '../hooks/useWorkflows'
import { collectFailedAgents, recoveryRunId, retryFailedAgents } from '../lib/runRecovery'
import WorkspaceFrame from './workspace/WorkspaceFrame'
import IntakeStage from './workspace/stages/IntakeStage'
import AgentPanel from './workspace/AgentPanel'
import type { ProofPathStep } from './ProofPathStrip'
import { buildDealRecordGroups, coerceEditValue, countNeedsEye } from '../lib/dealRecordModel'
import { buildAgentPanelView } from '../lib/agentView'
import { routeIntent } from '../lib/intentRouting'
import { useAgentDispatch } from '../hooks/useAgentDispatch'
import { API_URL } from '../config'
import type { TeamAgentView } from './workspace/TeamRail'
import {
  deriveSpineStages,
  INGESTION_TEAM,
  intakeSummaryFromDocuments,
  type StageId,
  type StageStatus,
} from '../lib/stageModel'
import { suggestionsForStage, type CommandSuggestion } from '../lib/commandModel'
import type {
  AgentCheckpoint,
  DealCheckpoint,
  DocumentArtifact,
  LogEntry,
  RuntimeProvider,
  StoryEvent,
} from '../types/checkpoint'
import type { DealLibraryItem, DealValidationIssue } from '../types/deals'
import type {
  DealCriteria,
  DealProgressionGuide,
  DealProgressionSection,
  ExtractionField,
  ExtractionPreview,
  ExtractionReviewStatus,
  GuideChecklistStatus,
  LaunchReadinessResult,
  OperatorGuideAction,
  PhaseWorkspaceStatus,
  SourceDocument,
  SourceReference,
  UploadedColumnProfile,
  UploadedDataProfile,
  UploadedDataRow,
  UploadedDataTable,
} from '../types/workspace'
import type { WorkflowLaunchResponse, WorkflowPreset } from '../types/workflows'

const CompletionPackage = lazy(() => import('./CompletionPackage'))
const MissionControl = lazy(() => import('./MissionControl'))
const WorkflowLauncher = lazy(() => import('./WorkflowLauncher'))

interface DealWorkspaceProps {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
  liveDealCheckpoint?: DealCheckpoint | null
  liveAgentCheckpoints?: Map<string, AgentCheckpoint>
  logEntries: LogEntry[]
  storyEvents: StoryEvent[]
  documentArtifacts: DocumentArtifact[]
  deals: DealLibraryItem[]
  initialTab?: WorkspaceTab
  startGuidedDemo?: boolean
  onGuidedDemoConsumed?: () => void
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

function defaultWorkspaceTab(status: string, initialTab?: WorkspaceTab): WorkspaceTab {
  return initialTab ?? (
    /^running|starting|in_progress$/i.test(status)
      ? 'mission'
      : isCompleteStatus(status)
        ? 'package'
        : 'documents'
  )
}

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

// One-line status of the ingestion agents for the Intake stage. Derived from document
// extraction state (no live agent run is required to read documents): pending parses read as
// "working", applied/review-ready docs as "filed", failures surface for the operator.
function deriveIntakeAgentsLine(documents: SourceDocument[]): string {
  if (documents.length === 0) {
    return 'Document Orchestrator is standing by. Drop a rent roll, T12, or offering memo to put the parsers to work.'
  }
  const pending = documents.filter(
    (doc) => doc.extractionStatus === 'extraction-pending' || doc.status === 'uploaded' || doc.status === 'parsed',
  ).length
  const readable = documents.filter((doc) => doc.status === 'review_ready' || doc.status === 'applied').length
  const failed = documents.filter(
    (doc) => doc.extractionStatus === 'parse_failed' || doc.extractionStatus === 'parser-unavailable' || doc.status === 'rejected',
  ).length
  const parts: string[] = []
  if (readable > 0) parts.push(`${readable} document${readable === 1 ? '' : 's'} read into the record`)
  if (pending > 0) parts.push(`${pending} still parsing`)
  if (failed > 0) parts.push(`${failed} need a closer look`)
  if (parts.length === 0) {
    return `Document Orchestrator routed ${documents.length} file${documents.length === 1 ? '' : 's'} to its parsers.`
  }
  return `Document Orchestrator + parsers: ${parts.join(', ')}.`
}

function WorkspacePanelSkeleton({ label }: { label: string }) {
  return (
    <div className="portal-panel animate-pulse">
      <div className="h-4 w-44 bg-white/10" />
      <div className="mt-4 h-28 bg-white/5" />
      <p className="mt-3 text-sm text-gray-500">{label}</p>
    </div>
  )
}

const RUNTIME_OPTIONS: { value: RuntimeProvider; label: string }[] = [
  { value: 'codex', label: 'Codex / ChatGPT' },
  { value: 'simulation', label: 'Simulation Demo' },
]

const CODEX_AGENT_LIMITS: { value: string; label: string }[] = [
  { value: '', label: 'All selected' },
  { value: '1', label: '1 agent' },
  { value: '2', label: '2 agents' },
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
  return /^(complete|completed)$/i.test(status)
}

// W72: a run is still active (so re-running failed agents would conflict) when the
// deal checkpoint reports a running/starting status.
function isRunActive(dealCheckpoint: DealCheckpoint): boolean {
  return /^running|starting|in_progress|stopping$/i.test(dealCheckpoint.status)
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

function buildProofPathSteps(
  documents: SourceDocument[],
  approvedFieldCount: number,
  workpaperCount: number,
  packageStatus: StageStatus,
): ProofPathStep[] {
  const packageReady = packageStatus === 'done'
  const packageDetail =
    packageStatus === 'done'
      ? 'Complete'
      : packageStatus === 'live'
        ? 'In progress'
        : packageStatus === 'blocked'
          ? 'Blocked'
          : 'Pending'
  return [
    {
      key: 'source-doc',
      label: 'Source doc',
      status: documents.length > 0 ? 'ready' : 'pending',
      detail: documents.length > 0 ? `${documents.length} uploaded` : 'Pending',
    },
    {
      key: 'approved-field',
      label: 'Approved field',
      status: approvedFieldCount > 0 ? 'ready' : 'pending',
      detail: approvedFieldCount > 0 ? `${approvedFieldCount} approved` : 'Pending',
    },
    {
      key: 'agent-workpaper',
      label: 'Agent workpaper',
      status: workpaperCount > 0 ? 'ready' : 'pending',
      detail: workpaperCount > 0 ? `${workpaperCount} filed` : 'Pending',
    },
    {
      key: 'ic-package',
      label: 'IC package',
      status: packageReady ? 'ready' : 'pending',
      detail: packageDetail,
    },
  ]
}

function downloadSafeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deal'
}

function downloadTextFile(fileName: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function sourceLabel(field: ExtractionField): string {
  const location = field.sourceRef?.location
  if (location?.sheet && location?.row) return `${location.sheet} row ${location.row}`
  if (location?.row) return `row ${location.row}`
  if (location?.line) return `line ${location.line}`
  if (location?.page) return `page ${location.page}`
  return field.source
}

function sourceEvidence(field: ExtractionField): string[] {
  const sourceRef = field.sourceRef
  const location = sourceRef?.location
  const parts: string[] = []
  if (sourceRef?.parserId) {
    parts.push(`Parser ${sourceRef.parserId}${sourceRef.parserVersion ? ` v${sourceRef.parserVersion}` : ''}`)
  }
  if (sourceRef?.fileHash) parts.push(`Hash ${sourceRef.fileHash.slice(0, 10)}`)
  if (location?.sheet) parts.push(`Sheet ${location.sheet}`)
  if (location?.row) parts.push(`Row ${location.row}`)
  if (location?.column) parts.push(`Column ${location.column}`)
  if (location?.line) parts.push(`Line ${location.line}`)
  if (location?.page) parts.push(`Page ${location.page}`)
  return parts
}

// W42: structured, human-readable location of the originating source row/cell/line/page.
function formatSourceLocation(location: SourceReference['location'] | undefined): string {
  if (!location) return ''
  const parts: string[] = []
  if (location.sheet) parts.push(`Sheet ${location.sheet}`)
  if (typeof location.row === 'number') parts.push(`Row ${location.row}`)
  if (location.column) parts.push(`Column ${location.column}`)
  if (typeof location.line === 'number') parts.push(`Line ${location.line}`)
  if (typeof location.page === 'number') parts.push(`Page ${location.page}`)
  if (location.description) parts.push(location.description)
  return parts.join(' / ')
}

// W42: Field-level provenance deep link. From an approved/applied input the operator
// can drill into the originating source row/cell/line and read the stored raw snippet
// plus its structured location. Uses the existing sourceRef.raw / location data.
function FieldSourceDrilldown({ field }: { field: ExtractionField }) {
  const [open, setOpen] = useState(false)
  const sourceRef = field.sourceRef
  if (!sourceRef) return null
  const locationText = formatSourceLocation(sourceRef.location)
  const raw = sourceRef.raw
  // Nothing to drill into if neither a raw snippet nor a structured location exists.
  if (!raw && !locationText) return null

  return (
    <span className="mt-2 block">
      <button
        type="button"
        data-testid={`source-drilldown-toggle-${field.fieldId}`}
        aria-expanded={open}
        className="portal-button portal-button-secondary min-h-8 px-2 py-1 text-[11px]"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? 'Hide source row' : 'Drill into source row'}
      </button>
      {open && (
        <span
          className="mt-2 block border border-white/10 bg-black px-3 py-2 text-xs text-gray-300"
          data-testid={`source-drilldown-${field.fieldId}`}
        >
          <span className="block font-semibold uppercase tracking-[0.14em] text-gray-500">
            Originating source
          </span>
          <span className="mt-1 block text-gray-300" data-testid={`source-drilldown-file-${field.fieldId}`}>
            {sourceRef.fileName}
          </span>
          {locationText && (
            <span
              className="mt-1 block font-mono text-[11px] text-gray-400"
              data-testid={`source-drilldown-location-${field.fieldId}`}
            >
              {locationText}
            </span>
          )}
          {raw && (
            <span
              className="mt-2 block whitespace-pre-wrap break-words rounded bg-white/5 px-2 py-1 font-mono text-[11px] text-gray-200"
              data-testid={`source-drilldown-snippet-${field.fieldId}`}
            >
              {raw}
            </span>
          )}
          <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-gray-600">
            Parser {sourceRef.parserId}
            {sourceRef.parserVersion ? ` v${sourceRef.parserVersion}` : ''}
            {sourceRef.fileHash ? ` / hash ${sourceRef.fileHash.slice(0, 10)}` : ''}
          </span>
        </span>
      )}
    </span>
  )
}

function uploadedTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'field'
}

function formatFillRate(value: number): string {
  return `${Math.round(value * 100)}%`
}

function uploadedCellValue(value: string | undefined): string {
  const normalized = value?.trim() ?? ''
  // Strip the Excel/Sheets leading-apostrophe text qualifier, but only when the
  // remaining cell is numeric-looking (e.g. "'-3200" -> "-3200"). Genuine string
  // values that happen to start with an apostrophe are left untouched.
  const dequalified =
    normalized.startsWith("'") && /^-?[\d,]*\.?\d+%?$/.test(normalized.slice(1))
      ? normalized.slice(1)
      : normalized
  return dequalified.length > 0 ? dequalified : 'blank'
}

function UploadedColumnCard({
  column,
  selected,
  onSelect,
}: {
  column: UploadedColumnProfile
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      data-testid={`uploaded-field-${column.columnId || uploadedTestId(column.name)}`}
      className={`w-full border px-3 py-2 text-left transition-colors ${
        selected ? 'border-white bg-white/10' : 'border-white/10 bg-black hover:border-white/30'
      }`}
      onClick={onSelect}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-white">{column.name}</span>
        <span className="status-badge status-pending shrink-0">{column.valueType}</span>
      </span>
      <span className="mt-2 grid grid-cols-3 gap-2 text-[11px] uppercase tracking-[0.1em] text-gray-500">
        <span>{formatFillRate(column.fillRate)} filled</span>
        <span>{column.uniqueCount} unique</span>
        <span>{column.missingCount} blank</span>
      </span>
    </button>
  )
}

function UploadedDataGrid({
  table,
  selectedColumn,
  selectedRow,
  onSelectColumn,
  onSelectRow,
}: {
  table: UploadedDataTable
  selectedColumn: UploadedColumnProfile | null
  selectedRow: UploadedDataRow | null
  onSelectColumn: (column: UploadedColumnProfile) => void
  onSelectRow: (row: UploadedDataRow) => void
}) {
  return (
    <div className="min-w-0 overflow-auto border border-white/10 bg-black" data-testid="uploaded-row-grid">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="bg-white/[0.04] text-gray-500">
          <tr>
            <th className="sticky left-0 z-10 border-b border-r border-white/10 bg-[#080808] px-3 py-2 font-semibold uppercase tracking-[0.1em]">
              Row
            </th>
            {table.columns.map((column) => (
              <th key={column.name} className="min-w-36 border-b border-r border-white/10 px-3 py-2 font-semibold uppercase tracking-[0.1em]">
                <button
                  type="button"
                  className={`max-w-48 truncate text-left ${selectedColumn?.name === column.name ? 'text-white' : 'text-gray-500 hover:text-gray-200'}`}
                  onClick={() => onSelectColumn(column)}
                >
                  {column.name}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => {
            const active = selectedRow?.rowNumber === row.rowNumber
            return (
              <tr
                key={row.rowNumber}
                className={active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'}
                data-testid={`uploaded-row-${row.rowNumber}`}
                onClick={() => onSelectRow(row)}
              >
                <td className="sticky left-0 z-10 border-r border-t border-white/10 bg-[#080808] px-3 py-2 font-mono text-gray-400">
                  <button
                    type="button"
                    className={active ? 'text-white' : 'hover:text-gray-200'}
                    onClick={() => onSelectRow(row)}
                  >
                    {row.rowNumber}
                  </button>
                </td>
                {table.columns.map((column) => (
                  <td
                    key={`${row.rowNumber}-${column.name}`}
                    className={`max-w-64 border-r border-t border-white/10 px-3 py-2 font-mono ${
                      selectedColumn?.name === column.name ? 'text-white' : 'text-gray-400'
                    }`}
                  >
                    <button
                      type="button"
                      className="block max-w-56 truncate text-left"
                      onClick={() => {
                        onSelectColumn(column)
                        onSelectRow(row)
                      }}
                    >
                      {uploadedCellValue(row.values[column.name])}
                    </button>
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function UploadedDetailPanel({
  table,
  selectedColumn,
  selectedRow,
}: {
  table: UploadedDataTable
  selectedColumn: UploadedColumnProfile | null
  selectedRow: UploadedDataRow | null
}) {
  return (
    <aside className="border border-white/10 bg-black p-3" data-testid="uploaded-detail-panel">
      <p className="portal-kicker">Detail</p>
      {selectedColumn ? (
        <div className="mt-3 border-b border-white/10 pb-3" data-testid="uploaded-field-detail">
          <p className="text-sm font-semibold text-white">{selectedColumn.name}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
            <span>Type: {selectedColumn.valueType}</span>
            <span>Filled: {formatFillRate(selectedColumn.fillRate)}</span>
            <span>Unique: {selectedColumn.uniqueCount}</span>
            <span>Blank: {selectedColumn.missingCount}</span>
          </div>
          {selectedColumn.examples.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedColumn.examples.map((example) => (
                <span key={example} className="border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-gray-300">
                  {example}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">No fields available.</p>
      )}

      {selectedRow ? (
        <div className="mt-3" data-testid="uploaded-row-detail">
          <p className="text-sm font-semibold text-white">Row {selectedRow.rowNumber}</p>
          <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
            {table.columns.map((column) => (
              <div key={`${selectedRow.rowNumber}-${column.name}-detail`} className="border-b border-white/10 pb-2 last:border-b-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-600">{column.name}</p>
                <p className="mt-1 break-words font-mono text-xs text-gray-300">{uploadedCellValue(selectedRow.values[column.name])}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">No rows available.</p>
      )}
    </aside>
  )
}

function UploadedDataInspector({ uploadedData }: { uploadedData?: UploadedDataProfile }) {
  const tables = uploadedData?.tables ?? []
  const [activeTableId, setActiveTableId] = useState('')
  const [fieldQuery, setFieldQuery] = useState('')
  const [selectedColumnName, setSelectedColumnName] = useState('')
  const [selectedRowNumber, setSelectedRowNumber] = useState<number | null>(null)

  useEffect(() => {
    const firstTable = tables[0]
    setActiveTableId(firstTable?.tableId ?? '')
    setSelectedColumnName(firstTable?.columns[0]?.name ?? '')
    setSelectedRowNumber(firstTable?.rows[0]?.rowNumber ?? null)
    setFieldQuery('')
  }, [uploadedData?.generatedAt, uploadedData?.rowCount, uploadedData?.columnCount])

  if (!uploadedData || tables.length === 0) return null

  const activeTable = tables.find((table) => table.tableId === activeTableId) ?? tables[0]
  const filteredColumns = activeTable.columns.filter((column) =>
    column.name.toLowerCase().includes(fieldQuery.trim().toLowerCase()),
  )
  const selectedColumn = activeTable.columns.find((column) => column.name === selectedColumnName) ?? activeTable.columns[0] ?? null
  const selectedRow = activeTable.rows.find((row) => row.rowNumber === selectedRowNumber) ?? activeTable.rows[0] ?? null

  return (
    <section className="mt-4 border border-white/10 bg-[#050505] p-4" data-testid="uploaded-data-inspector">
      <div className="portal-section-header">
        <div>
          <p className="portal-kicker">Uploaded Data Inspector</p>
          <h3 className="portal-title text-xl">{uploadedData.columnCount} Fields / {uploadedData.rowCount} Rows</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {tables.map((table) => (
            <button
              key={table.tableId}
              type="button"
              className={`portal-button min-h-9 px-3 py-1 ${table.tableId === activeTable.tableId ? 'portal-button-primary' : 'portal-button-secondary'}`}
              onClick={() => {
                setActiveTableId(table.tableId)
                setSelectedColumnName(table.columns[0]?.name ?? '')
                setSelectedRowNumber(table.rows[0]?.rowNumber ?? null)
              }}
            >
              {table.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="portal-stat">
          <strong>{activeTable.columnCount}</strong>
          <span>Fields</span>
        </div>
        <div className="portal-stat">
          <strong>{activeTable.rowCount}</strong>
          <span>Rows</span>
        </div>
        <div className="portal-stat">
          <strong>{activeTable.truncated ? activeTable.rows.length : activeTable.rowCount}</strong>
          <span>{activeTable.truncated ? 'Rows Shown' : 'Rows Loaded'}</span>
        </div>
      </div>

      {activeTable.source?.sheet && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-gray-600">
          Sheet {activeTable.source.sheet}
          {activeTable.source.headerRow ? ` / Header row ${activeTable.source.headerRow}` : ''}
        </p>
      )}

      {uploadedData.issues.length > 0 && (
        <div className="mt-3 space-y-1" data-testid="uploaded-data-issues">
          {uploadedData.issues.map((issue) => (
            <p key={issue} className="border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              {issue}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 2xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <label className="portal-field">
            <span>Find Fields</span>
            <input
              data-testid="uploaded-field-search"
              value={fieldQuery}
              onChange={(event) => setFieldQuery(event.target.value)}
              placeholder="Column name"
            />
          </label>
          <div className="max-h-[28rem] space-y-2 overflow-auto pr-1" data-testid="uploaded-field-list">
            {filteredColumns.length === 0 ? (
              <p className="border border-white/10 bg-black px-3 py-2 text-sm text-gray-500">No matching fields.</p>
            ) : (
              filteredColumns.map((column) => (
                <UploadedColumnCard
                  key={column.name}
                  column={column}
                  selected={selectedColumn?.name === column.name}
                  onSelect={() => setSelectedColumnName(column.name)}
                />
              ))
            )}
          </div>
        </div>

        <UploadedDataGrid
          table={activeTable}
          selectedColumn={selectedColumn}
          selectedRow={selectedRow}
          onSelectColumn={(column) => setSelectedColumnName(column.name)}
          onSelectRow={(row) => setSelectedRowNumber(row.rowNumber)}
        />

        <UploadedDetailPanel table={activeTable} selectedColumn={selectedColumn} selectedRow={selectedRow} />
      </div>
    </section>
  )
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
  onReview,
}: {
  extraction: ExtractionPreview | null
  onApply: (documentId: string, fieldIds: string[], allowConflicts?: boolean) => Promise<void>
  onReview: (
    documentId: string,
    fieldIds: string[],
    reviewStatus: Extract<ExtractionReviewStatus, 'rejected' | 'waived'>,
    note?: string,
  ) => Promise<void>
}) {
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([])
  const [confirmConflicts, setConfirmConflicts] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  useEffect(() => {
    setSelectedFieldIds([])
    setConfirmConflicts(false)
    setReviewNote('')
    setSubmittingReview(false)
  }, [extraction])

  if (!extraction) {
    return (
      <div className="portal-panel">
        <p className="portal-kicker">Extraction Preview</p>
        <p className="text-sm text-gray-500 mt-3">
          Upload a CSV, TXT, markdown, XLSX, or PDF source document and run extraction to review source-backed candidate fields here. Readable scanned PDFs route through local OCR and stay review-gated.
        </p>
      </div>
    )
  }
  const selectedFields = extraction.fields.filter((field) => selectedFieldIds.includes(field.fieldId))
  const extractionDocumentId = extraction.documentId
  const selectableFields = extraction.fields.filter((field) =>
    !field.validationIssues?.length &&
    field.reviewStatus !== 'applied' &&
    field.reviewStatus !== 'rejected' &&
    field.reviewStatus !== 'waived'
  )
  const selectedConflictCount = selectedFields.filter((field) => field.conflict).length
  const canApply = selectedFieldIds.length > 0 && (selectedConflictCount === 0 || confirmConflicts)
  const selectedReviewableCount = selectedFields.filter((field) =>
    field.reviewStatus !== 'applied' &&
    field.reviewStatus !== 'rejected' &&
    field.reviewStatus !== 'waived'
  ).length
  async function handleReview(reviewStatus: Extract<ExtractionReviewStatus, 'rejected' | 'waived'>): Promise<void> {
    setSubmittingReview(true)
    try {
      await onReview(extractionDocumentId, selectedFieldIds, reviewStatus, reviewNote)
      setSelectedFieldIds([])
      setReviewNote('')
    } finally {
      setSubmittingReview(false)
    }
  }

  async function handleApply(): Promise<void> {
    setSubmittingReview(true)
    try {
      await onApply(extractionDocumentId, selectedFieldIds, selectedConflictCount > 0 && confirmConflicts)
    } finally {
      setSubmittingReview(false)
    }
  }

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
        <div className="mt-3 space-y-1">
          {extraction.notes.slice(0, 3).map((note) => (
            <p key={note} className="text-sm text-gray-400">{note}</p>
          ))}
        </div>
      )}
      {extraction.error && (
        <p className="mt-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{extraction.error}</p>
      )}
      <UploadedDataInspector uploadedData={extraction.uploadedData} />
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
            const reviewLocked = field.reviewStatus === 'applied' || field.reviewStatus === 'rejected' || field.reviewStatus === 'waived'
            return (
            <label key={field.fieldId} className="flex items-center gap-3 border border-white/10 bg-black px-3 py-3 text-sm">
              <input
                type="checkbox"
                data-testid={`extraction-field-${field.fieldId}`}
                data-field-path={field.path}
                className="h-4 w-4 accent-white"
                disabled={blocked || reviewLocked}
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
                  {field.reviewStatus && field.reviewStatus !== 'candidate' && (
                    <span className={`status-badge ${statusClass(field.reviewStatus)}`}>
                      {field.reviewStatus}
                    </span>
                  )}
                </span>
                <span className="block font-mono text-xs text-gray-500">{field.path}</span>
                <span className="mt-1 block text-xs text-gray-500">
                  Source {sourceLabel(field)} / confidence {Math.round(field.confidence * 100)}%
                  {field.currentValue !== undefined ? ` / current ${fieldValue(field.currentValue)}` : ''}
                </span>
                {sourceEvidence(field).length > 0 && (
                  <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-gray-600" data-testid={`source-evidence-${field.fieldId}`}>
                    {sourceEvidence(field).join(' / ')}
                  </span>
                )}
                <FieldSourceDrilldown field={field} />
                {field.validationIssues?.map((issue) => (
                  <span key={issue} className="mt-1 block text-xs text-red-200">{issue}</span>
                ))}
                {field.reviewNote && (
                  <span className="mt-1 block text-xs text-gray-600">Review note: {field.reviewNote}</span>
                )}
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
      {selectedFieldIds.length > 0 && (
        <label className="portal-field mt-4">
          <span>Review Note</span>
          <input
            data-testid="extraction-review-note"
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Why these fields were rejected or waived."
          />
        </label>
      )}
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <button
          type="button"
          data-testid="apply-extraction"
          disabled={submittingReview || extraction.fields.length === 0 || !canApply}
          onClick={() => void handleApply()}
          className="portal-button portal-button-primary w-full"
        >
          {selectedFieldIds.length === 0
            ? 'Select Fields To Approve'
            : selectedConflictCount > 0
              ? confirmConflicts
                ? `Approve ${selectedConflictCount} Conflict${selectedConflictCount === 1 ? '' : 's'}`
                : 'Confirm Conflicts'
              : 'Approve & Apply'}
        </button>
        <button
          type="button"
          data-testid="reject-extraction-fields"
          disabled={submittingReview || selectedReviewableCount === 0}
          onClick={() => void handleReview('rejected')}
          className="portal-button portal-button-secondary w-full"
        >
          Reject Selected
        </button>
        <button
          type="button"
          data-testid="waive-extraction-fields"
          disabled={submittingReview || selectedReviewableCount === 0}
          onClick={() => void handleReview('waived')}
          className="portal-button portal-button-secondary w-full"
        >
          Waive Selected
        </button>
      </div>
    </div>
  )
}

function DocumentIntakePanel({
  documents,
  extraction,
  working,
  onUpload,
  onExtract,
  onLoadExtraction,
  onApply,
  onReview,
}: {
  documents: SourceDocument[]
  extraction: ExtractionPreview | null
  working: boolean
  onUpload: (file: File) => Promise<SourceDocument>
  onExtract: (documentId: string) => Promise<ExtractionPreview>
  onLoadExtraction: (documentId: string) => Promise<ExtractionPreview>
  onApply: (documentId: string, fieldIds: string[], allowConflicts?: boolean) => Promise<void>
  onReview: (
    documentId: string,
    fieldIds: string[],
    reviewStatus: Extract<ExtractionReviewStatus, 'rejected' | 'waived'>,
    note?: string,
  ) => Promise<void>
}) {
  const [autoLoadedDocumentId, setAutoLoadedDocumentId] = useState<string | null>(null)

  useEffect(() => {
    if (extraction || working) return
    const reviewReadyDocument = documents.find((doc) => doc.status === 'review_ready' || doc.status === 'applied')
    if (!reviewReadyDocument || reviewReadyDocument.documentId === autoLoadedDocumentId) return
    setAutoLoadedDocumentId(reviewReadyDocument.documentId)
    void onLoadExtraction(reviewReadyDocument.documentId)
  }, [autoLoadedDocumentId, documents, extraction, onLoadExtraction, working])

  function documentAction(doc: SourceDocument): {
    label: string
    disabled: boolean
    onClick: () => void
  } {
    if (doc.status === 'review_ready') {
      return {
        label: 'Review Fields',
        disabled: working,
        onClick: () => void onLoadExtraction(doc.documentId),
      }
    }
    if (doc.status === 'applied') {
      return {
        label: 'View Applied Evidence',
        disabled: working,
        onClick: () => void onLoadExtraction(doc.documentId),
      }
    }
    if (doc.status === 'approved' || doc.status === 'rejected' || doc.status === 'waived') {
      return {
        label: 'View Review Decision',
        disabled: working,
        onClick: () => void onLoadExtraction(doc.documentId),
      }
    }
    if (doc.extractionStatus === 'extraction-pending') {
      return {
        label: 'Extraction Pending',
        disabled: true,
        onClick: () => undefined,
      }
    }
    if (doc.extractionStatus === 'parser-unavailable') {
      return {
        label: 'Parser Unavailable',
        disabled: true,
        onClick: () => undefined,
      }
    }
    if (doc.extractionStatus === 'parse_failed') {
      return {
        label: 'Re-run Extraction',
        disabled: working,
        onClick: () => void onExtract(doc.documentId),
      }
    }
    if (doc.extractionStatus === 'unsupported') {
      return {
        label: 'Unsupported File',
        disabled: true,
        onClick: () => undefined,
      }
    }
    return {
      label: 'Preview Extraction',
      disabled: working,
      onClick: () => void onExtract(doc.documentId),
    }
  }

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
            documents.map((doc) => {
              const action = documentAction(doc)
              return (
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
                {doc.lifecycleReason && (
                  <p className="mt-2 text-xs text-gray-500">{doc.lifecycleReason}</p>
                )}
                <button
                  type="button"
                  data-testid={`extract-document-${doc.type}`}
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className="portal-button portal-button-secondary mt-4 w-full"
                >
                  {action.label}
                </button>
              </article>
              )
            })
          )}
        </div>
      </div>
      <ExtractionPreviewPanel extraction={extraction} onApply={onApply} onReview={onReview} />
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
  launchBlockers = [],
  onEditDeal,
  runtimeProvider,
  onRuntimeProviderChange,
  codexMaxAgents,
  onCodexMaxAgentsChange,
  codexConcurrency,
  onCodexConcurrencyChange,
  onOpenAgent,
}: {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
  phase: PhaseWorkspaceStatus
  documents: SourceDocument[]
  onChecklist: (phaseSlug: string, checklist: Record<string, GuideChecklistStatus>, notes?: Record<string, string>) => Promise<unknown>
  onLaunch: (phaseSlug: string) => Promise<void>
  launching: boolean
  launchBlockers?: DealValidationIssue[]
  onEditDeal?: () => void
  runtimeProvider: RuntimeProvider
  onRuntimeProviderChange: (runtimeProvider: RuntimeProvider) => void
  codexMaxAgents: number | null
  onCodexMaxAgentsChange: (maxAgents: number | null) => void
  codexConcurrency: number
  onCodexConcurrencyChange: (concurrency: number) => void
  // Phase 3 (A5): clicking an agent opens its panel (summon → watch → read → re-task).
  onOpenAgent?: (agentId: string) => void
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
            {launching ? 'Launching Workflow' : isCodexRun ? 'Run Phase with Codex' : 'Run Phase Demo'}
          </button>
          {launchBlockers.length > 0 && (
            <div
              className="mt-3 border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-sm text-amber-100"
              data-testid={`phase-launch-blocked-${phase.phaseSlug}`}
            >
              <p className="font-semibold">Launch blocked — this deal is not launch ready.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                {launchBlockers.map((issue, index) => (
                  <li key={issue.path || index}>
                    {issue.path ? (
                      <>
                        <span className="font-medium">{fieldLabel(issue.path)}</span> — {issue.message}
                      </>
                    ) : (
                      issue.message
                    )}
                  </li>
                ))}
              </ul>
              {onEditDeal && (
                <button
                  type="button"
                  data-testid={`phase-launch-blocked-edit-${phase.phaseSlug}`}
                  onClick={onEditDeal}
                  className="portal-button portal-button-secondary mt-3 px-3 py-1"
                >
                  Open Edit Deal
                </button>
              )}
            </div>
          )}
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
              <article
                key={agent.agentId}
                className={`border border-white/10 bg-black p-3 ${
                  onOpenAgent ? 'cursor-pointer transition-colors hover:border-white/40' : ''
                }`}
                data-testid={`phase-agent-${agent.agentId}`}
                {...(onOpenAgent
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => onOpenAgent(agent.agentId),
                      onKeyDown: (event: ReactKeyboardEvent) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onOpenAgent(agent.agentId)
                        }
                      },
                    }
                  : {})}
              >
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
              data-testid="operator-next-action-primary"
              className="portal-button portal-button-primary"
              onClick={nextAction.onClick}
              disabled={!workspace}
            >
              {nextAction.cta}
            </button>
            <button
              type="button"
              data-testid="operator-next-action-workflow-launcher"
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

// W72: Operator-visible partial-failure recovery. Surfaces failed specialist agents
// from a run and offers a one-click "Retry failed agents" action wired to the run API
// (codexRerunFailed / codexRerunRunId). Renders nothing when there are no failures.
function PartialFailureRecovery({
  dealCheckpoint,
  agentCheckpoints,
  storyEvents,
  dealPath,
  runActive,
}: {
  dealCheckpoint: DealCheckpoint
  agentCheckpoints: Map<string, AgentCheckpoint>
  storyEvents: StoryEvent[]
  dealPath: string | null
  runActive: boolean
}) {
  const failedAgents = useMemo(
    () => collectFailedAgents(dealCheckpoint, agentCheckpoints, storyEvents),
    [dealCheckpoint, agentCheckpoints, storyEvents],
  )
  const rerunRunId = useMemo(() => recoveryRunId(storyEvents, dealCheckpoint), [dealCheckpoint, storyEvents])
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (failedAgents.length === 0) return null

  const canRetry = Boolean(dealPath && rerunRunId) && !runActive && !working

  async function handleRetry(): Promise<void> {
    if (!dealPath || !rerunRunId) return
    setWorking(true)
    setMessage(null)
    try {
      const result = await retryFailedAgents({
        dealPath,
        runId: rerunRunId,
        workflowId: dealCheckpoint.workflowId,
        scenario: 'core-plus',
      })
      setMessage(`Retrying ${failedAgents.length} failed agent${failedAgents.length === 1 ? '' : 's'} on run ${result.runId ?? rerunRunId}.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="portal-panel border border-cre-danger/40" data-testid="partial-failure-recovery">
      <div className="portal-section-header">
        <div>
          <p className="portal-kicker">Partial Run Recovery</p>
          <h2 className="portal-title">
            {failedAgents.length} specialist{failedAgents.length === 1 ? '' : 's'} failed
          </h2>
        </div>
        <span className="status-badge status-blocked" data-testid="partial-failure-outcome">partial</span>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
        The run finished with failed agents. Re-run only the failed specialists without restarting the
        whole workflow. Completed workpapers are preserved.
      </p>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {failedAgents.map((agent) => (
          <li
            key={agent.agentName}
            className="border border-white/10 bg-black px-3 py-2 text-sm"
            data-testid={`failed-agent-${agent.agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
          >
            <span className="block font-semibold text-gray-200">{agent.agentName}</span>
            <span className="block text-xs uppercase tracking-[0.14em] text-gray-500">{displaySlug(agent.phase)}</span>
            {agent.reason && <span className="mt-1 block text-xs text-gray-500">{agent.reason}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="retry-failed-agents"
          className="portal-button portal-button-primary"
          disabled={!canRetry}
          onClick={() => void handleRetry()}
        >
          {working ? 'Retrying' : 'Retry failed agents'}
        </button>
        {!rerunRunId && (
          <span className="text-xs text-gray-500" data-testid="partial-failure-no-run">
            No prior run id available to re-run from.
          </span>
        )}
        {message && (
          <span className="text-xs uppercase tracking-[0.14em] text-gray-400" data-testid="partial-failure-status">
            {message}
          </span>
        )}
      </div>
    </section>
  )
}

// Maps between the new lifecycle stages and the retained internal `activeTab` selector.
const STAGE_TO_TAB: Record<StageId, WorkspaceTab> = {
  intake: 'documents',
  diligence: 'due-diligence',
  underwriting: 'underwriting',
  financing: 'financing',
  legal: 'legal',
  closing: 'closing',
  ic: 'package',
}

// The deal's own phase slug per lifecycle stage. DISTINCT from STAGE_TO_TAB: the tab map drives the
// retained `activeTab` selector (intake -> 'documents', ic -> 'package'), but team/agent resolution
// must key on the workspace phase slug (intake -> 'intake'). Keying the team lookup off STAGE_TO_TAB
// left Intake (the default landing) searching for a non-existent 'documents' phase -> empty rail.
const STAGE_TO_PHASE_SLUG: Record<StageId, string> = {
  intake: 'intake',
  diligence: 'due-diligence',
  underwriting: 'underwriting',
  financing: 'financing',
  legal: 'legal',
  closing: 'closing',
  ic: 'package',
}

function tabToStage(tab: WorkspaceTab): StageId {
  switch (tab) {
    case 'due-diligence':
      return 'diligence'
    case 'underwriting':
      return 'underwriting'
    case 'financing':
      return 'financing'
    case 'legal':
      return 'legal'
    case 'closing':
      return 'closing'
    case 'package':
      return 'ic'
    default:
      // documents + the non-stage tabs (mission/agents/workpapers/advanced) fall back to intake
      return 'intake'
  }
}

function agentStatusToStageStatus(status: string | undefined): StageStatus {
  switch (status) {
    case 'running':
      return 'live'
    case 'complete':
      return 'done'
    case 'failed':
      return 'blocked'
    default:
      return 'idle'
  }
}

const TOTAL_AGENT_COUNT = 31

export default function DealWorkspace({
  dealCheckpoint,
  agentCheckpoints,
  liveDealCheckpoint = null,
  liveAgentCheckpoints,
  logEntries,
  storyEvents,
  documentArtifacts,
  deals,
  initialTab,
  startGuidedDemo = false,
  onGuidedDemoConsumed,
  onOpenEditDetails,
  onLaunchStarted,
  onPresetSaved,
}: DealWorkspaceProps) {
  const initialDefaultTab = defaultWorkspaceTab(dealCheckpoint.status, initialTab)
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
    loadExtraction,
    applyExtraction,
    reviewExtraction,
    editField,
    exportPackage,
    savePhaseChecklist,
    refreshWorkspace,
  } = useDealWorkspace(dealCheckpoint.dealId)
  const { launchWorkflow, launchingWorkflowId } = useWorkflows()
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)
  // Structured launch-readiness blockers from the most recent rejected phase launch, shown inline
  // in the Agent Playbook (near the Run button) so the BLOCKED state explains WHY and how to fix.
  const [launchBlockers, setLaunchBlockers] = useState<DealValidationIssue[]>([])
  const [phaseRuntimeProvider, setPhaseRuntimeProvider] = useState<RuntimeProvider>('codex')
  const [phaseCodexMaxAgents, setPhaseCodexMaxAgents] = useState<number | null>(null)
  const [phaseCodexConcurrency, setPhaseCodexConcurrency] = useState(2)
  const [guidedDemoActive, setGuidedDemoActive] = useState(false)
  const [guidedDemoStep, setGuidedDemoStep] = useState(0)
  const [packageExportMessage, setPackageExportMessage] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Owned here (not in IntakeStage) so the intake detailed-review disclosure survives the stage
  // body re-mounting whenever a workspace refresh flips `loading` (extract / apply / field edit).
  const [intakeReviewOpen, setIntakeReviewOpen] = useState(false)
  // Phase 3: the agent whose panel is open (summon → watch → read → re-task). Holds the kebab
  // agent id (matches agentCheckpoints / storyEvents.agent / documentArtifacts.agent).
  const [agentPanelName, setAgentPanelName] = useState<string | null>(null)
  // The task the agent was summoned with (chip label or typed command), echoed in the panel header
  // so a summon visibly reflects what was asked. Null for a bare rail click (no specific task).
  const [agentPanelTask, setAgentPanelTask] = useState<string | null>(null)
  // A declined/failed LIVE follow-up dispatch (offline no-op, readiness-blocked, Codex error) puts
  // its notice here so the panel says why nothing happened instead of sitting silently idle.
  const [agentPanelNotice, setAgentPanelNotice] = useState<string | null>(null)
  // Single-agent dispatch (codex live) / offline replay no-op. Uses the LIVE checkpoint's runtime
  // when a run is in flight, else the operator's phase runtime selection.
  const dispatchRuntimeProvider: RuntimeProvider =
    (liveDealCheckpoint?.runtimeProvider as RuntimeProvider | undefined) ?? phaseRuntimeProvider
  const { dispatchAgent } = useAgentDispatch(dealCheckpoint.dealId, dispatchRuntimeProvider)

  useEffect(() => {
    setActiveTab(defaultWorkspaceTab(dealCheckpoint.status, initialTab))
    // Status updates for the same deal should not override a user-focused lifecycle stage.
  }, [dealCheckpoint.dealId, initialTab])

  useEffect(() => {
    if (!startGuidedDemo) return
    setGuidedDemoStep(0)
    setGuidedDemoActive(true)
    setActiveTab('mission')
    onGuidedDemoConsumed?.()
  }, [onGuidedDemoConsumed, startGuidedDemo])

  const phaseTabs = workspace?.phases ?? []
  const criteria = workspace?.criteria ?? null
  const documents = workspace?.documents ?? []

  // I2/I3 intake record: aggregate every readable document's extraction into the auto-filled
  // deal record. Docs reach 'review_ready'/'applied' once their parser has run and stored a
  // source-backed field set; we fetch each (independently of the hook's single `lastExtraction`
  // so we don't clobber the detailed-review panel's own auto-load) and feed them to the model.
  const [intakeExtractions, setIntakeExtractions] = useState<Map<string, ExtractionPreview>>(new Map())
  const recordReadyDocuments = useMemo(
    () => documents.filter((doc) => doc.status === 'review_ready' || doc.status === 'applied'),
    [documents],
  )
  // Refetch only when the readable-doc set or its freshness changes (apply/edit bumps timestamps).
  const recordDocSignature = recordReadyDocuments
    .map((doc) => `${doc.documentId}:${doc.status}:${doc.appliedAt ?? ''}:${doc.extractedAt ?? ''}:${doc.reviewedAt ?? ''}`)
    .join('|')

  useEffect(() => {
    const dealId = dealCheckpoint.dealId
    if (!dealId || recordReadyDocuments.length === 0) {
      setIntakeExtractions((current) => (current.size === 0 ? current : new Map()))
      return
    }
    let cancelled = false
    void (async () => {
      const next = new Map<string, ExtractionPreview>()
      await Promise.all(
        recordReadyDocuments.map(async (doc) => {
          try {
            const response = await fetch(
              `${API_URL}/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(doc.documentId)}/extraction`,
            )
            if (!response.ok) return
            const payload = (await response.json()) as { extraction?: ExtractionPreview }
            if (payload.extraction) next.set(doc.documentId, payload.extraction)
          } catch {
            // Best-effort: a single document's extraction failing to load just omits its fields.
          }
        }),
      )
      if (!cancelled) setIntakeExtractions(next)
    })()
    return () => {
      cancelled = true
    }
    // recordDocSignature captures the meaningful change surface of recordReadyDocuments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealCheckpoint.dealId, recordDocSignature])

  // Merge the freshest single extraction (from an in-panel extract/review) over the aggregated
  // map so a just-read document appears in the record immediately.
  const dealRecordGroups = useMemo(() => {
    const merged = new Map(intakeExtractions)
    if (lastExtraction) merged.set(lastExtraction.documentId, lastExtraction)
    return buildDealRecordGroups([...merged.values()])
  }, [intakeExtractions, lastExtraction])
  const dealRecordNeedsEye = useMemo(() => countNeedsEye(dealRecordGroups), [dealRecordGroups])

  // One-line ingestion-agent status for the Intake stage, derived from document state.
  const intakeAgentsLine = useMemo(
    () => deriveIntakeAgentsLine(documents),
    [documents],
  )

  // I2b end-to-end: auto-extract freshly uploaded, still-unextracted documents so DROPPING docs
  // auto-fills the record (drop → extract → auto-apply on the server) with no manual "Preview
  // Extraction" click. One doc at a time (guarded by `working` so extracts don't overlap), once
  // each (the ref), so re-renders never re-trigger and parse_failed/unsupported docs aren't retried.
  const autoExtractedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (working) return
    const pending = documents.find(
      (doc) => doc.extractionStatus === 'not-started' && !autoExtractedRef.current.has(doc.documentId),
    )
    if (!pending) return
    autoExtractedRef.current.add(pending.documentId)
    void extractDocument(pending.documentId)
  }, [documents, working, extractDocument])

  // Advanced-drawer a11y (Phase-1 gate finding): lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!advancedOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setAdvancedOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [advancedOpen])

  async function handlePhaseLaunch(phaseSlug: string): Promise<void> {
    const workflowId = PHASE_WORKFLOW[phaseSlug] ?? 'full-acquisition-review'
    setLaunchBlockers([])
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
      if (err instanceof LaunchValidationError) {
        setLaunchBlockers(err.blockers)
      }
    }
  }

  async function handleWorkspaceLaunch(response: WorkflowLaunchResponse): Promise<void> {
    await refreshWorkspace()
    onLaunchStarted?.(response)
  }

  async function handlePackageExport(format: 'markdown' | 'json'): Promise<void> {
    const exported = await exportPackage('full-acquisition-review')
    const baseName = `${downloadSafeName(dealCheckpoint.dealName)}-ic-starter-package`
    if (format === 'json') {
      downloadTextFile(`${baseName}.json`, JSON.stringify(exported.packageJson, null, 2), 'application/json')
      setPackageExportMessage(`JSON exported to ${exported.files.json}`)
      return
    }
    downloadTextFile(`${baseName}.md`, exported.markdown, 'text/markdown')
    setPackageExportMessage(`Markdown exported to ${exported.files.markdown}`)
  }

  function focusWorkflowLauncher(): void {
    setAdvancedOpen(true)
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

  const activeStage = tabToStage(activeTab)
  const stages = deriveSpineStages(
    dealCheckpoint,
    intakeSummaryFromDocuments(documents),
    { complete: isCompleteStatus(dealCheckpoint.status), hasContent: documentArtifacts.length > 0 },
  )
  const activeStageMeta = stages.find((stage) => stage.id === activeStage)
  const icStage = stages.find((stage) => stage.id === 'ic')
  const packageStatus: StageStatus = icStage?.status ?? 'idle'
  const packageLabel =
    packageStatus === 'idle' ? 'IC Package — not started' : `IC Package ${icStage?.progress ?? 0}%`
  const proofPathSteps = buildProofPathSteps(
    documents,
    workspace?.operatorCommand?.sourceCoverage?.approvedFieldCount ?? 0,
    documentArtifacts.length,
    packageStatus,
  )

  const activePhaseForStage = phaseTabs.find((phase) => phase.phaseSlug === STAGE_TO_PHASE_SLUG[activeStage])
  // Intake's crew (the ingestion agents) isn't a runtime checkpoint phase, so it never appears in
  // workspace.phases — source it from the fixed ingestion roster so the default-landing rail is
  // staffed. All other stages come from the resolved phase (ic/package has no agents by design).
  // Status keys on the agent's kebab id (how agentCheckpoints / story events are keyed), NOT the
  // display name — the previous `.get(agent.name)` never matched, so every dot read as idle.
  const stageTeamAgents = activeStage === 'intake' ? INGESTION_TEAM : activePhaseForStage?.agents ?? []
  const team: TeamAgentView[] = stageTeamAgents.map((agent) => ({
    agentId: agent.agentId,
    name: agent.name,
    critical: agent.critical,
    status: agentStatusToStageStatus(agentCheckpoints.get(agent.agentId)?.status),
  }))

  // Agent roster across all phases: kebab agentId -> { display name, role }. Lets the command bar
  // open a panel for ANY agent (not just the focused stage's team). agentId === the checkpoint /
  // story-event / artifact key, so the panel's data feed matches on the same id.
  const agentRoster = useMemo(() => {
    const roster = new Map<string, { name: string; role: string }>()
    // Seed the intake crew first (not a runtime phase, so absent from phaseTabs) so summoning a
    // parser from the Intake team rail opens a properly-titled panel instead of a bare kebab id.
    for (const agent of INGESTION_TEAM) {
      roster.set(agent.agentId, { name: agent.name, role: 'Intake · Ingestion' })
    }
    for (const phase of phaseTabs) {
      for (const agent of phase.agents) {
        if (roster.has(agent.agentId)) continue
        roster.set(agent.agentId, {
          name: agent.name,
          role: `${phase.label} · ${agent.critical ? 'Critical Path' : 'Specialist'}`,
        })
      }
    }
    return roster
  }, [phaseTabs])

  // Phase 3: summon paths. Rail click + command-bar (free text or chip intent) all land on the
  // same agent panel; a workflow intent launches that workflow; anything unrecognized opens the
  // Advanced drawer (the power-user fallback).
  function openAgentPanel(agentId: string, task?: string): void {
    setAgentPanelName(agentId)
    const trimmed = task?.trim()
    setAgentPanelTask(trimmed ? trimmed : null)
  }
  // `text` drives intent routing (a chip passes its "agent:<id>" intent string); `displayTask` is
  // the human-readable task echoed in the panel (a chip's label, or the operator's typed command).
  function routeAndAct(text: string, displayTask?: string): void {
    const result = routeIntent(text, activeStage, { suggestions: suggestionsForStage(activeStage) })
    if (result.kind === 'agent') {
      openAgentPanel(result.agentId, displayTask)
      return
    }
    if (result.kind === 'workflow') {
      // Reuse the existing phase-launch plumbing by resolving the workflow's owning phase slug;
      // if it isn't a per-phase workflow, fall back to the Advanced workflow launcher.
      const phaseSlug = Object.keys(PHASE_WORKFLOW).find((slug) => PHASE_WORKFLOW[slug] === result.workflowId)
      if (phaseSlug) {
        void handlePhaseLaunch(phaseSlug)
      } else {
        focusWorkflowLauncher()
      }
      return
    }
    setAdvancedOpen(true)
  }
  function handleCommandSuggestion(suggestion: CommandSuggestion): void {
    // A chip carries an explicit intent string ("agent:<id>" / "workflow:<id>" / action); its label
    // is the readable task to echo in the panel.
    routeAndAct(suggestion.intent, suggestion.label)
  }
  function handleCommandSubmit(text: string): void {
    routeAndAct(text, text)
  }

  // The agent panel's data feed (Hook 3): a pure selector over the existing checkpoint / story /
  // artifact data. Offline = replay of recorded work; codex live = the same selector over the
  // live WS feed. "Open full workpaper" opens the workpaper's file path.
  const agentPanelMeta = agentPanelName ? agentRoster.get(agentPanelName) : undefined
  const agentPanelView = agentPanelName
    ? buildAgentPanelView(agentPanelName, {
        agentCheckpoints,
        storyEvents,
        documentArtifacts,
        onOpenWorkpaper: (path) => {
          if (path) window.open(`${API_URL}/${path.replace(/^\/+/, '')}`, '_blank', 'noopener')
        },
      })
    : null
  const liveDispatch = dispatchRuntimeProvider === 'codex'

  function renderStageBody(): ReactNode {
    const recovery = (
      <PartialFailureRecovery
        dealCheckpoint={liveDealCheckpoint ?? dealCheckpoint}
        agentCheckpoints={liveAgentCheckpoints ?? agentCheckpoints}
        storyEvents={storyEvents}
        dealPath={deals.find((entry) => entry.dealId === (liveDealCheckpoint ?? dealCheckpoint).dealId)?.dealPath ?? null}
        runActive={launchingWorkflowId !== null || isRunActive(liveDealCheckpoint ?? dealCheckpoint)}
      />
    )

    if (activeStage === 'intake') {
      return (
        <div className="space-y-4">
          {recovery}
          <IntakeStage
            groups={dealRecordGroups}
            needsEyeCount={dealRecordNeedsEye}
            // DealRecord hands back the field PATH (fieldId === path) + the typed display string;
            // coerceEditValue converts it to the typed value the field-edit endpoint requires.
            // The hook surfaces failures via its `error` state, so swallow the promise rejection
            // here (DealRecord commits on both Enter and blur; the blur fired while the stage body
            // re-mounts on refresh can abort an in-flight fetch — that must not become an unhandled
            // rejection / page error).
            onEditField={(path, value) => {
              void editField(path, coerceEditValue(path, value), path).catch(() => undefined)
            }}
            onStartDiligence={() => setActiveTab('due-diligence')}
            saving={working}
            agentsLine={intakeAgentsLine}
            detailedReviewOpen={intakeReviewOpen}
            onDetailedReviewToggle={setIntakeReviewOpen}
            proofPathSteps={proofPathSteps}
          >
            <DocumentIntakePanel
              documents={documents}
              extraction={lastExtraction}
              working={working}
              onUpload={uploadDocument}
              onExtract={extractDocument}
              onLoadExtraction={loadExtraction}
              onApply={applyExtraction}
              onReview={(documentId, fieldIds, reviewStatus, note) =>
                reviewExtraction(documentId, fieldIds, reviewStatus, note).then(() => undefined)
              }
            />
          </IntakeStage>
        </div>
      )
    }

    if (activeStage === 'ic') {
      return (
        <div className="space-y-4">
          {recovery}
          <Suspense fallback={<WorkspacePanelSkeleton label="Loading IC package..." />}>
            <CompletionPackage
              dealCheckpoint={dealCheckpoint}
              storyEvents={storyEvents}
              documentArtifacts={documentArtifacts}
              onExportPackage={handlePackageExport}
              exportingPackage={working}
              exportMessage={packageExportMessage}
            />
          </Suspense>
          <div className="grid gap-4 xl:grid-cols-2">
            <FindingsPanel dealCheckpoint={dealCheckpoint} agentCheckpoints={agentCheckpoints} />
            <DecisionLog storyEvents={storyEvents} />
          </div>
          {/^complete$/i.test(dealCheckpoint.status) && <FinalReport dealCheckpoint={dealCheckpoint} />}
        </div>
      )
    }

    if (activePhaseForStage) {
      return (
        <div className="space-y-4">
          {recovery}
          <PhaseWorkspaceView
            dealCheckpoint={dealCheckpoint}
            agentCheckpoints={agentCheckpoints}
            phase={activePhaseForStage}
            documents={documents}
            onChecklist={savePhaseChecklist}
            onLaunch={handlePhaseLaunch}
            launching={launchingWorkflowId !== null}
            launchBlockers={launchBlockers}
            onEditDeal={() => { setLaunchBlockers([]); onOpenEditDetails?.(dealCheckpoint.dealId) }}
            runtimeProvider={phaseRuntimeProvider}
            onRuntimeProviderChange={setPhaseRuntimeProvider}
            codexMaxAgents={phaseCodexMaxAgents}
            onCodexMaxAgentsChange={setPhaseCodexMaxAgents}
            codexConcurrency={phaseCodexConcurrency}
            onCodexConcurrencyChange={setPhaseCodexConcurrency}
            onOpenAgent={openAgentPanel}
          />
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {recovery}
        <div className="portal-panel text-sm text-gray-500">
          {activeStageMeta?.label ?? 'This stage'} has no staffed workflow yet. Upload source documents
          and run the deal team to populate it.
        </div>
      </div>
    )
  }

  return (
    <>
      <WorkspaceFrame
        deal={dealCheckpoint}
        stages={stages}
        activeStage={activeStage}
        onFocusStage={(stage) => setActiveTab(STAGE_TO_TAB[stage])}
        storyEvents={storyEvents}
        team={team}
        totalAgentCount={TOTAL_AGENT_COUNT}
        stageLabel={activeStageMeta?.label ?? 'Stage'}
        packageLabel={packageLabel}
        packageStatus={packageStatus}
        suggestions={suggestionsForStage(activeStage)}
        onCommandSubmit={handleCommandSubmit}
        onCommandSuggestion={handleCommandSuggestion}
        onOpenAgent={openAgentPanel}
        onSummon={() => setAdvancedOpen(true)}
        onOpenAdvanced={() => setAdvancedOpen(true)}
      >
        {loading && !workspace ? (
          // Only blank to a placeholder on the FIRST load. Once the workspace is in hand, keep the
          // stage body mounted through background refreshes (extract / apply / field edit) — a
          // full unmount on every mutation would collapse the intake detailed-review disclosure
          // and abort in-flight inline edits (Enter+blur double-commit -> ERR_ABORTED).
          <div className="portal-panel text-sm text-gray-500">Loading workspace...</div>
        ) : (
          renderStageBody()
        )}
      </WorkspaceFrame>

      {agentPanelName && agentPanelView && (
        <AgentPanel
          open
          agentName={agentPanelMeta?.name ?? agentPanelName}
          agentRole={agentPanelMeta?.role}
          task={agentPanelTask ?? undefined}
          taskSource={agentPanelTask ? 'Your command' : undefined}
          notice={agentPanelNotice ?? undefined}
          status={agentPanelView.status}
          streamLines={agentPanelView.streamLines}
          output={agentPanelView.output}
          elapsedLabel={agentPanelView.elapsedLabel}
          liveDispatch={liveDispatch}
          followUpSuggestions={
            // Only agent-targeted chips make sense as a same-agent follow-up; offline the panel
            // disables them anyway (replay), so this is purely the live-codex affordance.
            liveDispatch
              ? suggestionsForStage(activeStage)
                  .filter((suggestion) => suggestion.intent.startsWith('agent:'))
                  .map((suggestion) => suggestion.label)
              : []
          }
          onFollowUp={(text) => {
            // Echo the latest follow-up as the panel's task so re-tasking is visible.
            setAgentPanelTask(text)
            setAgentPanelNotice(null)
            void dispatchAgent(agentPanelName, text).then((result) => {
              if (result.status === 'dispatched') {
                void refreshWorkspace()
              } else {
                // Surface a declined/failed live dispatch instead of leaving the panel idle.
                setAgentPanelNotice(result.notice)
              }
            })
          }}
          onClose={() => {
            setAgentPanelName(null)
            setAgentPanelTask(null)
            setAgentPanelNotice(null)
          }}
        />
      )}

      {(error || launchMessage) && (
        <div className="mt-4 border border-white/10 bg-black px-4 py-3 text-sm text-gray-300" data-testid="workspace-message">
          {error || launchMessage}
        </div>
      )}

      {advancedOpen && (
        <div
          className="fixed inset-0 z-40 overflow-y-auto bg-black/70 backdrop-blur-sm"
          data-testid="advanced-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Advanced controls, team, and workpapers"
        >
          <div className="min-h-full p-4 sm:p-6 lg:p-10">
            <div className="mx-auto w-full max-w-6xl border border-white/10 bg-cre-surface">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <p className="portal-kicker">Advanced · Controls, Team &amp; Workpapers</p>
                <button
                  type="button"
                  data-testid="advanced-drawer-close"
                  className="portal-button portal-button-secondary min-h-9 px-3 py-1"
                  onClick={() => setAdvancedOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="space-y-4 p-5">
                <Suspense fallback={<WorkspacePanelSkeleton label="Loading mission control..." />}>
                  <MissionControl
                    dealCheckpoint={dealCheckpoint}
                    agentCheckpoints={agentCheckpoints}
                    storyEvents={storyEvents}
                    documentArtifacts={documentArtifacts}
                    documents={documents}
                    workspace={workspace}
                    onOpenDocuments={() => { setAdvancedOpen(false); setActiveTab('documents') }}
                    onOpenAgents={() => undefined}
                    onOpenWorkpapers={() => undefined}
                    onOpenPackage={() => { setAdvancedOpen(false); setActiveTab('package') }}
                    onOpenAdvanced={() => undefined}
                  />
                </Suspense>
                <Overview
                  dealCheckpoint={dealCheckpoint}
                  workspace={workspace}
                  criteria={criteria}
                  documents={documents}
                  onOpenDocuments={() => { setAdvancedOpen(false); setActiveTab('documents') }}
                  onFocusWorkflowLauncher={focusWorkflowLauncher}
                  onOpenPhase={(phaseSlug) => { setActiveTab(phaseSlug as WorkspaceTab); setAdvancedOpen(false) }}
                  onOpenEditDetails={() => onOpenEditDetails?.(dealCheckpoint.dealId)}
                >
                  {criteria && (
                    <CriteriaPanel criteria={criteria} working={working} onSave={saveCriteria} />
                  )}
                  <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.72fr)]">
                    <PipelineView dealCheckpoint={dealCheckpoint} agentCheckpoints={agentCheckpoints} />
                    <div id="workspace-workflow-launcher" data-testid="workspace-workflow-launcher">
                      <Suspense fallback={<WorkspacePanelSkeleton label="Loading workflow launcher..." />}>
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
                      </Suspense>
                    </div>
                  </section>
                </Overview>
                <AgentTree
                  dealCheckpoint={dealCheckpoint}
                  agentCheckpoints={agentCheckpoints}
                  plannedPhases={workspace?.phases}
                />
                <DocumentWall documentArtifacts={documentArtifacts} />
                <DealProgressionGuideView
                  guide={workspace?.progressionGuide}
                  activeTab={activeTab}
                  onOpenSection={(phaseSlug) => { setActiveTab(phaseSlug as WorkspaceTab); setAdvancedOpen(false) }}
                  onAction={handleGuideAction}
                  onChecklist={savePhaseChecklist}
                />
                <StoryNarrative storyEvents={storyEvents} />
                <TimelineView dealCheckpoint={dealCheckpoint} agentCheckpoints={agentCheckpoints} />
                {logEntries.length > 0 && <LogStream logEntries={logEntries} />}
              </div>
            </div>
          </div>
        </div>
      )}

      <GuidedDemoTour
        active={guidedDemoActive}
        stepIndex={guidedDemoStep}
        onStepIndexChange={setGuidedDemoStep}
        onFocusStage={(stage) => setActiveTab(STAGE_TO_TAB[stage])}
        onClose={() => setGuidedDemoActive(false)}
      />
    </>
  )
}
