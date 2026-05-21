# Codex Agent Run - codex-sample-redacted

- Started: 2026-05-20T14:02:11.000Z
- Completed: 2026-05-20T14:09:48.000Z
- Workflow: Quick Deal Screen
- Scenario: core-plus
- Status: FAILED
- Outcome: partial
- Agents: 2
- Failed agents: scenario-analyst

## Results
- PASS: Underwriting / financial-model-builder (attempts: 1) -> data/codex-runs/codex-sample-redacted/underwriting/financial-model-builder.md
- FAIL: Underwriting / scenario-analyst (attempts: 3) -> Codex exec returned non-zero exit. Auth header was Authorization: [REDACTED]. token=[REDACTED]

## Redacted log excerpt
This excerpt mirrors what the live runner persists after redactSecrets masks
credentials. Ordinary deal text is preserved verbatim; only secret-looking
values are replaced with [REDACTED].

```
[codex] connecting with Authorization: [REDACTED]
[codex] session token=[REDACTED]
[codex] underwriting note: Net operating income held at the 6.1% in-place cap; rent roll shows 92% occupancy.
[codex] api_key=[REDACTED]
[codex] exec failed: upstream returned 503 (transient)
```
