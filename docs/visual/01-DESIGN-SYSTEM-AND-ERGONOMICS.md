# 01 — Design System & 40+ Operator Ergonomics (`geraiexpress-cfv2`)

The visual language of `geraiexpress-cfv2` is **calm, high-contrast, Apple-clean Indonesian utility** — deliberately contrasting the noisy, banner-heavy PPOB/agent apps in the market — engineered for shop owners and counter staff aged **35–55+** working on mid-range Android phones (`360px–412px`) and counter laptops under bright fluorescent shop lighting.

---

## 1. Core Ergonomic Rules

1. **One Primary Action per Screen:** a single `#0066CC` primary button anchors each view. No decorative gradients, auto-carousels, or promo pop-ups blocking counter inputs.
2. **40+ Eye Comfort & Instant Font Scaling:**
   - Body and input text minimum **`16px`** (`17px` on public reading pages); secondary metadata minimum `14px` (never `10–11px` low-contrast micro-text for operational facts).
   - Top-bar quick text-scale toggle in `app.geraiexpress.com`: **`Normal (100%)` · `Besar (112%)` · `Sangat Besar (125%)`** persisted in `localStorage`.
3. **Unambiguous Input & Touch Targets:** every interactive control has >= **`44px` (`h-11`)** touch height on phones and for every form input (desktop sidebar, tabs and menus may use `md:h-10`, comfort contract) and an explicit `>= 3:1` border (`#7A7A7A` on `#FFFFFF`).
4. **Strict Tabular Numerals (`tabular-nums`):** all Rupiah amounts, gram/kg weights, percentages, and timers use `font-variant-numeric: tabular-nums` right-aligned in tables/receipts.
5. **Compact Navigation (`DEC-213`):** 6 top-level menus on the Gerai workspace and 5 on Super Admin. Related sub-workflows live in clean horizontal tabs with live count badges.

---

## 2. Color Tokens (WCAG AA/AAA Verified)

> **Signed-in workspace palette superseded by DEC-222 (2026-11-14):** accent `#2547C8`, canvas `#F6F8FC`, ink `#1B2B44`, muted `#55657D`, borders `#D9DFEA`, inputs `#7B879C`, chart blue `#2547C8` + orange `#E07A2F`. The table below remains the public-page palette and the status colours.

| Token | Hex | Usage | Contrast on White |
|---|---|---|---|
| `--bg-canvas` | `#FFFFFF` | Primary workspace surface & cards over parchment | — |
| `--bg-parchment` | `#F5F5F7` | Alternating public bands & subtle panel wells | — |
| `--ink-primary` | `#1D1D1F` | Headings, totals, `INV` slugs, recipient/sender names | **16.8 : 1** (AAA) |
| `--ink-secondary` | `#333333` | Body text, street lines, helper copy | **12.6 : 1** (AAA) |
| `--ink-muted` | `#595959` | Timestamps, units, secondary captions | **7.0 : 1** (AAA) |
| `--border-hairline` | `#D2D2D7` | Card & table row dividers | — |
| `--border-input` | `#7A7A7A` | Textboxes, segmented toggles, courier radio cards | **4.4 : 1** (AA UI) |
| `--brand-primary` | `#0066CC` | Primary CTA, selected courier ring, active tab | **5.5 : 1** (AA) |
| `--status-safe` | `#1E7E34` / `#EAF7ED` | `Terkirim`, `Sync Mengantar ✓`, green COD score (<10% RTS) | >= 5.1 : 1 |
| `--status-warn` | `#9A5B00` / `#FFF4E0` | `Menunggu Saldo`, amber COD score, unit-mistake guard | >= 5.0 : 1 |
| `--status-danger` | `#C92A2A` / `#FFEBEB` | `Gagal Antar`, cash variance, wrong-courier scan, red COD score | **5.5 : 1** (AA) |
| `--status-pickup-warn` | `#6B2FBA` / `#F4ECFF` | `Drop-off saja` (origin pickup uncovered by courier) | >= 6.0 : 1 |

---

## 3. Typography & Three Mandatory Test Viewports

- **UI Font Stack (Zero Webfont Blocking on Slow Mobile Data):** `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif`.
- **Monospace (`INV` Slugs, AWBs, 32-Col Thermal Preview):** `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`.
- **Mandatory Viewports:**
  - **`390px` (Android Phone):** single-column flow + sticky bottom checkout/print bar on `/kiriman/:slug` + bottom/drawer navigation.
  - **`768px` (Counter Tablet):** two-column proportional grids + compact left rail.
  - **`1280px+` (Counter Laptop/PC):** persistent 6-item sidebar + 60/40 split POS layout (inputs left, live locked quote + thermal preview right).
