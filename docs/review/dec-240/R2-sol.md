## Review

**Verdict: APPROVE**  
**Merge verdict: OK**

Read-only round-2 delta review against `docs/review/dec-240/R1-sol.md`, using the supplied R1/R2 diff artifacts, current source, disposition, and mutation record. No files were edited, tests run, or state-changing Git operations performed. This review does not assert the outcome of the running integrated gate.

### Fixed — R1 disposition

#### #1 — Destructive-action errors behind the modal: **FIXED**

- **API & MCP:** Errors now use dialog-local `revokeErr` and render with `role="alert"` inside `AlertDialogContent` (`apps/web-app/src/routes/pengaturan/api-mcp/page.tsx:75–77, 131–137`). Opening or clearing a confirmation resets that error (`:54–59`).
- **Anggota:** The same correction is present for member revocation (`apps/web-app/src/routes/pengaturan/anggota/page.tsx:26–31, 60–62, 122–128`).
- **Mini-Site:** `act` returns its error; removal opts into inline handling, and the removal dialog renders the returned message with `role="alert"` (`apps/web-app/src/routes/pengaturan/mini-site/page.tsx:90–103, 125, 228–231`). Failure leaves the dialog and typed hostname intact.

**Retry/success checks:**
- API-key and member success paths call the error-clearing `setConfirm(null)`, closing the dialog without retaining the previous failure (`api-mcp/page.tsx:69–74`; `anggota/page.tsx:54–59`).
- Successful domain removal adopts the returned view, replacing `DomainStatus` with `AddDomain` and unmounting its dialog/error state (`mini-site/page.tsx:94–96, 124–128`). The endpoint returns the refreshed domain view after purge; purged domains are excluded from that view (`apps/worker/src/api/app.ts:725–738`; `apps/worker/src/hostnames/service.ts:76–77, 260–265`).
- Mini-Site check/TXT failures still render on the page: those calls retain the default `inline = false`, which sets the page-level danger notice (`mini-site/page.tsx:91–100, 125, 130`). Cancelling removal clears its error and typed confirmation (`:217`).

#### #2 — Desktop redirect ignores breakpoint changes: **FIXED**

`useSyncExternalStore` now subscribes to the media query’s `change` event and removes that listener on cleanup. The redirect consumes the reactive snapshot (`apps/web-app/src/routes/pengaturan/index/shared.tsx:163–179`).

**Boundary checks:**
- The server snapshot is explicitly `false`; browser-only `window.matchMedia` access remains inside client snapshot/subscription callbacks. This provides a consistent directory fallback for SSR/hydration (`shared.tsx:165–170`).
- The redirect still uses `replace` and selects the first role-visible section (`:176–179`).
- Owner filtering yields `/pengaturan/profil`; Kasir filtering leaves `/pengaturan/printer` first (`:21, 30, 45–46`). Printer is not owner-guarded (`apps/web-app/src/router.tsx:131`).
- `/pengaturan` and its section destinations are separate sibling routes, so successful navigation unmounts the index subscription rather than creating a resize-driven redirect loop (`router.tsx:129–131, 143`).

### Correct — Regression evidence

The new test forces a revoke response to HTTP 503 and asserts the error **inside** the alert dialog. It then opens the settings directory at 900 px and verifies navigation to `/pengaturan/profil` after resizing to 1280 px (`e2e/admin-shell.spec.ts:111–133`).

`docs/evidence/DEC-240/mutations.md` records M28 and M29 turning that test red when the respective fixes are removed. These are supplied proof records, not test executions independently repeated during this review. The added test covers API-key failure and owner resizing; the member/domain, successful-retry, SSR, and Kasir checks above are source-based.

### Findings

No issues found.

No new verified P0–P3 issues in the reviewed delta.