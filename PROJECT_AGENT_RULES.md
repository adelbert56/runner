# Runner Project Agent Rules

Use this file as the repo-specific override layer on top of `AGENTS.md`, `CLAUDE.md`, and `_ai/*` support docs.

## 1. Project Summary

- project name: `Runner`
- primary stack: static site (`site/`), Node scripts, Python scrapers, GitHub Actions automation
- primary runtime surfaces: generated JSON data, GitHub Actions schedules, GitHub Pages deployment, local static preview
- critical user-facing flows: race data freshness, registration date correctness, training-plan UI, content/news badges, automation dashboard trust
- non-goals for ordinary agent runs: broad redesign without evidence, pushing remote changes without explicit user intent, explanation-only follow-ups when source truth already proves a fix is needed

## 2. Truth Surfaces

- canonical frontend source: `site/app.js`, `site/index.html`, `site/styles.css`
- canonical backend or generation source: `scripts/`, especially sync/build scripts; Python scrapers under repo-owned paths
- canonical data source: `runner/賽事/賽事資料庫.json` feeding `site/data/races.json`
- readiness/health/status surfaces: workflow outputs, `site/data/automation-health.json`, `site/data/operational-dashboard.json`, GitHub Actions evidence, Pages 200 health when applicable
- build or release truth surface: `npm run dev` / node syntax gates / repo checks, plus generated site data and Pages deployment evidence when the task is automation-facing
- artifact output location: `site/data/`, local `output/`, payment/export artifacts under repo-owned output paths

## 3. Task Routing Overrides

- small fixes that can be done directly:
  - one-page UI/content badge changes
  - isolated script/parser corrections with clear owner paths
  - local export/formatting fixes with targeted verification
- changes that always require a plan first:
  - automation workflow redesign
  - parser plus override plus report-chain fixes
  - multi-surface training-plan logic upgrades
- changes that always require user confirmation:
  - remote push/publish when not already requested
  - destructive local cleanup outside the stated target
  - credential or workflow-secrets changes
- tasks that are usually read-only:
  - schedule audits
  - freshness checks
  - Pages/deployment health diagnosis

## 4. Forbidden Or Sensitive Areas

- secrets or credential locations: workflow secrets, local credential files, tokens used by actions or external APIs
- schema or migration paths: generated data contracts that feed the site should be treated carefully when shape changes propagate across scripts and UI
- production or deployment scripts: `.github/workflows/`, deploy/publish flows, Pages-related scripts
- generated files that should not be hand-edited: generated `site/data/*.json`, derived reports, generated outputs unless the task explicitly targets the generator or the output fix path
- directories outside normal task scope: `node_modules`, caches, unrelated local outputs, rescue dirs unless the task is explicitly maintenance

## 5. Verification Overrides

### Backend Or Data Generation

- required checks:
  - inspect owning generator/parser path and resulting generated JSON/report
  - compare source-published data against generated tracking outputs when freshness/correctness is the issue
- preferred runtime validation:
  - rerun or inspect the exact generation flow when feasible
- unacceptable weak evidence:
  - accepting a summary report as truth without rechecking `runner/賽事/賽事資料庫.json` or owning parser path

### Frontend

- required checks:
  - syntax gate for large `site/app.js` changes
  - rendered behavior validation when the task is visibly user-facing
- preferred rendered or interactive validation:
  - local static preview or targeted UI inspection of the affected feature
- unacceptable weak evidence:
  - syntax check alone used as proof of final UI correctness

### Automation

- required checks:
  - GitHub workflow evidence, timestamps, and Pages/deployment health when the task concerns schedules or freshness
- required time-bearing evidence:
  - recent workflow runs, schedule windows in Taipei time, Pages success timing, recovery-event timing
- unacceptable weak evidence:
  - local code inspection only for schedule-health or Pages-freshness claims

### Documents Or Artifacts

- required checks:
  - inspect the generated artifact itself and confirm output path/naming
- required final inspection method:
  - open or inspect the actual output file/JSON/report
- unacceptable weak evidence:
  - claiming success because a generator script finished

## 6. Repo-Specific Guardrails

- actions that must fail closed:
  - race data freshness claims without source-to-output proof
  - schedule-health claims without GitHub-side evidence for audit tasks
  - training-plan or content UI claims without checking the actual owner path and effect
- actions that need explicit human approval:
  - remote push/publish when not explicitly requested
  - destructive cleanup
  - secrets/workflow credential changes
- external systems that must not be touched without permission:
  - GitHub publishing flows beyond the requested scope, third-party content sources requiring credentialed access

## 7. Anti-Drip Rules

- if race data bugs involve parser, override, and report layers, repair the whole chain in the same pass
- if a user-visible site fix needs JSON/source alignment, include it now instead of suggesting it later
- if automation or Pages trust is the ask, include the decisive evidence in the same delivery
- if something is intentionally deferred, state the exact reason

## 8. Final Response Contract

In this repo, final agent summaries should include:

- changed: exact owner scripts/UI/workflow surfaces updated
- verified: syntax gates, generated outputs, GitHub/Pages evidence, or rendered checks used
- not verified: anything not proven live or blocked by environment scope
- follow-up only if truly optional: no obvious parser/source/output companion work should be left behind
