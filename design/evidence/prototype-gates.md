# Prototype gate evidence (TASK-001)

Date: 2026-11-14 (re-run after DEC-220..223: dashboard chart + history, period filter with range calendar, payment record, blue palette, settings sub-menu).
(comfort). Commands: `dotuiux check <url> --surface admin` (390/1366/1536) and
`admin-geometry.mjs <url> --contract design/admin-contract.json --viewports 390,1366,1536`.
`allowed` = WARN rules recorded with reasons under `DESIGN.md` → Allow. `not checked` = rule had nothing to measure
on that route (e.g. no inputs) or contrast over overlays; contrast was reviewed by eye on the screenshots.
Not covered: keyboard walk-through, loading/empty/error states (not built in the prototype), dark mode (out of scope).

Chronology (newest last):
1. 2026-11-14 morning — full run after DEC-220..223; rows below were first produced by it.
2. 2026-11-14 midday — re-run attempt failed to launch headless Chrome. **Superseded by 3.** Cause found later: a tool
   bug, not host load — Chrome 157 headless on Linux loads no http(s) page without `--password-store=basic`; fixed in
   `design-taste/scripts/ui-ref.mjs` (dotfiles `760aab7b`).
3. 2026-11-14 evening — TASK-005 re-run on the build with the DEC-222 palette and PC-first print labels: 0 fail on 12
   routes (table below). It caught one real defect: the `Pengaturan › Ekspedisi` switches are 28 px at 390 px.
4. 2026-11-15 — touch rule hardened after GPT-6.1 Sol round 2 (finding 10): the label exemption is replaced by
   `touch-target-toggle` (`labelTarget` probe: a checkbox/switch counts its label's width **and** height only when the
   label activates a native input; otherwise its own box). Proved by a negative fixture and a mutation in
   `admin-dashboard/scripts/test-admin-geometry.sh`. Re-measured: `#/pengaturan/ekspedisi` 60 px, `#/kasir/baru` 70 px.

Scope limits (not covered by these tools): the period filter popover/sheet is measured closed only (open state reviewed
on screenshots `/data/tmp/cfv2-shots/a3-*`); keyboard walk-through; loading, empty and error states are **not built**
in the throwaway prototype — owner-accepted deferral 2026-11-14 (M0 sign-off): they are specified in `docs/visual/07`
and become M3 acceptance criteria with real browser evidence.

| Route | dotuiux check | admin-geometry |
|---|---|---|
| `#/` | summary: 0 fail · 0 warn · 2 allowed · 4 not checked · 34 pass | admin-geometry exit 0 |
| `#/kasir/baru` | summary: 0 fail · 0 warn · 2 allowed · 3 not checked · 35 pass | admin-geometry exit 0 |
| `#/kiriman` | summary: 0 fail · 0 warn · 3 allowed · 4 not checked · 33 pass | admin-geometry exit 0 |
| `#/kontak/pengirim` | summary: 0 fail · 0 warn · 1 allowed · 5 not checked · 34 pass | admin-geometry exit 0 |
| `#/keuangan` | summary: 0 fail · 0 warn · 2 allowed · 4 not checked · 34 pass | admin-geometry exit 0 |
| `#/pengaturan` | summary: 0 fail · 1 warn (icon-overload, then allowed in DESIGN.md) · 2 allowed · 5 not checked · 32 pass | admin-geometry exit 0 |
| `#/pengaturan/printer` | summary: 0 fail · 0 warn · 2 allowed · 6 not checked · 32 pass | admin-geometry exit 0 |
| `#/pengaturan/ekspedisi` | summary: 0 fail · 0 warn · 2 allowed · 5 not checked · 33 pass | admin-geometry exit 0 (first run exit 1, see chronology 3–4) |
| `#/pengaturan/data-usaha` | summary: 0 fail · 0 warn · 2 allowed · 5 not checked · 33 pass | admin-geometry exit 0 |
| `#/admin` | summary: 0 fail · 0 warn · 0 allowed · 4 not checked · 36 pass | admin-geometry exit 0 |
| `#/?role=kasir` | summary: 0 fail · 0 warn · 2 allowed · 4 not checked · 34 pass | admin-geometry exit 0 |
| `#/?dir=b` | summary: 0 fail · 0 warn · 2 allowed · 4 not checked · 34 pass | admin-geometry exit 0 |

## Superseded: interim palette check (2026-11-14 midday)

Superseded by chronology item 3 (full TASK-005 re-run, 0 fail). Kept only as history: while the gate tools could not
launch Chrome, an agent-browser probe checked 10 routes × 390/1366 px for white background, no `.dark` class, 14 px
minimum text, no horizontal overflow and contrast ≥ 4.5:1.
