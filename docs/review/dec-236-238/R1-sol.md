# Review — REQUEST_CHANGES

**Merge verdict: BLOCK**

Read-only review of the uncommitted DEC-236–238 changes against base HEAD `8cfdccd`, using the supplied diff and current source. No files were modified. Tests and browser flows were not executed; the failure scenarios below follow from the verified code paths.

## Correct

- The owner console imports the shared `AdminShell`, rather than maintaining a second implementation (`apps/web-owner/src/shell/console-shell.tsx:3,47`).
- COD limits are checked against the computed collection total **C**, not merely the goods amount (`apps/worker/src/pricing/quote/service.ts:146–150`).
- Status simulation is guarded against production at both the HTTP and DO boundaries (`apps/worker/src/api/app.ts:1145`, `apps/worker/src/do/gerai-vault/index.ts:1582`).
- Dispatch retains the per-INV concurrency fence, write-ahead journal, provider idempotency key, and ambiguous-outcome reconciliation (`apps/worker/src/do/gerai-vault/index.ts:775–796,834–875`).

## Findings

### 1. P1 — A failed re-quote leaves the old POS selection eligible for checkout

**Location:** `apps/web-app/src/routes/kasir/quote-panel.tsx:143–165`; `apps/web-app/src/routes/kasir/index.tsx:256,273–276`

`QuotePanel` informs its parent only after a successful quote. Starting another quote does not invalidate the selected service, and the error path clears only the panel’s local `data`. The parent retains `sel`; checkout remains enabled because its disabled condition does not include quote loading, failure, or changed inputs.

**Failure scenario:** Select a service for a 1 kg package, correct the weight to 10 kg, and request another quote. If the request fails, the courier cards disappear but the payment summary and checkout button still use the old 1 kg request. Checkout sends `sel.req` to `/quotes/freeze`, so the server revalidates the **old weight**, not the corrected form.

Changing COD goods value or the DG setting has the same stale-selection problem.

**Smallest fix:** Invalidate parent selection on pricing-input changes and when a re-quote starts or fails. Disable checkout until a successful quote matches the current form. Also prevent an older in-flight quote response from restoring a superseded selection.

**Regression test:** Select a service, change weight/COD value, fail the next `/quotes` request, and assert that checkout cannot freeze or dispatch the previous request.

### 2. P1 — Checkout ignores the authoritative frozen price before recording payment

**Location:** `apps/web-app/src/routes/kasir/index.tsx:213–241`

The freeze request is typed and consumed as `{ slug }`, although the endpoint re-runs pricing and returns the new card (`apps/worker/src/api/app.ts:317–338`). The POS continues using the earlier `sel.card` for the displayed total, cash validation, change, and payment decision.

`markPaid` records the shipment’s server-side frozen `counter_due_idr`, not an amount confirmed by this client (`apps/worker/src/do/gerai-vault/payment/index.ts:39–70`).

**Failure scenario:** The displayed tariff is Rp12.500 and the customer pays that amount through QRIS. The tariff becomes Rp15.000 during freeze. The UI silently records Rp15.000 as received and dispatches, while its summary still says Rp12.500. Conversely, a lower frozen tariff produces incorrect displayed cash change. A change from zero counter due to positive due can bypass the payment step altogether.

**Smallest fix:** Consume the returned frozen card, compare its customer-facing amounts with those confirmed on screen, and stop for renewed payment confirmation if they changed. Use the frozen card for all subsequent payment calculations.

**Regression test:** Return a different card from `/quotes/freeze`; verify that payment is not recorded until the new amount has been displayed and confirmed.

### 3. P1 — J&T ECO cannot be quoted for COD

**Location:** `apps/worker/src/pricing/quote/service.ts:137–139`

The new `JTEco` catalog entry supports COD, but the COD fee passes request `courier: entry.courier_code`, which is `"JT"`, then read `r.value[entry.service_code]`, which is `"JTEco"`.

A single-courier JT estimate is normalized under `"JT"` by `packages/mengantar-sdk/src/public/client.ts:275–283`. Consequently, `x` is undefined and the ECO card becomes unavailable with a COD-fee calculation error.

The provider contract explicitly says that `JTEco` is returned alongside JT for **`courier=all`**, not as a courier parameter (`check-shipping-fee.md:261`). The migration enables COD for this new service (`packages/db/migrations/control/0018_courier_v2_limits.sql:24–25`).

**Failure scenario:** On a route supporting ECO, Non-COD J&T ECO works, but switching to any COD mode makes ECO unavailable regardless of valid amounts and coverage.

**Smallest fix:** For ECO COD passes, request `courier=all` with the candidate COD amount and select the `JTEco` row. Do not substitute the regular JT tariff.

**Regression test:** Add a COD ECO quote-and-dispatch test that verifies ECO-specific pricing and `courier: "JT"` plus `eco: true`. Existing ECO coverage uses Non-COD (`apps/worker/test/mengantar-v2/contract.test.ts:60–79`).

### 4. P1 — A new or unverified sender cannot complete COD within the new POS

**Location:** `apps/web-app/src/routes/kasir/index.tsx:111–112,141`

The POS displays the sender’s unverified WhatsApp state but provides no verification action. Its sender Sheet always renders `SenderForm` with `sender={null}`. That form exposes verification controls only for an existing sender (`apps/web-app/src/routes/kontak/pengirim.tsx:191–207`).

