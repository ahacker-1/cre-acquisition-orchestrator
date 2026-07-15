import { useState, type FormEvent } from 'react'
import { IconArrowUpRight, IconSend } from '@tabler/icons-react'
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
      className="border-t border-white/[0.08] bg-transparent py-4"
      aria-label="Command your team"
    >
      {suggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.intent}
              type="button"
              data-testid={`command-chip-${index}`}
              data-intent={suggestion.intent}
              disabled={disabled}
              onClick={() => onSuggestion(suggestion)}
              className="group inline-flex min-h-8 items-center gap-1.5 border-b border-white/[0.12] py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#aab4bb] transition-colors hover:border-[#c98d61] hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#c98d61] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggestion.label}
              <IconArrowUpRight
                size={12}
                stroke={1.6}
                aria-hidden="true"
                className="text-[#c98d61] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex min-h-[76px] items-center gap-3 border border-white/[0.14] bg-[#0a151d]/60 px-4 py-3 transition-colors focus-within:border-[#c98d61]/70"
      >
        <input
          data-testid="command-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={disabled}
          placeholder="Tell your team what to do…"
          aria-label="Tell your team what to do"
          className="min-w-0 flex-1 bg-transparent text-sm text-[#eef1f2] placeholder:text-[#71808a] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          data-testid="command-submit"
          disabled={disabled || !text.trim()}
          aria-label="Send"
          className="inline-flex size-11 shrink-0 items-center justify-center border border-[#de9d6c] bg-[#a75f3c] text-white transition-colors hover:bg-[#b86c46] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#efb184] disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.035] disabled:text-[#66737c]"
        >
          <IconSend size={18} stroke={1.5} aria-hidden="true" />
          <span className="sr-only">Send</span>
        </button>
      </form>
    </section>
  )
}
