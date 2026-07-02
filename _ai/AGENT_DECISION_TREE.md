# Agent Decision Tree

Use this file to choose the right execution path before deep work starts.

## Step 1: Identify Task Intent

Choose one primary intent:

- `repair`: something is wrong and needs to become correct
- `audit`: inspect and report without editing unless reopened
- `build`: create or extend a deliverable
- `research`: gather evidence and reduce to a decision

If two intents seem true, choose the one that defines completion.

## Step 2: Identify Truth Surface Shape

Choose the smallest accurate shape:

- `single-surface`: one file, one API, one script, one page, one artifact
- `dual-surface`: source vs summary, backend vs UI, generator vs output
- `multi-surface`: API + DB + UI + schedule + artifact, or similarly coupled systems

Rule:

- the more surfaces involved, the more planning and stronger verification you need

## Step 3: Identify Verification Depth

Choose the minimum level that can actually prove the request complete:

- `static`: file inspection, diff, config check
- `targeted runtime`: one test, one endpoint, one page render, one artifact generation
- `live contract`: real workflow, live page, real scheduler/run state, final artifact inspection

If the user asks for "正常運作", "可交付", "實際操作", or equivalent, default to `live contract` unless impossible.

## Step 4: Choose Execution Mode

### Mode A: Direct Execute

Use when:

- intent is `repair` or `build`
- truth surface is `single-surface`
- verification is `static` or cheap `targeted runtime`
- no meaningful approval risk exists

### Mode B: Plan Then Execute

Use when:

- truth surface is `dual-surface` or `multi-surface`
- there are multiple dependent steps
- the acceptance criteria needs sequencing

### Mode C: Read-Only Audit

Use when:

- intent is `audit`
- or the user explicitly forbids changes

### Mode D: Research To Decision

Use when:

- intent is `research`
- and the output must be a recommendation, comparison, or narrowed next step

## Step 5: Check Approval Gates

Two gates exist:

- `approval gate`: destructive, irreversible, external side effect, secrets, billing, schema, production
- `ambiguity gate`: product or architecture choice is unclear and cannot be resolved safely from local evidence

Rules:

- if approval gate is hit, ask before execution
- if ambiguity gate is hit, ask only for the missing decision, not the whole plan

## Step 6: Check Bounded Sweep Eligibility

Ask:

- Is there any adjacent low-risk deliverable that is clearly implied and required for a reusable result?

Examples:

- helper doc
- verification note
- missing companion prompt
- source + summary alignment
- parser + generated output alignment

If yes, include it now.

## Step 7: Final Pre-Execution Classification

State the task in one line internally:

`<intent> + <truth-surface-shape> + <verification-depth> + <execution-mode>`

Example:

- `repair + multi-surface + live contract + plan then execute`
- `audit + dual-surface + targeted runtime + read-only audit`

This is the shortest stable summary of how the agent should behave.
