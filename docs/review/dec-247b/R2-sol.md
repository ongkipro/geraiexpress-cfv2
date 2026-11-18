# DEC-247B Round 2 — delta review (`d72a5d7..f80c966`)

## Review

Six of the eight Round 1 findings are resolved. The payment copy and quote validation fixes are incomplete. No P0 findings.

### Findings

- **P1 — `/cara-kerja` still misstates the COD/DFOD payment rules.** Step 4 tells cashiers they collect packing and service fees for COD, and the pipeline says a service fee can apply to COD without distinguishing COD Barang from COD Ongkir (DFOD) (`apps/worker/src/brand/pages.ts:516`, `apps/worker/src/brand/pages.ts:534`). The money rules reject a counter service fee for COD Barang and allow it for Non-COD and DFOD (`packages/domain/src/money/index.ts:248`, `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:134`). The pipeline lead also says the modes differ in *when* the balance is debited, although COD and DFOD credit net proceeds rather than debit the seller balance (`apps/worker/src/brand/pages.ts:568`, `packages/domain/src/money/index.ts:267`). Keep the layout, but say explicitly that the recipient pays the courier’s bill, the optional counter service fee applies to Non-COD and DFOD only, and Mengantar deducts COD charges from the proceeds before crediting the balance. Update the worker assertions to cover those distinctions.
- **P2 — The dimension guard rejects valid browser inputs and still validates a truncated value.** The form accepts one to three digits, so `020 × 40 × 30` passes browser validation and previously quoted as `20 × 40 × 30`. The new guard rejects it even though all three dimensions are in range (`apps/worker/src/minisite/index.ts:89`, `apps/worker/src/minisite/index.ts:118`). Conversely, the handler truncates values to 200 characters before validation, so a submitted `20` followed by 198 spaces and `cm` is accepted as `20` (`apps/worker/src/minisite/index.ts:102`, `apps/worker/src/minisite/index.ts:117`). Validate the original dimension strings before truncating display values: allow up to three digits, then enforce numeric `1..300` when any dimension is supplied. Add regressions for a zero-padded valid value and a malformed value with a suffix beyond the display cap.

### Verified resolutions

- **Dropship masking:** The tracking projection derives `maskedOutlet` from the preset or printed snapshot. Lookup and unlock both use the masked shell, which suppresses the outlet name, logo and favicon initial, location card, map, and WhatsApp. The worker test compares ordinary tracking, masked tracking, and masked unlock (`apps/worker/src/do/gerai-vault/minisite/index.ts:195`, `apps/worker/src/minisite/index.ts:295`, `apps/worker/src/minisite/index.ts:308`, `apps/worker/src/minisite/html.ts:158`, `apps/worker/test/minisite/minisite.test.ts:112`).
- **Unicode initials:** The monogram and favicon take the first Unicode code point. The worker test saves `𠮷野家 Berkah`, checks `𠮷B`, decodes the favicon, and checks all three mini-site pages return 200 (`apps/worker/src/minisite/html.ts:120`, `apps/worker/test/minisite/identity.test.ts:83`).
- **Logo ownership:** `publicShell` binds the tenant ID after the vault’s tenant check. The wrong-owner fixture leaves the row in the same object and verifies monogram fallback and `/logo` returning 404 (`apps/worker/src/do/gerai-vault/index.ts:1736`, `apps/worker/src/do/gerai-vault/minisite/index.ts:33`, `apps/worker/test/minisite/identity.test.ts:72`).
- **Validation ownership:** The SPA, brand, and mini-site nets now relinquish ownership on a page setter call, even when the new message has identical text. The unit and browser tests cover that handoff (`apps/web-app/src/lib/form-validation-id.ts:93`, `apps/worker/src/brand/seo.ts:164`, `apps/worker/src/minisite/html.ts:206`, `apps/web-app/src/lib/form-validation-id.test.ts:130`, `e2e/brand.spec.ts:296`, `e2e/minisite.spec.ts:205`).
- **Simulator typography:** The phone rule sets primary trigger and option text to `1rem`; Playwright asserts a computed `16px` for both (`apps/worker/src/brand/styles.ts:419`, `e2e/brand.spec.ts:369`).
- **Mini-site menu:** Space toggles the menu and prevents the default scroll without removing Enter activation or the no-JavaScript fragment fallback. The phone test covers opening, closing, and unchanged scroll position (`apps/worker/src/minisite/html.ts:184`, `apps/worker/src/minisite/html.ts:187`, `e2e/minisite.spec.ts:124`).

This was a read-only review of the supplied delta, source, contracts, tests, and recorded evidence. The review-fix ledger records passing checks, including 53 end-to-end tests; I did not rerun them or modify files. After the fixes, rerun `pnpm test:worker test/brand/brand.test.ts test/minisite/identity.test.ts`.

**Merge verdict: BLOCK**

Verdict: REQUEST_CHANGES