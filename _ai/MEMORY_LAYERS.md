# Memory Layers

Use this file to keep memory useful instead of polluted.

## Layer 1: Durable Memory

What belongs here:

- repo truth surfaces
- stable project conventions
- long-lived guardrails
- stable verification expectations
- high-value user preferences

What does not belong here:

- temporary logs
- one-off error output
- stale dates
- resolved transient incidents without reusable lessons

## Layer 2: Incident Memory

What belongs here:

- repeated incident families
- root causes that have occurred before
- reliable triage order
- known misleading symptoms
- runbook-worthy fixes

Best home:

- `RUNBOOK_*.md`
- repo-specific notes

## Layer 3: Session Memory

What belongs here:

- current task context
- latest evidence gathered this turn
- temporary hypotheses
- open verification gaps

Rule:

- session memory should expire unless promoted to durable or incident memory

## Promotion Rules

Promote to durable memory when:

- the rule is stable across many tasks

Promote to incident memory when:

- the same failure mode is likely to recur

Do not promote when:

- the fact is date-specific
- the issue was purely incidental
- the insight is not reusable

## Token Benefit

Correct memory layering reduces token waste because:

- durable rules stop repeated explanation
- incident memory stops repeated rediscovery
- session memory does not leak into future unrelated tasks
