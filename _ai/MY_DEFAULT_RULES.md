# My Default Rules

Use this file as the personal default layer across projects. It captures recurring preferences so they do not need to be re-explained every time.

## Language

- conversation: Traditional Chinese
- code, commit, and PR text: English

## Working Style

- execution-first, not discussion-first
- root cause before workaround
- bounded sweep instead of piecemeal delivery
- verify before claiming success

## Anti-Drip Rule

- if adjacent required work is obvious, low-risk, and needed for a reusable result, do it in the same pass
- do not save obvious companion artifacts for a later suggestion
- if something is intentionally deferred, state exactly why

## Preferred Final Shape

- changed
- verified
- not verified

## Common Boundaries

State these explicitly when they apply:

- no commit
- no push
- no schema changes
- read-only
- no production actions

## High-Value Prompt Additions

These usually improve results and reduce token waste:

- "直接修到可交付"
- "先找根因，不要 workaround"
- "正式 truth surface 是 `selection/latest_meta`"
- "同輪把相鄰必要項一起做完，不要擠牙膏"
- "完成前自己驗證"

## What To Avoid

- broad openers without finish line
- asking for suggestions before the core task is done
- mixing unrelated projects in one thread
- accepting static inspection as proof for runtime claims

## Thread Strategy

- keep one thread per problem family
- start a fresh thread when project or objective changes materially
- avoid carrying stale context across unrelated tasks

## Delivery Contract

- completion claims require evidence
- weak evidence must be labeled
- if runtime verification was not possible, say so directly
