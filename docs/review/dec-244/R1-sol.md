## Review

**Verdict: REQUEST_CHANGES**  
**Merge verdict: BLOCK** — one P1 correctness issue remains, plus two P2 accessibility regressions.

### Review basis

Read-only review of `/data/tmp/dec244.diff` against the supplied base `bbf7a40`, the named source seams, AGENTS.md, WORKFLOW.md, DEC-244, runbook §§0–5 including §4B, relevant visual/spec rows, tests, mutation evidence, UI-gate results, and sampled desktop/phone screenshots. **No edits, tests, or state-changing Git commands were performed.** The running integrated gate was not independently verified.

The working tree changed during review: the supplied artifact directly calls `vault.financeSync` from the per-gerai Super Admin action, whereas the current source queues that work and returns `financeSync: "queued"`. This distinction is recorded below; superseded artifact behavior is not counted as an open finding.

### Correct

- **Cashier exclusion is enforced in both API and UI.** Both status endpoints use `app_owner`; the guard rejects non-`gerai_admin` membership (`apps/worker/src/api/app.ts:88,878–880`). The SPA uses `ownerOnly(StatusPage)` (`apps/web-app/src/router.tsx:100–104,138`); the icon, command, and sidebar shortcut are owner-gated (`apps/web-app/src/shell/app-shell.tsx:194,217,256–266`). Worker coverage asserts cashier 403 for both endpoints (`apps/worker/test/status/status.test.ts:64–65`).
- **Gerai status response construction excludes money amounts and customer/contact data.** `statusCounts` reduces tenant data to counts, timestamps, and readiness flags; `buildGeraiStatus` emits human-readable status/checklist DTOs rather than raw finance errors or records (`apps/worker/src/do/gerai-vault/index.ts:2688–2720`; `apps/worker/src/status/gerai.ts:33–99`).
- **Setup and faults are distinguished.** Pending webhook setup produces `setup`; mismatched/paused webhook, held/reconciling shipments, stale/error finance, discrepancies, and broken domains can produce `problem` (`apps/worker/src/status/gerai.ts:48–98`). Focused tests cover the principal cases.
- **Caching is tenant-keyed and does not poll.** The Gerai cache key contains the tenant ID, refreshes on expired focus, and guards concurrent refreshes within the mounted effect (`apps/web-app/src/routes/status/page.tsx:24`; `apps/web-app/src/components/admin/operational-status.tsx:49–83`).
- **External links and logos have no verified injection issue.** Current callers construct HTTPS mini-site links or same-platform brand links; React handles text/attribute escaping, and new-tab links use `rel="noreferrer"` (`apps/web-app/src/components/admin/shell.tsx:453–463`). Logo URLs are same-origin; inspected SVG assets contain no script, external references, or foreign objects.
- **The E2E diff adds assertions without weakening existing ones.** The added DEC-244 flows are desktop-only (`e2e/admin-shell.spec.ts:257,313`), so they do not establish phone editor behavior.

### Findings

#### 1. P1 — Per-gerai discount recheck can verify a different tenant

**Locations:**  
`apps/worker/src/pricing/rules/routes.ts:45–47`  
`apps/worker/src/admin/gerai/routes.ts:227–228`  
Supporting implementation: `apps/worker/src/pricing/rules/index.ts:252–281`

**Scenario and evidence:** Both targeted actions make the requested tenant’s rules due and then call `runDiscountVerifier(env, now, 1)`. The verifier has no tenant filter: it selects globally due tenants, orders by earliest due time, and takes one.

If tenant A already has an overdue rule and an operator rechecks tenant B, A wins that selection. B receives no immediate verification, even though the targeted action reports completion; the audit for B can describe work performed on A. The existing test uses one tenant, so it cannot expose this.

**Smallest fix:** Add an optional tenant filter to the verifier and use it from both targeted actions. Keep the cron/platform path globally bounded. Add a two-tenant test with A overdue and B explicitly requested; assert that only B is observed and updated by that invocation.

#### 2. P2 — Responsive discount editors duplicate form IDs and break mobile label associations

**Locations:**  
`apps/web-owner/src/routes/tarif/gerai.tsx:77,96,130–140`

**Scenario and evidence:** Selecting **Ubah** mounts two `RuleEditor` instances for the same service: one inside the CSS-hidden desktop table and another in the phone list. Both generate identical IDs such as `d-JNE`, `c-JNE`, and `r-JNE`.

On phones, the desktop inputs occur first in document order. Explicit `htmlFor` associations therefore resolve to those hidden controls instead of the visible editor, breaking visible-field label association and label-click focus.

**Smallest fix:** Give each editor instance a unique `useId()` prefix and use it consistently for all IDs and `htmlFor` values. Alternatively, render one shared editor. Add a phone editing assertion covering label association and focus.

#### 3. P2 — Select restyle removes the required high-contrast input boundary

**Location:**  
`apps/web-app/src/components/ui/select.tsx:41`  
Supporting token: `apps/web-app/src/styles/theme.css:81`

**Scenario and evidence:** The trigger replaces `border-input` with `border-slate-200/90` on white. The existing input token is `#7b879c`; Slate 200 is approximately `#e2e8f0`, giving only about **1.2:1** contrast against white, below AGENTS.md’s **≥3:1 input-border requirement**. Hovering to Slate 300 still does not satisfy it. Focus rings do not repair the idle-state boundary.

**Smallest fix:** Retain `border-input` or another verified ≥3:1 border while preserving the new spacing, popup styling, and dropdown positioning. Check the unfocused trigger in both consoles.

### Non-impersonation observation

The supplied artifact’s direct finance call was **not read-only**: `financeRun` invokes `recoverUnpaid` after a successful sync (`apps/worker/src/do/gerai-vault/index.ts:1461`), and recovery can call `payUnpaid(..., "system", ...)` (`:1547`).

The current source replaces that direct call with an explicitly permitted scheduled-job trigger (`apps/worker/src/admin/gerai/routes.ts:220–226`), with matching queued-result UI text. This removes the direct invocation seen in the artifact. Nevertheless, finance sync must not be described as inherently shipment-read-only: its system consumer can recover/pay held shipments. A shipment-row-count assertion alone does not prove otherwise.

### Required follow-up

Fix finding 1 before approval; address the two accessibility regressions in the same focused correction. Then supply the refreshed delta and gate evidence, including the two-tenant targeted-verification test and phone editor-label test.