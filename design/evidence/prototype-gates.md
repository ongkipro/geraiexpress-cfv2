# Prototype gate evidence (TASK-001)

Date: 2026-11-14. Build: `prototype/` (`pnpm build`, `vite preview` on port 55180). Contract: `design/admin-contract.json`
(comfort). Commands: `dotuiux check <url> --surface admin` (390/1366/1536) and
`admin-geometry.mjs <url> --contract design/admin-contract.json --viewports 390,1366,1536`.
`allowed` = WARN rules recorded with reasons under `DESIGN.md` → Allow. `not checked` = rule had nothing to measure
on that route (e.g. no inputs) or contrast over overlays; contrast was reviewed by eye on the screenshots.
Not covered: keyboard walk-through, loading/empty/error states (not built in the prototype), dark mode (out of scope).

| Route | dotuiux check | admin-geometry |
|---|---|---|
| `#/` | summary: 0 fail · 0 warn · 1 allowed · 4 not checked · 35 pass | admin-geometry exit 0 |
| `#/kasir/baru` | summary: 0 fail · 0 warn · 2 allowed · 3 not checked · 35 pass | admin-geometry exit 0 |
| `#/kiriman` | summary: 0 fail · 0 warn · 3 allowed · 4 not checked · 33 pass | admin-geometry exit 0 |
| `#/kontak/pengirim` | summary: 0 fail · 0 warn · 1 allowed · 5 not checked · 34 pass | admin-geometry exit 0 |
| `#/keuangan` | summary: 0 fail · 0 warn · 2 allowed · 4 not checked · 34 pass | admin-geometry exit 0 |
| `#/pengaturan` | summary: 0 fail · 0 warn · 2 allowed · 5 not checked · 33 pass | admin-geometry exit 0 |
| `#/admin` | summary: 0 fail · 0 warn · 0 allowed · 4 not checked · 36 pass | admin-geometry exit 0 |
| `#/?role=kasir` | summary: 0 fail · 0 warn · 2 allowed · 5 not checked · 33 pass | admin-geometry exit 0 |
| `#/?dir=b` | summary: 0 fail · 0 warn · 1 allowed · 4 not checked · 35 pass | admin-geometry exit 0 |
| `#/kasir/baru?dir=c` | summary: 0 fail · 0 warn · 2 allowed · 3 not checked · 35 pass | admin-geometry exit 0 |
