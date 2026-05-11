import { useRef, useState } from 'react'

interface DropZoneHeroProps {
  onFilesSelected: (files: File[]) => void
  onTryDemo: () => void
  starting: boolean
  runError: string | null
}

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
    onFilesSelected(files)
  }

  return (
    <section
      data-testid="drop-zone-hero"
      className={`min-h-[50vh] border border-dashed p-6 transition-colors md:p-10 ${
        dragging
          ? 'border-white bg-white/[0.08]'
          : 'border-white/20 bg-black/70 hover:border-white/40'
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
        <p className="portal-kicker">Acquisition Cockpit</p>
        <h2 className="mt-3 max-w-4xl font-serif text-4xl font-semibold leading-none text-white md:text-6xl">
          Drop your deal documents here
        </h2>
        <p className="mt-5 max-w-3xl text-sm leading-6 text-gray-400 md:text-base">
          Rent rolls, T12s, OMs, LOIs, PSAs, title, insurance, and lender files can start the deal workspace before you fill out the full intake.
        </p>
        <p className="mt-3 text-xs font-semibold uppercase text-gray-500">
          CSV, TXT, and Markdown extract locally. PDFs are stored for review. Excel files are stored and classified; field mapping is coming.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-testid="drop-zone-browse"
            className="portal-button portal-button-primary"
            onClick={() => inputRef.current?.click()}
          >
            Browse Files
          </button>
          <button
            type="button"
            data-testid="drop-zone-demo"
            className="portal-button portal-button-secondary"
            disabled={starting}
            onClick={onTryDemo}
          >
            {starting ? 'Starting Demo' : 'Try Demo Deal'}
          </button>
        </div>
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
