## Review

**Verdict: REQUEST_CHANGES**  
**Merge verdict: BLOCK** — R1 #1 is fixed at normal text size, but remains reachable using the supported 125% text-size preference.

Reviewed the supplied R2 and R1 diff artifacts, current source, R1 review, disposition, M34–M37 mutation records, and the three named screenshots. No edits, tests, or state-changing commands were performed. The running gate’s outcome is not claimed here.

### R1 disposition

| Finding | Status | Evidence |
|---|---|---|
| **#1 — Utilities overlap the centred search** | **PARTIAL** | Avatar-only presentation below `xl` and labelled utility pills from `2xl` address the reported normal-size cases (`apps/web-app/src/components/admin/shell.tsx:427–437`, `apps/web-app/src/shell/app-shell.tsx:255`, `apps/web-owner/src/shell/console-shell.tsx:142`). Both 1024 px screenshots show separation. However, the fixed search track and rem-sized utilities still overlap at the supported larger text size; see finding below. |
| **#2 — Phone month-navigation targets below 44 px** | **FIXED** | The phone calendar now uses `--cell-size:2.75rem` (`apps/web-app/src/components/period-filter/period-filter.tsx:127`), restoring 44 px navigation targets at normal size through the shared Calendar’s `size-(--cell-size)` classes. The E2E explicitly checks both navigation buttons (`e2e/admin-shell.spec.ts:198–204`); M36 records a failing mutation when the smaller sizing returns. |

### Finding

#### P1 — R1 #1 remains reachable with “Sangat Besar (125%)”

**Location:** `apps/web-app/src/components/admin/shell.tsx:168,184,428–437`.

**Scenario:** Expanded sidebar, 1280 px viewport, the long owner name already used in the new E2E, and **Menu akun → Ukuran Teks → Sangat Besar (125%)**.

**Source evidence:**
- The preference changes the root font size to 20 px, rather than browser zoom (`apps/web-app/src/styles/theme.css:107–113`; `apps/web-app/src/shell/workspace.ts:24–38`).
- The sidebar is `16rem`, becoming 320 px (`apps/web-app/src/components/ui/sidebar.tsx:28,217–224`).
- The header retains its **380 px search track**, while padding, gaps, avatar, account-name cap, and notification button grow with rem units.
- At 1280 px, the header’s available width is 960 px. Subtracting 50 px padding, 40 px grid gaps, and the 380 px search leaves **245 px per side**.
- The account chip with the capped long name occupies approximately **249.5 px**: 35 px avatar + 160 px name + 17.5 px chevron + 20 px internal gaps + 15 px padding + 2 px border. The 45 px notification button, divider/margins, and utility gaps bring the right-side content to approximately **315.5 px**.
- Since these controls do not shrink and are right-aligned, they exceed the right track by approximately 70.5 px—more than the 20 px grid gap—and therefore extend approximately **50 px into the search**.

This is source-derived geometry, not a newly executed browser measurement. The new viewport sweep does not change the text-size preference (`e2e/admin-shell.spec.ts:180–196`), so its normal-size assertions and M34/M35/M37 do not cover this supported configuration.

**Smallest fix:** Preserve the equal-side grid, but keep the account chip compact when the enlarged-text preference makes the labelled version too wide—for example, defer its name/role presentation at enlarged sizes. Add the same non-intersection assertion at 125% with the existing long name, including 1280 px. Check both shells because they share this account chip.

### Correct / verified delta checks

- **Account accessible name remains present:** `aria-label="Menu akun"` is independent of the hidden name and decorative avatar (`apps/web-app/src/components/admin/shell.tsx:427–437`). The opened menu still exposes the full name, email, and role (`:442–448`).
- **Mini-site remains reachable for owners at 1366/1440 px:** Hiding the topbar shortcut below 1536 px does not remove access. The settings rail includes Mini-Site (`apps/web-app/src/routes/pengaturan/index/shared.tsx:24–34`), and that page retains the unconditionally rendered **Buka Mini-Site** link (`apps/web-app/src/routes/pengaturan/mini-site/page.tsx:113–117`). The sidebar hostname itself is plain text, not an alternative link.
- **Console TOTP state remains available:** It is retained in the sidebar status block and passed into the account menu (`apps/web-owner/src/shell/console-shell.tsx:126–135`), regardless of the topbar pill’s breakpoint.
- **Day-span pill removal is complete:** The `useMemo` import and derived `span` calculation are removed. Date parsing, custom-range validation, and apply behavior remain intact (`apps/web-app/src/components/period-filter/period-filter.tsx:1,72–93`). The updated screenshot shows the footer fitting without the pill.
- **No verified E2E weakening:** The tree assertion now checks both visibility and absence of incorrect active state. The independent-scroll proof retains its assertions at a shorter viewport. The recovery change only extends the synchronization wait to 15 seconds; it retains the completion and shipment-result assertions (`e2e/recovery.spec.ts:28–32`).

**Fixed by this reviewer:** None — read-only review.