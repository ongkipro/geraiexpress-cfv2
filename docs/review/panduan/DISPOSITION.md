# `/panduan` Review Disposition (`cx/gpt-6.2-sol`, Rounds 1–4)

- **Reviews:** `docs/review/panduan/R1-R4-sol.md` (R1–R3 `CHANGES REQUIRED`, R4 **APPROVE**)
- **Date:** 2026-11-26

| ID | Round | Severity | File | Disposition | Resolution |
|---|---|---|---|---|---|
| P1-1 | R1 | P2 | `DESIGN.md` | **Fixed** | Aligned `first-viewport-words` allowlist note with CSS (`< 1000 px` 2-column TOC below head; `≥ 1000 px` sticky TOC beside guide column). |
| P1-2 | R1 | P2 | `docs/visual/09` §7.3 | **Fixed** | Documented both progressive enhancements (`aria-current="location"` + `≤ 700 px` zoom `href` sync to `-hp.webp`) and the no-JS fallback to `.webp`. |
| P2-1 | R1 | P1 | `apps/worker/src/brand/panduan.ts` | **Disposed (documented)** | HTML `<picture>` switches display source by media query, while `<a>` holds one `href`. Keeping `.webp` as the full-res no-JS fallback avoids duplicating 32 `<img>` nodes in DOM/screen readers; `syncShots()` aligns zoom to `-hp.webp` at `≤ 700 px` with JS enabled. Documented in `visual/09` §7.3. |
| P2-2 | R1 | P1 | `apps/worker/src/brand/panduan.ts` | **Disposed (by WAI-ARIA)** | In-page scrollspy TOC `aria-current="location"` is progressive enhancement; hardcoding `#daftar` server-side would become stale and misleading when scrolling without JS. |
| P2-3 | R1 | P1 | `apps/worker/src/brand/index.ts` | **Fixed** | XML-escaped `safeHost = e(host)` when generating `/sitemap.xml` (defense-in-depth alongside verified host classification). |
| P2-4 | R1 | P2 | `apps/worker/src/brand/seo.ts` | **Disposed (pre-existing)** | `"Rp 0 pendaftaran"` in `MENU_ROWS` is pre-existing DEC-247 software registration copy for `/biaya-dan-paket`, not seller cost/margin/discount. |
| P2-5 | R1 | P2 | `apps/worker/src/brand/panduan.ts` | **Fixed** | Escaped `caption`, `id`, `who`, `title`, `intro`, `need`, `tips`, and `part.title` via `escapeHtml`. |
| P3-1 | R1/R3 | P1 | `scripts/panduan/{capture,seed}.mjs` | **Fixed** | Validated port numeric range `1–65535`, strict tenant slug regex, and `.localhost` hostname assertion before any request. |
| P3-2 | R1 | P1 | `scripts/panduan/capture.mjs` | **Fixed** | Manual `b.at` badge coordinates now run `hits()` collision detection and fail closed if overlapping text/controls. |
| P3-3 | R1 | P1 | `scripts/panduan/capture.mjs` | **Fixed** | Bounds check falls back to viewport `{ x: 0, y: 0, width, height }` when `region` is omitted. |
| P3-4 | R1 | P2 | `scripts/panduan/capture.mjs` | **Fixed** | Multi-locator marks require `parts.length === locs.length` so missing sub-targets fail closed. |
| P3-5 | R1 | P2 | `scripts/panduan/capture.mjs` | **Fixed** | Widened phone redaction regex to `+62` with optional space/hyphen and redacted `input`/`textarea` `placeholder` attributes (restored in `unmark`). |
| P3-6 | R1/R2/R3 | P2 | `scripts/panduan/{capture,optimize}.mjs` | **Fixed** | `capture.mjs` writes `{ inProgress: true, shots: [], failed: ["capture_incomplete"] }` before any PNG, overwrites on finish, and exits `1` if `failed.length > 0`; `optimize.mjs` requires a valid completed `shots.json` with no `readdirSync` fallback. |
| R3-3 | R3 | P2 | `apps/worker/src/brand/styles.ts` | **Fixed** | `.gtoc` defaults to 2-column grid and switches to 1-column sticky at `@media(min-width:1000px)`, eliminating any fractional-width gap between `999px` and `1000px`. |
