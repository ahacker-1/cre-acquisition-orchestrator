import { useLayoutEffect, useState, type ReactNode } from 'react'
import {
  createEmptyDealForm,
  createEmptyUnitMixRow,
  hydrateDealFormData,
  launchScenarioForStrategy,
  totalUnitMixCount,
} from '../lib/dealForm'
import type {
  DealFormData,
  DealRecordResponse,
  DealValidationIssue,
  DealValidationResult,
  LaunchScenario,
  UnitMixRowForm,
} from '../types/deals'

interface DealIntakeWizardProps {
  isOpen: boolean
  suggestedDealId: string
  editingDealId: string | null
  onClose: () => void
  onLoadDeal: (dealId: string) => Promise<DealRecordResponse>
  onValidateDeal: (
    form: DealFormData,
    mode: 'draft' | 'launch',
    currentDealId?: string,
  ) => Promise<DealValidationResult>
  onSaveDeal: (
    form: DealFormData,
    mode: 'draft' | 'launch',
    currentDealId?: string,
  ) => Promise<DealRecordResponse>
  onLaunchDeal: (
    dealId: string,
    options: { scenario: LaunchScenario; speed: 'fast' | 'normal' | 'slow'; reset?: boolean },
  ) => Promise<unknown>
  onSaved: (dealId?: string, intent?: 'draft' | 'launch' | 'documents') => void
  onLaunched: () => void
}

const STEPS = [
  'Basics',
  'Property',
  'Unit Mix',
  'Financials',
  'Timeline',
  'Review',
] as const

function toNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string
  issues: DealValidationIssue[]
  tone: 'error' | 'warning'
}) {
  if (issues.length === 0) return null

  const containerClass =
    tone === 'error'
      ? 'border border-cre-danger/40 bg-cre-danger/10'
      : 'border border-cre-warning/40 bg-cre-warning/10'
  const titleClass = tone === 'error' ? 'text-cre-danger' : 'text-cre-warning'

  return (
    <div className={`rounded-xl p-4 ${containerClass}`}>
      <h4 className={`text-sm font-semibold ${titleClass}`}>{title}</h4>
      <ul className="mt-3 space-y-2 text-sm text-gray-200">
        {issues.map((issue) => (
          <li key={`${issue.path}-${issue.message}`} className="rounded-lg bg-black/20 px-3 py-2">
            <div className="font-medium">{issue.path || 'general'}</div>
            <div className="text-gray-400 mt-1">{issue.message}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Field({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-200 mb-2">{label}</span>
      {children}
      {helper && <span className="block text-xs text-gray-500 mt-2">{helper}</span>}
    </label>
  )
}

function inputClassName(): string {
  return 'w-full rounded-xl border border-cre-border bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-cre-accent'
}

function buttonClassName(kind: 'primary' | 'secondary' | 'ghost'): string {
  if (kind === 'primary') {
    return 'px-4 py-2.5 text-sm font-semibold uppercase bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  }
  if (kind === 'secondary') {
    return 'px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/8 text-gray-100 hover:bg-white/12 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  }
  return 'px-4 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
}

function statValue(value: string, label: string) {
  return (
    <div className="rounded-xl bg-black/20 px-4 py-3">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="text-xs uppercase tracking-wider text-gray-500 mt-1">{label}</div>
    </div>
  )
}

export default function DealIntakeWizard({
  isOpen,
  suggestedDealId,
  editingDealId,
  onClose,
  onLoadDeal,
  onValidateDeal,
  onSaveDeal,
  onLaunchDeal,
  onSaved,
  onLaunched,
}: DealIntakeWizardProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<DealFormData>(() => createEmptyDealForm(suggestedDealId))
  const [currentDealId, setCurrentDealId] = useState<string | undefined>(undefined)
  const [loadingDeal, setLoadingDeal] = useState(false)
  const [validation, setValidation] = useState<DealValidationResult | null>(null)
  const [workingState, setWorkingState] = useState<'saving' | 'launching' | 'checking' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (!isOpen) return

    let cancelled = false

    async function load(): Promise<void> {
      setSaveError(null)
      setValidation(null)
      setStepIndex(0)

      if (!editingDealId) {
        setCurrentDealId(undefined)
        setForm(createEmptyDealForm(suggestedDealId))
        return
      }

      setLoadingDeal(true)
      try {
        const record = await onLoadDeal(editingDealId)
        if (cancelled) return
        setCurrentDealId(record.item.kind === 'user' ? record.item.dealId : undefined)
        setForm(hydrateDealFormData(record.deal, suggestedDealId))
        setValidation(record.item.kind === 'user' ? record.validation : null)
      } catch (err) {
        if (cancelled) return
        setSaveError(err instanceof Error ? err.message : String(err))
        setCurrentDealId(undefined)
        setForm(createEmptyDealForm(suggestedDealId))
      } finally {
        if (!cancelled) {
          setLoadingDeal(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [editingDealId, isOpen])

  if (!isOpen) return null

  function updateUnitMixRow(rowId: string, updater: (row: UnitMixRowForm) => UnitMixRowForm): void {
    setForm((current) => ({
      ...current,
      property: {
        ...current.property,
        unitMix: {
          types: current.property.unitMix.types.map((row) =>
            row.id === rowId ? updater(row) : row
          ),
        },
      },
    }))
  }

  async function refreshLaunchValidation(): Promise<void> {
    setWorkingState('checking')
    setSaveError(null)
    try {
      const result = await onValidateDeal(form, 'launch', currentDealId)
      setValidation(result)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorkingState(null)
    }
  }

  async function saveDraft(): Promise<void> {
    setWorkingState('saving')
    setSaveError(null)
    try {
      const saved = await onSaveDeal(form, 'draft', currentDealId)
      onSaved(saved.item.dealId, 'documents')
      onClose()
    } catch (err) {
      const error = err as Error & { validation?: DealValidationResult }
      if (error.validation) {
        setValidation(error.validation)
      }
      setSaveError(error.message)
    } finally {
      setWorkingState(null)
    }
  }

  async function saveAndLaunch(): Promise<void> {
    setWorkingState('launching')
    setSaveError(null)
    try {
      const saved = await onSaveDeal(form, 'launch', currentDealId)
      setValidation(saved.validation)
      await onLaunchDeal(saved.item.dealId, {
        scenario: form.launch.scenario,
        speed: form.launch.speed,
        reset: false,
      })
      onSaved()
      onLaunched()
      onClose()
    } catch (err) {
      const error = err as Error & { validation?: DealValidationResult }
      if (error.validation) {
        setValidation(error.validation)
      }
      setSaveError(error.message)
    } finally {
      setWorkingState(null)
    }
  }

  async function handleNext(): Promise<void> {
    if (stepIndex === STEPS.length - 2) {
      await refreshLaunchValidation()
    }
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1))
  }

  const launchBlockingIssues = validation?.blockingIssues ?? []
  const warningIssues = validation?.warnings ?? []
  const reviewReady = validation?.launchReady ?? false
  const totalUnitsFromMix = totalUnitMixCount(form)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-6 lg:p-10">
        <div
          data-testid="deal-wizard-modal"
          className="w-full max-w-6xl border border-cre-border bg-cre-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        >
          <div className="border-b border-cre-border px-6 py-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cre-accent font-semibold">
                New Deal Wizard
              </p>
              <h2 className="text-2xl font-bold text-white mt-2">
                {editingDealId ? 'Edit Deal' : 'Create a Deal'}
              </h2>
              <p className="text-sm text-gray-500 mt-2 max-w-2xl">
                Start with a deal name, save a draft, then upload rent rolls, T12s, offering memoranda, LOIs, and legal files into the deal workspace for extraction before launch.
              </p>
            </div>
            <button
              onClick={onClose}
              data-testid="deal-wizard-close"
              className="rounded-full p-2 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
              aria-label="Close wizard"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                <path d="M5 5L15 15M15 5L5 15" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="px-6 pt-5">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {STEPS.map((step, index) => {
                const active = index === stepIndex
                const complete = index < stepIndex
                return (
                  <div
                    key={step}
                    className={`rounded-2xl border px-3 py-3 transition-colors ${
                      active
                        ? 'border-cre-accent bg-cre-accent/10'
                        : complete
                          ? 'border-cre-success/30 bg-cre-success/10'
                          : 'border-cre-border bg-black/10'
                    }`}
                  >
                    <div className="text-[11px] uppercase tracking-wider text-gray-500">
                      Step {index + 1}
                    </div>
                    <div className={`text-sm font-semibold mt-1 ${active ? 'text-white' : 'text-gray-300'}`}>
                      {step}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="px-6 py-6 space-y-6">
            {saveError && (
              <div className="rounded-xl border border-cre-danger/40 bg-cre-danger/10 px-4 py-3 text-sm text-cre-danger">
                {saveError}
              </div>
            )}

            {loadingDeal ? (
              <div className="card text-sm text-gray-400">Loading deal…</div>
            ) : (
              <>
                {stepIndex === 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Field label="Deal ID" helper="Suggested format: DEAL-YYYY-NNN">
                        <input
                          className={inputClassName()}
                          data-testid="deal-id-input"
                          value={form.dealId}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, dealId: event.target.value.toUpperCase() }))
                        }
                        placeholder={suggestedDealId}
                      />
                    </Field>
                    <Field label="Deal Name">
                      <input
                        className={inputClassName()}
                        data-testid="deal-name-input"
                        value={form.dealName}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, dealName: event.target.value }))
                        }
                        placeholder="Parkview Apartments"
                      />
                    </Field>
                    <Field label="Investment Strategy">
                      <select
                        className={inputClassName()}
                        value={form.investmentStrategy}
                        onChange={(event) => {
                          const strategy = event.target.value as DealFormData['investmentStrategy']
                          setForm((current) => ({
                            ...current,
                            investmentStrategy: strategy,
                            launch: {
                              ...current.launch,
                              scenario: launchScenarioForStrategy(strategy),
                            },
                          }))
                        }}
                      >
                        <option value="core">Core</option>
                        <option value="core-plus">Core Plus</option>
                        <option value="value-add">Value Add</option>
                        <option value="opportunistic">Opportunistic</option>
                      </select>
                    </Field>
                    <Field label="Target Hold Period (years)">
                      <input
                        type="number"
                        className={inputClassName()}
                        value={form.targetHoldPeriod ?? ''}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, targetHoldPeriod: toNumber(event.target.value) }))
                        }
                        placeholder="5"
                      />
                    </Field>
                    <Field label="Target IRR (decimal)" helper="Example: 0.15 for 15%">
                      <input
                        type="number"
                        step="0.01"
                        className={inputClassName()}
                        value={form.targetIRR ?? ''}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, targetIRR: toNumber(event.target.value) }))
                        }
                        placeholder="0.15"
                      />
                    </Field>
                    <Field label="Target Equity Multiple">
                      <input
                        type="number"
                        step="0.1"
                        className={inputClassName()}
                        value={form.targetEquityMultiple ?? ''}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, targetEquityMultiple: toNumber(event.target.value) }))
                        }
                        placeholder="1.8"
                      />
                    </Field>
                    <Field label="Target Cash-on-Cash (decimal)" helper="Example: 0.08 for 8%">
                      <input
                        type="number"
                        step="0.01"
                        className={inputClassName()}
                        value={form.targetCashOnCash ?? ''}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, targetCashOnCash: toNumber(event.target.value) }))
                        }
                        placeholder="0.08"
                      />
                    </Field>
                    <Field label="Notes" helper="Optional context for the deal">
                      <textarea
                        className={`${inputClassName()} min-h-[120px]`}
                        value={form.notes}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder="Seller motivations, strategic context, major caveats…"
                      />
                    </Field>
                  </div>
                )}

                {stepIndex === 1 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Field label="Street Address">
                      <input
                        className={inputClassName()}
                        value={form.property.address}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            property: { ...current.property, address: event.target.value },
                          }))
                        }
                        placeholder="4200 Parkview Drive"
                      />
                    </Field>
                    <Field label="City">
                      <input
                        className={inputClassName()}
                        value={form.property.city}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            property: { ...current.property, city: event.target.value },
                          }))
                        }
                        placeholder="Austin"
                      />
                    </Field>
                    <Field label="State" helper="Two-letter abbreviation">
                      <input
                        className={inputClassName()}
                        value={form.property.state}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            property: { ...current.property, state: event.target.value.toUpperCase() },
                          }))
                        }
                        placeholder="TX"
                        maxLength={2}
                      />
                    </Field>
                    <Field label="ZIP Code">
                      <input
                        className={inputClassName()}
                        value={form.property.zip}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            property: { ...current.property, zip: event.target.value },
                          }))
                        }
                        placeholder="78745"
                      />
                    </Field>
                    <Field label="Property Type">
                      <select
                        className={inputClassName()}
                        value={form.property.propertyType}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            property: {
                              ...current.property,
                              propertyType: event.target.value as DealFormData['property']['propertyType'],
                            },
                          }))
                        }
                      >
                        <option value="multifamily">Multifamily</option>
                        <option value="office">Office</option>
                        <option value="retail">Retail</option>
                        <option value="industrial">Industrial</option>
                      </select>
                    </Field>
                    <Field label="Year Built">
                      <input
                        type="number"
                        className={inputClassName()}
                        value={form.property.yearBuilt ?? ''}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            property: { ...current.property, yearBuilt: toNumber(event.target.value) },
                          }))
                        }
                        placeholder="1998"
                      />
                    </Field>
                    <Field label="Total Units">
                      <input
                        type="number"
                        className={inputClassName()}
                        value={form.property.totalUnits ?? ''}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            property: { ...current.property, totalUnits: toNumber(event.target.value) },
                          }))
                        }
                        placeholder="200"
                      />
                    </Field>
                  </div>
                )}

                {stepIndex === 2 && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="text-lg font-semibold text-white">Unit Mix</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Add one row per unit type. The count should add up to total units.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-black/20 px-4 py-3 text-right">
                          <div className="text-lg font-semibold text-white">{totalUnitsFromMix}</div>
                          <div className="text-xs uppercase tracking-wider text-gray-500">Units in mix</div>
                        </div>
                        <button
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              property: {
                                ...current.property,
                                unitMix: {
                                  types: [...current.property.unitMix.types, createEmptyUnitMixRow()],
                                },
                              },
                            }))
                          }
                          className={buttonClassName('secondary')}
                        >
                          Add Row
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {form.property.unitMix.types.map((row, index) => (
                        <div key={row.id} className="rounded-2xl border border-cre-border bg-black/15 p-4">
                          <div className="flex items-center justify-between gap-3 mb-4">
                            <div className="text-sm font-semibold text-gray-200">Unit Type {index + 1}</div>
                            {form.property.unitMix.types.length > 1 && (
                              <button
                                onClick={() =>
                                  setForm((current) => ({
                                    ...current,
                                    property: {
                                      ...current.property,
                                      unitMix: {
                                        types: current.property.unitMix.types.filter((item) => item.id !== row.id),
                                      },
                                    },
                                  }))
                                }
                                className="text-sm text-cre-danger hover:text-red-300 transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <Field label="Type">
                              <input
                                className={inputClassName()}
                                value={row.type}
                                onChange={(event) =>
                                  updateUnitMixRow(row.id, (current) => ({ ...current, type: event.target.value }))
                                }
                                placeholder="1BR/1BA"
                              />
                            </Field>
                            <Field label="Count">
                              <input
                                type="number"
                                className={inputClassName()}
                                value={row.count ?? ''}
                                onChange={(event) =>
                                  updateUnitMixRow(row.id, (current) => ({ ...current, count: toNumber(event.target.value) }))
                                }
                                placeholder="80"
                              />
                            </Field>
                            <Field label="Avg Sq Ft">
                              <input
                                type="number"
                                className={inputClassName()}
                                value={row.avgSqFt ?? ''}
                                onChange={(event) =>
                                  updateUnitMixRow(row.id, (current) => ({ ...current, avgSqFt: toNumber(event.target.value) }))
                                }
                                placeholder="750"
                              />
                            </Field>
                            <Field label="Market Rent">
                              <input
                                type="number"
                                className={inputClassName()}
                                value={row.marketRent ?? ''}
                                onChange={(event) =>
                                  updateUnitMixRow(row.id, (current) => ({ ...current, marketRent: toNumber(event.target.value) }))
                                }
                                placeholder="1500"
                              />
                            </Field>
                            <Field label="In-Place Rent">
                              <input
                                type="number"
                                className={inputClassName()}
                                value={row.inPlaceRent ?? ''}
                                onChange={(event) =>
                                  updateUnitMixRow(row.id, (current) => ({ ...current, inPlaceRent: toNumber(event.target.value) }))
                                }
                                placeholder="1400"
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stepIndex === 3 && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="space-y-5">
                      <h3 className="text-lg font-semibold text-white">Financials</h3>
                      <Field label="Asking Price">
                        <input
                          type="number"
                          className={inputClassName()}
                          value={form.financials.askingPrice ?? ''}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              financials: { ...current.financials, askingPrice: toNumber(event.target.value) },
                            }))
                          }
                          placeholder="32000000"
                        />
                      </Field>
                      <Field label="Current NOI">
                        <input
                          type="number"
                          className={inputClassName()}
                          value={form.financials.currentNOI ?? ''}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              financials: { ...current.financials, currentNOI: toNumber(event.target.value) },
                            }))
                          }
                          placeholder="1976500"
                        />
                      </Field>
                      <Field label="In-Place Occupancy (decimal)" helper="Example: 0.93">
                        <input
                          type="number"
                          step="0.01"
                          className={inputClassName()}
                          value={form.financials.inPlaceOccupancy ?? ''}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              financials: { ...current.financials, inPlaceOccupancy: toNumber(event.target.value) },
                            }))
                          }
                          placeholder="0.93"
                        />
                      </Field>
                    </div>

                    <div className="space-y-5">
                      <h3 className="text-lg font-semibold text-white">Financing</h3>
                      <Field label="Target LTV (decimal)">
                        <input
                          type="number"
                          step="0.01"
                          className={inputClassName()}
                          value={form.financing.targetLTV ?? ''}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              financing: { ...current.financing, targetLTV: toNumber(event.target.value) },
                            }))
                          }
                          placeholder="0.75"
                        />
                      </Field>
                      <Field label="Estimated Rate (decimal)">
                        <input
                          type="number"
                          step="0.001"
                          className={inputClassName()}
                          value={form.financing.estimatedRate ?? ''}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              financing: { ...current.financing, estimatedRate: toNumber(event.target.value) },
                            }))
                          }
                          placeholder="0.065"
                        />
                      </Field>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Field label="Loan Term">
                          <input
                            type="number"
                            className={inputClassName()}
                            value={form.financing.loanTerm ?? ''}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                financing: { ...current.financing, loanTerm: toNumber(event.target.value) },
                              }))
                            }
                            placeholder="10"
                          />
                        </Field>
                        <Field label="Amortization">
                          <input
                            type="number"
                            className={inputClassName()}
                            value={form.financing.amortization ?? ''}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                financing: { ...current.financing, amortization: toNumber(event.target.value) },
                              }))
                            }
                            placeholder="30"
                          />
                        </Field>
                        <Field label="Loan Type">
                          <select
                            className={inputClassName()}
                            value={form.financing.loanType}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                financing: {
                                  ...current.financing,
                                  loanType: event.target.value as DealFormData['financing']['loanType'],
                                },
                              }))
                            }
                          >
                            <option value="Agency">Agency</option>
                            <option value="CMBS">CMBS</option>
                            <option value="Bank">Bank</option>
                            <option value="Bridge">Bridge</option>
                            <option value="Life Company">Life Company</option>
                            <option value="HUD">HUD</option>
                          </select>
                        </Field>
                      </div>
                    </div>
                  </div>
                )}

                {stepIndex === 4 && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="space-y-5">
                      <h3 className="text-lg font-semibold text-white">Counterparty</h3>
                      <Field label="Seller Entity">
                        <input
                          className={inputClassName()}
                          value={form.seller.entity}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              seller: { entity: event.target.value },
                            }))
                          }
                          placeholder="Seller LLC"
                        />
                      </Field>
                      <h3 className="text-lg font-semibold text-white pt-3">Launch Settings</h3>
                      <Field label="Scenario">
                        <select
                          className={inputClassName()}
                          value={form.launch.scenario}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              launch: {
                                ...current.launch,
                                scenario: event.target.value as DealFormData['launch']['scenario'],
                              },
                            }))
                          }
                        >
                          <option value="core-plus">Core Plus</option>
                          <option value="value-add">Value Add</option>
                          <option value="distressed">Distressed</option>
                        </select>
                      </Field>
                      <Field label="Speed">
                        <select
                          className={inputClassName()}
                          value={form.launch.speed}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              launch: {
                                ...current.launch,
                                speed: event.target.value as DealFormData['launch']['speed'],
                              },
                            }))
                          }
                        >
                          <option value="fast">Fast</option>
                          <option value="normal">Normal</option>
                          <option value="slow">Slow</option>
                        </select>
                      </Field>
                    </div>

                    <div className="space-y-5">
                      <h3 className="text-lg font-semibold text-white">Timeline</h3>
                      <Field label="PSA Execution Date">
                        <input
                          type="date"
                          className={inputClassName()}
                          value={form.timeline.psaExecutionDate}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              timeline: { ...current.timeline, psaExecutionDate: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="DD Start Date">
                        <input
                          type="date"
                          className={inputClassName()}
                          value={form.timeline.ddStartDate}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              timeline: { ...current.timeline, ddStartDate: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="DD Expiration Date">
                        <input
                          type="date"
                          className={inputClassName()}
                          value={form.timeline.ddExpirationDate}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              timeline: { ...current.timeline, ddExpirationDate: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Closing Date">
                        <input
                          type="date"
                          className={inputClassName()}
                          value={form.timeline.closingDate}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              timeline: { ...current.timeline, closingDate: event.target.value },
                            }))
                          }
                        />
                      </Field>
                    </div>
                  </div>
                )}

                {stepIndex === 5 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      {statValue(form.dealId || 'Pending', 'Deal ID')}
                      {statValue(form.dealName || 'Untitled', 'Deal Name')}
                      {statValue(`${form.property.totalUnits ?? '--'}`, 'Total Units')}
                      {statValue(form.financials.askingPrice !== null ? `$${form.financials.askingPrice.toLocaleString()}` : '--', 'Asking Price')}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                      <div className="card bg-black/15">
                        <h3 className="text-base font-semibold text-white">Deal Summary</h3>
                        <dl className="mt-4 space-y-3 text-sm">
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Property</dt>
                            <dd className="text-gray-200 text-right">
                              {[form.property.address, form.property.city, form.property.state].filter(Boolean).join(', ') || '--'}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Investment Strategy</dt>
                            <dd className="text-gray-200 capitalize">{form.investmentStrategy || '--'}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Occupancy</dt>
                            <dd className="text-gray-200">
                              {form.financials.inPlaceOccupancy !== null ? `${(form.financials.inPlaceOccupancy * 100).toFixed(1)}%` : '--'}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Run Scenario</dt>
                            <dd className="text-gray-200 capitalize">{form.launch.scenario}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Speed</dt>
                            <dd className="text-gray-200 capitalize">{form.launch.speed}</dd>
                          </div>
                        </dl>
                      </div>

                      <div className="card bg-black/15">
                        <h3 className="text-base font-semibold text-white">Launch Check</h3>
                        <p className="text-sm text-gray-500 mt-2">
                          Review the blocking issues below. Warnings can still be saved, but launch requires a clean validation result.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <span className={`status-badge ${reviewReady ? 'bg-cre-success/20 text-cre-success' : 'bg-cre-warning/20 text-cre-warning'}`}>
                            {reviewReady ? 'Launch Ready' : 'Needs Attention'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {launchBlockingIssues.length} blocking issue(s), {warningIssues.length} warning(s)
                          </span>
                        </div>
                        <button
                          onClick={() => void refreshLaunchValidation()}
                          disabled={workingState === 'checking'}
                          className={`${buttonClassName('secondary')} mt-4`}
                        >
                          {workingState === 'checking' ? 'Checking…' : 'Refresh Launch Check'}
                        </button>
                      </div>
                    </div>

                    <IssueList title="Blocking Issues" issues={launchBlockingIssues} tone="error" />
                    <IssueList title="Warnings" issues={warningIssues} tone="warning" />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-cre-border px-6 py-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
                disabled={stepIndex === 0 || loadingDeal || workingState !== null}
                data-testid="deal-wizard-back"
                className={buttonClassName('ghost')}
              >
                Back
              </button>
              {stepIndex < STEPS.length - 1 && (
                <button
                  onClick={() => void handleNext()}
                  disabled={loadingDeal || workingState !== null}
                  data-testid="deal-wizard-next"
                  className={buttonClassName('secondary')}
                >
                  {stepIndex === STEPS.length - 2 ? 'Review for Launch' : 'Next'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => void saveDraft()}
                disabled={loadingDeal || workingState !== null}
                data-testid="deal-wizard-save-draft"
                className={buttonClassName('secondary')}
              >
                {workingState === 'saving' ? 'Saving…' : 'Save Draft'}
              </button>
              {stepIndex === STEPS.length - 1 && (
                <button
                  onClick={() => void saveAndLaunch()}
                  disabled={loadingDeal || workingState !== null || !reviewReady}
                  data-testid="deal-wizard-save-launch"
                  className={buttonClassName('primary')}
                >
                  {workingState === 'launching' ? 'Launching…' : 'Save & Launch'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
