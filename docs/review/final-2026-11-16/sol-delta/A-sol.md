Verdict: REQUEST_CHANGES

### Findings

1. **P1 — Valid JSON with an invalid Partner envelope still lifts the rotation fence.**  
   `packages/mengantar-sdk/src/partner/index.ts:123-125`  
   HTTP `200` with `{}` or `null` bypasses the unreadable-body catch and returns `kind: "error", code: "HTTP_200"`. If regeneration or registration already happened, callers treat this as a definitive refusal instead of reconciling the unknown outcome. **Smallest fix:** return `maybe_sent` for successful HTTP responses lacking a valid success/error envelope. Add tests for `200 {}`, `200 null`, and missing success data. **M2A-2: partial.**

2. **P1 — Replacing an active webhook secret still leaves the next poll up to 24 hours away.**  
   `apps/worker/src/do/gerai-vault/index.ts:2566-2587`  
   `saveWebhookSecret()` now changes the state to `awaiting_seller_setup`, but neither advances `status_poll` nor arms the alarm. After an active tenant’s daily poll, saving a mistyped replacement secret makes subsequent webhooks fail while the existing daily timer remains unchanged. The promised hourly fallback does not begin until that timer fires. **Smallest fix:** when open poll candidates exist, set the timer to at most `now + POLL_INTERVAL_INACTIVE_MS` and call `armAlarm()`. Test an active connection with an existing 24-hour timer. **M2B-3: partial.**

3. **P2 — BYOK’s Partner-connected guard is still a check-then-write race.**  
   `apps/worker/src/onboarding/service.ts:357-360`; `apps/worker/src/do/gerai-vault/index.ts:305-322`  
   BYOK can read `registration_pending`, then Partner provisioning can finish, and BYOK subsequently overwrites the newly connected Partner account. `recordOnboarding()` does not reject a BYOK transition from current state `connected`; its rotation check also occurs before asynchronous encryption rather than at commit time. **Smallest fix:** enforce both transition eligibility and the rotation fence inside the DO immediately before committing, after encryption. Add a provisioning-versus-BYOK race test. **M2A-8: partial.**

4. **P2 — Automatic rotation read-back still bypasses the global Partner quota.**  
   `apps/worker/src/do/gerai-vault/index.ts:2254-2259`  
   `resolveKeyRotation()` directly calls `partnerClient(...).apiKey()` without `PartnerQuotaDO.reserve("call", ...)`. Concurrent recovery alarms across tenants can therefore exceed the shared 60/minute limit despite the new reservations in registration reconciliation. **Smallest fix:** reserve a call before read-back; when refused, retain the fence and schedule another check without contacting Mengantar. **M2A-6: partial.**

5. **P2 — Same-millisecond decisions still duplicate audit and routing side effects.**  
   `apps/worker/src/onboarding/service.ts:160-166, 190-205, 239-243`  
   The deterministic outbox ID fixes duplicate email only. Two requests by the same actor sharing `now` can both load `submitted`; the losing batch updates zero application rows but still matches the winner’s `decided_at`/`decided_by`. It inserts another randomly identified audit row and, for approval, increments `routing_version` again before returning `409`. **Smallest fix:** identify the winning transition with a unique per-call nonce, or otherwise gate every side effect on that batch’s successful transition—not actor plus timestamp. Test audit counts and routing version, not only outbox counts. **M2A-9: partial.**

6. **P2 — Route coverage still excludes an entire side-door registration method.**  
   `apps/worker/test/ci/route-scan.test.ts:26-33`  
   The new scan discards **every** `ALL` route, so adding an unregistered `app.all("/unprotected", handler)` remains invisible. It also checks only method/path membership, not whether the mounted guard is present. Thus the advertised fail-closed route gate remains incomplete. **Smallest fix:** exempt only the exact documented rolling-cookie middleware, reject other `ALL` registrations, and verify guard/handler identity or registration ownership. Include an `app.all` mutation fixture. **M1-5: partial.**

7. **P2 — Email-change OTP requests still ignore the verification lock.**  
   `apps/worker/src/auth/account/index.ts:45-70, 79-81`  
   After five wrong confirmations, `confirmEmailChange()` locks the user for 15 minutes, but `requestEmailChange()` still accepts another request and sends a code valid for only 10 minutes. Requested immediately after locking, that code expires before confirmation becomes possible. The disposition’s “lock checked on request” is true for signup, not email change. **Smallest fix:** check `email-change-lock:${userId}` before creating or enqueueing another OTP and return the remaining retry interval. **M1-4: partial.**

8. **P2 — Origin validation still permits keyed URL construction to throw outside the redacting boundary.**  
   `packages/mengantar-sdk/src/public/transport.ts:77-82`  
   A syntactically valid non-hierarchical origin such as `mailto:ops@example.test` passes `new URL(opts.origin)`. Its `origin` is `"null"`; the next `new URL(...)`, constructed with the seller key, throws outside the catch. This escapes as a raw URL-construction exception rather than the safe `MengantarError`; runtimes exposing the rejected input retain the keyed URL on that exception. **Smallest fix:** require an HTTP(S) origin before inserting the key and keep final URL construction within a catch that emits only the fixed configuration error. Add non-HTTP-origin tests. **M2A-3: partial.**

### Disposition verification

| Finding ID | Status | Remaining issue |
|---|---|---|
| M1-1 | FIXED | — |
| M1-2 | FIXED | — |
| M1-3 | FIXED | — |
| M1-4 | PARTIAL | Finding 7 |
| M1-5 | PARTIAL | Finding 6 |
| M1-6 | FIXED | — |
| M1-7 | FIXED | — |
| M2A-1 | FIXED | — |
| M2A-2 | PARTIAL | Finding 1 |
| M2A-3 | PARTIAL | Finding 8 |
| M2A-4 | FIXED | — |
| M2A-5 | FIXED | — |
| M2A-6 | PARTIAL | Finding 4 |
| M2A-7 | FIXED | — |
| M2A-8 | PARTIAL | Finding 3 |
| M2A-9 | PARTIAL | Finding 5 |
| M2B-1 | FIXED | — |
| M2B-2 | FIXED | — |
| M2B-3 | PARTIAL | Finding 2 |
| M2B-4 | FIXED | — |
| M2B-5 | FIXED | — |
| M2B-6 | FIXED | — |

Static review of the supplied diff and current source; tests were not executed. Paths containing the `credentials` segment were excluded. The supplied artifact omits the `gerai-vault/index.ts` changes, so findings there verify outstanding HEAD behavior rather than independently establish delta attribution.