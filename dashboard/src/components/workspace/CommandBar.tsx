import { useState, type FormEvent } from 'react'
import type { CommandSuggestion } from '../../lib/commandModel'

interface CommandBarProps {
  suggestions: CommandSuggestion[]
  onSubmit: (text: string) => void
  onSuggestion: (suggestion: CommandSuggestion) => void
  disabled?: boolean
}

/**
 * The one place you dispatch work: a "tell your team…" prompt + context-aware suggestion
 * chips. Replaces the old workflow launcher for the everyday path. Routing of the typed
 * text / chosen intent is wired in Phase 3 (intentRouting); this shell just emits them.
 */
export default function CommandBar({ suggestions, onSubmit, onSuggestion, disabled }: CommandBarProps) {
  const [text, setText] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setText('')
  }

  return (
    <section
      data-testid="command-bar"
      className="border-t border-white/10 bg-white/[0.02] px-4 py-3 md:px-5"
      aria-label="Command your team"
    >
      {suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.intent}
              type="button"
              data-testid={`command-chip-${index}`}
              data-intent={suggestion.intent}
              disabled={disabled}
              onClick={() => onSuggestion(suggestion)}
              className="border border-white/15 px-3 py-1 text-[11px] text-gray-300 transition-colors hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 border border-white/20 px-3 py-2 focus-within:border-white/40">
        <span className="text-cre-live" aria-hidden="true">▸</span>
        <input
          data-testid="command-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={disabled}
          placeholder="Tell your team what to do…"
          aria-label="Tell your team what to do"
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none"
        />
        <button
          type="submit"
          data-testid="command-submit"
          disabled={disabled || !text.trim()}
          className="portal-button portal-button-secondary min-h-9 px-3 py-1"
        >
          Send
        </button>
      </form>
    </section>
  )
}
