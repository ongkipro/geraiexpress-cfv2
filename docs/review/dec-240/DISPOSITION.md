# DEC-240 / DEC-241 / DEC-242 — review disposition

Reviewer: GPT-6.1 Sol (`9router-fantastico/cx/gpt-6.1-sol`), independent of the implementer (Claude Opus 5.5).

## Round 1 — APPROVE with two P2 findings (`R1-sol.md`)

Every P0–P2 is fixed (project rule), with a test proven red by a mutation.

| # | Sev | Finding | Fix | Proof |
|---|---|---|---|---|
| 1 | P2 | Failed revoke / domain-removal errors render behind the still-open `AlertDialog` | API & MCP and Anggota show the revoke error inside the dialog (`role="alert"`, cleared when a new confirmation opens); Mini-Site `act` returns the error and the remove dialog shows it in place (typed confirmation kept) | `e2e/admin-shell.spec.ts` "error cabut kunci…" (forced 503); mutation M28 red |
| 2 | P2 | `/pengaturan` desktop redirect reads the breakpoint only on render | `useSyncExternalStore` over `matchMedia("(min-width: 1024px)")` `change`; crossing 1024 px redirects (replace) | same test: 900 px shows the directory, resize to 1280 px lands on `/pengaturan/profil`; mutation M29 red |

Integrated run `DEC-240` PASS 9/9 on the R1 tree (before these fixes); re-run after.

## Round 2 — APPROVE (`R2-sol.md`)

#1 and #2 FIXED; no new P0–P3. Integrated run `DEC-240` PASS 9/9 on the R2 tree.
