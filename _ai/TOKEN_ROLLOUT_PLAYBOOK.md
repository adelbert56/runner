# Token Rollout Playbook

Use this playbook to actually deploy the token-efficiency pack into a real repository instead of leaving it as a library of templates.

## Goal

- land the rules in a repo
- make the next task cheaper than the last one
- avoid "good docs that nobody applied"

## Deliverables

After a successful rollout, the target repo should have:

- a common agent layer
- a repo-specific rules layer
- a verification contract
- reusable prompt macros
- a clear rollout checklist

## Recommended Landing Structure

At minimum:

- repo root: `AGENTS.md`
- repo root: `CLAUDE.md`
- repo root: `PROJECT_AGENT_RULES.md`
- repo support dir: `_ai/`

Suggested `_ai/` contents:

- `TASK_ROUTING.md`
- `VERIFY.md`
- `TOKEN_EFFICIENCY.md`
- `PROMPT_MACROS.md`
- `MY_DEFAULT_RULES.md`
- `PROJECT_RULES_INTAKE.md`
- `ROLL_OUT_CHECKLIST.md`

## Rollout Paths

### Path A: Existing Project Retrofit

Use when:

- the repo already exists
- there are recurring incidents
- people keep re-explaining the same context

Target outcome:

- the next 3 common task types can start from written truth surfaces and macros

### Path B: New Project Setup

Use when:

- starting a new repo
- adding AI workflows to a clean project
- defining conventions before drift appears

Target outcome:

- the repo has explicit routing, verification, and anti-drip rules from day one

## 30-Minute Landing Plan

If you only have one pass, do this:

1. copy the base files in
2. create `PROJECT_AGENT_RULES.md` from the closest template
3. fill truth surfaces
4. fill routing overrides
5. fill verification overrides
6. prepare 3 prompt macros for the repo's most common tasks

This is the minimum viable landing.

## 60-Minute Landing Plan

If you want a better landing:

1. do the 30-minute plan
2. fill sensitive areas and guardrails
3. write anti-drip rules for the repo
4. create one short runbook for the most repeated incident type
5. decide thread separation by problem family

## What To Fill First In `PROJECT_AGENT_RULES.md`

Do not start with every section. Start with:

1. project summary
2. truth surfaces
3. task routing overrides
4. verification overrides
5. anti-drip rules

These five sections give the highest token savings.

## Repo Launch Checklist

- [ ] `AGENTS.md` landed
- [ ] `CLAUDE.md` landed
- [ ] `PROJECT_AGENT_RULES.md` created
- [ ] `_ai/` support docs landed
- [ ] truth surfaces filled
- [ ] routing overrides filled
- [ ] verification overrides filled
- [ ] 3 repo macros prepared
- [ ] anti-drip rules filled

## Adoption Rule

The rollout is not complete when the files exist.

The rollout is complete only when:

- the next task in that repo actually uses the new rules
- the opening prompt is shorter than before
- the agent starts from the declared truth surface

## Practical First Targets

Pick one recurring expensive problem family first:

- UI truthfulness
- data freshness
- scheduling
- report generation
- startup/readiness

Do not try to operationalize everything at once.

## Success Metrics

The rollout is working when:

- fewer clarification turns are needed
- fewer broad repo reads happen
- fewer follow-up suggestion turns are needed
- verification is stronger with less rework
- the same issue type gets solved faster over time
