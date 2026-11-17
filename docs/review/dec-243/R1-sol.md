## Review

**Verdict: REQUEST_CHANGES**  
**Merge verdict: BLOCK** — one P1 header regression and one P2 phone-target regression.

Reviewed `/data/tmp/dec243.diff` against the named source seams, the DEC-243 decision, the goal runbook, screenshots, `ui-gates.txt`, and mutation evidence. No files were edited and no tests or state-changing commands were run. The integrated gate remains outside this review.

### Findings

#### P1 — Desktop grid lets utilities overlap the search at narrower desktop widths

**Location:** `apps/web-app/src/components/admin/shell.tsx:166–182`, with non-shrinking account content at `:426–436`. Also affects `apps/web-owner/src/shell/console-shell.tsx:146–153`.

**Scenario:** Expanded sidebar at 1024 px, especially the Super Admin console with its environment and TOTP badges. Gerai headers also become constrained, including when the mini-site pill appears at 1280 px.

**Evidence:**
- The sidebar reserves `16rem` (256 px), defined in `components/ui/sidebar.tsx:28`.
- At 1024 px, the header therefore has 768 px. After 40 px horizontal padding and two 16 px gaps, the grid gives the 380 px search track **158 px per side**.
- The right zone uses `min-w-0` and `justify-end`, but its account trigger is `shrink-0`; console badges are also `shrink-0` (`components/ui/badge.tsx:7`). Nothing clips or responsively reduces these contents.
- The supplied `owner-gerai-1440.png` shows those same console utilities occupying approximately 335 px. At 1024 px their right-aligned contents necessarily overflow the 158 px track **back into the search button**. This is internal overlap, not necessarily document overflow, so a geometry gate passing does not disprove it.

The new E2E assertion checks search position at 1440 px, but not whether neighboring controls intersect it (`e2e/admin-shell.spec.ts:137–153`).

**Smallest fix:** Keep the deterministic equal-side grid, but make utility content fit the narrow tracks—for example, retain avatar-only account presentation longer and collapse redundant console badges into the existing sidebar/account presentation at constrained widths. Adjust the search track responsively if necessary. Add non-intersection assertions for both shells at 1024 and 1280 px, including a long account name.

#### P2 — Phone calendar month-navigation targets shrink below 44 px

**Location:** `apps/web-app/src/components/period-filter/period-filter.tsx:135`.

**Scenario:** Open the period bottom sheet on a phone and use the previous/next-month buttons.

**Evidence:** The phone calendar changes from `--cell-size:2.75rem` (44 px) to `2.4rem` (38.4 px). The shared calendar explicitly sizes both month-navigation buttons using `size-(--cell-size)` (`components/ui/calendar.tsx:54–63`). Thus these phone controls now have 38.4 px targets rather than 44 px.

This contradicts the non-negotiable phone-target requirement in `AGENTS.md` §3.6. The runbook’s request for 38 px mobile cells does not resolve that target-size contradiction.

**Smallest fix:** Preserve the phone calendar’s 44 px sizing, or separately retain at least 44×44 px navigation hit areas while compacting the visuals. Keep the approximately 31 px calendar sizing confined to the desktop popover. Add an open-sheet target-size assertion.

### Correct / verified

- **Single-card settings rail:** The summary removal follows DEC-243. Tenant identity remains in `ShellBrand`; connection/webhook information remains in `CounterStatus` (`apps/web-app/src/shell/app-shell.tsx:196–218,279–310`). No verified owner-information loss warrants a separate finding.
- **Default-expanded trees:** The initializer preserves manual toggling and active-section auto-opening (`components/admin/shell.tsx:208–220`). Icon-rail mode hides subtree lists and chevrons (`components/ui/sidebar.tsx:565,640`); phone links retain the Sheet-close handler.
- **Breadcrumb and keyboard semantics:** Separators are sibling list items; the current crumb retains `aria-current="page"` without a fake link role. The displayed platform shortcut matches the handler, which accepts both Ctrl+K and Meta+K (`components/admin/shell.tsx:130–140,265–290`).
- **Period popover:** Dari/Sampai label associations and validation placement remain intact. `period-popover-1440.png` shows the compact footer fitting on one row. The phone `defaultMonth` expression remains behaviorally equivalent: that branch previously received `months={1}`.
- **DEC-242 scroll proof remains meaningful:** Moving it to 1280×560 does not remove its essential assertions. It still requires actual rail overflow, independent rail scrolling, unchanged document scroll, and the final item entering the viewport (`e2e/settings.spec.ts:89–99`). M30–M33 provide focused mutation evidence, but do not cover the two regressions above.

**Fixed:** None — read-only review.