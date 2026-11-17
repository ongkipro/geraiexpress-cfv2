# DEC-240/241/242 mutation proofs (2026-11-17)

Each mutation was applied, the UI rebuilt where needed, the named test run, and the file restored.

| # | Mutation | Red test |
| --- | --- | --- |
| M19 | `senderPayout` refuses `tunai` without an open shift again (`SHIFT_REQUIRED`) | worker `test/shift/shift.test.ts` — tunai works without a shift (DEC-241) |
| M20 | sidebar sub-tree ignores `?tab=` (no query-aware child) | e2e `admin-shell.spec.ts` sidebar taxonomy |
| M21 | router `aria-current` allowed onto shell links (`/kiriman` current on `?tab=retur`) | e2e `admin-shell.spec.ts` sidebar taxonomy |
| M22 | `/pengaturan` does not open the first section on desktop | e2e `admin-shell.spec.ts` sidebar taxonomy |
| M23 | every regular service labelled `Reguler` (J&T ECO duplicate pill) | e2e `admin-shell.spec.ts` sidebar taxonomy |
| M24 | `Shift Loket` back in the ⌘K commands | e2e `admin-shell.spec.ts` ⌘K / label status |
| M25 | settings rail not `sticky` | e2e `settings.spec.ts` rail stays put / scrolls on its own (DEC-242) |
| M26 | rail without `max-h` / `overflow-y-auto` / `overscroll-y-contain` | same |
| M27 | settings grid without `lg:-mb-8` (grid area ends above the main bottom padding; sticky pushes the rail up at page end) | same |
| M28 | API key revoke error rendered only in the page notice (behind the open dialog) | e2e `admin-shell.spec.ts` error cabut kunci / ikut lebar layar (Sol R1 #1) |
| M29 | `/pengaturan` reads the breakpoint once (no `change` subscription) | same (Sol R1 #2) |
