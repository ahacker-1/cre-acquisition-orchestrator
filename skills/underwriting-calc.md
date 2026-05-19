# Underwriting Calculations - Multifamily Focus

This document defines every formula and calculation used during underwriting analysis. All agents performing financial analysis must use these formulas exactly as specified. The calculations cover standard CRE metrics plus multifamily-specific analytics for income, expenses, value-add scenarios, and sensitivity analysis.

---

## Core Income Metrics

### Gross Potential Income (GPI)

Total income if the property were 100% occupied at market rents with no concessions or losses. RUBS recoveries are not income in the EGI walk; treat them as utility expense offsets.

```
GPI = Sum of all unit market rents (annualized) + Other Income excluding RUBS
```

For multifamily:
```
GPI = (Unit Count x Average Market Rent x 12) + Annual Other Income excluding RUBS
```

### Effective Gross Income (EGI)

Actual expected income after accounting for vacancy, credit loss, and concessions.

```
GPI = Gross Potential Rent + Other Income excluding RUBS
Vacancy Loss = GPI x Vacancy Rate
Credit Loss = GPI x Credit Loss Rate (Bad Debt; typically 1-2%)
Concessions = Total annualized value of free rent, move-in specials, etc. (contra-revenue)
EGI = GPI - Vacancy Loss - Credit Loss - Concessions
RUBS Recovery = Utility reimbursement applied as an offset to utility expense, not as Other Income
Total Operating Expenses = Operating Expenses after RUBS Recovery
NOI = EGI - Total Operating Expenses
```

Bad debt/credit loss must stay separate from concessions. Concessions reduce revenue as contra-revenue; RUBS recoveries reduce owner-paid utilities.

### Net Operating Income (NOI)

The property's income after all operating expenses but before debt service and capital expenditures.

```
NOI = EGI - Total Operating Expenses
```

This is the single most important number in CRE underwriting. All valuation and return metrics derive from NOI.

---

## Operating Expenses

### Total Operating Expenses (Total OpEx)

```
Total OpEx = Property Taxes + Insurance + Utilities + Repairs & Maintenance
             + Management Fee + Payroll + Administrative + Turnover Costs
             + Landscaping + Pest Control + Marketing + Legal & Professional
             + Capital Reserves
```

### Operating Expense Ratio

```
OpEx Ratio = Total Operating Expenses / EGI
```

Benchmark ranges by property size (see Expense Ratio Benchmarks section below).

### Management Fee

```
Management Fee = EGI x Management Fee Rate
```

Typical rates: 4-8% of EGI for multifamily. Smaller properties trend higher (6-8%), larger properties trend lower (4-5%).

### Property Tax Estimation

```
Estimated Annual Tax = Assessed Value x Mill Rate / 1000
```

Or, if using purchase price as a proxy for reassessment:

```
Estimated Annual Tax = Purchase Price x Local Tax Rate
```

**Important:** Many jurisdictions reassess on sale. Always check if the current tax basis will reset to the acquisition price. If so, use the acquisition price for post-close tax projections, not the current assessed value.

---

## Valuation Metrics

### Capitalization Rate (Cap Rate)

```
Cap Rate = NOI / Property Value (or Purchase Price)
```

Solving for value:
```
Property Value = NOI / Cap Rate
```

### Cap Rate Spread

The spread between the property cap rate and the risk-free rate (10-year Treasury yield).

```
Cap Rate Spread = Cap Rate - 10-Year Treasury Yield
```

A healthy spread indicates adequate risk premium. Minimum acceptable spread is typically 150-200 bps.

### Gross Rent Multiplier (GRM)

```
GRM = Purchase Price / Annual Gross Rent
```

Lower GRM = potentially better value. Typical multifamily GRM ranges: 8-15x depending on market.

### Price Per Unit

```
Price Per Unit = Purchase Price / Total Unit Count
```

This is a quick comparability metric. Compare to market comps on a per-unit basis.

### Price Per Square Foot

```
Price Per SF = Purchase Price / Total Rentable Square Footage
```

---

## Debt Metrics

### Loan Payment (Monthly)

```
Monthly Payment = Loan Amount x [r(1+r)^n] / [(1+r)^n - 1]
```

Where:
```
r = Annual Interest Rate / 12
n = Amortization Period in Months (e.g., 360 for 30 years)
```

### Interest-Only Payment (Monthly)

```
Monthly IO Payment = Loan Amount x (Annual Interest Rate / 12)
```

### Annual Debt Service

```
Annual Debt Service = Monthly Payment x 12
```

### Loan-to-Value (LTV)

```
LTV = Loan Amount / Property Value (or Purchase Price)
```

Typical maximums: 65-75% for multifamily acquisition, 60-70% for value-add.

### Debt Service Coverage Ratio (DSCR)

```
DSCR = NOI / Annual Debt Service
```

Minimum DSCR thresholds:
- Agency (Fannie/Freddie): 1.20-1.25x
- CMBS: 1.25-1.30x
- Bridge/Value-Add: 1.10-1.20x
- Bank: 1.25-1.35x

### Debt Yield

```
Debt Yield = NOI / Loan Amount
```

Minimum debt yield thresholds:
- Agency: 8-9%
- CMBS: 9-10%
- Bank: 10-11%

---

## Return Metrics

### Cash-on-Cash Return (CoC)

```
Cash-on-Cash = Annual Pre-Tax Cash Flow / Total Equity Invested
```

Where:
```
Annual Pre-Tax Cash Flow = NOI - Annual Debt Service
Total Equity Invested = Down Payment + Closing Costs + Renovation Budget
```

### Equity Multiple

```
Equity Multiple = Total Distributions / Total Equity Invested
```

### Internal Rate of Return (IRR)

IRR is the discount rate that makes the NPV of all cash flows equal to zero. Calculate iteratively or use standard financial functions. Include:
- Initial equity investment (negative)
- Annual cash flows during hold period
- Net sale proceeds at disposition (minus loan payoff, closing costs)

### Return on Cost (Development/Value-Add)

```
Return on Cost = Stabilized NOI / Total Project Cost
```

Where:
```
Total Project Cost = Purchase Price + Closing Costs + Renovation Budget + Carry Costs
```

---

## Multifamily Income Analysis

### Per-Unit Rent Roll Aggregation

Aggregate the rent roll to calculate key income metrics:

```
Total In-Place Monthly Rent = Sum of all current unit rents
Average In-Place Rent = Total In-Place Monthly Rent / Occupied Unit Count
Average Rent Per SF = Average In-Place Rent / Average Unit SF
Occupancy Rate = Occupied Units / Total Units
Physical Vacancy = 1 - Occupancy Rate
```

Break down by unit type:
```
For each unit type (Studio, 1BR, 2BR, 3BR+):
  - Unit count
  - Average in-place rent
  - Average market rent
  - Average SF
  - Rent per SF
  - Vacancy rate
```

### Loss-to-Lease Calculation

Loss-to-lease measures the difference between what tenants are currently paying and what the market would bear. This is a key value-add indicator.

```
Loss-to-Lease (per unit) = Market Rent - In-Place Rent
Loss-to-Lease (total monthly) = Sum of (Market Rent - In-Place Rent) for all occupied units
Loss-to-Lease (%) = Loss-to-Lease (total monthly) / Total Market Rent (monthly) x 100
Annual Loss-to-Lease = Loss-to-Lease (total monthly) x 12
```

