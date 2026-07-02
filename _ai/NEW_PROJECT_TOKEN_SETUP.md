# New Project Token Setup

Use this guide when starting a new repository or adding AI workflows to a project before bad habits accumulate.

## Goal

- make the project cheap to work on from day one
- avoid repeated context rebuild
- prevent future thread bloat

## Principle

For new projects, token efficiency is mostly an onboarding problem.

If you establish the contract early, later tasks stay short and high-signal.

## Setup Order

## Step 1: Add The Base Layer

Start with:

- common `AGENTS.md`
- common `CLAUDE.md`
- `TASK_ROUTING.md`
- `VERIFY.md`
- `TOKEN_EFFICIENCY.md`
- `PROMPT_MACROS.md`

Why this matters:

- the default working style becomes explicit immediately

## Step 2: Create Repo-Specific Rules On Day One

Pick the closest template:

- web
- python
- data-workflow

Fill it before the project becomes messy.

Must-fill fields:

- truth surfaces
- routing overrides
- verification overrides
- guardrails
- anti-drip rules

## Step 3: Keep Canonical Surfaces Singular

For each important concern, choose one primary truth surface:

- one readiness endpoint
- one canonical data output
- one main dashboard source
- one final artifact path

Why this matters:

- fewer future comparisons
- shorter prompts
- less drift

## Step 4: Separate Problem Families Early

Set a convention for thread separation.

Examples:

- one thread for UI
- one for backend workflows
- one for artifact generation
- one for monitoring and audits

Why this matters:

- lower context pollution
- lower carry-over cost

## Step 5: Prepare A Small Prompt Pack

Create or reuse 4 opening macros:

- fast repair
- read-only audit
- multi-step implementation
- artifact delivery

Why this matters:

- every task starts with a better opener

## Step 6: Normalize Verification Culture

Do not let the project adopt weak completion habits.

Require:

- rendered checks for UI claims
- endpoint or payload checks for API claims
- timestamps for scheduling claims
- artifact inspection for export claims

Why this matters:

- a false fix always costs more tokens later than a proper check now

## Step 7: Add Lightweight Runbooks Only For Recurring Pain

Do not over-document everything.

Create runbooks only for recurring issues such as:

- startup and readiness
- report generation
- scheduler diagnosis
- data freshness

Why this matters:

- reusable context without giant docs

## Step 8: Set The Default Summary Format

Make all closes use:

- changed
- verified
- not verified

Why this matters:

- less conversational waste
- easier continuation

## Minimum New-Project Pack

For most new repos, this is enough:

1. one repo-specific rules file
2. one prompt pack
3. one verification contract
4. one anti-drip section

Only add more when repeated work proves it is needed.

## Anti-Patterns In New Projects

- waiting until the repo is messy to define truth surfaces
- allowing several unofficial status endpoints
- mixing generated artifacts with canonical sources without labeling them
- using generic AI prompts for every task instead of repo-shaped macros

## New Project Checklist

- [ ] base layer copied
- [ ] repo-specific rules filled
- [ ] truth surfaces chosen
- [ ] verification contract written
- [ ] anti-drip rules written
- [ ] 4 starter macros prepared
- [ ] thread separation convention decided
