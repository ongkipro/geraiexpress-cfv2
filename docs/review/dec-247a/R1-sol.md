# DEC-247A — Independent Round 1 Review

Reviewed the supplied `/data/tmp/dec-247a-sol-r1.diff` for commit `d0fda4b`, the corresponding source and tests, the white-gallery mandate, and the homepage-parity mandate. Read-only review; no files modified.

## Review

### Correct

- **Asset boundary remains allowlisted.** The new product screenshot is added through the fixed `BRAND_ASSETS` set; arbitrary bundle paths remain inaccessible. Asset requests are restricted to GET/HEAD and receive `nosniff` (`apps/worker/src/brand/index.ts:23–55`). Tests cover disallowed assets, source maps, methods, cookies, and the new WebP (`apps/worker/test/brand/brand.test.ts:71–99, 229–240`).
- **No new XSS or apex-session issue identified.** Runtime legal-profile, brand, contact, origin, and metadata values are HTML-escaped. JSON-LD serialization escapes `<`, preventing injected closing-script tags (`apps/worker/src/brand/seo.ts:235–236, 275–295`; `apps/worker/src/brand/pages.ts:675–748`). The apex dispatch remains separate from application API families and does not introduce session handling (`apps/worker/src/index.ts:108–111`).
- **Core commercial guards are retained.** There are nine courier entries, Cargo is advertised as starting at 5 kg and Non-COD, Pro has no invented price, and discount copy does not promise a fixed percentage (`apps/worker/src/brand/pages.ts:8–18, 279–285, 461–480, 505–510`). The layered KPI/table showcase and POS screenshot explicitly identify their data as examples (`pages.ts:213, 256`). The screenshot visibly uses a Kasir account and exposes no owner cost, discount, or margin.
- **Keyboard and accessibility foundations are sound.** The shared menu synchronizes `inert` and `aria-expanded`, handles Escape with focus return, closes on outside interaction, and closes when switching to desktop (`apps/worker/src/brand/seo.ts:118–139`). Pricing uses native same-name radios inside a fieldset, preserving native arrow-key behavior (`apps/worker/src/brand/pages.ts:459–463`). FAQ disclosure uses native `<details>/<summary>` (`pages.ts:654–656`).
- **Motion and SEO safeguards remain present.** Bento animation requires `IntersectionObserver`, is gated by reduced-motion preference, and becomes static through the global reduced-motion CSS (`apps/worker/src/brand/pages.ts:107–111`; `apps/worker/src/brand/styles.ts:9–10`). Canonical, OG, JSON-LD, staging `noindex`, breadcrumbs, and the single shared shell remain intact (`apps/worker/src/brand/seo.ts:194–236, 264–317`).

### Fixed

None — read-only review.

### Finding: P2 — Newly added synthetic bento records lack a visible example-data label

**Location:** `apps/worker/src/brand/pages.ts:218–250`; related proof chart at `pages.ts:263–267`.

**Evidence:** The new bento displays a paid invoice, shipping price, realistic AWB and recipient, shop/sender names, reconciliation result, and return PIN. Unlike the separately captioned layered showcase and screenshot, this section contains no visible “Data contoh” or equivalent disclaimer. Its artifacts use `aria-hidden="true"`, which hides them from assistive technology but does not label them for sighted visitors. The proof chart likewise places its example-data disclaimer only in `aria-label`.

**Impact:** This falls short of the requested guard that synthetic example data be clearly labeled. Visitors can read the records and comparison bars as actual operational evidence rather than illustrations.

**Smallest fix:** Add one visible caption covering the six bento artifacts, such as **“Ilustrasi fitur dengan data contoh, bukan transaksi gerai sungguhan.”** Add a visible **“Ilustrasi, bukan hasil pengukuran”** note to the proof chart. Assert those labels in the focused brand test.

### Verification limits

Tests were inspected, not executed during this read-only review. Existing E2E tests exercise menu dismissal, pricing selection, FAQ interaction, screenshot decoding, cookies, and hero reduced motion. They do not directly exercise pricing arrow keys or the menu’s desktop-resize closure.

The implementation consistently uses **960 px** for both CSS and `matchMedia`, matching visual specification §6.2, rather than the **961 px** expression named in the review request.

Supervisor verification commands:
- `pnpm test:worker test/brand/brand.test.ts`
- `pnpm e2e e2e/brand.spec.ts`

**Merge verdict: OK with notes.** No P0 or P1 issue identified; the P2 labeling note is non-blocking.

Verdict: APPROVE