**Interpretation:**
- Loss-to-Lease > 10%: Strong value-add opportunity through rent increases
- Loss-to-Lease 5-10%: Moderate upside, achievable through natural lease turnover
- Loss-to-Lease < 5%: Property is near market rents, limited organic upside

### Concessions and Free Rent Adjustments

```
Effective Rent = Face Rent - (Concession Value / Lease Term in Months)
```

Common concessions to quantify:
- Free month(s) of rent
- Reduced security deposit
- Move-in specials (gift cards, reduced first month)
- Utility credits

```
Total Concession Drag = Sum of all annualized concession values
Adjusted GPI = GPI - Total Concession Drag
```

### Other Income (Ancillary Revenue)

Multifamily properties generate income beyond base rent. Quantify each line item:

```
Other Income = Laundry Income + Parking Income + Pet Fees
               + Application Fees + Late Fees + Storage Income
               + Vending Income + Cable/Internet Revenue Share
```

**RUBS (Ratio Utility Billing System):**
```
RUBS Recovery = Number of Units on RUBS x Average Monthly RUBS Charge x 12
Net Utility Expense = Gross Utility Expense - RUBS Recovery
RUBS Recovery Rate = RUBS Recovery / Gross Utility Expense
```

Target RUBS recovery: 60-85% of utility costs.

**Per-unit other income benchmarks:**
- Class A: $150-300/unit/month
- Class B: $75-150/unit/month
- Class C: $25-75/unit/month

### Bad Debt Allowance

```
Bad Debt = GPI x Bad Debt Rate
```

Typical bad debt rates:
- Class A: 0.5-1.0% of GPI
- Class B: 1.0-1.5% of GPI
- Class C: 1.5-2.5% of GPI
- Workforce/Affordable: 2.0-3.0% of GPI

---

## Expense Ratio Benchmarks

### Multifamily OpEx Ratios by Unit Count

| Unit Count | Typical OpEx Ratio | Notes |
|-----------|-------------------|-------|
| 5-20 units | 50-60% | No on-site staff, higher per-unit costs |
| 20-50 units | 45-55% | May have part-time maintenance |
| 50-100 units | 40-50% | Part-time or full-time staff, economies of scale emerging |
| 100-150 units | 38-48% | Full-time leasing + maintenance staff |
| 150-250 units | 35-45% | Full on-site team, significant scale benefits |
| 250+ units | 32-42% | Fully staffed, maximum operational efficiency |

### Payroll Costs for On-Site Staff

```
Total Payroll = Sum of (Salary + Benefits + Payroll Tax) for each position
Payroll Cost Per Unit = Total Payroll / Total Unit Count
```

Typical staffing ratios:
- Property Manager: 1 per 150-250 units
- Leasing Agent: 1 per 150-200 units
- Maintenance Tech: 1 per 75-100 units
- Groundskeeper: 1 per 200-300 units
- Porter/Housekeeper: 1 per 150-250 units

Benchmark payroll cost per unit: $800-1,500/unit/year (varies significantly by market and class).

### Turnover Costs

```
Annual Turnover Cost = Total Units x Turnover Rate x Cost Per Turn
```

Cost per turn includes:
- Cleaning: $200-500
- Paint/touch-up: $300-800
- Carpet/flooring: $400-1,200
- Appliance replacement (prorated): $100-300
- Marketing/vacancy loss during turn: $500-1,500
- Leasing commission (if applicable): $300-500

**Total cost per turn: $1,500-3,000 per unit** (varies by class and scope)

Typical turnover rates:
- Class A: 40-50% annually
- Class B: 45-55% annually
- Class C: 50-65% annually

```
Effective Turnover Cost Per Unit Per Year = Cost Per Turn x Turnover Rate
```

### Capital Reserves (Replacement Reserves)

```
Annual Capital Reserves = Total Units x Reserve Per Unit Per Year
```

Industry standards:
- **Minimum:** $250/unit/year (newer properties, good condition)
- **Standard:** $300-400/unit/year (typical allocation)
- **Aggressive:** $400-500/unit/year (older properties, deferred maintenance)
- **Major rehab planned:** $500+/unit/year

Lender requirements vary:
- Agency (Fannie/Freddie): $250-300/unit/year minimum
- CMBS: $250-300/unit/year minimum
- Bridge: Often not required during business plan execution

---

## Value-Add Metrics

### Renovation ROI Calculation

```
Renovation ROI = Annual Rent Increase / Renovation Cost Per Unit x 100
```

Or on a per-dollar basis:
```
Rent Premium Per Dollar = Monthly Rent Increase / Renovation Cost Per Unit
```

**Target benchmarks:**
- Light renovation ($5,000-10,000/unit): $75-150/month rent increase, 12-20% ROI
- Moderate renovation ($10,000-20,000/unit): $150-300/month rent increase, 15-25% ROI
- Heavy renovation ($20,000-35,000/unit): $250-500/month rent increase, 12-20% ROI

**Rule of thumb:** Target a minimum 15% unlevered ROI on renovation spend, or a rent premium of at least $1.00 per $100 spent per month.

### Stabilized vs In-Place NOI Comparison

```
In-Place NOI = Current EGI - Current Operating Expenses
Stabilized NOI = Pro Forma EGI (at market rents, stabilized vacancy) - Stabilized Operating Expenses
NOI Upside = Stabilized NOI - In-Place NOI
NOI Upside (%) = (Stabilized NOI - In-Place NOI) / In-Place NOI x 100
```

**Stabilized assumptions typically mean:**
- All renovated units leased at target rents
- Vacancy at market rate (not lease-up level)
- RUBS fully implemented
- Other income programs in place
- Operating expenses normalized (no one-time costs)

### Construction Period Cash Flow Modeling

During renovation, cash flow is impacted by:

```
Construction Period Cash Flow = In-Place NOI (from non-renovated units)
                                - Renovation Vacancy Loss (units offline for renovation)
                                - Renovation CapEx (spread over renovation period)
                                - Incremental Operating Costs (construction management, etc.)
                                + Incremental Revenue (from units already renovated and leased)
```

Model month-by-month:
```
For each month in renovation period:
  Units Offline = Number of units under renovation this month
  Units Completed = Cumulative units renovated and leased
  Monthly Income = (Occupied Non-Renovated Units x In-Place Rent)
                   + (Units Completed x Renovated Rent)
  Monthly Expense = Operating Expenses + Renovation Spend This Month
  Monthly Cash Flow = Monthly Income - Monthly Expense
```

---

## Investment Thresholds Quick Reference

### Acquisition Criteria (Multifamily)

| Metric | Minimum Acceptable | Target | Strong |
|--------|-------------------|--------|--------|
| Cap Rate (in-place) | 4.5% | 5.5-6.5% | 7.0%+ |
| Cap Rate (stabilized) | 5.5% | 6.5-7.5% | 8.0%+ |
| Cash-on-Cash (Year 1) | 4.0% | 6.0-8.0% | 10.0%+ |
| Cash-on-Cash (Stabilized) | 7.0% | 9.0-12.0% | 14.0%+ |
| DSCR | 1.20x | 1.30-1.40x | 1.50x+ |
| Debt Yield | 8.0% | 9.5-11.0% | 12.0%+ |
| Equity Multiple (5-yr) | 1.5x | 1.8-2.2x | 2.5x+ |
| IRR (5-yr hold) | 12% | 15-18% | 20%+ |
| Renovation ROI | 12% | 15-20% | 25%+ |
| Price Per Unit vs Replacement | < 80% | < 65% | < 50% |
| OpEx Ratio | < 55% | 40-48% | < 38% |
| Loss-to-Lease | > 5% | > 10% | > 15% |

