# Frequently Asked Questions

## Security & Data Privacy

### Where does our deal data go?

The default offline simulation and dashboard storage run locally. Runtime deal files, uploads, checkpoints, reports, and package artifacts are written under the local `data/` directory and are ignored by git.

Live Codex runs are optional. If you choose the Codex / ChatGPT runtime, the selected prompts and deal context are sent through your ChatGPT-authenticated Codex CLI session so the real agents can run. Use offline simulation for local-only demos.

The **Login to ChatGPT** button starts the local Codex CLI login flow. Authentication stays with Codex on the user's machine; this repository does not include or export tokens, cookies, API keys, or credential files.

### Is our data used to train AI models?

The offline path does not send deal data to an AI provider. For optional live Codex runs, data handling follows the terms and controls of the ChatGPT-authenticated Codex session you choose to use.

### What about third-party integrations?

Offline simulation does not call external services. Optional live Codex runs use OpenAI Codex CLI through your ChatGPT login. Optional web search only runs when you request it with `--search` and your Codex CLI supports that flag.

---

## Accuracy & Reliability

### How reliable is the analysis?

The system applies the same analytical frameworks your team uses - it doesn't invent new methodologies. Accuracy matches or exceeds manual analysis because:
- It follows the same checklist every time without shortcuts
- It doesn't get fatigued or distracted
- It cross-references data points across phases automatically
- It flags inconsistencies that humans might miss

### What if the AI makes a mistake?

The system is designed for transparency, not opacity. Every finding includes the source data and reasoning. If something looks wrong, you can trace exactly how it was calculated. The final decision always rests with your team - the AI provides analysis, not authorization.

### How does it handle unusual situations?

When the system encounters something outside normal parameters, it flags it for human review rather than making assumptions. Red flags, data gaps, and anomalies are all surfaced explicitly in the findings panel and final report.

---

## Customization

### Can we change the investment criteria?

Yes. Investment thresholds are fully configurable:
- Minimum DSCR, target IRR, cap rate ranges
- Risk tolerance levels by strategy (core, value-add, opportunistic)
- Dealbreaker conditions
- All parameters are stored in editable JSON configuration files

### Can we add our own checklists or criteria?

The agent system is modular. New specialist agents can be added for specific requirements. Custom validation rules can be incorporated into existing agents. The system is designed to extend, not replace, your existing processes.

### Does it work for different property types?

The current system is optimized for multifamily acquisitions. The architecture supports extension to other property types (office, retail, industrial) with appropriate specialist agents.

---

## Integration

### Does it replace our acquisitions team?

No. It augments your team by handling the analytical heavy lifting. Your professionals focus on:
- Relationship building with brokers and sellers
- Negotiation strategy
- Investment committee presentations
- Portfolio-level decisions

The AI handles repetitive analysis; humans handle judgment and relationships.

### How does it integrate with existing workflows?

Output formats match standard industry practice:
- IC memos in your preferred format
- Underwriting summaries compatible with Excel export
- Due diligence checklists matching industry standards

The system slots into your existing investment committee process without requiring workflow changes.

### Can it connect to our existing data systems?

The system reads deal information from standard JSON configuration files. Integration with CRM, deal tracking, or data room systems can be implemented through standard APIs.

---

## Operations

### How long does a typical analysis take?

- **Simple stabilized deal**: 12-24 hours
- **Standard value-add**: 24-48 hours
- **Complex repositioning**: 48-72 hours

Time varies based on deal complexity and external data availability (market research, comparable sales, etc.).

### What happens if the system is interrupted?

The system checkpoints progress continuously. If interrupted for any reason (power outage, network issue, etc.), it resumes from the last checkpoint automatically. No work is lost.

### How many deals can it process simultaneously?

Each deal runs as an independent process. You can run multiple deals in parallel, limited only by your computing resources. There's no artificial constraint on deal volume.

---

## Getting Started

### What do we need to provide?

For each deal:
- Property information (address, unit count, year built, etc.)
- Financial data (asking price, current NOI, rent roll summary)
- Target terms (desired LTV, hold period, return targets)
- Seller information and timeline

### What technical requirements are there?

- Node.js environment for the dashboard
- Modern web browser (Chrome recommended)
- Network access for external data lookups (market research)
- See [Prerequisites](../../docs/PREREQUISITES.md) for complete requirements

### How do we get started?

1. Review the [Quick Start Guide](./quick-start.md)
2. Schedule a technical setup session
3. Run your first test deal with the sample data in `config/deal.json`
4. Configure for your specific investment criteria
5. Process your first live deal with oversight

---

## Support

### What support is available?

- Technical documentation for common operations
- Troubleshooting guides for known issues
- Email/phone support for production issues
- Regular update releases with improvements

### How do we report issues?

Issues can be reported through:
- The dashboard's built-in error reporting
- Email to the support team
- GitHub issues (if using the open-source version)

Include the deal ID and relevant log excerpts for fastest resolution.
