# Round 2 Delta Review — REQUEST_CHANGES

## Scope and verification

Read-only review of the Round 2 fixes against `docs/review/dec-236-238/R1-sol.md` and the claims in `DISPOSITION.md`. Used the supplied Round 1 and Round 2 diff artifacts and current source at the named implementation seams.

**No files were modified, and no tests or Git commands were run.** Test references below describe assertions inspected on disk, not independently reproduced passing results. The running integrated gate remains outside this review’s verification claim.

## R1 finding disposition

| R1 # | Status | Evidence and assessment |
|---|---|---|
| **1 — Stale POS selection** | **PARTIAL** | `quote-panel.tsx:147–160` compares the current form with the quoted request and invalidates selection after edits; `:167` also invalidates at re-quote start. Stale cards cannot be selected (`:336–347`). However, responses still call `onQuoted` unconditionally (`:170–173`), and the invalidation effect does not rerun when its dependencies remain unchanged. An in-flight response can therefore restore an obsolete parent selection. See **R2-A**. |
| **2 — Authoritative frozen price** | **PARTIAL** | `index.tsx:260–270` now consumes the frozen card and stops before payment when counter due or COD collection changes. The ordinary next-press continuation works: the retry GET materializes the shipment through `ensureDraft` (`apps/worker/src/do/gerai-vault/index.ts:716–725`) before attaching parties. But the frozen card is not retained in `frozen`, and same-request selections can replace the displayed amount without changing the frozen signature. The comparison also omits sender COD payable. See **R2-B** and **R2-C**. |
| **3 — J&T ECO COD quoting** | **FIXED** | `apps/worker/src/pricing/quote/service.ts:138–142` requests `courier: "all"` for ECO’s COD passes and reads `r.value[entry.service_code]`, preserving the ECO row rather than substituting JT. The regression at `apps/worker/test/mengantar-v2/contract.test.ts:253–264` checks availability, a lower ECO-specific collection total, and dispatch with `courier: "JT"` plus `eco: true`. |
| **4 — Sender verification within POS** | **FIXED** | The chosen sender renders `VerifySender` (`index.tsx:111`), whose successful verification replaces the selected contact with the returned item (`:120–141`). Checkout rejects an unverified sender for COD/masking before freeze/payment (`:254–257`). `e2e/checkout.spec.ts:50–89` adds the new-sender verification and COD checkout flow on `/kasir`. |
| **5 — Lost successful dispatch response** | **FIXED** | Matching-INV retries now read shipment state before `/parties` (`index.tsx:271–280`). Issued/held/in-flight/reconciliation states reach dispatch read-back instead of the immutable-party update. The DO returns existing issued/held results before dispatch readiness checks (`apps/worker/src/do/gerai-vault/index.ts:778–785`); payment status is adopted before continuing an editable retry (`index.tsx:279`). The specific successful-dispatch/lost-response failure is resolved. No automated lost-response case was added in the inspected checkout tests. |
| **6 — Packing and service-fee handoff** | **FIXED** | `cek-cepat.tsx:14–22` serializes the packing name and explicit fee choice. `index.tsx:188–189` restores both; `quote-panel.tsx:124–136` resolves packing against the current catalogue and applies the current configured fee only when enabled/allowed. `e2e/quote.spec.ts:29–39` checks packing plus fee-off handoff and the resulting Rp13.500 total. |
| **7 — Cargo extra-discount observation** | **FIXED** | The DO now propagates `cargoDiscountExtra` (`apps/worker/src/do/gerai-vault/index.ts:625–627`). Quote pricing and verification share `observedCargoBps` (`apps/worker/src/pricing/quote/engine.ts:67,89–92`; `apps/worker/src/pricing/rules/index.ts:208–210`). Cargo net remains the provider’s `cargoEstimatedSpecialPrice`, without another subtraction (`engine.ts:64–67`). The regression at `contract.test.ts:267–272` checks combined observed bps. |
| **8 — 90-minute pickup-slot reuse** | **FIXED** | `apps/worker/src/do/gerai-vault/index.ts:1199–1212` searches cached reservations with at least 90 minutes remaining **before** calculating a new 120-minute slot. SPX cached candidates are filtered against the currently returned date/window (`:1201–1209`). `contract.test.ts:274–289` exercises reuse with 110 minutes remaining. The inspected test does not exercise SPX-specific window rejection, but the implementation applies that constraint. |

## Correct

- The `onStale` effect does **not** form a render loop merely because the parent supplies an inline callback: its dependencies are the primitive `stale` and `currentKey` values (`quote-panel.tsx:157–160`).
- Stopping at `PRICE_CHANGED` does not inherently strand a quote-only INV: the retry detail endpoint calls `ensureDraft`, and `/parties` also ensures a draft exists (`apps/worker/src/do/gerai-vault/index.ts:716–725,746–754`).
- ECO COD reads the ECO-specific row on every COD pass, and cargo extra discounts affect observed bps without being deducted twice from net pricing.
- Cached-slot reuse preserves the SPX window filter instead of blindly choosing the earliest reservation for the address.

## Findings

### R2-A — P1 — An in-flight re-quote can restore an obsolete selection

**Residual R1 #1**

**Location:** `apps/web-app/src/routes/kasir/quote-panel.tsx:155–173`; `apps/web-app/src/routes/kasir/index.tsx:320–325`

