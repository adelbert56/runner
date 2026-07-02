# Verification Matrix

Use this file to choose the right evidence before claiming a task is complete.

## Principle

- Verification must match the user-facing contract.
- A narrow check cannot justify a broad success claim.
- "Looks right" is not enough when stronger evidence is available.

## Verification By Task Type

### Code Logic Change

Preferred evidence:

- targeted tests
- type check
- lint when relevant
- direct execution path that exercises the changed logic

Minimum close-out:

- what path was tested
- what passed
- what remains unverified

### API Or Data Change

Preferred evidence:

- direct endpoint response
- query result
- payload inspection
- before/after comparison when relevant

Minimum close-out:

- exact surface checked
- decisive field or output
- whether data freshness or environment scope may limit confidence

### UI Change

Preferred evidence:

- actual rendered page
- screenshot or browser inspection
- interactive flow validation for the affected path

Minimum close-out:

- which page or component was checked
- what visible behavior changed
- whether verification was static, rendered, or interactive

### Build, Packaging, Or Artifact Change

Preferred evidence:

- successful build
- generated artifact inspection
- file existence and structure checks
- render or open the produced artifact when layout matters

Minimum close-out:

- artifact name or output path
- generation result
- whether the final artifact itself was inspected

### Documentation Or Prompting Change

Preferred evidence:

- source-to-output consistency check
- link/path validation when relevant
- structural review against the intended workflow

Minimum close-out:

- source basis used
- what was updated
- whether this was content review only or runtime-tested in a real agent flow

### Scheduling, Automation, Or Statefulness

Preferred evidence:

- actual run record
- logs with timestamps
- observed next-run or completed-run state
- direct health/readiness/status surface

Minimum close-out:

- exact time-bearing evidence used
- whether the workflow truly ran or was only code-inspected

## Verification Depth

### Level 1: Static

Use when runtime validation is not possible or not required.

Examples:

- file inspection
- config diff
- docs consistency check

### Level 2: Targeted Runtime

Use when a specific changed path can be exercised cheaply.

Examples:

- run one test file
- hit one endpoint
- render one page

### Level 3: Contract Validation

Use when the user asked for true readiness, real behavior, or production-like confidence.

Examples:

- end-to-end flow
- live page interaction
- real generated artifact review
- real scheduler or workflow execution evidence

## Failure Rules

- If verification fails, do not present the task as done.
- If verification is partial, say exactly which requirement remains open.
- If verification is impossible in the current environment, say that explicitly and identify the strongest evidence you could gather instead.

## Reporting Template

Use this structure in the final summary when helpful:

- changed: what was updated
- verified: exact commands, surfaces, or observations
- not verified: anything still indirect, blocked, or environment-limited