The backend correctly refuses COD and masked shipments without sender verification (`apps/worker/src/do/gerai-vault/dispatch/index.ts:157–158`).

**Failure scenario:** Create a sender using “Pengirim baru,” select COD, and complete the form. Submission reaches dispatch and fails because the sender is unverified. There is no action on this screen to resolve that condition; the operator must leave the supposedly single-screen checkout. Any counter payment has already been recorded before this rejection.

**Smallest fix:** Expose the existing verification workflow for the chosen sender, either directly in its provenance card or by opening an existing-sender Sheet. Refresh the selected contact after verification. Identify this missing prerequisite before recording payment.

**Regression test:** Start with a newly created sender and complete verification plus COD dispatch without leaving `/kasir`. The current checkout test pre-verifies its sender through the API (`e2e/checkout.spec.ts:17–18`), so it does not exercise this path.

### 5. P2 — Retry cannot recover a successful dispatch whose response was lost

**Location:** `apps/web-app/src/routes/kasir/index.tsx:233–241`

Every retry re-runs `/parties` before reaching the idempotent dispatch endpoint. `setParties` rejects an already-issued shipment with `ALREADY_ISSUED` (`apps/worker/src/do/gerai-vault/dispatch/index.ts:105`).

**Failure scenario:** Mengantar issues the order and the Worker records success, but the browser loses the dispatch response. The POS retains the INV and payment key, yet retry stops at `/parties` and never reaches the dispatch endpoint that would return the existing AWB. The operator cannot recover the successful result in place.

**Smallest fix:** On retry, read the shipment state first. Render an existing issued/held result directly, and update parties only while the shipment is editable.

**Regression test:** Let dispatch complete server-side, drop its browser response, and retry. Assert that the same INV/AWB appears without another provider order or payment.

### 6. P2 — Quick-quote prefill drops packing and the service-fee choice

**Location:** `apps/web-app/src/routes/kasir/cek-cepat.tsx:15–20`; `apps/web-app/src/routes/kasir/quote-panel.tsx:125–135`

The handoff serializes destination, weight, mode, service, COD value, declared value, DG, and dimensions—but omits `packingIdr` and `serviceFeeIdr`. The destination POS starts with no packing selected and the service fee enabled by default.

**Failure scenario:** In Cek Ongkir Cepat, select paid packing or turn off the optional service fee, then click “Buat Kiriman dari Tarif Ini.” The POS automatically quotes a different request: packing disappears or the service fee returns. This contradicts DEC-237’s same-request prefill requirement.

**Smallest fix:** Carry and restore the packing selection and explicit service-fee enabled/disabled state, validating them against current configuration.

**Regression test:** Configure packing and a service fee, choose packing while disabling the fee in the quick quote, and verify that the POS request and total remain unchanged after navigation.

### 7. P2 — Cargo extra discounts are parsed but discarded before discount verification

**Location:** `apps/worker/src/do/gerai-vault/index.ts:623–627`; `apps/worker/src/pricing/quote/engine.ts:60–67`; `apps/worker/src/pricing/rules/index.ts:208–211`

The SDK now parses `cargoDiscountExtra` and `cargoDiscountExtraPercent`, but `ObservedRate` does not carry them through the DO normalization. Both cargo observation paths continue calculating observed bps from `cargoDiscount` alone.

**Failure scenario:** A cargo rate has a 5% base discount and a 5% extra discount. Its net shipping price correctly includes both, but the verifier records only 500 bps and can report `Selisih` against a matching 1,000 bps assignment.

This leaves DEC-238’s extra-discount observation parity incomplete. **N itself remains unchanged and correct.**

**Smallest fix:** Propagate the cargo extra fields and include them in cargo observed-bps calculation, without subtracting them again from the provider’s already-netted price.

**Regression test:** Add a cargo fixture with nonzero base and extra discounts; assert the combined observed bps and unchanged net price.

### 8. P2 — The 90-minute pickup-slot reuse allowance is ineffective

**Location:** `apps/worker/src/do/gerai-vault/index.ts:1196–1198`

The implementation first selects a new slot using the 120-minute lead requirement, then searches the cache only for that exact date/hour. An existing slot with 90–119 minutes remaining cannot match the newly selected slot, despite satisfying the explicit reuse condition.

**Failure scenario:** A 13:00 slot is reserved at 11:00 WIB. At 11:10, it still has 110 minutes remaining and should be reusable under DEC-238. Instead, the code selects 14:00 and creates another slot. If SPX has only the 13:00 window available, it returns `NO_PICKUP_SLOT` despite having a valid cached reservation.

**Smallest fix:** Search for an eligible cached reservation first, applying the 90-minute minimum and current courier-window constraints. Apply the 120-minute requirement only when reserving a new slot.

**Regression test:** Advance time between two dispatches so the first reservation has 110 minutes remaining. Assert reuse, including an SPX case with no later available window.

## Verification follow-up

After adding the regression cases, run:

- `pnpm test:worker test/mengantar-v2/contract.test.ts test/pricing/quote.test.ts`
- `pnpm test:unit`
- `pnpm e2e e2e/checkout.spec.ts e2e/quote.spec.ts e2e/minisite.spec.ts`
- Migration and isolation suites, followed by `pnpm check`

The repository’s recorded passing evidence was not independently reproduced in this review.