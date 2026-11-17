## Review

**Verdict: REQUEST_CHANGES**  
**Merge verdict: BLOCK** pending the P1 fixes below.

### Scope and verification

Read-only review of `/data/tmp/dec239/full.diff` and the corresponding source files, against the supplied base HEAD `668bd91`. Read the required invariants, DEC-239, design documents, size contract, runbook, and UI gate output; inspected selected 390px and 1440px evidence screenshots.

No files edited, tests run, or Git state changed. The running integrated gate was not disturbed. The supplied screenshots do not independently establish pixel-level correctness at 768px or 1366px.

### Correct

- **Heading ownership is correctly moved out of the breadcrumb.** `SiteBreadcrumb` renders navigation, while `PageHeader` renders the page `h1` and `SectionCard` renders `h2` headings (`apps/web-app/src/components/admin/shell.tsx:238–258`; `apps/web-app/src/components/admin/page.tsx:22–29, 59–63`).
- **The reviewed POS changes retain the payment source of truth and owner guards.** The total still comes from `counterDueIdr`, payment submission still uses the existing payment path, and the modal/profit inset remains conditional on `owner` (`apps/web-app/src/routes/kasir/index.tsx:247–249, 300, 408–412`). Courier cost/margin is also still owner-gated (`apps/web-app/src/routes/kasir/quote-panel.tsx:387–391`).
- **Chart and surface changes substantially match DEC-239.** Bars are capped at 28px, animation is disabled, and the accessible data table remains present (`apps/web-app/src/components/admin/bar-chart.tsx:54–105`). The remaining `bg-background` uses in the reviewed app source are canvas/inset uses, not controls that should remain white.
- **The e2e selector changes retain their substantive assertions.** For example, checkout still asserts the selected state, now through `aria-checked`; shipment tests still assert exact unpaid counts (`e2e/checkout.spec.ts:24–25`; `e2e/kiriman.spec.ts:20–26`). I found no concrete weakening attributable to these replacements.

### Findings

#### R1 — P1: Courier radio group loses its keyboard entry point after a category change

**Location:** `apps/web-app/src/routes/kasir/quote-panel.tsx:335–350, 360`

**Scenario:** Select a Reguler service, then switch to Cargo with available services. `select.selected` still contains the Reguler service code. Every Cargo row therefore gets `tabIndex={-1}`: `firstFocusable` only falls back to the first available row when *no selection exists anywhere*, rather than when the selected service is absent from the displayed category. Tab skips the entire Cargo group, preventing a keyboard-only operator from selecting its services.

The same handler also computes arrow movement from the selected service rather than the focused row. On initial entry with no selection, ArrowDown selects the already-focused first row, while ArrowUp selects the penultimate row instead of the last.

**Smallest fix:** Derive the tab stop from the enabled services in the current category: use the selected service when present there, otherwise the first enabled service. Derive arrow movement from the focused row, with correct wrapping. Add keyboard coverage for initial entry and switching categories after selection.

#### R2 — P1: New muted text colours fail normal-text contrast on their actual surfaces

**Locations:**
- `apps/web-app/src/components/admin/page.tsx:27`
- `apps/web-app/src/components/ui/sidebar.tsx:401–411`
- `apps/web-app/src/components/admin/shell.tsx:323, 462`

**Evidence:** Page descriptions now use `text-slate-500` directly on the `#F6F7F9` canvas. With the installed Tailwind token, that pairing is approximately **4.45:1**, below the 4.5:1 normal-text threshold. Sidebar section labels, palette group labels, and the sidebar status heading use `text-slate-400` on white, approximately **2.63:1**. These are meaningful 12–14px labels, not decorative content.

The token values are defined in `apps/web-app/node_modules/tailwindcss/theme.css:218–219`; the canvas and existing darker muted token are defined in `apps/web-app/src/styles/theme.css:66–78`.

**Smallest fix:** Use the existing `text-muted-foreground` token, or another verified ≥4.5:1 colour, for normal-sized text. Keep lighter slate colours for decorative icons and rules rather than required labels.

#### R3 — P2: Keyboard selection in the command palette can move outside the visible results