### Dealbreaker Thresholds

| Metric | Dealbreaker If |
|--------|---------------|
| Cap Rate (in-place) | < 3.5% (unless deep value-add) |
| DSCR | < 1.10x |
| Debt Yield | < 7.0% |
| OpEx Ratio | > 65% (without clear fix) |
| Occupancy | < 70% (without clear lease-up plan) |
| Renovation ROI | < 10% |
| Cap Rate Spread | < 100 bps above risk-free rate |
| Bad Debt | > 5% of GPI |

---

## Sensitivity Analysis Framework

Run sensitivity analysis on every deal to understand risk exposure. Vary key assumptions and measure impact on returns.

### Variables to Stress Test

| Variable | Base Case | Downside | Severe Downside |
|----------|-----------|----------|-----------------|
| Vacancy Rate | Market rate | +5% | +10% |
| Rent Growth | Projected rate | 0% (flat) | -5% (decline) |
| Exit Cap Rate | Entry cap | +50 bps | +100 bps |
| Interest Rate | Quoted rate | +50 bps | +100 bps |
| Operating Expenses | Budget | +10% | +20% |
| Renovation Cost | Budget | +15% | +30% |
| Renovation Timeline | Planned | +3 months | +6 months |
| Rent Premium | Projected | -20% | -40% |

### Sensitivity Matrix (Example: NOI Impact)

```
                    Vacancy Rate
                    5%      7%      10%     12%
Rent Growth  3%   [NOI]   [NOI]   [NOI]   [NOI]
             1%   [NOI]   [NOI]   [NOI]   [NOI]
             0%   [NOI]   [NOI]   [NOI]   [NOI]
            -2%   [NOI]   [NOI]   [NOI]   [NOI]
```

### Break-Even Analysis

Calculate the break-even point for key metrics:

```
Break-Even Occupancy = (Operating Expenses + Debt Service) / GPI
Break-Even Rent = (Operating Expenses + Debt Service) / (Occupied Units x 12)
```

### Scenario Modeling

Run three complete scenarios through the full underwriting model:

1. **Base Case**: Most likely assumptions based on market data and property analysis
2. **Downside Case**: Conservative assumptions -- higher vacancy, lower rent growth, higher expenses, wider exit cap
3. **Upside Case**: Optimistic but achievable -- faster lease-up, stronger rents, lower exit cap

For each scenario, calculate: NOI, Cash-on-Cash, IRR, Equity Multiple, DSCR, and Debt Yield.

**Decision framework:**
- If the **Downside Case** still meets minimum investment thresholds: Strong deal
- If only the **Base Case** meets thresholds: Marginal deal, proceed with caution
- If the **Base Case** does not meet thresholds: Pass unless there is a compelling strategic reason

---

## Worked Examples

All examples below use the **Parkview Apartments** test deal:

| Parameter | Value |
|-----------|-------|
| Property | 200-unit Class B multifamily, Austin TX, Travis County |
| Purchase Price | $32,000,000 |
| Gross Potential Rent (GPR) | $3,600,000/yr ($1,500/unit/mo avg scheduled rent) |
| Vacancy Loss | $180,000 (5.0% of GPR) |
| Loss to Lease | $84,000 |
| Concessions | $30,000 |
| Bad Debt | $12,000 |
| Other Income | $120,000/yr |
| Total Operating Expenses | $1,725,500 ($8,628/unit) |
| Loan Amount | $24,000,000 (75% LTV) |
| Interest Rate | 6.50% fixed, 30-year amortization, 10-year term, 2-year IO period |
| Hold Period | 5 years |
| Exit Cap Rate | 6.75% |
| Annual NOI Growth | 2.5% |

<!-- Sources for Austin tax assumptions, accessed 2026-05-19:
Travis Central Appraisal District mission/market-value basis: https://traviscad.org/?id=6119&method=ical
Travis County truth-in-taxation rate tables: https://www.traviscountytx.gov/tax-rates
Texas Constitution Article VIII Section 24-a individual income tax prohibition: https://statutes.capitol.texas.gov/Docs/CN/pdf/CN.8.pdf
The 1.90% effective property tax rate used below is an underwriting assumption for Parkview, not a statutory quote. -->

---

### Worked Example 1: Net Operating Income (NOI) Calculation

Walk through the full income waterfall from Gross Potential Rent to NOI.

**Step 1 -- Gross Potential Rent (GPR)**

GPR is what the property earns if every unit is occupied at scheduled rents with zero loss.

```
GPR = Unit Count x Average Monthly Rent x 12
GPR = 200 units x $1,500/mo x 12
GPR = $3,600,000
```

**Step 2 -- Loss-to-Lease Adjustment**

Parkview tracks loss-to-lease separately so the scheduled rent basis reconciles back to `config/deal.json`.

```
Loss to Lease = $84,000
Gross Potential Rent after Loss-to-Lease = $3,600,000 - $84,000 = $3,516,000
```

**Step 3 -- Other Income**

Other income includes laundry, parking, late fees, application fees, storage, and other ancillary revenue excluding RUBS. RUBS recoveries are utility expense offsets, not other income.

```
Other Income excluding RUBS = $120,000
GPI = Gross Potential Rent after Loss-to-Lease + Other Income excluding RUBS
GPI = $3,516,000 + $120,000
GPI = $3,636,000
```

**Step 4 -- Effective Gross Income (EGI)**

```
Vacancy Loss = $180,000
Credit Loss = $12,000
Concessions = $30,000
RUBS Recovery = $0 in this sample income walk; any RUBS would reduce utility expense
EGI = GPI - Vacancy Loss - Credit Loss - Concessions
    = $3,636,000 - $180,000 - $12,000 - $30,000
    = $3,414,000
```

**Step 5 -- Total Operating Expenses**

The expense breakdown at Parkview:

| Expense Category | Amount | Per Unit |
|-----------------|--------|----------|
| Property Taxes | $608,000 | $3,040 |
| Insurance | $80,000 | $400 |
| Utilities (common area) | $175,500 | $878 |
| Repairs & Maintenance | $202,000 | $1,010 |
| Management Fee | $150,000 | $750 |
| Payroll (on-site staff) | $280,000 | $1,400 |
| Administrative | $45,000 | $225 |
| Marketing | $35,000 | $175 |
| Contract Services | $90,000 | $450 |
| Capital Reserves ($300/unit) | $60,000 | $300 |
| **Total** | **$1,725,500** | **$8,628** |

Tax note: the $608,000 property tax line equals 1.90% of the $32,000,000 purchase price. Texas has no state individual income tax, but Austin/Travis County underwriting should still carry high annual property taxes and an annual reassessment/protest cadence.

Check: OpEx Ratio = $1,725,500 / $3,414,000 = **50.5%**. The high ratio is driven by the Travis County reassessed tax basis and should be called out in the IC memo.

