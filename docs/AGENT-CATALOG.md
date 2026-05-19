# Agent Catalog

The canonical open-source catalog contains **31 named AI roles**: 6 orchestrators, 21 acquisition specialists, and 4 source-document ingestion roles.

Every role follows the 19-section prompt anatomy standard: Identity, Mission, Tools, Inputs, Strategy, Output Format, Quality Gates, Checkpoint Protocol, Resume Protocol, Error Handling, Confidence Scoring, Dealbreaker Detection, Data Gap Handling, Self-Review, Escalation Rules, Logging, Coordination, Constraints, and Examples. See [Agent Development](AGENT-DEVELOPMENT.md) for the full specification.

## Phase Map

| Phase | Starts When | Key Agents | Output |
|-------|-------------|------------|--------|
| **Due Diligence** | Immediately | Rent Roll Analyst, OpEx Analyst, Physical Inspection, Market Study, Environmental Review, Legal & Title Review, Tenant Credit | Property risk profile, market positioning, physical condition assessment |
| **Underwriting** | DD 100% complete | Financial Model Builder, Scenario Analyst, IC Memo Writer | Pro forma financials, 27-scenario stress test, investment committee memo |
| **Financing** | UW 100% complete | Lender Outreach, Quote Comparator, Term Sheet Builder | Lender quotes, comparative analysis, recommended term sheet |
| **Legal** | DD 80% complete | PSA Reviewer, Title & Survey, Estoppel Tracker, Loan Doc Reviewer, Insurance Coordinator, Transfer Doc Preparer | Contract review, title clearance, closing document preparation |
| **Closing** | All prior phases complete | Closing Coordinator, Funds Flow Manager | Final closing checklist, funds flow schedule, transfer execution |

Legal starts at DD 80% completion to model how real CRE deals work: legal review begins before all diligence is complete, but the Loan Doc Reviewer waits for Financing output before reviewing loan documents.

## Orchestrators (6)

| Agent | Role | Manages |
|-------|------|---------|
| **Master Orchestrator** | Full pipeline coordinator | 5 phase orchestrators, phase dependency enforcement, final go/no-go verdict |
| **Due Diligence Orchestrator** | DD phase manager | 7 specialist agents, parallel launch with dependency ordering |
| **Underwriting Orchestrator** | UW phase manager | 3 agents in sequence: model, scenarios, IC memo |
| **Financing Orchestrator** | Financing phase manager | 3 agents: parallel lender outreach, sequential quote comparison and term sheet |
| **Legal Orchestrator** | Legal phase manager | 6 agents, early start at DD 80%, Loan Doc Reviewer waits for financing |
| **Closing Orchestrator** | Closing phase manager | 2 agents: closing coordinator, then funds flow manager |

## Due Diligence Specialists (7)

| Agent | What It Does | Key Outputs |
|-------|-------------|-------------|
| **Rent Roll Analyst** | Validates unit mix, in-place rents vs market, loss-to-lease calculation, occupancy, tenant concentration risk, and anomaly detection | Unit mix summary, rent comp analysis, loss-to-lease matrix, anomaly flags |
| **OpEx Analyst** | Analyzes T-12 operating statement, per-unit expense benchmarking, line-item trends, management fee validation, and tax reassessment modeling | Expense analysis, per-unit benchmarks, anomaly flags, tax projection |
| **Physical Inspection** | Assesses property condition, estimates capital expenditure needs by system, calculates remaining useful life, and quantifies deferred maintenance | Physical condition report, CapEx schedule, deferred maintenance estimate |
| **Market Study** | Researches submarket fundamentals, demographics, employment, supply pipeline, absorption, rent comps, and competitive positioning | Market analysis, rent comps, competitive positioning, demand forecast |
| **Environmental Review** | Evaluates Phase I ESA findings, contamination risk, regulatory compliance, remediation cost, vapor intrusion, and adjacent property concerns | Environmental risk score, remediation needs, regulatory flags |
| **Legal & Title Review** | Analyzes title commitment, exceptions, encumbrances, easements, liens, deed restrictions, and HOA/CC&R issues | Title analysis, exception review, encumbrance schedule |
| **Tenant Credit** | Evaluates tenant creditworthiness, income concentration, lease rollover exposure, Section 8/subsidized housing, and credit scoring | Tenant credit report, concentration risk matrix, rollover schedule |

