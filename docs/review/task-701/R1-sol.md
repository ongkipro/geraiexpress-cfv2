## Review

**Scope:** Independent, read-only R3/R4 review of the supplied `/data/tmp/task-701-sol-r1.diff`, identified as TASK-701 / PR-22 on `task-701` (`7ced83a`), together with the affected source, migration infrastructure, tests, specifications, and UI evidence. No files were modified and no commands were executed.

### Correct

- **Pairing secrets and lifecycle:** The Worker generates the raw token and passes only its SHA-256 hash into the tenant object (`apps/worker/src/api/app.ts:1090–1094`). Pairing revokes earlier pairings belonging to the same member, stores the open shift if present, and expires after 12 hours (`apps/worker/src/do/gerai-vault/customer-display/index.ts:119–137`). Shift close revokes bound sessions inside the existing transaction, and reads independently reject closed shifts (`apps/worker/src/do/gerai-vault/index.ts:1347–1363`; `customer-display/index.ts:160–175`).
- **Public-read tenant isolation:** Public reads resolve an active tenant by slug and look up the token hash only in that tenant’s object. They also check that the pairing creator remains an active member (`apps/worker/src/api/app.ts:1124–1134`). Consequently, a token presented with another tenant’s slug, or a suspended tenant, fails closed.
- **Authentication and CSRF:** The management endpoints use `app_member`; QRIS setting/removal uses `app_owner`. The shared guard applies same-origin checks before dispatch, requires a session, and loads membership from the session’s active tenant (`apps/worker/src/api/app.ts:69–96,1090–1103,1169–1174`). Public display routes return before session loading, avoiding rolling cookies.
- **Owner-only DTO keys:** The constructed display objects do not spread request objects or shipment rows. No normal serialization path introduces `OWNER_ONLY_KEYS`. Paid amounts and receipts are selected from tenant storage rather than accepted from request amounts (`apps/worker/src/do/gerai-vault/customer-display/index.ts:85–113`). This does **not**, however, establish the claimed PII boundary; see F1.
- **QRIS security:** Upload rejects cashiers, applies the 2 MB limit, and uses sniffed image type rather than the supplied MIME type (`apps/worker/src/api/app.ts:1043–1060`). Settings-preview URLs use the existing tenant-bound, ten-minute HMAC scheme (`apps/worker/src/media/index.ts:15–35`). Public display media revalidates the pairing and restricts the R2 key to the resolved tenant.
- **Migration and schema shape:** Migration `0024` and Drizzle agree on the new column, session-table columns, uniqueness, and partial indexes. The media-table rebuild preserves existing columns and rows while widening the purpose set. Version advancement and migration SQL execute in one transaction, so repeat upgrades skip applied steps (`packages/db/migrations/tenant/0024_customer_display.sql:3–34`; `packages/db/src/schema/tenant.ts:775–791`; `apps/worker/src/do/gerai-vault/core/migrate.ts:64–83`). The SQL token-length check is not represented in Drizzle; the existing drift test compares tables, columns, nullability, and defaults, not CHECK constraints.
- **Route scan and baseline UI:** The public allowlist gains only the two specific GET routes; its enforcement logic is unchanged (`scripts/ci/route-scan-lib.mjs:4–36`). The display is outside the authenticated workspace route, explicitly omits credentials for polling, and pauses new polls while hidden (`apps/web-app/src/router.tsx:149–161`; `apps/web-app/src/routes/kasir/layar-pelanggan.tsx:34–56`). The checkout total is explicitly 40 px, and the smallest declared display text is `text-xs`—12 px with the current 16 px root. The supplied 390 px checkout screenshot is readable and shows no visible horizontal clipping.

### Fixed

None. This review was read-only.

## Findings

### F1 — P1: The stored/public DTO still accepts raw PII through allowed text fields

**Location:** `apps/worker/src/do/gerai-vault/customer-display/index.ts:47–48,52–80,103–105`

**Evidence:** `text()` only normalizes whitespace and truncates. Checkout copies request-controlled `courier`, `eta`, `destination`, and packing `name` into the stored DTO. Paid state likewise copies the request’s courier label. There is no canonical lookup or PII restriction.

A member can submit a valid checkout with:
- a complete synthetic street address in `destination`;
- a synthetic phone number in `eta`;
- a masked shipment’s true sender name in `courier` or packing `name`.

Those values survive into `state_json` and the unauthenticated view. Dropping unknown properties such as `recipientPhone` does not protect these allowed fields. The existing zero-leak test exercises only the unknown-property case (`apps/worker/test/customer-display/customer-display.test.ts:88–118`).

This is **not** an anonymous write bypass, and ordinary paid-state construction does not automatically select sender snapshots. Nevertheless, the advertised server-enforced “never phone/street/true identity” boundary is not satisfied.

**Smallest fix:** Replace unrestricted display text with server-resolved identifiers wherever possible: canonical service/courier, canonical destination area, and canonical ETA. Use a fixed packing label unless a display-safe catalogue name is independently validated. Derive paid courier information from the shipment. Add tests placing PII in the **allowed** fields and inspect both stored JSON and public responses.

### F2 — P2: BroadcastChannel updates are not bound to the display’s pairing

**Location:** `apps/web-app/src/routes/kasir/display-dialog.tsx:32–35`; `apps/web-app/src/routes/kasir/layar-pelanggan.tsx:58–63`

**Evidence:** Every counter uses the same channel and broadcasts only `tenantSlug`, state, and a client timestamp. The display accepts any message matching its slug; it does not verify the pairing or creating member.

