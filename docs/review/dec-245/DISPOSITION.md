# DEC-245 — review disposition

Reviewer: GPT-6.1 Sol (`9router-fantastico/cx/gpt-6.1-sol`, agent `reviewer`), independent of the implementer
(Claude Opus 5.5). Scope: brand diff `bbf7a40..9c740b1` (the landing shipped before its contract) plus the DEC-245
contract edits and every fix below.

## Before review — integrated gate r1 FAIL

Gate r1 ran typecheck … security PASS; `e2e` failed to start its `wrangler dev` web server (transient local start
failure; `e2e/brand.spec.ts` passed 3/3 on its own straight after). Later gate attempts: r2 stopped on purpose (Sol R2
fix pending); r3 `typecheck` UNVERIFIED (evidence files were written during the run). r4 PASS 9/9 on the reviewed tree; r5
PASS 9/9 on the final surface (docs added); ledger run finished PASS.

## Round 1 — REQUEST_CHANGES (`R1-sol.md`)

| # | Sev | Finding | Fix | Proof |
|---|---|---|---|---|
| 1 | P1 | Pause / reduced motion stopped only the step timeline; the scene kept animating on wall-clock time | Hero source now in the repo (`apps/worker/src/brand/hero/hero-studio-3d.src.js`, minified with esbuild); a `sceneClock` advances only while playing, paused draws a short settle then stops; `aria-pressed` + label on the toggle | e2e pause freezes `data-clock`, resume advances, reduced motion starts frozen; M-c red |
| 2 | P2 | Services not in the catalog (J&T Cargo, Lion BIGPACK, Anteraja/Pos Kargo, inactive SAP Lite, EXPRESS / SAMEDAY tiles); cargo COD not distinguished | Only active `courier_service_catalog` services; cargo labelled Non-COD; hero tiles REGULER / EKONOMI / COD / KARGO; visual 09 §4.2 | worker copy guard |
| 3 | P2 | Volumetric divisor copy (6.000 regular / 4.000 cargo) wrong | Engine rule: 4.000 JNE Reguler + iDexpress Cargo, 6.000 otherwise | worker assertion; M-b red |
| 4 | P2 | Fixed "25% OFF" / "s/d 25%" vs DEC-226/230/233; discount attributed to couriers | No percentage anywhere ("Diskon kirim mitra · sesuai akun gerai", canvas "MITRA" / "9 EKSPEDISI"); /biaya: GeraiExpress sets, Mengantar applies, customers pay the publish tariff | worker copy guard |
| 5 | P2 | "KYC VERIFIED" / automatic identity validation not implemented | Step 02 "Tinjauan Pengajuan Gerai" (team review), canvas "DISETUJUI" | worker copy guard |
| 6 | P2 | API/MCP shown as Pro-only | Moved to Standard | worker assertion |
| 7 | P2 | Unapproved support hours | Removed | worker copy guard |
| 8 | P2 | 40 px hero controls | 44 px pause + step targets | e2e 44 px box |
| 9 | P2 | `#CBD5E1` input borders < 3:1 | `#7B879C` (app `--input`) | — |
| 10 | P2 | No coverage of the asset allow-list | Worker test: allow-list GET/HEAD, type, cache, nosniff, no cookie; `/app/…`, `/index.html`, `/assets/`, maps, `//`, `%2F`, `..`, Ninja, POST → 404; three.js only on `/`; demos without fetch/XHR | M-a red |

## Round 2 — REQUEST_CHANGES (`R2-sol.md`)

| # | Sev | Finding | Fix | Proof |
|---|---|---|---|---|
| 11 | P2 | Resize while paused left a blank canvas (`setSize` clears the buffer, no redraw) | Paused resize renders and settles the camera; settle is time + frame based (slow GPUs) | e2e resize counts scene pixels from a canvas screenshot; M-d red (0 pixels) |

## Round 3 — REQUEST_CHANGES (`R3-sol.md`)

| # | Sev | Finding | Fix | Proof |
|---|---|---|---|---|
| 12 | P2 | The resize repaint bypassed the off-screen gate | Repaint only when `stageVisible`; on return to view a paused stage settles and redraws; `renderFrame()` counts every draw | e2e off-screen resize keeps `data-frames`, back on-screen repaints; M-e red (59 → 62) |

## Round 4 — APPROVE (`R4-sol.md`)

All twelve findings fixed on disk, no new findings, no open P0–P2.