## Underwriting Specialists (3)

| Agent | What It Does | Key Outputs |
|-------|-------------|-------------|
| **Financial Model Builder** | Builds complete 10-year pro forma: GPI, vacancy, EGI, OpEx, NOI, debt service, cash flow, reversion, stabilization, renovation impact, and refinancing scenarios | Base case pro forma, cash flow projections, return metrics |
| **Scenario Analyst** | Runs 27 sensitivity scenarios by varying rent growth, vacancy, and exit cap rate across three levels each | Scenario matrix, sensitivity tables, break-even analysis, downside risk quantification |
| **IC Memo Writer** | Synthesizes diligence and underwriting outputs into a structured investment committee memorandum | Investment committee memo, decision card, risk-weighted recommendation |

## Financing Specialists (3)

| Agent | What It Does | Key Outputs |
|-------|-------------|-------------|
| **Lender Outreach** | Solicits quotes from up to 12 lenders across Agency, CMBS, Life Companies, Banks, Bridge, and Mezzanine sources | Lender list, outreach results, initial quotes, lender fit scoring |
| **Quote Comparator** | Compares rate, term, LTV, DSCR, prepayment, recourse, rate lock, deposit, and lender fit | Quote comparison matrix, weighted ranking, recommended lender |
| **Term Sheet Builder** | Drafts term sheet, identifies negotiation leverage, flags non-standard terms, and models rate-lock scenarios | Term sheet draft, negotiation points, rate-lock analysis |

## Legal Specialists (6)

| Agent | What It Does | Key Outputs |
|-------|-------------|-------------|
| **PSA Reviewer** | Reviews Purchase & Sale Agreement clauses, contingencies, representations, earnest money, closing conditions, seller obligations, and assignment rights | PSA analysis, risk flags, deadline calendar, negotiation recommendations |
| **Title & Survey Reviewer** | Reviews title commitment and ALTA survey for boundary issues, easements, encroachments, flood zone, and zoning compliance | Title/survey review, exception analysis, survey issue map |
| **Estoppel Tracker** | Manages estoppel collection for up to 200 units and validates tenant-reported terms against rent roll | Estoppel status tracker, discrepancy report, completion percentage |
| **Loan Doc Reviewer** | Reviews note, mortgage/deed of trust, guaranty, environmental indemnity, and UCC filings against the term sheet | Loan doc review, compliance check, deviation flags |
| **Insurance Coordinator** | Verifies lender and PSA insurance requirements, property coverage, liability, flood, windstorm, umbrella, and broker coordination | Insurance compliance report, coverage gap analysis, premium estimates |
| **Transfer Doc Preparer** | Prepares deed, bill of sale, assignment of leases, FIRPTA certificate, transfer tax calculations, entity verification, and closing statement review | Transfer document drafts, entity verification, transfer tax calculation |

## Closing Specialists (2)

| Agent | What It Does | Key Outputs |
|-------|-------------|-------------|
| **Closing Coordinator** | Manages closing checklist, verifies conditions precedent, tracks outstanding items, coordinates timeline, and performs final readiness assessment | Closing checklist, readiness score, outstanding items tracker |
| **Funds Flow Manager** | Prepares funds flow memo, purchase price allocation, prorations, lender disbursement, escrow holdbacks, wire instructions, and closing cost breakdown | Funds flow memo, wire instructions, proration schedule, closing cost summary |

## Document Ingestion Agents (4)

| Agent | What It Does | Key Outputs |
|-------|-------------|-------------|
| **Document Orchestrator** | Classifies incoming documents, routes to the right parser, manages extraction pipeline, and validates completeness | Document manifest, extraction status, routing decisions |
| **Rent Roll Parser** | Extracts structured rent roll data from CSV, text/markdown, and supported XLSX rent rolls with operator review before apply | Structured rent roll JSON, extraction confidence, source provenance, review status |
| **Financials Parser** | Extracts T-12 operating statements, income line items, expense categories, and month-over-month trends | Structured financials JSON, line-item mapping |
| **Offering Memo Parser** | Extracts property details, investment highlights, financial projections, and market data from offering memoranda | Structured property data, financial assumptions, market summary |