**Step 6 -- NOI**

```
NOI = EGI - Total Operating Expenses
    = $3,414,000 - $1,725,500
    = $1,688,500
```

**Verification:** NOI per unit = $1,688,500 / 200 = $8,443/unit/year. This is tight for a Class B Austin value-add deal at the current price and leverage, so the memo should treat the tax basis as a primary sensitivity.

---

### Worked Example 2: Capitalization Rate (Cap Rate)

**Forward calculation -- cap rate from purchase price:**

```
Cap Rate = NOI / Purchase Price
         = $1,688,500 / $32,000,000
         = 0.0528
         = 5.28%
```

**Reverse calculation -- value from NOI and a target cap rate:**

If a buyer requires a 7.00% cap rate on the same NOI:

```
Implied Value = NOI / Target Cap Rate
              = $1,688,500 / 0.07
              = $24,121,429
```

At a 7.00% cap requirement, the buyer would offer roughly $24.1M -- about $7.9M less than the $32M asking price.

**Cap rate spread check:**

Assuming the 10-Year Treasury yields 4.25% at time of analysis:

```
Cap Rate Spread = Cap Rate - 10-Year Treasury
                = 5.28% - 4.25%
                = 1.03% (103 bps)
```

103 bps falls below the 150-200 bps minimum threshold. The tax-adjusted basis is not adequately compensated unless the buyer has credible value-add upside or renegotiates price/proceeds.

**Gross Rent Multiplier (GRM) cross-check:**

```
GRM = Purchase Price / Annual Gross Rent
    = $32,000,000 / $3,600,000
    = 8.89x
```

**Price per unit:**

```
Price Per Unit = $32,000,000 / 200 = $160,000/unit
```

---

### Worked Example 3: Debt Service Coverage Ratio (DSCR)

**Step 1 -- Calculate monthly debt service**

Loan terms: $24,000,000 at 6.50% interest, 30-year (360 month) amortization.

```
r = Annual Rate / 12 = 0.0650 / 12 = 0.00541667
n = 360 months

Monthly Payment = Loan Amount x [r(1+r)^n] / [(1+r)^n - 1]
```

Calculate the components:

```
(1 + r)^n = (1.00541667)^360

Using logarithms:
ln(1.00541667) = 0.005402
0.005402 x 360 = 1.944720
e^1.944720 = 6.9918

So (1 + r)^n = 6.9918

Numerator:   r x (1+r)^n = 0.00541667 x 6.9918 = 0.037872
Denominator: (1+r)^n - 1 = 6.9918 - 1 = 5.9918

Monthly Payment = $24,000,000 x (0.037872 / 5.9918)
                = $24,000,000 x 0.006321
                = $151,696
```

**Step 2 -- Annual debt service**

```
Annual Debt Service = Monthly Payment x 12
                    = $151,696 x 12
                    = $1,820,356
```

**Step 3 -- DSCR**

```
DSCR = NOI / Annual Debt Service
     = $1,688,500 / $1,820,356
     = 0.928x
```

**Interpretation:** 0.928x fails conventional stabilized-debt sizing on an amortizing basis. The IC memo must either reduce proceeds, use an interest reserve/bridge structure, or condition the recommendation on verified value-add execution.

**Step 4 -- Debt yield (cross-check)**

```
Debt Yield = NOI / Loan Amount
           = $1,688,500 / $24,000,000
           = 7.04%
```

7.04% is below current Agency and CMBS comfort ranges. This confirms DSCR, not LTV, is the binding constraint.

**Interest-only comparison:** If the first 2 years are interest-only:

```
Monthly IO Payment = $24,000,000 x (0.0650 / 12)
                   = $24,000,000 x 0.005417
                   = $130,000

Annual IO Debt Service = $130,000 x 12 = $1,560,000

DSCR (IO period) = $1,688,500 / $1,560,000 = 1.082x
```

The IO period keeps the deal barely above break-even (1.08x), but it does not solve permanent debt sizing. The model should flag this as a value-add execution risk, not as a clean financing pass.

---

### Worked Example 4: Cash-on-Cash Return

**Step 1 -- Total equity required**

```
Down Payment  = Purchase Price - Loan Amount
              = $32,000,000 - $24,000,000
              = $8,000,000

Closing Costs = $960,000
Renovation Budget = $2,000,000
Total Equity Required = $8,000,000 + $960,000 + $2,000,000
                      = $10,960,000
```

Parkview is a value-add acquisition, so this example includes closing costs and the renovation budget in the initial equity requirement.

**Step 2 -- Cash flow after debt service (CFADS)**

```
CFADS = NOI - Annual Debt Service
      = $1,688,500 - $1,820,356
      = -$131,856
```

**Step 3 -- Cash-on-cash return**

```
Cash-on-Cash = CFADS / Total Equity Invested
             = -$131,856 / $10,960,000
             = -0.0120
             = -1.20%
```

**Interpretation:** Year 1 cash-on-cash is negative on an amortizing basis. During the 2-year IO period, CFADS is $128,500 and cash-on-cash is 1.17%, still below target.

**Break-even occupancy check:**

```
Break-Even Occupancy = (Operating Expenses + Debt Service) / GPR (including Other Income)
                     = ($1,725,500 + $1,820,356) / ($3,600,000 + $120,000)
                     = $3,545,856 / $3,720,000
                     = 95.3%
```

The property must maintain at least 95.3% economic occupancy to cover all expenses and amortizing debt service. Current physical occupancy is 93%, so the acquisition needs lower leverage, better tax appeal results, or rent growth before amortization starts.

---

### Worked Example 5: Internal Rate of Return (IRR)

The IRR is the discount rate that sets the net present value of all cash flows to zero. We build year-by-year cash flows for a 5-year hold.

**Assumptions:**
- Year 1 NOI uses the Austin/Travis reassessed tax basis
- Year 2 reflects partial value-add lease-up
- Year 3 reaches the $2,400,000 stabilized NOI in `config/deal.json`
- NOI grows 2.5% annually after stabilization
- Debt service is interest-only for Years 1-2, then amortizing
- Exit at Year 5 end at a 6.75% cap rate
- Disposition costs: 2.0% of sale price (broker commission + closing)

**Step 1 -- Project annual cash flows**

| Year | NOI | Debt Service | CFADS |
|------|-----|-------------|-------|
| 0 | -- | -- | -$10,960,000 (equity invested) |
| 1 | $1,688,500 | $1,560,000 | $128,500 |
| 2 | $2,064,000 | $1,560,000 | $504,000 |
| 3 | $2,400,000 | $1,820,356 | $579,644 |
| 4 | $2,460,000 | $1,820,356 | $639,644 |
| 5 | $2,521,500 | $1,820,356 | $701,144 |

NOI growth calculation:
```
Year 2 NOI = partial value-add ramp to $2,064,000
Year 3 NOI = stabilized pro forma from deal.json = $2,400,000
Year 4 NOI = $2,400,000 x 1.025 = $2,460,000
Year 5 NOI = $2,460,000 x 1.025 = $2,521,500
```

**Step 2 -- Calculate exit (terminal) value at end of Year 5**

The exit cap rate uses Year 6 forward NOI (Year 5 NOI grown one more period):

```
Year 6 Forward NOI = $2,521,500 x 1.025 = $2,584,538
```

Rounding for the example: $2,584,538.

