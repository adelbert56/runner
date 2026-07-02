# Agent Evolution Loop

Use this file to keep the agent system improving over time instead of freezing as a static doc set.

## Goal

- reduce repeated token waste
- shorten time to root cause
- strengthen verification quality
- reduce piecemeal delivery

## The Loop

## 1. Run

Execute a real task using:

- repo rules
- prompt macros
- matching runbook

## 2. Observe

After the task, note:

- Was the truth surface found quickly?
- Were clarification turns fewer than before?
- Did verification prove enough?
- Did any obvious companion work get missed?
- Did the prompt macro reduce setup effort?

## 3. Diagnose

If the task still felt expensive, identify the bottleneck:

- missing truth surface
- weak routing
- weak verification rule
- no runbook for this incident family
- noisy or bloated docs
- bad thread hygiene

## 4. Improve The Smallest Durable Asset

Patch only the best leverage point:

- `PROJECT_AGENT_RULES.md`
- `PROMPT_MACROS.md`
- `RUNBOOK_*.md`
- `INDEX.md`
- `TOKEN_EFFICIENCY.md`

Do not rewrite the whole system when one small durable fix will do.

## 5. Reuse

The next similar task should start from the improved asset instead of rediscovering the lesson.

## Monthly Review Questions

- Which repos still consume the most tokens?
- Which incident families still require too much exploratory reading?
- Which tasks still trigger clarification turns too often?
- Which prompt macros are used most?
- Which runbooks are missing for recurring incidents?
- Which docs are large but low-yield?

## Signals That The System Is Improving

- shorter opening prompts
- fewer clarification turns
- faster convergence to the owner path
- stronger verification with less rework
- fewer follow-up turns asking for the next obvious deliverable

## Signals That The System Is Regressing

- more broad file reads
- more partial handoffs
- more "looks fixed" claims without proof
- repeated rediscovery of the same root cause
- more prompts that restate long context manually

## Default Optimization Order

When improvement is needed, fix in this order:

1. truth surface clarity
2. routing clarity
3. verification clarity
4. prompt macro quality
5. incident runbook quality
6. large-doc slimming

This order usually gives the best token return.
