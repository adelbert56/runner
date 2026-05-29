#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <commit-message> <file> [file ...]" >&2
  exit 2
fi

message="$1"
shift
files=("$@")

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add -- "${files[@]}"
if git diff --cached --quiet; then
  echo "No generated changes to commit."
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "did_push=false" >> "$GITHUB_OUTPUT"
  fi
  exit 0
fi

snapshot_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$snapshot_dir"
}
trap cleanup EXIT

for path in "${files[@]}"; do
  if [ -e "$path" ]; then
    mkdir -p "$snapshot_dir/$(dirname "$path")"
    cp "$path" "$snapshot_dir/$path"
  fi
done

git fetch origin main
git reset --hard origin/main

for path in "${files[@]}"; do
  if [ -e "$snapshot_dir/$path" ]; then
    mkdir -p "$(dirname "$path")"
    cp "$snapshot_dir/$path" "$path"
  fi
done

git add -- "${files[@]}"
if git diff --cached --quiet; then
  echo "Generated changes already exist on latest main."
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "did_push=false" >> "$GITHUB_OUTPUT"
  fi
  exit 0
fi

git commit -m "$message"
git push

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "did_push=true" >> "$GITHUB_OUTPUT"
fi