For example, leave member A’s valid display open, sign out of the counter, then sign in and pair member B in the same tenant and browser storage partition. B’s state updates overwrite A’s display immediately, although A’s token-authorized public view still returns A’s state. Polling can subsequently change it back. The same issue affects an old pairing before its next revocation poll.

The slug check prevents direct different-slug bleed, but it does not prevent stale or different-member state within the tenant.

**Smallest fix:** Treat BroadcastChannel messages as refresh hints and fetch the state using the receiving display’s own capability, rather than accepting message payloads. Alternatively, introduce a non-secret pairing identifier and validate its association before accepting updates. Test simultaneous or successive member pairings in the same browser context.

### F3 — P2: Re-pairing an already-paired counter does not resend its current state

**Location:** `apps/web-app/src/routes/kasir/display-dialog.tsx:26–48,63–67`

**Evidence:** `onPaired()` clears `last.current`, but the publishing effect depends only on `key`, `status?.paired`, and `tenantSlug`. Re-pairing changes `paired` from `true` to `true`; the other dependencies can remain unchanged. Updating the ref does not rerun the effect.

Reproduction: load `/kasir` with an existing pairing, select a courier, let checkout publish, then choose **Buat Kode Baru** without changing checkout. The new server pairing starts idle and receives no current-state push until another input changes.

**Smallest fix:** Include a pairing generation/revision in the publishing effect’s dependencies, or explicitly publish current input after successful pairing. Add a test that re-pairs an unchanged checkout and verifies the new device receives checkout rather than remaining idle.

### F4 — P2: The purported closed line-kind set accepts inherited object properties

**Location:** `apps/worker/src/do/gerai-vault/customer-display/index.ts:58–63`

**Evidence:** `kind in LINE_LABELS` also accepts inherited properties. A valid-total checkout with:

```json
{
  "courier": "J&T Express",
  "lines": [{ "kind": "__proto__", "amountIdr": 12500 }],
  "totalIdr": 12500
}
```

passes this check. Its label becomes `Object.prototype`, serialized as `{}`, rather than a string. The display subsequently renders that object as a React child (`apps/web-app/src/routes/kasir/layar-pelanggan.tsx:123–128`), producing a render error. Other inherited names also bypass the declared five-kind restriction.

**Smallest fix:** Require a string and use `Object.hasOwn(LINE_LABELS, kind)` or a fixed `Set`. Test `__proto__`, `constructor`, and non-string kinds, expecting 422 and no stored-state replacement.

### F5 — P2: Older polling responses can overwrite newer checkout/payment state

**Location:** `apps/web-app/src/routes/kasir/layar-pelanggan.tsx:39–55,61–62`

**Evidence:** The interval can start another request while an earlier request remains outstanding. Every successful response calls `setView()` unconditionally; `updatedAt` is not used to reject older results. BroadcastChannel updates are likewise accepted without ordering checks.

A delayed checkout response can therefore replace a newer paid state or restore an obsolete amount/QRIS checkout after a later update has already been displayed.

**Smallest fix:** Serialize polling or use request sequencing, and reject older server revisions before replacing view state. Do not compare server timestamps with the current client-generated BroadcastChannel timestamp. Add a test that delays an older response until after a newer response has rendered.

### F6 — P2: A transient state-write failure leaves the display stale indefinitely

**Location:** `apps/web-app/src/routes/kasir/display-dialog.tsx:26–44`

**Evidence:** A failed `/customer-display/state` request is swallowed. There is no retry timer, and the effect does not rerun unless its dependencies change. Leaving `last.current` unchanged is insufficient because the unchanged input does not trigger another effect execution.

If the one checkout or paid-state write fails before reaching the server—or receives a transient server failure—the display continues polling the old persisted state indefinitely while the counter remains unchanged.

**Smallest fix:** Retry failed publication with bounded backoff while the current pairing and input remain applicable; cancel obsolete retries on input/pairing change or unmount. Test a failed first state write followed by recovery without any additional form interaction.

### F7 — P2: QRIS upload exposes raw English browser exception text

**Location:** `apps/web-app/src/routes/pengaturan/printer/page.tsx:121–126`

**Evidence:** The catch branch displays `err.message` for every `Error`. A browser network failure during upload is therefore shown directly—for example, “Failed to fetch”—contrary to the user-facing Bahasa Indonesia requirement. The new error path does not distinguish validated API messages from browser/runtime exceptions.

**Smallest fix:** Preserve validated Indonesian API error messages, but map unknown/network exceptions to the existing Indonesian fallback. Test an aborted upload request.

## Verification and remaining gates

The supplied worker and E2E tests cover the happy-path pairing, lifecycle, tenant mismatch, suspended tenant, QRIS permissions, and cookie-less display. The mutation and UI evidence were inspected, but **their executions were not independently repeated**. Existing tests do not exercise the failure cases above.

After fixes, the supervisor should run:

- `pnpm --filter @gx/worker exec vitest run test/customer-display test/ci/route-scan.test.ts`
- `pnpm test:migrations`
- `pnpm test:isolation`
- `pnpm e2e -- e2e/customer-display.spec.ts`
- `pnpm check`

Add regression coverage for the reported PII, malformed-kind, re-pairing, channel-isolation, response-ordering, and transient-failure scenarios before rerunning those gates.

**Merge verdict: BLOCK** — the claimed PII boundary is incomplete, and display synchronization has reproducible correctness gaps.

**Verdict: REQUEST_CHANGES**