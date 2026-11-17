# DEC-244 mutation proofs (2026-11-17)

Each mutation applied, UI rebuilt where needed, the named test run, file restored.

| # | Mutation | Red test |
| --- | --- | --- |
| M40 | operational status icon rendered for Kasir too | e2e `admin-shell.spec.ts` "DEC-244: Halaman Publik Gerai, status operasional, packing select" (Kasir sees no icon) |
| M41 | `SelectContent` back to `alignItemWithTrigger = true` | same (packing popup must open below the trigger) |
| M42 | `Halaman Publik Gerai` link missing from the account menu | same |
| M43 | console `RecheckButton` never calls its endpoint | e2e "DEC-244: Super Admin periksa ulang…" |
| M44 | `GET /api/app/status` opened to `app_member` | worker `test/status/status.test.ts` (Kasir 403) |
| M45 | `runDiscountVerifier` without the tenant filter (targeted recheck verifies the most overdue gerai) | worker `test/admin/recheck.test.ts` "A overdue, B requested" (Sol R1 #1) |
| M46 | discount editor ids keyed by service (desktop + phone editors collide) | e2e "DEC-244: Super Admin periksa…" phone editor label → visible textarea (Sol R1 #2) |
| M47 | Select trigger border back to `slate-200/90` | e2e "DEC-244: Halaman Publik Gerai…" idle trigger border = `--input` (Sol R1 #3) |
| M48 | search track not narrowed at enlarged text below xl (status icon + bell + avatar overrun at 1024 px / 125 %) | e2e "DEC-243: utilitas topbar…" (gate r2 caught it at −0.5 px) |
| — | console environment badge from lg at normal text: measured 1 px clearance at 1024 px (not an overlap), so the e2e sweep stays green; the badge waits for xl as a margin, not as a proven defect | n/a |
