# Runbook: Runner Race Data Truth

Use this runbook when published registration windows, official dates, or race freshness look wrong in the generated site outputs.

## Trigger Conditions

- a race page already shows registration info, but the report/site still says missing
- `開報後待補資料報告.md` or similar summaries contradict the public source
- manual override exists but does not apply
- race data and generated site outputs drift apart

## Primary Truth Surfaces

- source database: `runner/賽事/賽事資料庫.json`
- generated site output: `site/data/races.json`
- owner scripts: `scripts/` plus parser/override paths
- report surfaces: quality reports and missing-data reports are secondary, not canonical

## Fast Triage Order

1. Recheck the source/public page or authoritative platform payload.
2. Recheck `runner/賽事/賽事資料庫.json`.
3. Recheck `site/data/races.json`.
4. Only then trust or reject any report that says the field is missing.

## Common Root Causes

- the review stayed at the report layer and never revalidated parser/override truth
- manual override matching depends on exact or near-exact title matching and normalization is insufficient
- some platforms hide the actual dates in API payloads or embedded script data, not the visible HTML
- live enrichment is blocked, so verified values were never seeded into the rebuild path

## Repair Rules

- repair parser, override, and generated-output chain together when they are all involved
- treat source-to-output correctness as the main contract, not the report wording alone
- if a source is SPA/API-backed, jump to the API early instead of over-reading HTML
- if network is blocked, land parser/test/manual-seed fixes together so the rebuild can still converge

## Verification Contract

Minimum expected proof:

- source or authoritative payload shows the value
- `runner/賽事/賽事資料庫.json` reflects it correctly
- `site/data/races.json` reflects it correctly
- report output no longer contradicts the canonical source

For automation-related follow-ups, add:

- GitHub Actions / Pages freshness evidence when the user asked about live deployment health

## Anti-Drip Notes

- do not stop after fixing the parser if the override path or generated JSON still disagrees
- do not trust `開報後待補資料報告.md` over the source database and owner parser path
- if parser plus override plus report are all implicated, fix the full chain in one pass
