## Review

**Verdict: APPROVE — with two non-blocking P2 findings.**  
**Merge verdict: OK with notes.**

Reviewed `/data/tmp/dec240/full.diff` against the current source and the named DEC-240/241/242 requirements. Read the requested runbook sections, specifications, task entries, mutation record, UI-gate results, and sampled supplied desktop/phone screenshots. No files were edited, tests run, or state-changing Git operations performed. The running integrated gate’s outcome is not asserted here.

### Correct

- **Settings behavior is preserved across the rewrites.**
  - NPWP omission, replacement, and explicit clearing remain distinct in `apps/web-app/src/routes/pengaturan/data-usaha/page.tsx:27–30`.
  - Packing retains per-row name/price errors in both responsive presentations: `apps/web-app/src/routes/pengaturan/packing/page.tsx:53–83`.
  - Disabling the selected masking preset still restores `standar_gerai`: `apps/web-app/src/routes/pengaturan/label-privasi/page.tsx:35–38`.
  - Member revocation is still offered only for cashiers: `apps/web-app/src/routes/pengaturan/anggota/page.tsx:86–89`. API-key token-once presentation and custom-domain typed confirmation remain present.

- **Kasir projection is correctly bounded.** Settings groups filter owner entries; `GeraiSummary` mounts only for owners (`apps/web-app/src/routes/pengaturan/index/shared.tsx:45–46, 142`). `CounterStatus` fetches and renders Mengantar status only for owners (`apps/web-app/src/shell/app-shell.tsx:199–218`). The endpoint remains server-protected by `app_owner` (`apps/worker/src/api/app.ts:1047–1048`).

- **The shift-less tunai change preserves the money-writing path.** Receipts use a nullable shift, payout/void directions remain `out`/`in`, and paid totals are updated with the receipt inside the existing transaction. Actor-derived open-shift resolution and replay-aware audit handling remain intact: `apps/worker/src/do/gerai-vault/shift/index.ts:139–157, 176–199`; `apps/worker/src/do/gerai-vault/index.ts:1318–1327`. Drawer totals continue to select receipts by their actual `shift_id` (`shift/index.ts:45–70`).

- **Navigation and sticky-rail implementation match the principal contracts.** Query children use explicit search parameters and shell-owned `aria-current`; pickup batch details select the pickup child (`apps/web-app/src/components/admin/shell.tsx:64–77`; `apps/web-app/src/shell/app-shell.tsx:88–97`). The rail has the specified sticky position, viewport bound, independent overflow, and overscroll containment (`routes/pengaturan/index/shared.tsx:126`). The added rail test exercises page movement and independent rail scrolling, rather than checking CSS alone (`e2e/settings.spec.ts:63–98`).

- **No unjustified E2E weakening found.** Locator scoping accommodates duplicated navigation labels. Replacing the sidebar shift-status assertion follows DEC-241; direct shift implementation/tests remain. Supplied `ui-gates.txt` records zero failures, but these are supplied results rather than checks executed by this review.

### Fixed

None — read-only review.

### Findings

#### 1. P2 — Destructive-action errors render behind the still-open modal

**Locations**
- `apps/web-app/src/routes/pengaturan/api-mcp/page.tsx:64–72, 125–137`
- `apps/web-app/src/routes/pengaturan/anggota/page.tsx:49–57, 116–128`
- `apps/web-app/src/routes/pengaturan/mini-site/page.tsx:90–99, 212–230`

**Concrete scenario:** A key/member revoke or domain-removal request fails. Each catch updates the page-level `msg`, but leaves the confirmation open. Its `Notice` is outside `AlertDialogContent`. The shared `AlertDialogAction` is a plain button—not an automatic close control (`apps/web-app/src/components/ui/alert-dialog.tsx:144–154`).

Consequently, the error is behind the modal backdrop and outside its accessible content. The confirmation appears unchanged; users must cancel it to discover the failure. This is introduced by converting the formerly inline confirmations to modal dialogs.

**Smallest fix:** Render the action error inside the corresponding dialog, with alert semantics, and clear it when opening a new confirmation. Preserve the open dialog and typed domain on failure. Add failure-response coverage asserting that the error is visible within the alert dialog.

#### 2. P2 — Desktop settings redirect does not react to crossing the breakpoint

**Location:** `apps/web-app/src/routes/pengaturan/index/shared.tsx:165–169`

**Concrete scenario:** Open `/pengaturan` at 900 px, then widen the same window to 1200 px. The component only reads `matchMedia(...).matches` during rendering; it does not subscribe to media-query changes. Crossing 1024 px therefore does not itself trigger the redirect, and the directory can remain displayed at desktop width.

This misses DEC-240’s desktop first-section behavior until another render or navigation occurs. The existing redirect test covers initial desktop entry, not this transition.

**Smallest fix:** Subscribe to the media query’s `change` event, using state or `useSyncExternalStore`, and render `Navigate replace` from that reactive value. Cover resizing from below to above 1024 px, including the Kasir destination `/pengaturan/printer`.