```
Exit Price = Year 6 Forward NOI / Exit Cap Rate
           = $2,584,538 / 0.0675
           = $38,289,444 (rounded)
```

**Step 3 -- Calculate net sale proceeds**

Estimate the remaining loan balance after the 2-year IO period plus 36 amortizing payments on a 30-year amortizing $24.0M loan at 6.50%:

```
Remaining Loan Balance (approx.) = $23,140,138
```

(Calculated by summing remaining principal after 36 amortizing monthly payments.)

```
Gross Sale Proceeds          = $38,289,444
Less: Disposition Costs (2%) = ($765,789)
Less: Loan Payoff            = ($23,140,138)
Net Equity Proceeds          = $14,383,517
```

**Step 4 -- Build complete cash flow schedule**

| Year | Operating CFADS | Disposition Proceeds | Total Cash Flow |
|------|----------------|---------------------|----------------|
| 0 | -- | -- | -$10,960,000 |
| 1 | $128,500 | -- | $128,500 |
| 2 | $504,000 | -- | $504,000 |
| 3 | $579,644 | -- | $579,644 |
| 4 | $639,644 | -- | $639,644 |
| 5 | $701,144 | $14,383,517 | $15,084,662 |

**Step 5 -- Solve for IRR**

The IRR is the rate (r) that satisfies:

```
0 = -10,960,000
    + 128,500 / (1+r)^1
    + 504,000 / (1+r)^2
    + 579,644 / (1+r)^3
    + 639,644 / (1+r)^4
    + 15,084,662 / (1+r)^5
```

Solving iteratively (or via financial calculator / spreadsheet):

```
Levered IRR = 9.6%
```

**Interpretation:** 9.6% falls short of the 15% target IRR. With Austin tax reassessment included, Parkview is not a clean go at the stated $32.0M price and 75% LTV. The IC memo should recommend proceed-with-mitigations only if the buyer can reduce price/proceeds or verify upside beyond the current pro forma.

---

### Worked Example 6: Equity Multiple

The equity multiple measures total return as a multiple of invested equity.

**Step 1 -- Total distributions (all cash received)**

```
Total Distributions = Sum of all cash flows to equity
                    = $128,500 + $504,000 + $579,644 + $639,644 + $15,084,662
                    = $16,936,450
```

**Step 2 -- Equity multiple**

```
Equity Multiple = Total Distributions / Total Equity Invested
                = $16,936,450 / $10,960,000
                = 1.545x
```

Rounded with full precision: **1.55x**.

**Interpretation:** 1.55x means an investor receives $1.55 for every $1.00 invested over the 5-year hold. This clears a minimum 1.5x screen but misses the 1.8x target. Combined with the 9.6% IRR, the deal needs a pricing, financing, or operating mitigation before an unconditional proceed verdict.

**Decomposing the equity multiple:**

```
Cash Flow Component   = ($128,500 + $504,000 + $579,644 + $639,644 + $701,144) / $10,960,000
                      = $2,552,932 / $10,960,000
                      = 0.233x (23.3% of equity returned through operations)

Principal Paydown     = $24,000,000 - $23,140,138 = $859,862
Appreciation          = $38,289,444 - $32,000,000 = $6,289,444
Disposition Costs     = -$765,789

Reversion Component   = ($6,289,444 + $859,862 - $765,789) / $10,960,000
                      = $6,383,517 / $10,960,000
                      = 0.582x (58.2% of equity from appreciation + paydown)

Total Check: $2,552,932 operating distributions + $14,383,517 net sale proceeds = $16,936,449 total distributions. $16,936,449 / $10,960,000 = 1.545x.
```

---

## Edge Cases & Special Scenarios

Underwriting models must handle non-standard situations gracefully. The following edge cases arise regularly in practice. Each section describes the scenario, explains why it matters, provides handling instructions, and includes a brief calculation snippet.

---

### Edge Case 1: Negative NOI

**Description:** Operating expenses exceed Effective Gross Income, producing a negative NOI. This can happen with severely distressed properties, vacant buildings, or properties with abnormally high tax or insurance burdens.

**Why it matters:** Negative NOI breaks standard valuation methods. A negative cap rate is meaningless, DSCR is negative (or undefined if debt service is zero), and income-approach valuation produces a negative number. Any agent receiving a negative NOI must halt normal underwriting and flag the result.

**How to handle it in the model:**
1. Calculate NOI normally. Do not force it to zero.
2. If NOI < 0, skip cap-rate-based valuation. Use replacement cost or comparable sales (price per unit / per SF) instead.
3. Set DSCR = 0.00x and flag as **DSCR: FAIL - Negative NOI**.
4. Cash-on-Cash and IRR calculations should still run (they will produce negative values), but flag as distressed.
5. Model the path to positive NOI: what occupancy, rent, or expense level is required?

**Example calculation snippet:**

```
Scenario: 200-unit property, 40% occupied
GPR (at 40% occupancy) = 80 units x $1,200/mo x 12 = $1,152,000
Other Income = $20,000
EGI = $1,172,000
Operating Expenses = $1,400,000 (fixed costs dominate at low occupancy)

NOI = $1,172,000 - $1,400,000 = -$228,000

Cap Rate: UNDEFINED (negative NOI / positive price is meaningless)
DSCR: 0.00x --> FAIL

Break-even occupancy required:
  Required EGI = $1,400,000 (to reach NOI = $0)
  Required occupied units = ($1,400,000 - $20,000) / ($1,200 x 12) = 96 units
  Break-even occupancy = 96 / 200 = 48%
```

**What to flag in output:**
- `[CRITICAL] NOI is negative: -$228,000. Income-approach valuation not applicable.`
- `[CRITICAL] DSCR: 0.00x. Property cannot support any debt at current occupancy.`
- `[INFO] Break-even occupancy: 48%. Current occupancy: 40%. Gap: 8 percentage points (16 units).`

---

### Edge Case 2: Zero Equity / 100% LTV

**Description:** The buyer contributes no equity -- the loan covers 100% of the purchase price (or more, in negative-equity assumptions). This is rare in conventional CRE but arises in seller-financed deals, assumed loans above current value, or synthetic structures.

**Why it matters:** Cash-on-Cash return and Equity Multiple require division by total equity invested. Division by zero produces undefined results. Additionally, any negative equity scenario (loan > value) inverts normal return logic.

**How to handle it in the model:**
1. If Total Equity Invested = $0, set Cash-on-Cash = "N/A (no equity invested)" and Equity Multiple = "N/A".
2. If Total Equity Invested < $0 (negative equity), flag as anomalous and skip CoC and EM calculations.
3. IRR can still be calculated if there is a meaningful initial cash outlay (closing costs, for example). If the initial cash flow is truly $0 or positive, IRR is mathematically infinite or undefined.
4. DSCR, debt yield, and NOI-based metrics remain valid and become the primary decision tools.

**Example calculation snippet:**

```
Scenario: Seller-financed at 100% LTV
Purchase Price = $32,000,000
Loan Amount    = $32,000,000
Equity         = $0
NOI            = $1,688,500
Debt Service   = $2,427,141 (higher loan amount --> higher ADS)

CFADS = $1,688,500 - $2,427,141 = -$738,641

Cash-on-Cash = -$738,641 / $0 --> UNDEFINED
Equity Multiple = Total Distributions / $0 --> UNDEFINED

DSCR = $1,688,500 / $2,427,141 = 0.696x --> FAIL (below 1.0x, negative cash flow)
```

