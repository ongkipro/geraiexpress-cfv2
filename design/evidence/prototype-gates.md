# Prototype gate evidence (TASK-001)

Date: 2026-11-14 (re-run after DEC-220..223: dashboard chart + history, period filter with range calendar, payment record, blue palette, settings sub-menu).
(comfort). Commands: `dotuiux check <url> --surface admin` (390/1366/1536) and
`admin-geometry.mjs <url> --contract design/admin-contract.json --viewports 390,1366,1536`.
`allowed` = WARN rules recorded with reasons under `DESIGN.md` → Allow. `not checked` = rule had nothing to measure
on that route (e.g. no inputs) or contrast over overlays; contrast was reviewed by eye on the screenshots.
Not covered: keyboard walk-through, loading/empty/error states (not built in the prototype), dark mode (out of scope).

Note: a later re-run (after only adding the `icon-overload` allow line) could not launch a fresh headless Chrome on this
host (`no working Chrome/Chromium`, environment issue while 50+ browser processes from other sessions were running);
the rows below are from the full run immediately before it on the same build. The period filter popover/sheet is only
measured closed by these tools; its open state was reviewed on screenshots (`/data/tmp/cfv2-shots/a3-*`).

| Route | dotuiux check | admin-geometry |
|---|---|---|
| `#/` | summary: 0 fail · 0 warn · 2 allowed · 4 not checked · 34 pass | admin-geometry exit 0 |
| `#/kasir/baru` | summary: 0 fail · 0 warn · 2 allowed · 3 not checked · 35 pass | admin-geometry exit 0 |
| `#/kiriman` | summary: 0 fail · 0 warn · 3 allowed · 4 not checked · 33 pass | admin-geometry exit 0 |
| `#/kontak/pengirim` | summary: 0 fail · 0 warn · 1 allowed · 5 not checked · 34 pass | admin-geometry exit 0 |
| `#/keuangan` | summary: 0 fail · 0 warn · 2 allowed · 4 not checked · 34 pass | admin-geometry exit 0 |
| `#/pengaturan` | summary: 0 fail · 1 warn (icon-overload, then allowed in DESIGN.md) · 2 allowed · 5 not checked · 32 pass | admin-geometry exit 0 |
| `#/pengaturan/printer` | summary: 0 fail · 0 warn · 2 allowed · 6 not checked · 32 pass | admin-geometry exit 0 |
| `#/pengaturan/ekspedisi` | summary: 0 fail · 0 warn · 2 allowed · 5 not checked · 33 pass | admin-geometry exit 0 |
| `#/pengaturan/data-usaha` | summary: 0 fail · 0 warn · 2 allowed · 5 not checked · 33 pass | admin-geometry exit 0 |
| `#/admin` | summary: 0 fail · 0 warn · 0 allowed · 4 not checked · 36 pass | admin-geometry exit 0 |
| `#/?role=kasir` | summary: 0 fail · 0 warn · 2 allowed · 4 not checked · 34 pass | admin-geometry exit 0 |
| `#/?dir=b` | summary: 0 fail · 0 warn · 2 allowed · 4 not checked · 34 pass | admin-geometry exit 0 |
