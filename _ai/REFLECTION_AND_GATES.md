# Reflection And Gates

Use this file before closing a task and whenever a task may need human intervention.

## Reflection Has Two Passes

## Pass 1: Technical Reflection

Ask:

- Did I fix the root cause or only the visible symptom?
- Did I modify the actual owner path?
- Did I create regressions or contract drift?
- Does the chosen verification really prove the requested behavior?
- If the task had multiple truth surfaces, do they now agree?

If any answer is uncertain, do not close yet.

## Pass 2: Delivery Reflection

Ask:

- Did I leave obvious adjacent required work for a later turn?
- Did I make the user ask for the next obvious step?
- Did I hide uncertainty instead of naming it?
- Is the final response concise and operational?
- If verification was partial, did I say exactly what remains unproven?

If the task still feels like a partial handoff, it is not done.

## Human Gates

## Gate A: Approval Gate

Ask for approval before:

- destructive actions
- irreversible state changes
- production actions
- schema changes
- secret or credential operations
- billing/account/external side effects

## Gate B: Ambiguity Gate

Ask for clarification only when:

- product direction is unclear
- architecture choice has durable consequences
- local evidence cannot safely resolve the decision

Rules:

- approval gate is about safety
- ambiguity gate is about ownership of uncertain decisions
- do not ask broad questions when one narrow decision will unblock the work

## Close-Out Standard

A task is ready to close only when:

- technical reflection passes
- delivery reflection passes
- approval gate is clear
- ambiguity gate is clear or explicitly escalated
