# Runner Project Rules Intake

## Basic Identity

- repo path: `D:\Users\Squall\Documents\Runner`
- project name: `Runner`
- project type: `web`
- main language: JavaScript/Node + Python
- main runtime: static site + GitHub Actions + local generation scripts

## Highest-Value User Flows

- flow 1: race data freshness and registration correctness
- flow 2: training-plan generation UI
- flow 3: content/news candidate labeling and publication
- flow 4: automation health and Pages deployment trust
- flow 5: local artifact/export flows such as payment sheet outputs

## Truth Surfaces

- canonical backend source: `scripts/` and scraper/generator owner paths
- canonical frontend source: `site/app.js`, `site/index.html`, `site/styles.css`
- canonical data source: `runner/賽事/賽事資料庫.json` and generated `site/data/*.json`
- health/readiness/status surface: GitHub Actions runs, `site/data/automation-health.json`, `site/data/operational-dashboard.json`, Pages 200 status when relevant
- final artifact or export surface: `site/data/`, local output/export files
- build or release truth surface: node syntax gates, local preview, generated data inspection, GitHub/Pages evidence for automation tasks

## Most Common Task Types

- frequent repair task 1: parser/override/race-data correctness fixes
- frequent repair task 2: `site/app.js` training-plan or label/UI behavior fixes
- frequent audit task 1: schedule/Pages/automation health audit
- frequent delivery task 1: local artifact/export generation and packaging

## Routing

- tasks safe for direct execution: isolated UI tweaks, owner-script fixes, small content/data-label fixes
- tasks that must plan first: workflow redesign, parser + report-chain fixes, multi-surface training-plan upgrades
- tasks that must confirm first: remote push/publish unless requested, destructive cleanup, secrets/workflow credential changes
- tasks that are read-only by default: audits, Pages/deployment health checks, freshness diagnosis

## Verification

- what proves a UI fix: syntax gate plus rendered or local preview behavior for the affected path
- what proves an API fix: n/a in the classic service sense; use generated JSON/output and consuming UI behavior
- what proves a data fix: source-published dates or content match the generated JSON/report outputs
- what proves a scheduler fix: GitHub workflow timing/evidence plus Pages or generated-output freshness
- what proves an artifact is correct: inspect the final export file itself

## Guardrails

- forbidden files or areas: secrets-backed workflow configs unless in scope, unrelated generated outputs, caches
- secrets or credential paths: workflow secrets, local token files
- dangerous scripts: publish/deploy workflows, destructive cleanup scripts
- destructive operations requiring approval: remote push/publish not already requested, destructive cleanup, secret changes

## Anti-Drip Notes

- common companion files that should be updated together: parser + override + generated report; UI logic + corresponding data source alignment; workflow change + validator/audit path
- common verification artifacts that should be included together: syntax/build gate, generated JSON/report inspection, GitHub workflow evidence, Pages health when automation-facing
- common scope traps: trusting report layers without source recheck, using syntax-only proof for UI completion, stopping at local changes when the user really asked about remote or live freshness

## Threading Strategy

- problem family 1: race data and registration correctness
- problem family 2: training-plan and UI behavior
- problem family 3: automation / GitHub Actions / Pages health

## Starter Macros To Create

- macro 1: race data freshness or parser repair
- macro 2: training-plan or site UI fix
- macro 3: automation/Pages audit or recovery