**What to flag in output:**
- `[WARNING] Zero equity structure. Cash-on-Cash and Equity Multiple are not calculable.`
- `[CRITICAL] DSCR: 0.70x. Property cash flow does not cover debt service at 100% LTV.`
- `[INFO] Recommend evaluating with reduced leverage. LTV required for 1.25x DSCR: ~56%.`

---

### Edge Case 3: Interest-Only Period Exceeds Hold Period

**Description:** The loan has an interest-only (IO) term that extends beyond the planned hold period. For example, a 7-year IO period on a 10-year loan with a 5-year hold plan. The investor never makes a principal payment during the hold.

**Why it matters:** During IO, debt service is lower (boosting CFADS and CoC), but no principal is paid down, so the equity multiple depends entirely on cash flow and appreciation. The loan balance at exit equals the original loan amount, reducing net sale proceeds compared to an amortizing scenario.

**How to handle it in the model:**
1. Use the IO payment formula for every year within the hold period: `ADS = Loan Amount x Interest Rate`.
2. Do NOT amortize the loan balance during the IO hold period. Remaining balance at exit = original loan amount.
3. DSCR should be calculated using IO debt service (the actual obligation), not a hypothetical amortizing payment.
4. Clearly label all metrics as "IO-period" to distinguish from amortizing projections.
5. Run a parallel amortizing scenario for comparison.

**Example calculation snippet:**

```
Parkview with 7-year IO (exceeds 5-year hold):

IO Annual Debt Service = $24,000,000 x 0.0650 = $1,560,000
Amortizing ADS (for comparison) = $1,820,356

Year 1 CFADS (IO)         = $1,688,500 - $1,560,000 = $128,500
Year 1 CFADS (Amortizing) = $1,688,500 - $1,820,356 = -$131,856

CoC (IO)         = $128,500 / $10,960,000 = 1.17%
CoC (Amortizing) = -$131,856 / $10,960,000 = -1.20%

DSCR (IO)         = $1,688,500 / $1,560,000 = 1.082x
DSCR (Amortizing) = $1,688,500 / $1,820,356 = 0.928x

Exit after 5 years:
  Loan balance (IO):         $24,000,000 (no paydown)
  Loan balance (Amortizing): $22,466,635 ($1,533,365 paid down)

  Net proceeds (IO):         $38,289,444 - $765,789 - $24,000,000 = $13,523,655
  Net proceeds (Amortizing): $38,289,444 - $765,789 - $22,466,635 = $15,057,020

  Difference: -$1,533,365 less equity at exit on IO structure
```

**What to flag in output:**
- `[INFO] IO period (7 years) exceeds hold period (5 years). No principal paydown during hold.`
- `[INFO] IO structure improves Year 1 CoC by 237 bps (1.17% vs -1.20%) but reduces exit equity by $1,533,365.`
- `[INFO] DSCR calculated on IO basis: 1.08x. Lender may also require amortizing DSCR test (0.93x).`

---

### Edge Case 4: Variable Rate Debt

**Description:** The loan carries a floating interest rate (e.g., SOFR + 275 bps) rather than a fixed rate. Future debt service is uncertain, making cash flow projections inherently speculative.

**Why it matters:** A 100 bps rate increase on $24.0M of debt adds roughly $240,000/year to interest cost, which can eliminate cash flow entirely. Variable rate debt injects significant uncertainty into IRR and CoC projections.

**How to handle it in the model:**
1. Build three rate scenarios: Base, +100 bps, +200 bps (or use the forward SOFR curve for the base case).
2. Calculate debt service, CFADS, CoC, DSCR, and IRR under each scenario.
3. If a rate cap is purchased, model the capped rate as the maximum in the upside/base scenarios and note the cap cost as an upfront equity expense.
4. Present all return metrics as ranges, not point estimates.
5. Calculate the "break-even rate" -- the rate at which DSCR hits 1.00x.

**Example calculation snippet:**

```
Parkview with floating rate debt: SOFR + 2.75%
Current SOFR: 3.75% --> Current all-in rate: 6.50%

Scenario A (Base): SOFR stays at 3.75% --> Rate = 6.50%
  ADS = $1,820,356 | CFADS = -$131,856 | CoC = -1.20% | DSCR = 0.93x

Scenario B (+100 bps): SOFR rises to 4.75% --> Rate = 7.50%
  IO-equivalent ADS increase = $24,000,000 x 0.01 = +$240,000
  Adjusted ADS = $2,060,356 | CFADS = -$371,856 | CoC = -3.39% | DSCR = 0.82x

Scenario C (+200 bps): SOFR rises to 5.75% --> Rate = 8.50%
  Adjusted ADS = $2,300,356 | CFADS = -$611,856 | CoC = -5.58% | DSCR = 0.73x

Break-even rate (DSCR = 1.00x):
  Required IO ADS = NOI = $1,688,500
  Break-even IO all-in rate approximately 7.04% (SOFR = 4.29%)

Rate cap cost estimate:
  2-year cap at 5.50% strike on $24.0M notional = $250,000-400,000 upfront
```

**What to flag in output:**
- `[WARNING] Variable rate debt. Return metrics are rate-dependent. Presenting 3-scenario range.`
- `[CRITICAL] At SOFR +200 bps, amortizing DSCR drops to 0.73x. Cash flow is deeply negative.`
- `[INFO] Break-even IO all-in rate: 7.04%. Current rate: 6.50%. Cushion: 54 bps before IO cash flow is eliminated.`
- `[RECOMMENDATION] Rate cap strongly recommended if floating rate is pursued.`

---

### Edge Case 5: Value-Add Renovation

**Description:** The acquisition business plan calls for unit renovations that temporarily take units offline, incur capital expenditure, and produce higher rents upon re-lease. Metrics must distinguish between in-place (current) and stabilized (post-renovation) performance.

**Why it matters:** Standard underwriting assumes a static property. Value-add deals have a J-curve: returns dip during renovation (vacant units, capital spend) before rising at stabilization. Using in-place metrics alone undervalues the deal; using stabilized metrics alone ignores execution risk and the cost to get there.

**How to handle it in the model:**
1. Carry two parallel NOI tracks: in-place and stabilized (pro forma).
2. Model the renovation period month-by-month: units offline, units completing, rent-up schedule.
3. Add renovation CapEx to equity required (it reduces CoC and increases equity in the denominator).
4. Calculate Return on Cost = Stabilized NOI / Total Project Cost.
5. Present both in-place and stabilized metrics, clearly labeled.

**Example calculation snippet:**

