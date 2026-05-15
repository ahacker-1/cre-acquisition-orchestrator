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

const OUTCOME_CHIPS: Array<{ id: OutcomeIntent; label: string; goal: string }> = [
  { id: 'screen-deal', label: 'Run go/no-go screen', goal: 'Tell me if this deal is worth pursuing' },
  { id: 'ic-package', label: 'Build IC package', goal: 'Build an IC-ready acquisition package' },
  { id: 'legal-blockers', label: 'Find legal blockers', goal: 'Review the PSA and diligence materials for blockers' },
  { id: 'financing-package', label: 'Compare financing paths', goal: 'Prepare a financing package and lender comparison' },
  { id: 'underwriting-refresh', label: 'Refresh the model', goal: 'Refresh the model and economics from the latest files' },
]

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
  const [selectedIntent, setSelectedIntent] = useState<OutcomeIntent>('ic-package')
  const [goalText, setGoalText] = useState('Build an IC-ready acquisition package')
  const inputRef = useRef<HTMLInputElement | null>(null)

  function handleFiles(files: File[]): void {
    if (files.length === 0) return
    setDragging(false)
    onFilesSelected(files, selectedIntent, goalText.trim())
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
        <p className="portal-kicker">Give your acquisition team a deal</p>
        <h2 className="mt-3 max-w-4xl font-serif text-4xl font-semibold leading-none text-white md:text-6xl">
          Drop the deal. Watch the team go to work.
        </h2>
        <p className="mt-5 max-w-3xl text-sm leading-6 text-gray-400 md:text-base">
          Upload the source package, choose the outcome, and the orchestrator will staff specialist agents for diligence, underwriting, legal review, financing, blockers, and IC package assembly.
        </p>
        <p className="mt-3 text-xs font-semibold uppercase text-gray-500">
          Source-backed extraction is local-first. CSV, TXT, and Markdown extract now; PDFs and Excel stay stored for review/classification.
        </p>

        <div className="mt-8 w-full max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            What should the team accomplish?
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {OUTCOME_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`portal-button ${selectedIntent === chip.id ? 'portal-button-primary' : 'portal-button-secondary'}`}
                data-testid={`outcome-chip-${chip.id}`}
                onClick={() => {
                  setSelectedIntent(chip.id)
                  setGoalText(chip.goal)
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <label className="portal-field mt-4 text-left">
            <span>Mission goal</span>
            <textarea
              data-testid="drop-zone-goal-input"
              rows={3}
              value={goalText}
              onChange={(event) => setGoalText(event.target.value)}
              placeholder="Example: Tell me if this deal is worth pursuing and identify the diligence blockers."
            />
          </label>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" data-testid="drop-zone-browse" className="portal-button portal-button-primary" onClick={() => inputRef.current?.click()}>
            Upload Source Package
          </button>
          <button type="button" data-testid="drop-zone-demo" className="portal-button portal-button-secondary" disabled={starting} onClick={onTryDemo}>
            {starting ? 'Staffing Demo Team' : 'Watch Demo Team Work'}
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
