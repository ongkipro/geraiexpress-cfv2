# DEC-247B Round 3 — final delta review (`f80c966..cb7a553`)

## Review

- **Finding: P2 — The dimension guard still trims the submitted strings.** The handler no longer validates the 200-character display copy, but it calls `.trim()` before applying `/^\d{1,3}$/` (`apps/worker/src/minisite/index.ts:118`). The new test explicitly expects `" 40 "` to pass (`apps/worker/test/minisite/identity.test.ts:170`), even though it fails the browser pattern and the Round 3 requirement to validate untrimmed input. Remove `.trim()`, keep `020 × 40 × 30` as the success case, and assert that whitespace-padded input returns 422. Keep the existing test for a non-digit suffix beyond the display cap.
- **Finding: P2 — Repeated dimension fields can make the quote and the form disagree.** Validation now reads the first value via `FormData.get()`, while the display copy keeps the last value via `Object.fromEntries()` (`apps/worker/src/minisite/index.ts:118`, `apps/worker/src/minisite/index.ts:102`). If a dimension is submitted twice with a valid value first and a malformed value second, the handler can return a quote while redisplaying the malformed value. Use the same untruncated lookup for validation and display, applying the 200-character cap only to the display copy, or reject repeated dimension fields.
- **Correct: R2-1 is resolved.** `/cara-kerja` now says that Non-COD shipping is paid at the counter and debited at issue; both COD modes are paid to the courier on delivery. The optional counter service fee applies only to Non-COD and COD Ongkir (DFOD), and Mengantar credits net COD proceeds rather than debiting the seller balance. This matches `computeFlow`, and the worker test covers the revised wording (`apps/worker/src/brand/pages.ts:514`, `apps/worker/src/brand/pages.ts:534`, `apps/worker/src/brand/pages.ts:568`, `packages/domain/src/money/index.ts:248`, `packages/domain/src/money/index.ts:267`, `apps/worker/test/brand/brand.test.ts:277`).

The recorded fix run reports passing SEO, unit, Worker, isolation, and `pnpm check` gates. I reviewed the supplied delta, source, tests, and ledger without modifying files or rerunning tests. After the validation fix, rerun `pnpm test:worker test/brand/brand.test.ts test/minisite/identity.test.ts`.

**Merge verdict: BLOCK**

Verdict: REQUEST_CHANGES