```
Parkview Value-Add Plan:
  Renovation scope: 200 of 200 units
  Cost per unit: $10,000
  Total renovation budget: $10,000 x 200 = $2,000,000
  Renovation pace: 9-12 units/month --> 18-24 months to complete
  Unit downtime: 3 weeks per unit
  Rent increase: $250/unit/month post-renovation

Revised equity requirement:
  Down payment:        $8,000,000
  Closing costs:       $960,000
  Renovation budget:   $2,000,000
  Total equity:        $10,960,000

In-Place Metrics (Day 1):
  NOI:      $1,688,500
  Cap Rate: 5.28%
  CoC:      $128,500 / $10,960,000 = 1.17% during IO period

Stabilized Metrics (Month 24+, all 200 units renovated):
  New GPR = unit mix market rent roll = $3,864,000
  Vacancy (5%): $193,200
  Other Income excluding RUBS: $180,000 (amenity and ancillary income)
  RUBS Recovery: treated as a utility expense offset
  Stabilized EGI: $3,864,000 - $193,200 + $180,000 = $3,850,800
  Stabilized OpEx: $1,450,800 (post-tax-appeal stabilized run-rate)
  Stabilized NOI: $3,850,800 - $1,450,800 = $2,400,000

  Stabilized Cap Rate (on purchase): $2,400,000 / $32,000,000 = 7.50%
  Return on Cost: $2,400,000 / ($32,000,000 + $2,000,000 + $960,000) = 6.86%

Renovation ROI:
  Annual rent increase per unit: $250 x 12 = $3,000
  Per-unit ROI: $3,000 / $10,000 = 30.0% --> Meets the 15% minimum target

NOI Uplift: ($2,400,000 - $1,688,500) / $1,688,500 = 42.1%
```

**What to flag in output:**
- `[INFO] Value-add deal. Dual metrics: In-place NOI $1,688,500 (5.28% cap) vs. Stabilized NOI $2,400,000 (7.50% cap).`
- `[INFO] Renovation ROI: 30.0% (exceeds 15% threshold). Return on Cost: 6.86%.`
- `[INFO] Stabilization timeline: 18-24 months renovation plus lease-up.`
- `[WARNING] Day 1 tax-adjusted NOI does not support permanent debt at requested leverage. Value-add execution must be verified before proceed.`

---

### Edge Case 6: Tax Reassessment on Sale

**Description:** Many jurisdictions reassess property taxes upon sale, resetting the assessed value to the purchase price. This can dramatically increase the tax burden, particularly in states where the prior owner held the property for decades at a low basis (e.g., California Prop 13 jurisdictions) or in states with annual reassessment to market value.

**Why it matters:** An underwriting model that uses the seller's current tax bill will understate post-acquisition expenses, inflating NOI and overstating returns. The tax increase can be tens or hundreds of thousands of dollars annually.

**How to handle it in the model:**
1. Determine whether the jurisdiction reassesses on sale (research county assessor rules).
2. If yes: calculate the new tax bill using the purchase price (or a percentage thereof) multiplied by the local mill rate.
3. Replace the current tax amount with the projected post-reassessment amount in the Year 1 expense budget.
4. For Prop 13 states (CA): annual increases are capped at 2%, so model a slow escalation.
5. For annual-reassessment states (OR, TX, etc.): assume assessed value tracks market value each year.

**Example calculation snippet:**

```
Parkview Apartments, Austin TX / Travis County (annual reassessment and protest cadence):

Seller's current assessed value: $24,000,000 (purchased 8 years ago)
Seller's current tax bill:       $456,000 ($24M x 1.90% effective tax rate)

Post-acquisition:
  New assessed value:    $32,000,000 (purchase price)
  New annual tax bill:   $32,000,000 x 0.019 = $608,000

Tax increase:            $608,000 - $456,000 = $152,000/year

Impact on NOI:
  NOI using seller's taxes:  $1,688,500 + $152,000 = $1,840,500 (overstated)
  NOI using buyer's taxes:   $1,688,500 (correctly uses $608,000)
  NOI overstatement if not adjusted: 9.0%

Impact on cap rate:
  Overstated cap rate: $1,840,500 / $32,000,000 = 5.75%
  Correct cap rate:    $1,688,500 / $32,000,000 = 5.28%
  Error: 47 bps (material for pricing and go/no-go decisions)

Comparison -- California Prop 13 state:
  If property were in CA with same basis:
  Seller's tax (Prop 13 basis of $18M): $18,000,000 x 0.012 = $216,000
  Buyer's tax (reset to $32M):          $32,000,000 x 0.012 = $384,000
  Tax increase: $168,000/year (73% jump)
  Post-Prop 13: grows at max 2%/year going forward
```

**What to flag in output:**
- `[WARNING] Travis County reassessment/protest cadence. Current seller tax basis would understate Year 1 taxes by approximately $152,000/yr.`
- `[INFO] Model already uses reassessed tax amount. NOI reflects post-acquisition expense basis.`
- `[INFO] If using broker's pro forma, verify they are NOT using seller's tax basis. Common error worth 30+ bps on cap rate.`

---

### Edge Case 7: Lease-Up Period (Occupancy Ramp)

**Description:** The property is below stabilized occupancy and will take time to lease up. This applies to new construction, repositioned assets, or distressed acquisitions with high vacancy. Income ramps gradually from current to stabilized levels over months.

**Why it matters:** A model that uses stabilized occupancy from Day 1 overstates Year 1 income. The lease-up period generates lower cash flow (or negative cash flow), increases equity needs (to cover shortfalls), and delays the return profile. IRR is especially sensitive to when cash flows begin.

**How to handle it in the model:**
1. Start the income projection at current occupancy, not stabilized.
2. Assume an absorption rate (units leased per month) based on market data. Typical: 8-15 units/month for multifamily.
3. Model monthly income during lease-up, then switch to annual once stabilized.
4. Include lease-up costs in the equity budget: marketing, concessions, staffing, carry costs.
5. Calculate DSCR at current occupancy (worst case), not stabilized.

**Example calculation snippet:**

```
Parkview lease-up scenario:
  Current occupancy: 65% (130 of 200 units)
  Target stabilized occupancy: 93% (186 units)
  Units to absorb: 56 units
  Absorption rate: 10 units/month --> 5.6 months to stabilize (round to 6)

Monthly income ramp:

| Month | Occupied | Monthly Rent Revenue | Monthly OpEx | Monthly NOI |
|-------|----------|---------------------|-------------|-------------|
| 1     | 130      | $195,000            | $143,792    | $51,208     |
| 2     | 140      | $210,000            | $143,792    | $66,208     |
| 3     | 150      | $225,000            | $143,792    | $81,208     |
| 4     | 160      | $240,000            | $143,792    | $96,208     |
| 5     | 170      | $255,000            | $143,792    | $111,208    |
| 6     | 180      | $270,000            | $143,792    | $126,208    |
| 7+    | 186      | $279,000            | $143,792    | $135,208    |

(Monthly OpEx simplified as Total OpEx / 12 = $1,725,500 / 12 = $143,792)

Year 1 blended NOI (6 months ramp + 6 months stabilized):
  Ramp NOI (months 1-6): $51,208 + $66,208 + $81,208 + $96,208 + $111,208 + $126,208 = $532,248
  Stabilized NOI (months 7-12): $135,208 x 6 = $811,248
  Year 1 Total NOI: $532,248 + $811,248 = $1,343,496

Compare to stabilized annual NOI: $135,208 x 12 = $1,622,496
Year 1 NOI shortfall: $1,622,496 - $1,343,496 = $279,000

Worst-case DSCR (Month 1, annualized):
  Annualized NOI at 65% occupancy: $51,208 x 12 = $614,496
  DSCR: $614,496 / $1,820,356 = 0.34x --> FAIL

DSCR at stabilization (Month 7+):
  Annualized NOI: $135,208 x 12 = $1,622,496
  DSCR: $1,622,496 / $1,820,356 = 0.89x --> FAIL at requested leverage
```

