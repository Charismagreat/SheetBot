#!/usr/bin/env bash
# Refactor guardrails: route manifest + no new TypeScript errors vs docs/tsc-baseline.txt
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASELINE="$ROOT/docs/tsc-baseline.txt"
TSC="$ROOT/node_modules/.bin/tsc"

if [[ ! -x "$TSC" ]]; then
  echo "verify.sh: run npm ci (or npm install) first — tsc not found" >&2
  exit 1
fi

echo "== check-manifest.mjs =="
node "$ROOT/scripts/check-manifest.mjs"

echo "== tsc --noEmit (compare to baseline) =="
CURRENT_FILE="$(mktemp)"
ALLOWED_FILE="$(mktemp)"
trap 'rm -f "$CURRENT_FILE" "$ALLOWED_FILE"' EXIT

# tsc exits non-zero when errors exist; we still need its stdout for comparison.
TSC_OUT="$("$TSC" --noEmit 2>&1 || true)"
printf '%s\n' "$TSC_OUT" | perl -ne 'if (/^(.+)\((\d+),\d+\): error (TS\d+):/) { print "$1:$2 $3\n" }' | sort -u > "$CURRENT_FILE"
grep -vE '^\s*#' "$BASELINE" | grep -vE '^\s*$' | sort -u > "$ALLOWED_FILE"

NEW_COUNT=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if ! grep -Fxq "$line" "$ALLOWED_FILE"; then
    if [[ "$NEW_COUNT" -eq 0 ]]; then
      echo "New TypeScript errors (not in docs/tsc-baseline.txt):" >&2
    fi
    echo "  $line" >&2
    NEW_COUNT=$((NEW_COUNT + 1))
  fi
done < "$CURRENT_FILE"

if [[ "$NEW_COUNT" -gt 0 ]]; then
  exit 1
fi

CURRENT_COUNT=$(wc -l < "$CURRENT_FILE" | tr -d ' ')
echo "tsc: ${CURRENT_COUNT} known error(s), no new errors"
echo "verify.sh: OK"
