## Review

**Verdict: REQUEST_CHANGES**  
**Merge verdict: BLOCK** — R2 #1 is **PARTIAL**: the enlarged-text fix addresses Gerai’s account chip, but the Super Admin environment badge still makes the right zone overlap the search at 1024 px and 125%.

Reviewed the supplied R3/R2 diff artifacts, current source, R2 review and disposition, M38, existing built CSS, and the console header screenshot. No edits, tests, builds, or state-changing commands were performed. The running gate’s result is not claimed.

### R2 disposition

| Finding | Status | Evidence |
|---|---|---|
| **R2 #1 — Utilities overlap the search with enlarged text** | **PARTIAL** | Name/role and chevron now receive `in-data-text:hidden!` (`apps/web-app/src/components/admin/shell.tsx:435–439`). This removes the oversized labelled account chip. The new enlarged-text sweep covers Gerai at 1024/1280/1440 (`e2e/admin-shell.spec.ts:199–212`), with M38 recording a failing mutation. However, Super Admin retains its non-shrinking environment badge and is tested only after the text preference is cleared (`:213,227–240`), leaving the scenario below uncovered. |

### Finding

#### P1 — Super Admin still overlaps the search at 1024 px with “Sangat Besar (125%)”

**Location:** `apps/web-owner/src/shell/console-shell.tsx:139`; shared layout at `apps/web-app/src/components/admin/shell.tsx:168,184–197`.

**Scenario:** Super Admin console, expanded sidebar, 1024 px viewport, **Menu akun → Ukuran Teks → Sangat Besar (125%)**. The environment badge remains visible even though the account chip becomes avatar-only.

**Evidence:**

- The preference sets the root font size to 20 px (`apps/web-app/src/styles/theme.css:111–113`).
- The expanded sidebar reserves `16rem`, or 320 px (`apps/web-app/src/components/ui/sidebar.tsx:28,217–224`).
- The header therefore has 704 px. Its 50 px horizontal padding, 40 px grid gaps, and 380 px search track leave **117 px for each side track** (`components/admin/shell.tsx:168`).
- Including the 20 px gap before the right track, right-aligned utilities have **137 px before intersecting the search**.
- At this preference, the avatar-only account chip occupies 47 px: 35 px avatar, 10 px padding, and 2 px border (`:428–430`).
- The environment badge contributes another **37 px before its label**: dot 7.5 px, internal gap 7.5 px, padding 20 px, and border 2 px. It cannot shrink (`apps/web-app/src/components/admin/page.tsx:134–138`; `apps/web-app/src/components/ui/badge.tsx:7`).
- The utility gaps and divider add approximately 21 px. This leaves only **32–33 px for the entire environment label**. Neither `Sandbox` nor `Produksi` fits that allowance at the resulting 15 px text size. The existing normal-size screenshot, `docs/evidence/DEC-243/owner-header-1024.png`, corroborates the badge’s substantial label width.

Consequently, the environment badge extends into the search even with the account label successfully hidden. This is **source-derived geometry**, not a newly executed browser measurement.

**Why the added test misses it:** The enlarged-text loop applies only to Gerai. The test removes `gx-text-size` at `e2e/admin-shell.spec.ts:213`, navigates again, and then checks Super Admin at normal size (`:227–240`). M38 therefore does not prove this console configuration.

**Smallest fix:** Compact or hide the redundant topbar environment badge at constrained enlarged-text widths; the environment remains available in the console brand/sidebar. Extend the enlarged-text non-intersection sweep to Super Admin, including 1024 px.

### Correct / verified

- **The Tailwind variant compiles and matches `html`.** Both existing generated stylesheets contain:
  ```css
  :where([data-text]) .in-data-text\:hidden\!{display:none!important}
  ```
  Verified in `dist/assets/app/assets/index-BtL3t5Ij.css:2` and `dist/assets/owner/assets/index-BSlqyVmN.css:2`. This is the optimized descendant equivalent of `:where(*[data-text]) &`; an `html[data-text]` ancestor matches. `!important` overrides the responsive `xl:flex`/`xl:block`.
- **The shared fix reaches Super Admin.** Its console imports the shared `AdminShell` and passes the account user through it (`apps/web-owner/src/shell/console-shell.tsx:3,124–135`). The remaining issue is the separate environment badge, not failure to compile the account classes.
- **Other right-zone items were checked.** Gerai’s notification button and the console environment badge grow with rem units. Mini-site and TOTP pills also grow, but remain deferred until 1536 px (`apps/web-app/src/shell/app-shell.tsx:255`; `apps/web-owner/src/shell/console-shell.tsx:142`). No additional verified overlap finding was established at those wider widths.
- **Account accessibility remains intact:** `aria-label="Menu akun"` and the opened menu’s full identity/role remain independent of the hidden chip text (`apps/web-app/src/components/admin/shell.tsx:427,443–451`).

**Fixed by this reviewer:** None — read-only review.