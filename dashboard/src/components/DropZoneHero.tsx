import { IconArrowUpRight, IconFileUpload } from '@tabler/icons-react'
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
      className={`relative min-h-[62vh] overflow-hidden border-y transition-colors duration-300 ${
        dragging
          ? 'border-[#c8895b]/70 bg-[#c8895b]/[0.08]'
          : 'border-white/[0.09] bg-[#0a141c] hover:border-white/[0.16]'
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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_30%,rgba(184,116,70,0.08),transparent_32%)]"
      />
      <div className="relative mx-auto grid min-h-[62vh] max-w-[1380px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col justify-center px-6 py-16 sm:px-10 lg:px-14 lg:py-24 xl:px-20">
          <div className="flex items-center gap-4">
            <span className="h-px w-9 bg-[#c8895b]" aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#c8895b]">
              Give your acquisition team a deal
            </p>
          </div>
          <h2 className="mt-7 max-w-4xl font-serif text-5xl font-normal leading-[0.96] tracking-[-0.035em] text-[#f0eee8] sm:text-6xl lg:text-7xl">
            Drop the deal. Watch the team go to work.
          </h2>
          <p className="mt-8 max-w-2xl text-sm leading-7 text-[#9ba6ad] md:text-[15px]">
            Drop your rent roll, T12, and offering memo. The team reads them, fills in the deal record for you,
            and flags anything that needs your eye — the numbers come from your documents, not a data-entry form.
          </p>
          <p className="mt-6 max-w-3xl border-t border-white/[0.08] pt-5 text-[10px] font-medium uppercase leading-5 tracking-[0.13em] text-[#65747d]">
            Source-backed extraction is local-first. CSV, TXT, Markdown, and supported XLSX rent rolls or T12s
            auto-fill now; PDFs upload for one-click extraction.
          </p>
          {runError && (
            <p className="mt-5 text-xs text-[#df8378]" role="alert">
              {runError}
            </p>
          )}
        </div>

        <div className="flex flex-col justify-center border-t border-white/[0.08] px-6 py-12 sm:px-10 lg:border-l lg:border-t-0 lg:px-10 lg:py-16">
          <IconFileUpload
            aria-hidden="true"
            stroke={1.25}
            className={`h-10 w-10 transition-colors ${dragging ? 'text-[#d79a6b]' : 'text-[#7d8a92]'}`}
          />
          <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#718089]">
            Source package
          </p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-[#b4bdc2]">
            Drag files anywhere into this field, or select them from your computer.
          </p>
          <button
            type="button"
            data-testid="drop-zone-browse"
            className="mt-8 inline-flex min-h-12 items-center justify-between gap-8 bg-[#b87345] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0a141c] transition-colors hover:bg-[#ca8656] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d59667]"
            onClick={() => inputRef.current?.click()}
          >
            Upload Source Package
            <IconArrowUpRight aria-hidden="true" className="h-4 w-4" stroke={1.8} />
          </button>
          <button
            type="button"
            data-testid="guided-demo-front-door-cta"
            className="mt-5 inline-flex min-h-10 items-center justify-between border-b border-white/[0.12] py-3 text-left text-[11px] font-medium uppercase tracking-[0.13em] text-[#aeb8bd] transition-colors hover:border-[#b87345]/70 hover:text-[#f0eee8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d59667] disabled:cursor-wait disabled:opacity-50"
            disabled={starting}
            onClick={onTryDemo}
          >
            {starting ? 'Opening Guided Demo' : 'Start Guided Demo'}
            <IconArrowUpRight aria-hidden="true" className="h-4 w-4 text-[#b87345]" stroke={1.5} />
          </button>
          <p className="mt-5 text-[11px] leading-5 text-[#63717a]">
            No uploads or API keys required for the demo. Guided Demo opens the deterministic Parkview sample and
            walks the lifecycle spine, the live team feed, and the IC package.
          </p>
        </div>
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
