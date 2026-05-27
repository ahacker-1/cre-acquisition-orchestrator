import { useRef, useState } from 'react'

export type OutcomeIntent =
  | 'screen-deal'
  | 'ic-package'
  | 'legal-blockers'
  | 'financing-package'
  | 'underwriting-refresh'

interface DropZoneHeroProps {
  onFilesSelected: (files: File[], intent: OutcomeIntent, goalText: string) => void
  onTryDemo: () => void
  starting: boolean
  runError: string | null
}

// The redesign makes dropping documents the one, obvious way to start a deal — no outcome
// picker or mission-goal form up front (that friction is what made starting confusing). Intent
// defaults to a full IC package and is changeable later via the in-workspace command bar.
const DEFAULT_INTENT: OutcomeIntent = 'ic-package'
const DEFAULT_GOAL = 'Build an IC-ready acquisition package'

function toFileArray(files: FileList | null): File[] {
  return files ? Array.from(files) : []
}

export default function DropZoneHero({
  onFilesSelected,
  onTryDemo,
  starting,
  runError,
}: DropZoneHeroProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function handleFiles(files: File[]): void {
    if (files.length === 0) return
    setDragging(false)
    onFilesSelected(files, DEFAULT_INTENT, DEFAULT_GOAL)
  }

  return (
    <section
      data-testid="drop-zone-hero"
      className={`min-h-[50vh] border border-dashed p-6 transition-colors md:p-10 ${
        dragging ? 'border-white bg-white/[0.08]' : 'border-white/20 bg-black/70 hover:border-white/40'
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
      <div className="flex min-h-[calc(50vh-5rem)] flex-col items-center justify-center text-center">
        <div className="mb-7 flex h-20 w-20 items-center justify-center border border-white/20 bg-white/[0.04]">
          <svg className="h-10 w-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7.2L9.8 5H5a2 2 0 0 0-2 2.5Z" strokeWidth="1.8" />
            <path d="M12 16V9.5M9.5 12l2.5-2.5 2.5 2.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="portal-kicker">Give your acquisition team a deal</p>
        <h2 className="mt-3 max-w-4xl font-serif text-4xl font-semibold leading-none text-white md:text-6xl">
          Drop the deal. Watch the team go to work.
        </h2>
        <p className="mt-5 max-w-3xl text-sm leading-6 text-gray-400 md:text-base">
          Drop your rent roll, T12, and offering memo. The team reads them, fills in the deal record for you,
          and flags anything that needs your eye — no forms, no manual entry to get started.
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          Source-backed extraction is local-first. CSV, TXT, Markdown, and supported XLSX rent rolls or T12s
          auto-fill now; PDFs are stored for review.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-testid="drop-zone-browse"
            className="portal-button portal-button-primary"
            onClick={() => inputRef.current?.click()}
          >
            Upload Source Package
          </button>
          <button
            type="button"
            data-testid="guided-demo-front-door-cta"
            className="portal-button portal-button-secondary"
            disabled={starting}
            onClick={onTryDemo}
          >
            {starting ? 'Opening Guided Demo' : 'Start Guided Demo'}
          </button>
        </div>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-gray-500">
          No uploads or API keys required for the demo. Guided Demo opens the deterministic Parkview sample and
          walks the lifecycle spine, the live team feed, and the IC package.
        </p>
        {runError && <p className="mt-4 text-xs text-cre-danger">{runError}</p>}
      </div>

      <input
        ref={inputRef}
        data-testid="drop-zone-input"
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          handleFiles(toFileArray(event.target.files))
          event.currentTarget.value = ''
        }}
      />
    </section>
  )
}