The stale effect depends only on `[stale, currentKey]`. Quote completion unconditionally publishes its captured request through `onQuoted`, even when the form has changed since submission.

**Verified failure sequence:**

1. Select a service for request **A**.
2. Press **Cek Ongkir** again without changing A. The submit closure captures the parent callback containing the selected service; `onStale` clears the selection.
3. While that request is loading, change the weight to produce **B**. The existing quoted request is still A, so `stale` becomes `true` and selection is cleared.
4. The response for A completes. `setReq(body)` writes A again, and the captured `onQuoted` restores the selected service for A.
5. Neither `currentKey` nor `stale` changed at completion, so the effect does not clear the restored selection.

The courier panel warns that the form is stale, but the parent payment summary and checkout are eligible again. Checkout freezes **A**, not the currently entered B.

**Smallest fix:** Reject superseded responses before publishing them to the parent, using the latest request key/generation. A response that no longer matches the current form must not restore selection. Avoid relying solely on effect dependency changes for response-time invalidation.

**Regression test:** Select A, delay a same-request re-quote response, edit weight/COD value during loading, release the response, and assert that checkout remains unavailable and cannot freeze A.

---

### R2-B — P1 — Re-selecting the same service bypasses frozen-price confirmation

**Residual R1 #2; an escape from the new `PRICE_CHANGED` path**

**Location:** `apps/web-app/src/routes/kasir/index.tsx:208,244,258–283,320`; `apps/web-app/src/routes/kasir/quote-panel.tsx:336–340`

`frozen` retains only the slug, request signature, payment state, and payment key—not the authoritative card. Its signature contains the request and service code, but no frozen amounts. Meanwhile, the courier panel retains its pre-freeze card and permits selecting it again.

**Verified failure sequence:**

1. Quote/select J&T at Rp12.500.
2. Freeze returns Rp15.000. The new code correctly stores the INV, displays Rp15.000, and stops with `PRICE_CHANGED`.
3. Click the same service’s **Terpilih** button. It publishes the panel’s original Rp12.500 card through `onSelect`.
4. Checkout now displays Rp12.500 again. The request/service signature still matches the frozen INV, so submission skips freeze and enters the retry branch.
5. That branch reads only shipment state/payment status, not authoritative amounts. QRIS/transfer payment then records the frozen **Rp15.000**, although the screen confirms Rp12.500.

The backend receipt uses `s.counter_due_idr`, not a client-confirmed amount (`apps/worker/src/do/gerai-vault/payment/index.ts:39–70`).

A later successful re-quote for the same request/service can produce the same mismatch against an already-frozen INV.

**Smallest fix:** Retain the authoritative card with the frozen INV and enforce its confirmed amounts on every continuation. If selecting/re-quoting the same request produces different amounts, restore/display the frozen card and stop for confirmation before payment or dispatch. The shipment detail read-back can also supply authoritative quote amounts.

**Regression test:** Trigger `PRICE_CHANGED`, re-select the unchanged service from the existing cards, and verify that payment cannot proceed using the pre-freeze displayed amount. Also cover a same-request re-quote after freezing.

---

### R2-C — P1 — Freeze can silently reduce the sender’s COD payout

**Additional incomplete coverage in the R1 #2 fix**

**Location:** `apps/web-app/src/routes/kasir/index.tsx:266–270`

The confirmation check compares only `counterDueIdr` and `codCollectionTotalIdr`. It does not compare `senderCodPayableIdr`, although that amount appears in the checkout summary.

This is a real independent price-change case:

- In `sender_bears_fee`, collection is `G + P + I`, while sender payable is `G − F`.
- In `cod_all_in`, collection is fixed at `G`, while sender payable is `G − P − I − F`.

Those formulas are implemented at `packages/domain/src/money/index.ts:273–279`.

**Failure scenario:** A COD all-in quote displays the sender’s estimated payout. Shipping price increases during freeze. Counter due and recipient collection remain unchanged, so the check passes. `setSel` updates the payout, but submission immediately continues to parties/payment/dispatch without a renewed confirmation. The operator has confirmed the earlier, higher payout.

**Smallest fix:** Include `senderCodPayableIdr` in the customer-facing frozen-price comparison. A changed payout must stop for confirmation just like a changed counter due or recipient collection.

**Regression test:** Freeze a `cod_all_in` or `sender_bears_fee` card with unchanged counter due/collection but a lower sender payable; assert that dispatch and any payment wait for another explicit confirmation.

## Verification gaps

The added tests cover the simple post-quote edit, packing/fee handoff, sender verification, ECO COD, cargo observed bps, and generic 110-minute slot reuse. They do not cover:

- Editing during an in-flight re-quote.
- `PRICE_CHANGED` followed by re-selection or another same-request quote.
- A payout-only COD price change.
- A successful dispatch whose browser response is lost.
- SPX reuse rejecting an out-of-window cached reservation.

The first three gaps correspond to the verified findings above. The latter two are follow-up coverage notes, not additional verified implementation defects.

## Merge verdict: BLOCK

**Verdict: REQUEST_CHANGES**

R1 findings **#3–#8 are fixed** at the reviewed seams. **#1 and #2 remain partial**, with three verified P1 failure paths above. No additional P0–P2 issue was verified in the reviewed ECO, cargo-discount, or pickup-slot fixes.