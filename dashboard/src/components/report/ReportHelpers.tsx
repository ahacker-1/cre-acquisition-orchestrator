import React from 'react'

/* ------------------------------------------------------------------ */
/*  Number / String / Type-safe accessors                              */
/* ------------------------------------------------------------------ */

export function safeNum(val: unknown, fallback: number = 0): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

export function safeStr(val: unknown, fallback: string = '--'): string {
  if (typeof val === 'string' && val.length > 0) return val
  return fallback
}

export function safeBool(val: unknown, fallback: boolean = false): boolean {
  if (typeof val === 'boolean') return val
  return fallback
}

export function safeArr(val: unknown): unknown[] {
  return Array.isArray(val) ? val : []
}

export function safeObj(val: unknown): Record<string, unknown> {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>
  }
  return {}
}

/* ------------------------------------------------------------------ */
/*  Currency / percentage / multiplier formatters                      */
/* ------------------------------------------------------------------ */

/** Abbreviated currency: $32.0M, $640K, $1,225 — negatives shown as ($X) */
export function fmt$(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`
  return `${sign}$${abs.toLocaleString('en-US')}`
}

/** Full currency with commas, no abbreviation: $32,000,000 */
export function fmtFull$(n: number): string {
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  if (n < 0) return `($${formatted})`
  return `$${formatted}`
}

/** Percentage from decimal: 0.187 -> "18.7%" */
export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

/** Interest rate from decimal with basis-point precision: 0.0625 -> "6.25%" */
export function fmtRate(n: number): string {
  return `${(n * 100).toFixed(2)}%`
}

/** Multiplier: 2.1234 -> "2.12x" */
export function fmtX(n: number): string {
  return `${n.toFixed(2)}x`
}

/* ------------------------------------------------------------------ */
/*  Phase helpers                                                      */
/* ------------------------------------------------------------------ */

export const PHASE_ORDER = [
  'due_diligence',
  'underwriting',
  'financing',
  'legal',
  'closing',
] as const

export const PHASE_LABELS: Record<string, string> = {
  due_diligence: 'Due Diligence',
  underwriting: 'Underwriting',
  financing: 'Financing',
  legal: 'Legal',
  closing: 'Closing',
}

/** Returns a Tailwind class string for verdict badge background + text color */
export function verdictColor(v: string | null | undefined): string {
  if (!v) return 'bg-[#4b5563]/20 text-gray-400'
  const upper = v.toUpperCase()
  if (upper === 'PASS') return 'bg-cre-success/20 text-cre-success'
  if (upper === 'FAIL') return 'bg-cre-danger/20 text-cre-danger'
  if (upper.includes('CONDITIONAL') || upper.includes('MITIGATION'))
    return 'bg-cre-warning/20 text-cre-warning'
  if (upper === 'NEEDS_REVIEW') return 'bg-cre-info/20 text-cre-info'
  return 'bg-[#4b5563]/20 text-gray-400'
}

/** Human-friendly verdict label */
export function verdictLabel(v: string | null | undefined): string {
  if (!v) return 'PENDING'
  return v.toUpperCase().replace(/_/g, ' ')
}

/* ------------------------------------------------------------------ */
/*  Tiny shared React components                                       */
/* ------------------------------------------------------------------ */

/** Section heading: uppercase tracking, bottom border */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-cre-border pb-2">
      {children}
    </h3>
  )
}

/** Centered metric card with large value + small label */
export function MetricCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string
  value: string
  accent?: boolean
  sub?: string
}) {
  return (
    <div className="card text-center">
      <div
        className={`text-2xl font-bold font-mono tabular-nums ${
          accent ? 'text-cre-accent' : 'text-white'
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-gray-500 font-mono mt-0.5">{sub}</div>
      )}
      <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  )
}

/** Compact bg-black/20 rounded card for stat display */
export function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="bg-black/20 rounded-lg p-3 text-center">
      <div
        className={`text-lg font-bold font-mono tabular-nums ${color || 'text-white'}`}
      >
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  DataTable                                                          */
/* ------------------------------------------------------------------ */

export interface DataTableColumn {
  header: string
  key: string
  align?: 'left' | 'right' | 'center'
  format?: (val: unknown, row: Record<string, unknown>) => string
}

export function DataTable({
  columns,
  rows,
  highlightLast,
  compactMode,
}: {
  columns: DataTableColumn[]
  rows: Record<string, unknown>[]
  highlightLast?: boolean
  compactMode?: boolean
}) {
  const py = compactMode ? 'py-1.5' : 'py-2'

  const alignClass = (a?: string) => {
    if (a === 'right') return 'text-right'
    if (a === 'center') return 'text-center'
    return 'text-left'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cre-border text-xs text-gray-500 uppercase">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${py} font-medium ${alignClass(col.align)} px-2`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const isLast = rowIdx === rows.length - 1
            const rowClass = [
              'border-b border-cre-border/30 last:border-b-0',
              highlightLast && isLast ? 'bg-white/5 font-semibold' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <tr key={rowIdx} className={rowClass}>
                {columns.map((col, colIdx) => {
                  const raw = row[col.key]
                  const display = col.format
                    ? col.format(raw, row)
                    : String(raw ?? '--')
                  const isFirstCol = colIdx === 0
                  const cellClass = [
                    py,
                    'px-2',
                    'text-sm',
                    alignClass(col.align),
                    isFirstCol
                      ? 'text-gray-300'
                      : 'font-mono tabular-nums text-white',
                  ].join(' ')
                  return (
                    <td key={col.key} className={cellClass}>
                      {display}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
