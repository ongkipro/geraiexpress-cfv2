#!/usr/bin/env bash
# Milestone integrated run (docs/WORKFLOW.md §5): gates run sequentially and fail fast; after a failure the remaining
# gates are reported NOT RUN. Each gate is recorded through delivery-ledger (executed evidence). Usage:
#   scripts/ci/integrated-gate.sh <milestone-task-id>   (a ledger run must already be started with --require-check ...)
set -uo pipefail
task="${1:?milestone task id}"
port="${GX_E2E_PORT:-55191}"
gates=(
  "typecheck|pnpm typecheck"
  "lint|pnpm lint"
  "unit|pnpm test:unit"
  "build|pnpm build"
  "worker|pnpm test:worker"
  "migrations|pnpm test:migrations"
  "isolation|pnpm test:isolation"
  "security|pnpm security:bundle-audit && bash scripts/ci/red-fixtures.sh && security-check ."
  "e2e|GX_E2E_PORT=$port pnpm exec playwright test --reporter=line"
)
failed=""
for g in "${gates[@]}"; do
  name="${g%%|*}"; cmd="${g#*|}"
  if [ -n "$failed" ]; then echo "NOT RUN $name (after $failed failed)"; continue; fi
  out=$(delivery-ledger record --check "$name" --command "heavy-run --lock geraiexpress-cfv2-env --label 'gx $task $name' -- bash -c '$cmd'" 2>&1 | tail -1)
  echo "$out"
  case "$out" in *"RECORDED $name=PASS"*) ;; *) failed="$name" ;; esac
done
[ -z "$failed" ] && echo "INTEGRATED RUN PASS ($task)" || { echo "INTEGRATED RUN FAIL at $failed ($task)"; exit 1; }