**Location:** `apps/web-app/src/components/admin/shell.tsx:298–305, 313, 319–345`

**Scenario:** Open the unfiltered Gerai palette and repeatedly press ArrowDown. The results container is scrollable and capped at `min(60vh, 26rem)`, but arrow handling only changes `cursor`. DOM focus remains on the input, and nothing scrolls the active option into view. The active highlight can disappear below the viewport while Enter still navigates to that hidden option.

**Smallest fix:** Scroll the active option into view with `block: "nearest"` when the keyboard cursor changes. Add a test that navigates beyond the initially visible options and verifies that the active descendant remains visible.

#### R4 — P2: Compact courier rows conceal operational rules and rejection reasons

**Location:** `apps/web-app/src/routes/kasir/quote-panel.tsx:358, 379–385`

**Evidence:** Rules and unavailable reasons now occupy a single `truncate` line with no expansion or alternative visible presentation. The supplied `docs/evidence/DEC-239/pos-kasir-v1-390.png` shows the J&T ECO hint reduced to an ellipsis and unavailable-service explanations clipped.

For available POS radios, the explicit `aria-label` contains only service name, price, and ETA. It does not expose the rule or drop-off information as an accessible name/description either. Previously, these rules were separate wrapping text.

**Smallest fix:** Allow the operational hint/rejection reason to wrap, or provide an accessible expandable detail. Associate the full rule and drop-off information with each radio using `aria-describedby`. Do not rely solely on a hover tooltip for phone users.

#### R5 — P2: The COD fee breakdown was removed from quote results

**Location:** `apps/web-app/src/routes/kasir/quote-panel.tsx:395–401`

**Evidence:** The old COD result displayed shipping plus `codFeeIdr`. The replacement displays only collection total and sender payout, or shipping for DFOD. `codFeeIdr` now appears only in the interface declaration (`quote-panel.tsx:31`) throughout the Kasir route source; it is not rendered in either the result or POS summary.

**Scenario:** In Cek Ongkir Cepat, an operator comparing COD services can no longer read the actual COD fee. There is no receipt summary on that page to recover the removed breakdown.

**Smallest fix:** Restore a compact “Ongkir … · biaya COD …” detail for COD results, optionally in an accessible expanded row. Keep the underlying amounts and payment calculation unchanged.

#### R6 — P2: The phone account trigger is narrower than the required 44px target

**Location:** `apps/web-app/src/components/admin/shell.tsx:385–399`

**Evidence:** Below `lg`, the name, role, and chevron are hidden. The remaining trigger consists of a 32px avatar plus 2px left and 4px right padding: **38px wide**, although its height is 44px. There is no minimum width or expanded hit area. This violates DEC-239’s ≥44px phone-target requirement.

The geometry contract currently checks buttons, inputs, and select triggers, but not `data-slot="dropdown-menu-trigger"` (`design/admin-contract.json`), so its green result does not cover this control.

**Smallest fix:** Add `min-w-11` to the account trigger and include dropdown triggers in the phone-target check.

#### R7 — P2: The new sidebar status card stays stale after opening or closing a shift

**Location:** `apps/web-app/src/shell/app-shell.tsx:126–144`

**Evidence:** `CounterStatus` fetches shift and label settings only once through an empty-dependency effect. It remains mounted in the persistent shell. Opening or closing a shift refreshes only the Shift page’s local data (`apps/web-app/src/routes/kasir/shift.tsx:25–40, 66–67, 98–99`).

**Scenario:** Enter with no open shift, then open one through Shift Loket. The sidebar continues to display “Belum dibuka”. Closing a shift similarly leaves “Buka” displayed until a full reload. Changing the saved label format has the equivalent stale-display problem.

**Smallest fix:** Invalidate/refetch this status after successful shift and printer-setting mutations, preferably through shared status state or a narrowly scoped refresh event.

### Verification notes

The UI evidence log ends with successful reruns for the two initially failing routes. Those results are useful, but do not cover the keyboard transitions, persistent status invalidation, or dropdown-trigger width identified above. The P1 findings should be corrected and independently rechecked before approval.