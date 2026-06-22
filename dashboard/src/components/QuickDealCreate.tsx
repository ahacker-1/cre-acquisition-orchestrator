import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createDraftDealFromFiles } from '../lib/dealForm'
import type { DealFormData, SaveDealResponse } from '../types/deals'
import type { SourceDocument } from '../types/workspace'
import type { OutcomeIntent } from './DropZoneHero'

type UploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed'

interface UploadQueueItem {
  id: string
  file: File
  status: UploadStatus
  error: string | null
}

interface QuickDealCreateProps {
  files: File[]
  intent: OutcomeIntent
  goalText: string
  suggestedDealId: string
  dealIdReady: boolean
  isOpen: boolean
  onCancel: () => void
  onCreated: (dealId: string) => void
  saveDeal: (form: DealFormData, mode: 'draft', currentDealId?: string) => Promise<SaveDealResponse>
  uploadDealDocument: (dealId: string, file: File) => Promise<SourceDocument>
}

function suggestDealName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '')
  const clean = stem
    .replace(/[_-]+/g, ' ')
    .replace(/\b(om|t12|rent|roll|final|draft|financials?|memo|offering|psa|loi)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return 'New Acquisition Deal'
  return clean
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function queueId(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`
}

function uploadStatusClass(status: UploadStatus): string {
  if (status === 'uploaded') return 'status-complete'
  if (status === 'uploading') return 'status-running'
  if (status === 'failed') return 'status-blocked'
  return 'status-pending'
}

function nextDealId(candidate: string, offset: number): string {
  const match = candidate.match(/^(.*?)(\d+)$/)
  if (match) {
    const [, prefix, numeric] = match
    return `${prefix}${String(Number(numeric) + offset).padStart(numeric.length, '0')}`
  }
  return `${candidate}-${String(offset + 1).padStart(2, '0')}`
}

function isDealIdConflictError(error: unknown): boolean {
  const validation = (error as {
    validation?: {
      blockingIssues?: Array<{ path?: string; message?: string } | null>
      issues?: Array<{ path?: string; message?: string } | null>
    }
  })?.validation
  const issues = [
    ...(validation?.blockingIssues ?? []),
    ...(validation?.issues ?? []),
  ]
  return issues.some((issue) => (
    issue?.path === 'dealId' && /already exists/i.test(issue.message || '')
  ))
}

const WORKFLOW_BY_INTENT: Record<OutcomeIntent, string> = {
  'screen-deal': 'quick-deal-screen',
  'ic-package': 'full-acquisition-review',
  'legal-blockers': 'legal-psa-review',
  'financing-package': 'financing-package',
  'underwriting-refresh': 'underwriting-refresh',
}

const OUTCOME_LABEL_BY_INTENT: Record<OutcomeIntent, string> = {
  'screen-deal': 'Screen this deal',
  'ic-package': 'Build IC package',
  'legal-blockers': 'Review legal blockers',
  'financing-package': 'Prepare financing package',
  'underwriting-refresh': 'Refresh underwriting',
}

export default function QuickDealCreate({
  files,
  intent,
  goalText,
  suggestedDealId,
  dealIdReady,
  isOpen,
  onCancel,
  onCreated,
  saveDeal,
  uploadDealDocument,
}: QuickDealCreateProps) {
  const suggestedName = useMemo(() => suggestDealName(files[0]?.name ?? ''), [files])
  const modalRef = useRef<HTMLElement | null>(null)
  const [dealName, setDealName] = useState(suggestedName)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [savedDealId, setSavedDealId] = useState<string | null>(null)
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])

  useEffect(() => {
    if (isOpen) {
      setDealName(suggestedName)
      setError(null)
      setWorking(false)
      setSavedDealId(null)
      setUploadQueue(files.map((file, index) => ({
        id: queueId(file, index),
        file,
        status: 'queued',
        error: null,
      })))
    }
  }, [isOpen, suggestedName])

  useEffect(() => {
    if (!isOpen) return
    modalRef.current?.querySelector<HTMLInputElement>('[data-testid="quick-deal-name-input"]')?.focus()
  }, [isOpen])

  if (!isOpen) return null

  const uploadedCount = uploadQueue.filter((item) => item.status === 'uploaded').length
  const failedItems = uploadQueue.filter((item) => item.status === 'failed')
  const failedCount = failedItems.length
  const progressText = uploadQueue.length > 0
    ? `${uploadedCount}/${uploadQueue.length} uploaded`
    : 'No files queued'
  // PDFs are stored for extraction (extraction-pending) rather than auto-applied like CSV/XLSX,
  // so set that expectation up front instead of leaving the deal record silently empty.
  const hasPdf = files.some((file) => /\.pdf$/i.test(file.name))
  const createDisabled = working || Boolean(savedDealId) || !dealIdReady

  function updateQueueItem(itemId: string, update: Partial<UploadQueueItem>): void {
    setUploadQueue((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...update } : item)),
    )
  }

  async function uploadItems(dealId: string, items: UploadQueueItem[]): Promise<number> {
    let failures = 0
    for (const item of items) {
      updateQueueItem(item.id, { status: 'uploading', error: null })
      try {
        await uploadDealDocument(dealId, item.file)
        updateQueueItem(item.id, { status: 'uploaded', error: null })
      } catch (err) {
        failures += 1
        updateQueueItem(item.id, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return failures
  }

  async function saveDraftWithAvailableId(name: string): Promise<SaveDealResponse> {
    let lastConflict: unknown = null
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const dealId = attempt === 0 ? suggestedDealId : nextDealId(suggestedDealId, attempt)
      const form = createDraftDealFromFiles(files.map((file) => file.name), name, dealId, {
        goalText,
        outcomeIntent: intent,
        recommendedWorkflowId: WORKFLOW_BY_INTENT[intent],
      })
      try {
        return await saveDeal(form, 'draft')
      } catch (err) {
        if (!isDealIdConflictError(err)) throw err
        lastConflict = err
      }
    }
    throw lastConflict instanceof Error ? lastConflict : new Error('Could not find an available deal ID.')
  }

  async function handleCreate(): Promise<void> {
    const trimmed = dealName.trim()
    if (!trimmed) {
      setError('Deal name is required.')
      return
    }

    setWorking(true)
    setError(null)
    try {
      const saved = await saveDraftWithAvailableId(trimmed)
      const dealId = saved.item.dealId
      setSavedDealId(dealId)
      const failures = await uploadItems(dealId, uploadQueue)
      if (failures === 0) {
        onCreated(dealId)
        return
      }
      setError(`${failures} file${failures === 1 ? '' : 's'} failed. Retry them or open the workspace with the successful uploads.`)
      setWorking(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setWorking(false)
    }
  }

  async function handleRetryFailed(): Promise<void> {
    if (!savedDealId || failedItems.length === 0) return
    setWorking(true)
    setError(null)
    const failures = await uploadItems(savedDealId, failedItems)
    if (failures === 0) {
      onCreated(savedDealId)
      return
    }
    setError(`${failures} file${failures === 1 ? '' : 's'} still failed. You can keep retrying or open the workspace.`)
    setWorking(false)
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && !working) {
      event.preventDefault()
      onCancel()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('aria-hidden'))
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm">
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <section
          ref={modalRef}
          data-testid="quick-deal-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-deal-title"
          aria-describedby="quick-deal-description"
          onKeyDown={handleDialogKeyDown}
          className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col border border-cre-border bg-cre-surface shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:my-6 sm:max-h-[calc(100vh-3rem)]"
        >
          <div className="border-b border-cre-border px-6 py-5">
            <p className="portal-kicker">New deal</p>
            <h2 id="quick-deal-title" className="portal-title">Name your deal</h2>
            <p id="quick-deal-description" className="mt-3 text-sm text-gray-400">
              I'll create the deal, upload your {files.length} file{files.length === 1 ? '' : 's'}, and get
              your acquisition team ready — {OUTCOME_LABEL_BY_INTENT[intent]}.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <label className="portal-field">
              <span>Deal Name</span>
              <input
                data-testid="quick-deal-name-input"
                value={dealName}
                onChange={(event) => setDealName(event.target.value)}
              />
            </label>
            <div className="border border-white/10 bg-black p-3">
              <p className="text-xs font-semibold uppercase text-gray-500">What you'll get</p>
              <p className="mt-2 text-sm text-gray-200">{goalText}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="status-badge status-pending">
                  Your acquisition team is assembled when the deal opens
                </span>
              </div>
            </div>
            <div className="border border-white/10 bg-black p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-gray-500">Upload Queue</p>
                <span className="text-xs font-semibold uppercase text-gray-500" data-testid="quick-upload-progress">
                  {progressText}
                </span>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                {uploadQueue.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 border border-white/10 bg-white/[0.03] px-3 py-2"
                    data-testid={`quick-upload-item-${item.status}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{item.file.name}</span>
                      {item.error && <span className="mt-1 block text-xs text-cre-warning">{item.error}</span>}
                    </span>
                    <span className={`status-badge ${uploadStatusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </li>
                ))}
              </ul>
              {hasPdf && (
                <p className="mt-3 text-xs leading-5 text-cre-warning" data-testid="quick-pdf-note">
                  PDFs upload and open for one-click extraction in the deal — they don't auto-fill like CSV
                  or Excel rent rolls and T12s. You'll review and apply their fields once the deal opens.
                </p>
              )}
            </div>
            {error && (
              <p className="border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</p>
            )}
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-cre-border px-6 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              data-testid="quick-deal-cancel"
              className="portal-button portal-button-secondary w-full sm:w-auto"
              disabled={working}
              onClick={onCancel}
            >
              Cancel
            </button>
            {savedDealId && failedCount > 0 && (
              <>
                <button
                  type="button"
                  data-testid="quick-deal-open-anyway"
                  className="portal-button portal-button-secondary w-full sm:w-auto"
                  disabled={working}
                  onClick={() => onCreated(savedDealId)}
                >
                  Open Workspace
                </button>
                <button
                  type="button"
                  data-testid="quick-deal-retry-failed"
                  className="portal-button portal-button-secondary w-full sm:w-auto"
                  disabled={working}
                  onClick={() => void handleRetryFailed()}
                >
                  Retry Failed
                </button>
              </>
            )}
            <button
              type="button"
              data-testid="quick-deal-create"
              className="portal-button portal-button-primary w-full sm:w-auto"
              disabled={createDisabled}
              onClick={() => void handleCreate()}
            >
              {!dealIdReady ? 'Preparing Deal ID' : working ? 'Preparing Team' : 'Create Workspace & Upload'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
