import { useRef, useState } from 'react'
import type { DealCheckpoint } from '../types/checkpoint'
import type { DealWorkspace as DealWorkspaceState, SourceDocument } from '../types/workspace'

interface DealCockpitSidebarProps {
  workspace: DealWorkspaceState | null
  documents: SourceDocument[]
  dealCheckpoint: DealCheckpoint
  activeTab: string
  onTabChange: (tab: string) => void
  onUploadFiles: (files: File[]) => void
  onExtractDocuments: (documents: SourceDocument[]) => void
  onOpenEditDetails: () => void
}

const REQUIRED_DOCUMENTS = [
  { type: 'rent_roll', label: 'Rent Roll' },
  { type: 't12', label: 'T12' },
  { type: 'offering_memo', label: 'Offering Memo' },
  { type: 'psa', label: 'PSA' },
  { type: 'title', label: 'Title' },
  { type: 'inspection_report', label: 'Inspection' },
  { type: 'environmental', label: 'Environmental' },
]

function toFileArray(files: FileList | null): File[] {
  return files ? Array.from(files) : []
}

function documentStatus(doc: SourceDocument | undefined): { label: string; className: string; detail: string } {
  if (!doc) return { label: 'Missing', className: 'status-blocked', detail: 'Needed' }
  if (doc.status === 'applied' || doc.status === 'review_ready' || doc.extractionStatus === 'extracted') {
    return { label: 'Ready', className: 'status-complete', detail: doc.status === 'applied' ? 'Applied' : 'Review ready' }
  }
  if (doc.extractionStatus === 'extraction-pending') {
    return { label: 'Stored', className: 'status-running', detail: 'Pending review' }
  }
  if (doc.extractionStatus === 'not-started') {
    return { label: 'Stored', className: 'status-running', detail: 'Awaiting extraction' }
  }
  return { label: 'Stored', className: 'status-pending', detail: doc.extractionStatus }
}

function readinessStatusClass(status: string | undefined): string {
  if (status === 'ready') return 'status-complete'
  if (status === 'warning') return 'status-running'
  if (status === 'blocked') return 'status-blocked'
  return 'status-pending'
}

function phaseProgress(dealCheckpoint: DealCheckpoint, phaseKey: string, phaseSlug: string): number {
  const runtimePhase = dealCheckpoint.phases[phaseKey] ?? dealCheckpoint.phases[phaseSlug.replace(/-/g, '_')]
  const total = runtimePhase?.agents.total ?? 0
  if (total <= 0) return 0
  return Math.round(((runtimePhase?.agents.completed ?? 0) / total) * 100)
}

