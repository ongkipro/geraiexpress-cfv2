# DEC-239 mutation proofs (2026-11-17)

`e2e/admin-shell.spec.ts` (desktop-1280); each mutation was applied, the spec run, the file restored.

| # | Mutation | Red test |
| --- | --- | --- |
| M15 | courier tab stop taken from the global selection (none when it is in another category) | courier rows: one tab stop per category |
| M16 | arrow keys move from the selected row instead of the focused row | courier rows: arrows move from the focused row |
| M17 | ⌘K list does not scroll the active option into view | ⌘K keeps the keyboard-active option visible |
| M18 | sidebar counter status ignores the refresh event | opening a shift updates the sidebar status |