**What to flag in output:**
- `[WARNING] Property is in lease-up. Current occupancy (65%) is 28 points below stabilized (93%).`
- `[CRITICAL] Day 1 annualized DSCR: 0.34x. Property cannot service debt at current occupancy. Interest reserve or earnout structure required.`
- `[INFO] Estimated time to stabilization: 6 months at 10 units/month absorption.`
- `[INFO] Year 1 NOI shortfall vs. stabilized: $279,000. Budget this as carry cost in equity.`

---

### Edge Case 8: Below-Market Leases (Loss-to-Lease)

**Description:** Existing tenants are paying rents significantly below current market rates. This is the "loss-to-lease" -- the gap between what tenants pay and what the market would bear. Leases turn over at different times, so the income lift is gradual, not immediate.

**Why it matters:** Loss-to-lease represents embedded upside but it is not immediately accessible. Models must reflect the phased timing of rent increases as leases expire and renew. Overstating the speed of rent convergence inflates near-term returns; understating it misses real value.

**How to handle it in the model:**
1. Calculate total loss-to-lease as the difference between in-place rents and market rents, aggregated across all units.
2. Obtain the lease expiration schedule (or assume even distribution if unavailable).
3. Model rent increases at each lease expiration: new rent = market rent (or market minus a retention discount of 3-5%).
4. Apply a renewal rate assumption (typically 50-60% of tenants renew; non-renewals incur turnover cost + vacancy).
5. Build a month-by-month or quarter-by-quarter rent convergence schedule.

**Example calculation snippet:**

```
Parkview loss-to-lease analysis:

  200 units, average in-place rent: $1,600/month
  Market rent: $1,750/month
  Loss-to-lease per unit: $150/month
  Total monthly loss-to-lease: 200 x $150 = $30,000/month
  Annual loss-to-lease: $360,000
  Loss-to-lease as % of market rent: $150 / $1,750 = 8.6%

Interpretation: 8.6% falls in the 5-10% "moderate upside" range.

Lease expiration schedule (assumed even distribution):
  Leases expiring per quarter: 200 / 4 = 50 units/quarter
  (In practice, pull actual expiration dates from the rent roll.)

Rent convergence model:
  - Upon renewal/re-lease: rent moves to $1,750 (market)
  - Retention discount for renewals: 3% --> renewal rent = $1,698
  - Renewal rate: 55% renew, 45% turn over
  - Turnover cost: $2,000/unit; vacancy loss: 1 month

Quarter-by-quarter rent capture:

| Quarter | Units Expiring | Renewals (55%) | New Leases (45%) | Avg New Rent | Incremental Monthly Revenue |
|---------|---------------|----------------|-----------------|-------------|---------------------------|
| Q1      | 50            | 28 @ $1,698    | 22 @ $1,750     | $1,721      | 50 x ($1,721 - $1,600) = $6,050 |
| Q2      | 50            | 28 @ $1,698    | 22 @ $1,750     | $1,721      | $6,050                    |
| Q3      | 50            | 28 @ $1,698    | 22 @ $1,750     | $1,721      | $6,050                    |
| Q4      | 50            | 28 @ $1,698    | 22 @ $1,750     | $1,721      | $6,050                    |

Cumulative monthly revenue increase after full year: $24,200/month
Annualized revenue increase: $24,200 x 12 = $290,400
Capture rate: $290,400 / $360,000 = 80.7% of total loss-to-lease captured in Year 1

Remaining loss-to-lease after Year 1: $360,000 - $290,400 = $69,600
  (From renewals priced at $1,698 vs. $1,750 market)

NOI impact:
  Incremental revenue (Year 1): $290,400
  Less: turnover costs (90 units x $2,000): -$180,000
  Less: vacancy loss (90 units x 1 month x $1,750): -$157,500
  Net NOI impact (Year 1): -$47,100 (turnover drag exceeds partial-year rent gain)
  Net NOI impact (Year 2+, steady state): +$290,400 (no additional turnover drag)
```

**What to flag in output:**
- `[INFO] Loss-to-lease: 8.6% ($360,000/year). Moderate value-add opportunity through organic lease turnover.`
- `[INFO] Full rent convergence requires 12 months assuming even lease expirations.`
- `[WARNING] Year 1 net NOI impact is negative (-$47,100) due to turnover costs and vacancy during re-leasing. Upside is realized in Year 2+.`
- `[INFO] Renewal retention discount (3%) leaves $69,600 residual loss-to-lease after Year 1. Full market rents achieved only through tenant turnover.`

---

## How Agents Use This Skill

### When to Read

- **Financial model builder** (mandatory): This is the primary reference for all underwriting calculations. Read in full before constructing any financial model.
- **Scenario analyst** (reference for sensitivity): Read the Sensitivity Analysis Framework and Investment Thresholds sections when building downside, base, and upside scenarios.
- **IC memo writer** (verify figures): Read to verify that all calculated metrics in the investment committee memo match the formulas defined here. Every number in the memo must trace back to a formula in this document.

### What to Cross-Reference

- **Formulas against `deal.json` terms**: Verify that purchase price, loan amount, interest rate, and amortization schedule in deal.json match the inputs used in calculations. A mismatch between deal terms and formula inputs is a common source of errors.
- **NOI against rent-roll-analyst output**: The NOI calculation depends on EGI, which depends on the rent roll. Cross-reference the rent roll agent's output (unit rents, vacancy, concessions, other income) to ensure they flow correctly into the GPI and EGI formulas.
- **Expenses against opex-analyst output**: Total operating expenses must match the opex agent's findings. Compare each expense line item (taxes, insurance, management fee, payroll, turnover, reserves) against the opex agent's verified figures.

### How to Apply

- **Base case**: Use the exact formulas as written. Do not modify inputs or assumptions -- apply the property's actual figures from the rent roll, T-12, and deal terms.
- **Scenarios**: For sensitivity analysis, modify only the inputs specified by the scenario parameters (e.g., vacancy rate +5%, rent growth 0%, exit cap +50 bps). Keep all other inputs at base case values. Run each changed input through the same formulas.
- **IC memo verification**: After the financial model is built, the IC memo writer must verify that every calculated metric (NOI, DSCR, CoC, IRR, equity multiple, debt yield) matches the output of the formulas in this document. Any discrepancy must be flagged and resolved before the memo is finalized.

### Common Mistakes

- **Using in-place NOI instead of stabilized NOI for value-add**: Value-add deals must be valued on stabilized NOI (post-renovation, post-lease-up), not in-place NOI. Using in-place NOI drastically undervalues the opportunity and produces misleading return metrics. See the "Stabilized vs In-Place NOI Comparison" section.
- **Forgetting to adjust cap rate for market movement**: The exit cap rate is not the same as the entry cap rate. Sensitivity analysis must stress-test cap rate expansion at disposition (+50 bps, +100 bps). Failing to do so overstates IRR and equity multiple.
- **Using the wrong amortization schedule**: Agency loans use 30-year amortization; bank loans may use 25-year. Bridge loans are interest-only. Using the wrong schedule produces incorrect debt service, which cascades into wrong DSCR, CoC, and cash flow projections. Always verify the amortization schedule against the loan terms in deal.json.
