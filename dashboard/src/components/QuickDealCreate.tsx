import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createDraftDealFromFiles } from '../lib/dealForm'
import type { DealFormData, SaveDealResponse } from '../types/deals'
import type { SourceDocument } from '../types/workspace'

interface QuickDealCreateProps {
  files: File[]
  suggestedDealId: string
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

export default function QuickDealCreate({
  files,
  suggestedDealId,
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

  useEffect(() => {
    if (isOpen) {
      setDealName(suggestedName)
      setError(null)
      setWorking(false)
    }
  }, [isOpen, suggestedName])

  useEffect(() => {
    if (!isOpen) return
    modalRef.current?.querySelector<HTMLInputElement>('[data-testid="quick-deal-name-input"]')?.focus()
  }, [isOpen])

  if (!isOpen) return null

  async function handleCreate(): Promise<void> {
    const trimmed = dealName.trim()
    if (!trimmed) {
      setError('Deal name is required.')
      return
    }

    setWorking(true)
    setError(null)
    try {
      const form = createDraftDealFromFiles(files.map((file) => file.name), trimmed, suggestedDealId)
      const saved = await saveDeal(form, 'draft')
      const dealId = saved.item.dealId
      for (const file of files) {
        await uploadDealDocument(dealId, file)
      }
      onCreated(dealId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setWorking(false)
    }
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-6">
        <section
          ref={modalRef}
          data-testid="quick-deal-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-deal-title"
          aria-describedby="quick-deal-description"
          onKeyDown={handleDialogKeyDown}
          className="w-full max-w-xl border border-cre-border bg-cre-surface shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        >
          <div className="border-b border-cre-border px-6 py-5">
            <p className="portal-kicker">Create Upload Workspace</p>
            <h2 id="quick-deal-title" className="portal-title">Name this deal</h2>
            <p id="quick-deal-description" className="mt-3 text-sm text-gray-400">
              I will create a draft, upload {files.length} file{files.length === 1 ? '' : 's'}, and open the Documents tab.
            </p>
          </div>
          <div className="space-y-4 p-6">
            <label className="portal-field">
              <span>Deal Name</span>
              <input
                data-testid="quick-deal-name-input"
                value={dealName}
                onChange={(event) => setDealName(event.target.value)}
              />
            </label>
            <div className="border border-white/10 bg-black p-3">
              <p className="text-xs font-semibold uppercase text-gray-500">Files queued</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-300">
                {files.slice(0, 4).map((file) => (
                  <li key={`${file.name}-${file.size}`} className="truncate">{file.name}</li>
                ))}
              </ul>
              {files.length > 4 && <p className="mt-2 text-xs text-gray-500">+ {files.length - 4} more</p>}
            </div>
            {error && (
              <p className="border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-cre-border px-6 py-4">
            <button
              type="button"
              data-testid="quick-deal-cancel"
              className="portal-button portal-button-secondary"
              disabled={working}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="quick-deal-create"
              className="portal-button portal-button-primary"
              disabled={working}
              onClick={() => void handleCreate()}
            >
              {working ? 'Creating' : 'Create & Upload'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
