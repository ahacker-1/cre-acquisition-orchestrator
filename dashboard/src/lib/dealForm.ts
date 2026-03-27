import type {
  DealFormData,
  InvestmentStrategy,
  LaunchScenario,
  UnitMixRowForm,
} from '../types/deals'

const DEFAULT_SCENARIO_BY_STRATEGY: Record<Exclude<InvestmentStrategy, ''>, LaunchScenario> = {
  core: 'core-plus',
  'core-plus': 'core-plus',
  'value-add': 'value-add',
  opportunistic: 'distressed',
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function createEmptyUnitMixRow(): UnitMixRowForm {
  return {
    id: randomId(),
    type: '',
    count: null,
    avgSqFt: null,
    marketRent: null,
    inPlaceRent: null,
  }
}

export function createEmptyDealForm(suggestedDealId = ''): DealFormData {
  return {
    dealId: suggestedDealId,
    dealName: '',
    property: {
      address: '',
      city: '',
      state: '',
      zip: '',
      propertyType: 'multifamily',
      yearBuilt: null,
      totalUnits: null,
      unitMix: {
        types: [createEmptyUnitMixRow()],
      },
    },
    financials: {
      askingPrice: null,
      currentNOI: null,
      inPlaceOccupancy: null,
    },
    financing: {
      targetLTV: null,
      estimatedRate: null,
      loanTerm: null,
      amortization: null,
      loanType: 'Agency',
    },
    investmentStrategy: 'core-plus',
    targetHoldPeriod: null,
    targetIRR: null,
    targetEquityMultiple: null,
    targetCashOnCash: null,
    seller: {
      entity: '',
    },
    timeline: {
      psaExecutionDate: '',
      ddStartDate: '',
      ddExpirationDate: '',
      closingDate: '',
    },
    notes: '',
    launch: {
      scenario: 'core-plus',
      speed: 'normal',
    },
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function pickLaunchScenario(value: unknown, investmentStrategy: InvestmentStrategy): LaunchScenario {
  if (value === 'core-plus' || value === 'value-add' || value === 'distressed') {
    return value
  }
  return investmentStrategy && investmentStrategy in DEFAULT_SCENARIO_BY_STRATEGY
    ? DEFAULT_SCENARIO_BY_STRATEGY[investmentStrategy as Exclude<InvestmentStrategy, ''>]
    : 'core-plus'
}

export function hydrateDealFormData(deal: Record<string, unknown>, suggestedDealId = ''): DealFormData {
  const empty = createEmptyDealForm(suggestedDealId)
  const property = asObject(deal.property)
  const financials = asObject(deal.financials)
  const financing = asObject(deal.financing)
  const seller = asObject(deal.seller)
  const timeline = asObject(deal.timeline)
  const unitMix = asObject(property.unitMix)
  const strategy = asString(deal.investmentStrategy, empty.investmentStrategy) as InvestmentStrategy

  const rows = asArray(unitMix.types)
    .map((entry) => {
      const row = asObject(entry)
      return {
        id: randomId(),
        type: asString(row.type),
        count: asNumber(row.count),
        avgSqFt: asNumber(row.avgSqFt),
        marketRent: asNumber(row.marketRent),
        inPlaceRent: asNumber(row.inPlaceRent),
      }
    })
    .filter((row) => row.type || row.count !== null || row.avgSqFt !== null || row.marketRent !== null || row.inPlaceRent !== null)

  return {
    ...empty,
    dealId: asString(deal.dealId, suggestedDealId),
    dealName: asString(deal.dealName),
    property: {
      address: asString(property.address),
      city: asString(property.city),
      state: asString(property.state),
      zip: asString(property.zip),
      propertyType: asString(property.propertyType, empty.property.propertyType) as DealFormData['property']['propertyType'],
      yearBuilt: asNumber(property.yearBuilt),
      totalUnits: asNumber(property.totalUnits),
      unitMix: {
        types: rows.length > 0 ? rows : [createEmptyUnitMixRow()],
      },
    },
    financials: {
      askingPrice: asNumber(financials.askingPrice),
      currentNOI: asNumber(financials.currentNOI),
      inPlaceOccupancy: asNumber(financials.inPlaceOccupancy),
    },
    financing: {
      targetLTV: asNumber(financing.targetLTV),
      estimatedRate: asNumber(financing.estimatedRate),
      loanTerm: asNumber(financing.loanTerm),
      amortization: asNumber(financing.amortization),
      loanType: asString(financing.loanType, empty.financing.loanType) as DealFormData['financing']['loanType'],
    },
    investmentStrategy: strategy,
    targetHoldPeriod: asNumber(deal.targetHoldPeriod),
    targetIRR: asNumber(deal.targetIRR),
    targetEquityMultiple: asNumber(deal.targetEquityMultiple),
    targetCashOnCash: asNumber(deal.targetCashOnCash),
    seller: {
      entity: asString(seller.entity),
    },
    timeline: {
      psaExecutionDate: asString(timeline.psaExecutionDate),
      ddStartDate: asString(timeline.ddStartDate),
      ddExpirationDate: asString(timeline.ddExpirationDate),
      closingDate: asString(timeline.closingDate),
    },
    notes: asString(deal.notes),
    launch: {
      scenario: pickLaunchScenario(undefined, strategy),
      speed: 'normal',
    },
  }
}

function withObject(condition: boolean, value: Record<string, unknown>): Record<string, unknown> {
  return condition ? value : {}
}

export function serializeDealFormData(form: DealFormData): Record<string, unknown> {
  const rows = form.property.unitMix.types
    .filter((row) => row.type || row.count !== null || row.avgSqFt !== null || row.marketRent !== null || row.inPlaceRent !== null)
    .map((row) => ({
      ...withObject(row.type.trim().length > 0, { type: row.type.trim() }),
      ...withObject(row.count !== null, { count: row.count as number }),
      ...withObject(row.avgSqFt !== null, { avgSqFt: row.avgSqFt as number }),
      ...withObject(row.marketRent !== null, { marketRent: row.marketRent as number }),
      ...withObject(row.inPlaceRent !== null, { inPlaceRent: row.inPlaceRent as number }),
    }))

  return {
    ...withObject(form.dealId.trim().length > 0, { dealId: form.dealId.trim() }),
    ...withObject(form.dealName.trim().length > 0, { dealName: form.dealName.trim() }),
    property: {
      ...withObject(form.property.address.trim().length > 0, { address: form.property.address.trim() }),
      ...withObject(form.property.city.trim().length > 0, { city: form.property.city.trim() }),
      ...withObject(form.property.state.trim().length > 0, { state: form.property.state.trim().toUpperCase() }),
      ...withObject(form.property.zip.trim().length > 0, { zip: form.property.zip.trim() }),
      ...withObject(form.property.propertyType.trim().length > 0, { propertyType: form.property.propertyType }),
      ...withObject(form.property.yearBuilt !== null, { yearBuilt: form.property.yearBuilt as number }),
      ...withObject(form.property.totalUnits !== null, { totalUnits: form.property.totalUnits as number }),
      ...withObject(rows.length > 0, { unitMix: { types: rows } }),
    },
    financials: {
      ...withObject(form.financials.askingPrice !== null, { askingPrice: form.financials.askingPrice as number }),
      ...withObject(form.financials.currentNOI !== null, { currentNOI: form.financials.currentNOI as number }),
      ...withObject(form.financials.inPlaceOccupancy !== null, { inPlaceOccupancy: form.financials.inPlaceOccupancy as number }),
    },
    financing: {
      ...withObject(form.financing.targetLTV !== null, { targetLTV: form.financing.targetLTV as number }),
      ...withObject(form.financing.estimatedRate !== null, { estimatedRate: form.financing.estimatedRate as number }),
      ...withObject(form.financing.loanTerm !== null, { loanTerm: form.financing.loanTerm as number }),
      ...withObject(form.financing.amortization !== null, { amortization: form.financing.amortization as number }),
      ...withObject(form.financing.loanType.trim().length > 0, { loanType: form.financing.loanType }),
    },
    ...withObject(form.investmentStrategy.trim().length > 0, { investmentStrategy: form.investmentStrategy }),
    ...withObject(form.targetHoldPeriod !== null, { targetHoldPeriod: form.targetHoldPeriod as number }),
    ...withObject(form.targetIRR !== null, { targetIRR: form.targetIRR as number }),
    ...withObject(form.targetEquityMultiple !== null, { targetEquityMultiple: form.targetEquityMultiple as number }),
    ...withObject(form.targetCashOnCash !== null, { targetCashOnCash: form.targetCashOnCash as number }),
    seller: {
      ...withObject(form.seller.entity.trim().length > 0, { entity: form.seller.entity.trim() }),
    },
    timeline: {
      ...withObject(form.timeline.psaExecutionDate.trim().length > 0, { psaExecutionDate: form.timeline.psaExecutionDate.trim() }),
      ...withObject(form.timeline.ddStartDate.trim().length > 0, { ddStartDate: form.timeline.ddStartDate.trim() }),
      ...withObject(form.timeline.ddExpirationDate.trim().length > 0, { ddExpirationDate: form.timeline.ddExpirationDate.trim() }),
      ...withObject(form.timeline.closingDate.trim().length > 0, { closingDate: form.timeline.closingDate.trim() }),
    },
    ...withObject(form.notes.trim().length > 0, { notes: form.notes.trim() }),
  }
}

export function totalUnitMixCount(form: DealFormData): number {
  return form.property.unitMix.types.reduce((sum, row) => sum + (row.count ?? 0), 0)
}

export function launchScenarioForStrategy(strategy: InvestmentStrategy): LaunchScenario {
  if (!strategy || !(strategy in DEFAULT_SCENARIO_BY_STRATEGY)) return 'core-plus'
  return DEFAULT_SCENARIO_BY_STRATEGY[strategy as Exclude<InvestmentStrategy, ''>]
}
