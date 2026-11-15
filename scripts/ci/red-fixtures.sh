#!/usr/bin/env bash
# TASK-109 Done-when: four fixtures must each turn the gates red. Runs on a throwaway copy of the tracked tree, so the
# working tree is never modified. Exit 0 only when all four fixtures FAIL their gate and the clean copy PASSES.
set -uo pipefail
root=$(git rev-parse --show-toplevel)
work=$(mktemp -d /data/tmp/gx-red-XXXXXX 2>/dev/null || mktemp -d)
trap 'chmod -R u+w "$work" 2>/dev/null; find "$work" -mindepth 1 -delete 2>/dev/null; rmdir "$work" 2>/dev/null' EXIT
git -C "$root" ls-files -z --cached --others --exclude-standard | grep -zv '^prototype/\|^\.delivery/\|^\.pi/' | (cd "$root" && xargs -0 cp --parents -t "$work" 2>/dev/null)
cp "$root/.dev.vars.example" "$work/.dev.vars"
ln -s "$root/node_modules" "$work/node_modules"
for d in apps/worker apps/web-app apps/web-owner packages/domain packages/db packages/telemetry; do
  [ -d "$root/$d/node_modules" ] && ln -s "$root/$d/node_modules" "$work/$d/node_modules"
done
cd "$work"
pass=0
expect_red() { # name, command, failure marker that proves the gate (not something else) went red
  if bash -c "$2" >/tmp/gx-red-$1.log 2>&1; then echo "FIXTURE $1: gate stayed GREEN (bad)"
  elif grep -q -- "$3" /tmp/gx-red-$1.log; then echo "FIXTURE $1: gate RED (good)"; pass=$((pass+1))
  else echo "FIXTURE $1: red for an unexpected reason (see /tmp/gx-red-$1.log)"; fi
}
# Tools are called directly (pnpm refuses symlinked node_modules in a scratch copy).
V="$root/node_modules/.bin/vitest"
(cd apps/web-app && "$root/apps/web-app/node_modules/.bin/vite" build >/dev/null 2>&1) && (cd apps/web-owner && "$root/apps/web-owner/node_modules/.bin/vite" build >/dev/null 2>&1) \
  && node scripts/ci/bundle-audit.mjs --client-only >/dev/null 2>&1 && echo "CLEAN: bundle audit GREEN" || { echo "CLEAN: build or bundle audit unexpectedly RED"; exit 1; }

# 1. broken unit test
echo 'import { it, expect } from "vitest"; it("broken fixture", () => expect(1).toBe(2))' > packages/domain/test/zz-broken.test.ts
expect_red unit "$V run --project unit packages/domain/test/zz-broken.test.ts" "broken fixture"
rm packages/domain/test/zz-broken.test.ts

# 2. emitted source map
echo '{}' > dist/assets/app/assets/fixture.js.map
expect_red sourcemap "node scripts/ci/bundle-audit.mjs --client-only" "source map file"
rm dist/assets/app/assets/fixture.js.map

# 3. injected secret literal in a client bundle
f=$(ls dist/assets/owner/assets/*.js | head -1); cp "$f" /tmp/gx-owner.bak
printf '\nconst leaked="gx_live_%s";' "AAAAAAAAAAAAAAAAAAAAAAAA" >> "$f"
expect_red secret "node scripts/ci/bundle-audit.mjs --client-only" "gx-live-key"
cp /tmp/gx-owner.bak "$f"

# 4. unprotected route (a public /api/app route outside the allowlist)
python3 - <<'PY'
p='apps/worker/src/api/app.ts'; s=open(p).read()
s=s.replace('  return app\n}', '  r("GET", "/kiriman-bocor", "public", "role", async () => ok({}))\n\n  return app\n}', 1)
open(p,'w').write(s)
PY
expect_red route "cd apps/worker && $root/apps/worker/node_modules/.bin/vitest run test/ci/route-scan.test.ts" "public route outside the allowlist"

echo "fixtures red: $pass/4"
[ "$pass" -eq 4 ]
