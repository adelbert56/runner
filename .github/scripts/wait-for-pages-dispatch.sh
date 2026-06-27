#!/usr/bin/env bash
set -euo pipefail

if [ -z "${REPOSITORY:-}" ]; then
  echo "REPOSITORY is required." >&2
  exit 2
fi

workflow_file="${PAGES_WORKFLOW_FILE:-pages.yml}"
workflow_event="${PAGES_WORKFLOW_EVENT:-workflow_dispatch}"
poll_attempts="${PAGES_POLL_ATTEMPTS:-60}"
poll_interval_seconds="${PAGES_POLL_INTERVAL_SECONDS:-10}"

expected_sha="$(git rev-parse HEAD)"
pages_run_id=""

for _ in $(seq 1 "$poll_attempts"); do
  pages_run_id="$(
    gh run list --repo "$REPOSITORY" --workflow "$workflow_file" --branch main --limit 10 \
      --json databaseId,headSha,event \
    | jq -r --arg sha "$expected_sha" --arg event "$workflow_event" '
        [.[] | select(.event == $event and .headSha == $sha)][0].databaseId // empty
      '
  )"

  if [ -n "$pages_run_id" ]; then
    break
  fi

  sleep "$poll_interval_seconds"
done

if [ -z "$pages_run_id" ]; then
  echo "Timed out waiting for Pages workflow dispatch for commit $expected_sha." >&2
  exit 1
fi

pages_run_url="$(gh run view --repo "$REPOSITORY" "$pages_run_id" --json url --jq '.url')"
echo "Waiting for Pages workflow: $pages_run_url"
gh run watch --repo "$REPOSITORY" "$pages_run_id" --exit-status