## Domain Knowledge Base

Eight specialized knowledge files encode CRE domain expertise that agents reference during analysis.

| Skill | What It Contains | Used By |
|-------|-----------------|---------|
| **[Underwriting Calculations](../skills/underwriting-calc.md)** | CRE formulas: GPI, EGI, NOI, DSCR, LTV, cap rate, IRR, equity multiple, cash-on-cash, debt yield, break-even occupancy, GRM, price metrics, reserves, loan constant, and amortization | Financial Model Builder, Scenario Analyst, Quote Comparator |
| **[Risk Scoring Framework](../skills/risk-scoring.md)** | 9-category risk scoring across ownership/title, physical, environmental, market, financial, tenant, legal, capital markets, and operational factors | All DD agents, IC Memo Writer, Master Orchestrator |
| **[Multifamily Benchmarks](../skills/multifamily-benchmarks.md)** | Operating expenses by property class and region, occupancy standards, rent growth, CapEx reserves, fees, turnover, insurance, and tax reassessment factors | OpEx Analyst, Financial Model Builder, Market Study |
| **[Lender Criteria](../skills/lender-criteria.md)** | Agency, CMBS, Life Company, Bank, Bridge, and Mezzanine requirements, loan parameters, rate structures, and prepayment terms | Lender Outreach, Quote Comparator, Term Sheet Builder |
| **[Legal Checklist](../skills/legal-checklist.md)** | PSA review items, title requirements, survey standards, environmental compliance, entity formation, transfer documentation, and closing conditions | Legal agents, Closing Coordinator |
| **[Logging Protocol](../skills/logging-protocol.md)** | Dashboard event format, log levels, event types, agent attribution, timestamps, and correlation IDs | All agents |
| **[Checkpoint Protocol](../skills/checkpoint-protocol.md)** | 3-tier checkpoint system, read/write procedures, schema compliance, resume logic, versioning, and conflict resolution | All agents, all orchestrators |
| **[Self-Review Protocol](../skills/self-review-protocol.md)** | Output completeness validation, calculation cross-checks, confidence scoring, data gaps, and escalation criteria | All agents |

## Data Contracts

Every data handoff between agents and phases is validated against formal JSON Schema contracts at runtime.

| Schema | Purpose | Validates |
|--------|---------|-----------|
| **[Due Diligence Data](../schemas/phases/due-diligence-data.schema.json)** | DD phase output contract | Rent roll analysis, expense benchmarks, market data, physical condition, environmental findings, title status, tenant credit |
| **[Underwriting Data](../schemas/phases/underwriting-data.schema.json)** | UW phase output contract | Pro forma financials, scenario results, return metrics, IC memo recommendation |
| **[Financing Data](../schemas/phases/financing-data.schema.json)** | Financing phase output contract | Lender quotes, comparison matrix, selected terms, debt sizing |
| **[Legal Data](../schemas/phases/legal-data.schema.json)** | Legal phase output contract | PSA review, title clearance, estoppel status, loan doc compliance, insurance verification |
| **[Closing Data](../schemas/phases/closing-data.schema.json)** | Closing phase output contract | Readiness checklist, funds flow, outstanding items, final status |
| **[Flag](../schemas/common/flag.schema.json)** | Risk flag format | Severity, category, description, agent source, recommended action |
| **[Checklist Item](../schemas/common/checklist-item.schema.json)** | Checklist entry format | Status, responsible party, deadline, completion criteria |
| **[Phase Completion Event](../schemas/events/phase-completion.schema.json)** | Phase transition event | Phase ID, status, verdict, metrics, timestamp |
| **[Master Checkpoint](../schemas/checkpoint/master-checkpoint.schema.json)** | Pipeline state persistence | Deal ID, phase statuses, progress, timestamps, phase outputs |
| **[Agent Checkpoint](../schemas/checkpoint/agent-checkpoint.schema.json)** | Agent state persistence | Agent ID, status, findings, metrics, red flags, data gaps |