export default function DealCockpitSidebar({
  workspace,
  documents,
  dealCheckpoint,
  activeTab,
  onTabChange,
  onUploadFiles,
  onExtractDocuments,
  onOpenEditDetails,
}: DealCockpitSidebarProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const phases = workspace?.phases ?? []
  const documentsByType = new Map(documents.map((doc) => [doc.type, doc]))
  const missingDoc = REQUIRED_DOCUMENTS.find((entry) => !documentsByType.has(entry.type))
  const extractableDocuments = documents.filter((doc) => doc.extractionStatus === 'not-started')
  const reviewReadyDocument = documents.find((doc) => doc.status === 'review_ready')
  const readyPhase = phases.find((phase) => phase.readiness === 'ready')
  const fullReadiness = workspace?.launchReadiness.find((entry) => entry.workflowId === 'full-acquisition-review')
    ?? workspace?.launchReadiness[0]
  const sourceCoverage = fullReadiness?.sourceCoverage
  const requiredSourceCount = sourceCoverage?.requiredApprovedFieldCount ?? 0
  const approvedRequiredSourceCount = Math.max(0, requiredSourceCount - (sourceCoverage?.missingApprovedFieldCount ?? 0))

  const nextAction = (() => {
    if (documents.length === 0) {
      return {
        title: 'Drop your rent roll, T12, or offering memo to begin.',
        cta: 'Add Documents',
        action: () => inputRef.current?.click(),
      }
    }
    if (extractableDocuments.length > 0) {
      return {
        title: `Run extraction on ${extractableDocuments.length} document${extractableDocuments.length === 1 ? '' : 's'}.`,
        cta: 'Run Extraction',
        action: () => onExtractDocuments(extractableDocuments),
      }
    }
    if (reviewReadyDocument) {
      return {
        title: `Review extracted fields from ${reviewReadyDocument.fileName}.`,
        cta: 'Review Fields',
        action: () => onTabChange('documents'),
      }
    }
    if (missingDoc) {
      return {
        title: `Add ${missingDoc.label} to improve source coverage.`,
        cta: 'Drop More Files',
        action: () => inputRef.current?.click(),
      }
    }
    if (readyPhase) {
      return {
        title: `${readyPhase.label} has the required source package.`,
        cta: `Open ${readyPhase.label}`,
        action: () => onTabChange(readyPhase.phaseSlug),
      }
    }
    return {
      title: 'Source package is organized. Review criteria or launch the next workflow.',
      cta: 'Review Overview',
      action: () => onTabChange('overview'),
    }
  })()

  function handleFiles(files: File[]): void {
    if (files.length === 0) return
    setDragging(false)
    onUploadFiles(files)
  }

  return (
    <aside className="portal-panel lg:sticky lg:top-6" data-testid="deal-cockpit-sidebar">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="portal-kicker">Cockpit</p>
          <h2 className="portal-title text-xl">Documents & Next Action</h2>
        </div>
        <button
          type="button"
          className="portal-button portal-button-secondary min-h-9 px-3 py-1"
          onClick={onOpenEditDetails}
        >
          Edit Details
        </button>
      </div>

      <section className="mt-5">
        <p className="text-xs font-semibold uppercase text-gray-500">Documents you have</p>
        <div className="mt-3 space-y-2">
          {REQUIRED_DOCUMENTS.map((entry) => {
            const doc = documentsByType.get(entry.type)
            const status = documentStatus(doc)
            return (
              <div key={entry.type} className="flex items-center justify-between gap-3 border border-white/10 bg-black px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-200">{entry.label}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{doc?.fileName ?? status.detail}</p>
                </div>
                <span className={`status-badge ${status.className}`}>{status.label}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section
        className={`mt-4 border border-dashed p-4 text-center transition-colors ${
          dragging ? 'border-white bg-white/[0.08]' : 'border-white/15 bg-black'
        }`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          handleFiles(toFileArray(event.dataTransfer.files))
        }}
      >
        <button
          type="button"
          className="text-sm font-semibold uppercase text-white"
          onClick={() => inputRef.current?.click()}
        >
          + Drop more files
        </button>
        <p className="mt-2 text-xs text-gray-500">CSV/TXT/MD extract locally. PDF and Excel stay honest.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            handleFiles(toFileArray(event.target.files))
            event.currentTarget.value = ''
          }}
        />
      </section>

      <section className="mt-5 border border-white/10 bg-black p-4" data-testid="cockpit-next-action">
        <p className="text-xs font-semibold uppercase text-gray-500">Next action</p>
        <p className="mt-2 text-sm text-gray-300">{nextAction.title}</p>
        <button
          type="button"
          className="portal-button portal-button-primary mt-4 w-full"
          onClick={nextAction.action}
        >
          {nextAction.cta}
        </button>
      </section>

      <section className="mt-5 border border-white/10 bg-black p-4" data-testid="cockpit-launch-readiness">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase text-gray-500">Launch readiness</p>
          <span className={`status-badge ${readinessStatusClass(fullReadiness?.status)}`}>
            {fullReadiness?.status ?? 'pending'}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="border border-white/10 px-3 py-2">
            <p className="text-xs uppercase text-gray-500">Source inputs</p>
            <p className="mt-1 font-semibold text-white">
              {requiredSourceCount > 0 ? `${approvedRequiredSourceCount}/${requiredSourceCount}` : '--'}
            </p>
          </div>
          <div className="border border-white/10 px-3 py-2">
            <p className="text-xs uppercase text-gray-500">Warnings</p>
            <p className="mt-1 font-semibold text-white">{fullReadiness?.warnings.length ?? 0}</p>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <p className="text-xs font-semibold uppercase text-gray-500">Phase readiness</p>
        <div className="mt-3 space-y-2">
          {phases.map((phase) => {
            const progress = phaseProgress(dealCheckpoint, phase.phaseKey, phase.phaseSlug)
            return (
              <button
                key={phase.phaseSlug}
                type="button"
                data-testid={`cockpit-phase-${phase.phaseSlug}`}
                className={`w-full border border-white/10 bg-black px-3 py-3 text-left transition-colors hover:border-white/40 ${
                  activeTab === phase.phaseSlug ? 'border-white/50' : ''
                }`}
                onClick={() => onTabChange(phase.phaseSlug)}
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-gray-200">{phase.label}</span>
                  <span className="text-xs text-gray-500">{progress}%</span>
                </div>
                <div className="progress-bar mt-2">
                  <div className="progress-fill bg-white" style={{ width: `${progress}%` }} />
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </aside>
  )
}
