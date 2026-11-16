# Round 4 Delta Review — APPROVE

## Scope and verification

Read-only review of the **“Post-approval change”** in `docs/review/dec-236-238/DISPOSITION.md`: the stale scheduled-pickup-slot recovery in `dispatchOwned`, and the final `"stale pickup slot"` test.

Inspected the current diff and source at the changed seam, dispatch outcome recording, masking/API-cap release helpers, pickup-slot selection and tenant isolation, SDK error classification, the mock, and the supplied provider contracts (`create-order.md` and `add-time.md`). Round 3 approval was treated as the baseline; unrelated changes were not re-reviewed.

**No files were modified. No tests, browser flows, Git commands, or state-changing commands were run.** Reported mutation and preview results were not independently executed.

## Review

### Correct

- **The matched response is a definitive refusal, not an ambiguous dispatch.**  
  `apps/worker/src/do/gerai-vault/index.ts:875–880` requires HTTP **400**, a message matching `/invalid pickup time/i`, and `scheduledPickup`. The provider’s `add-time.md:82–83` identifies this message as a Create Order pickup-time rejection; `create-order.md:391` specifies the scheduled pickup’s `time_id` and minimum lead time.

  The SDK constructs this matching error from a parsed non-success HTTP response (`packages/mengantar-sdk/src/public/transport.ts:123–129`). Timeout/network failures, unreadable bodies, and 5xx responses do not satisfy the new condition. A replay of this particular 400 still represents the original definitive refusal, so handling it before the general `idempotentReplayed` ambiguity branch does not make an applied order retryable.

- **The dispatch journal and shipment remain safely retryable.**  
  The new branch records `kind: "rejected"` with `PICKUP_TIME_REJECTED` (`apps/worker/src/do/gerai-vault/index.ts:878–879`). Existing outcome handling sets the shipment’s dispatch state to `failed` and the journal row to `failed`, retaining the reason (`apps/worker/src/do/gerai-vault/dispatch/index.ts:232–235`).

  A subsequent attempt accepts that failed state and allocates a new attempt-specific idempotency key (`apps/worker/src/do/gerai-vault/index.ts:815–816,838–839`). It does not reuse the refused attempt’s key.

- **Masking quota and API-cap reservations use the existing rejection release path.**  
  Recording the rejection and releasing both reservations occur in the same synchronous transaction (`apps/worker/src/do/gerai-vault/index.ts:886–892`). `releasePreset` returns only a claimed sender-masking slot and uses the original claim date (`apps/worker/src/do/gerai-vault/masking/index.ts:84–86`). `releaseApiSpend` removes the reservation for this INV (`apps/worker/src/do/gerai-vault/api-spend/index.ts:33–35`).

- **Deleting by `time_id` is tenant-local and narrowly targeted.**  
  The deletion uses the `timeId` selected for this dispatch, with a bound SQL parameter (`apps/worker/src/do/gerai-vault/index.ts:878`). Storage belongs to this Durable Object, whose identity is tenant-bound, and dispatch rejects a mismatched tenant (`:281–299,310–315,778–780`). No shared D1 cache or other tenant object is modified.

  Deleting the rejected ID also cannot delete a concurrently replaced row carrying a different ID. The next dispatch selects from the remaining cache or reserves a new slot when none qualifies (`:1211–1234`).

- **The user-facing retry message is appropriate Bahasa Indonesia.**  
  The resulting response is: **“Mengantar menolak kiriman: jadwal jemput ditolak. Tekan sekali lagi untuk memesan jadwal baru.”** (`apps/worker/src/do/gerai-vault/index.ts:879,913`). It gives an actionable retry instruction without exposing `time_id`, raw provider English, or an exception string.

- **The regression test exercises the actual recovery seam.**  
  `apps/worker/test/mengantar-v2/contract.test.ts:291–304` first establishes a cached slot, replaces its ID with one unknown to the mock, verifies a 422 with the retry instruction, then verifies that retrying the same INV issues successfully and results in a second `/time` call. The mock rejects the unknown pickup ID before order creation (`apps/worker/src/mengantar/mock.ts:203–205`).

### Test evidence limits

The added test covers stale-cache refusal and successful retry through the application API. It does **not** directly assert the journal’s error code, masking-quota release, API-cap release, or negative ambiguity cases; those conclusions above are supported by source inspection. Test and mutation pass claims remain outside this read-only review’s independent execution evidence.

### Findings

No issues found.

## Merge verdict: OK

**Verdict: APPROVE**

No P0–P3 issue was verified in the Round 4 delta. This approval does not assert that a post-change integrated gate has passed.