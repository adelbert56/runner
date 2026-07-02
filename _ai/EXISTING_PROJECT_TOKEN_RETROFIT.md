# Existing Project Token Retrofit

Use this guide to reduce token burn in a project that already exists and already has history, quirks, and repeated problem types.

## Goal

- Cut repeated rediscovery cost.
- Stop paying for the same context every time.
- Make future tasks start closer to the real truth surface.

## Principle

For existing projects, token waste usually comes from missing structure, not from the model itself.

The biggest leaks are:

- no clearly written truth surfaces
- no repo-specific routing rules
- no verification contract
- no reusable opening prompts
- mixing unrelated problem families in one thread

## Retrofit Order

Apply these in order. Do not skip the first three.

## Step 1: Write The Truth Surfaces

Create or fill a repo-specific rules file using a project template and define:

- canonical backend source
- canonical frontend source
- canonical data source
- health/readiness/status surfaces
- final artifact surfaces

Why this matters:

- the agent stops wandering
- diagnosis starts from the real contract
- repeated prompts become shorter

Minimum success condition:

- for the top 5 recurring task types, you can point to one authoritative surface immediately

## Step 2: Define Task Routing Overrides

In the repo rules, explicitly classify:

- what can be direct-fix
- what always needs a plan
- what always needs confirmation
- what is read-only by default

Why this matters:

- fewer clarification turns
- less re-planning
- less accidental scope drift

## Step 3: Define Verification Overrides

Write down what counts as real completion for this repo.

Examples:

- UI issue: rendered page check, not just code read
- scheduler issue: timestamped run evidence, not just source inspection
- data issue: canonical source plus summary surface comparison

Why this matters:

- stops weak completion claims
- avoids re-opening the same bug after a fake fix

## Step 4: Identify Repeating Problem Families

Split the project's work into a few stable lanes.

Examples:

- UI truthfulness
- data freshness
- scheduling
- exports and artifacts
- deployment or readiness

Why this matters:

- one thread can keep one problem family context
- less irrelevant history per task

## Step 5: Prepare Repo Macros

For the 3 to 5 most common tasks in that repo, make short macros.

Examples:

- fix data freshness
- audit scheduler
- fix dashboard mismatch
- generate report artifact

Why this matters:

- users stop typing long freeform context
- the agent gets higher-signal openings

## Step 6: Move Reusable Context Into Files

Do not restate these every time in chat:

- repo truth surfaces
- recurring constraints
- verification expectations
- anti-drip rules

Put them in:

- repo `AGENTS.md` or `PROJECT_AGENT_RULES.md`
- helper docs
- stable runbooks

Why this matters:

- token spend shifts from repeated instructions to actual problem-solving

## Step 7: Remove Known Noise Sources

Common existing-project noise:

- giant stale docs nobody actually uses
- multiple competing "latest" files
- helper scripts with unclear ownership
- summary pages that diverge from canonical data

Action:

- mark canonical paths
- de-emphasize or document non-canonical paths
- add one-line warnings where confusion is common

Why this matters:

- less token spent comparing conflicting surfaces

## Step 8: Standardize Final Response Shape

For the project, prefer one summary shape:

- changed
- verified
- not verified

Why this matters:

- less filler
- easier follow-up turns
- better auditability

## Recommended Retrofit Pack

For an existing project, the minimum useful pack is:

1. repo-specific rules file
2. verification overrides
3. 3 repo-specific prompt macros
4. anti-drip rules

If the project is complex, add:

5. one short runbook per recurring problem family

## What To Do In Your Existing Projects

### For A Project With Frequent Bug Fixes

Prioritize:

- truth surfaces
- direct-fix vs plan-first split
- UI/API verification rules
- fast repair macros

### For A Project With Data And Scheduling

Prioritize:

- canonical source vs summary mapping
- timestamp-bearing verification rules
- read-only monitoring macros
- freshness and scheduler runbooks

### For A Project With Document Or Artifact Output

Prioritize:

- artifact output path
- final inspection requirements
- artifact delivery macros
- naming/path conventions

## Anti-Patterns In Existing Projects

- leaving all repo knowledge inside chat history
- using one thread for every issue in the same repo forever
- keeping multiple unofficial truth surfaces alive
- accepting "looks fixed" without a repo-specific verification contract

## Fast Retrofit Checklist

- [ ] repo truth surfaces written
- [ ] task routing overrides written
- [ ] verification overrides written
- [ ] anti-drip rules written
- [ ] 3 prompt macros prepared
- [ ] recurring problem families separated
- [ ] final response shape standardized
