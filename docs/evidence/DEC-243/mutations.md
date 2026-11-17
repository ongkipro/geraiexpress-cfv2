# DEC-243 mutation proofs (2026-11-17)

`e2e/admin-shell.spec.ts` "DEC-243: search tidak bergeser…" (desktop-1280, viewport 1440×900 then 1366×768); each
mutation applied, UI rebuilt, test run, file restored.

| # | Mutation | Result |
| --- | --- | --- |
| M30 | header back to a flex row (search follows the breadcrumb width) | red — search x differs between `/` and `/pengaturan/ekspedisi` |
| M31 | breadcrumb separator nested inside its item (`<li>` in `<li>`) | red |
| M32 | sidebar trees start closed (`useState(n.active)`) | red — `Kiriman Satuan` / `Cek Resi` hidden on `/keuangan` |
| M33 | a summary-sized card back under the settings rail | red — rail scrolls at 1366×768 |
| M34 | console `TOTP aktif` pill shown from `sm` (right track too wide below 2xl) | red — `utilitas topbar…` console overlap at 1024 px (Sol R1 #1) |
| M35 | account name/role shown from `lg` | red — Gerai right zone overlaps the search at 1024 px |
| M36 | phone calendar back to 38 px cells | red — month navigation < 44 px in the phone sheet (Sol R1 #2) |
| M37 | mini-site pill shown from `lg` | red — right zone overlaps the search below xl |
| M38 | labelled account chip kept at enlarged Ukuran Teks | red — right zone overlaps the search at 1280 px, text Sangat Besar (Sol R2) |
| M39 | console environment badge shown at enlarged Ukuran Teks below xl | red — console right zone overlaps the search at 1024 px, text Sangat Besar (Sol R3) |
