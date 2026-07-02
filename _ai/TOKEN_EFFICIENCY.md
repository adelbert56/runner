# Token Efficiency

Use this file to make AI work last longer under limited quotas without sacrificing correctness.

## Goal

- Spend tokens on decisive reasoning and real verification.
- Cut waste from redundant reading, repeated planning, and vague prompts.
- Prefer reusable structure over re-explaining the same context every turn.

## Highest-Impact Rules

### 1. State The Finish Line Up Front

Bad:

- "看看這個問題"

Better:

- "找出根因，直接修到可交付，驗證完再回報"

Why it saves tokens:

- reduces exploratory back-and-forth
- reduces repeated intent clarification
- lets the agent choose the right routing once

### 2. Give Boundaries Early

Say upfront if any of these apply:

- read-only
- no commit
- no push
- no schema changes
- no production actions
- Chinese output, English code

Why it saves tokens:

- prevents rework
- avoids proposing forbidden paths
- avoids clarification turns

### 3. Give The Truth Surface

If you know the likely canonical source, name it.

Examples:

- "正式 truth surface 是 `/api/ready`"
- "真正買點來源看 `selection/latest_meta`"
- "UI 問題直接看這個頁面和這支 API"

Why it saves tokens:

- avoids broad repo wandering
- reduces irrelevant file reads
- cuts false starts

### 4. Ask For Bounded Sweep

Use a phrase like:

- "同輪把相鄰必要項一起做完，不要擠牙膏"

Why it saves tokens:

- avoids follow-up suggestion turns
- reduces repeated context reload
- yields one heavier but cheaper total pass

### 5. Prefer Targeted Inputs

Send one of these when possible:

- exact error message
- failing screenshot
- endpoint response snippet
- exact command that failed
- file path and function name

Why it saves tokens:

- reduces broad diagnosis cost
- helps the agent jump to the right surface

## Prompting Patterns That Save Tokens

### Pattern A: Repair

```text
根因優先，直接修到可交付。
邊界：不得 commit、不得 push。
正式 truth surface：`/api/ready`.
若發現明顯相鄰根因一併處理，不要擠牙膏。
```

### Pattern B: Read-Only Audit

```text
只讀巡檢，不得修改。
檢查 `/api/v1/schedules/health/overview` 是否正常。
先給 findings，再給風險與建議。
```

### Pattern C: Multi-Step Build

```text
這是多步任務，先列短計畫再執行。
完成標準：產物已生成且已驗證.
請直接做到驗證完成。
```

## Workflow Tactics

### Use Layered Docs

Keep reusable instructions in files instead of retyping them each turn:

- `AGENTS.md`
- `CLAUDE.md`
- `TASK_ROUTING.md`
- `VERIFY.md`
- `PROMPT_MACROS.md`
- `MY_DEFAULT_RULES.md`
- repo-specific rules

Why it saves tokens:

- persistent guidance replaces repeated instruction payloads

### Reuse A Stable Task Format

Good recurring structure:

- objective
- truth surface
- boundaries
- acceptance criteria

Why it saves tokens:

- the agent learns your pattern
- fewer clarifying turns

### Keep One Thread Per Problem Family

Examples:

- one thread for trading freshness
- one thread for DVR UI
- one thread for document templates

Why it saves tokens:

- preserves relevant context
- avoids reloading unrelated project history

For project rollout guidance, see:

- `EXISTING_PROJECT_TOKEN_RETROFIT.md`
- `NEW_PROJECT_TOKEN_SETUP.md`

### Split Only When Context Becomes Polluted

Start a fresh thread when:

- the task switches projects entirely
- the thread contains too much stale history
- the objective changes from fix to research to delivery

Why it saves tokens:

- prevents paying for irrelevant prior context

## What Usually Wastes Tokens

- asking too broadly without acceptance criteria
- withholding boundaries until after work starts
- reading whole files when symbols would do
- repeated re-planning instead of execution
- fixing one visible issue while leaving obvious companion work for later
- asking for suggestions after every micro-step
- mixing unrelated projects in one thread

## Recommended User Macros

### Fast Repair Macro

```text
處理一下，直接修到可交付。
先找根因，不要做 workaround。
如果有明顯相鄰根因一併解掉。
完成前自己驗證。
邊界：不得 commit、不得 push。
truth surface：`selection/latest_meta`.
```

### Efficient Audit Macro

```text
只讀檢查排程健康狀態。
先看真正 truth surface，不要只看 summary。
我要 findings、風險、下一步。
不得修改。
```

### Efficient Build Macro

```text
直接做完整交付，不要拆成下一輪建議。
若需要模板、驗證清單、配套檔，這輪一起補齊。
完成標準：最終產物可直接使用且已驗證.
```

For more reusable starters, see `PROMPT_MACROS.md`.

## Decision Rule

Spend tokens on:

- root-cause discovery
- authoritative evidence
- real verification
- reusable artifacts

Do not spend tokens on:

- repeated framing
- speculative explanation
- optional brainstorms before the core task is done
- suggestions that should have been included in the current pass
