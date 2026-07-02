# Task Routing

Use this file to decide how a coding agent should execute a task before editing anything.

## Goal

- Choose the right execution mode early.
- Keep autonomy high on low-risk work.
- Force checkpoints on high-risk or ambiguous work.
- Preserve explicit read-only or scope boundaries through the full task.

## Step 1: Classify The Task

### Class A: Direct Fix

Use when all conditions hold:

- clear bug or small content fix
- local impact or tightly bounded file set
- no schema, credential, billing, or production-side effects
- verification path is obvious

Default behavior:

- inspect relevant files
- implement directly
- run targeted verification
- report what changed and what passed

### Class B: Coordinated Change

Use when any of these apply:

- cross-file feature work or refactor
- multiple possible implementation routes
- acceptance criteria need sequencing
- verification requires several steps

Default behavior:

- inspect and stage context first
- produce a short execution plan
- implement in coherent batches
- verify against each stated requirement

### Class C: High-Risk Change

Use when any of these apply:

- destructive or hard-to-reverse action
- schema or migration impact
- secrets, auth, billing, account, or production operations
- ambiguous architecture tradeoff with lasting consequences
- external side effects beyond the local workspace

Default behavior:

- gather evidence
- define the blast radius
- ask for confirmation before execution
- prefer a lower-risk alternative if available

### Class D: Read-Only Investigation

Use when the user asks for patrol, research, diagnosis, audit, review, or explicitly forbids edits.

Default behavior:

- do not modify files or state
- inspect the real truth surfaces
- summarize findings, risks, and recommended next actions

## Step 2: Pick Execution Style

- `Direct execute`: Class A with clear root cause and obvious verification.
- `Plan then execute`: Class B, or Class A with hidden complexity.
- `Ask before side effects`: Any Class C action.
- `Strict read-only`: Any Class D request.

## Step 3: Stage The Minimum Context

Before substantial work, gather:

- user objective
- relevant files or systems
- current failure signal or reason for change
- explicit constraints
- acceptance criteria

For larger tasks, this staged context should be explicit in the agent's notes or status update.

## Step 4: Keep Scope Tight

- Fix the root cause, not adjacent unrelated issues.
- Expand scope only when new evidence shows another cause must be fixed to make the requested result true.
- If scope expands, say why.
- Use a bounded sweep: include adjacent low-risk deliverables that are clearly implied by the request or required to make the result practically reusable.
- Do not defer obvious companion artifacts into a later suggestion if they can be completed safely in the same pass.

## Step 5: Preserve Boundaries

If the user sets any boundary, it stays active unless explicitly reopened:

- no edits
- no commit
- no push
- no schema changes
- no secrets access
- no production actions

## Practical Defaults

- Small bug, obvious fix, one to three files: execute.
- New feature, refactor, workflow redesign, or multi-surface change: plan first.
- Anything irreversible or externally visible: confirm first.
- Audit or review request: stay read-only unless the user reopens edit scope.
- When the task naturally needs a template, checklist, helper doc, or verification note to be truly reusable, include it in the same delivery.
