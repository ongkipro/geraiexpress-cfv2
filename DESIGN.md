# DESIGN.md — GeraiExpress v2 signed-in workspace

Surface: admin
Brief: `design/brief.md`. Size contract: `design/admin-contract.json` (**comfort**). Full tokens and wireframes:
`docs/visual/01` (tokens), `docs/visual/07` (shell and page inventory), `docs/visual/02`, `05`, `06` (bodies).

## Direction

Picked-by: pending — the owner picks one of 2–3 rendered directions at the prototype step (todo #5); until then
this file holds the accepted constraints only and the build is visually UNVERIFIED.

- Surface/job: shop owners 35–55+ and counter staff serving a waiting customer; they decide price, courier and
  payment in under 45 s and must trust money numbers.
- Feel: calm, legible, exact. Motion: subtle (state feedback only).
- References: `design/refs/` — shadcn `dashboard-01` and `sidebar-07` (shell, sidebar, data table), Polaris
  resource index (tabs over a list, 16 px body on phones). Transfer: composition and density only.
- Won't do: 12–13 px text, icon-tile KPI cards, gradients/glass, card-in-card, more than one primary per screen,
  English UI strings, locked browser zoom.

### Composition contract

- C1: desktop shell = 256 px sidebar (6 menus, `Kontak` expands) + 64 px header with search, scan, account, and
  `+ Kiriman Baru`; content max 1440 px (visual 07 §1.1).
- C2: phone shell = 64 px header + 64 px bottom bar with a center `＋`; POS replaces the bottom bar with a sticky
  checkout bar (visual 07 §1.3).
- C3: list pages = title → in-page tabs with counts → filter bar → table; tables become cards under 768 px.
- C4: POS = 60/40 split at ≥ 1024 px (inputs left, locked summary + payment + print right); single column on phones.
- C5: dashboard (owner) = 4 KPI → `Perlu Tindakan` chips → trend + courier table; Kasir home has no money totals.

## Tokens

### Colour
Accent `#0066CC`; ink `#1D1D1F` / `#333333` / `#595959`; canvas `#FFFFFF`, parchment `#F5F5F7`; borders
`#D2D2D7` (hairline), `#7A7A7A` (inputs). Status pairs as in `docs/visual/01` §2 (safe, warn, danger, pickup-warn).

### Type
System UI stack (`-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif`); mono only for INV,
AWB and thermal preview. Scale: 14 (meta floor) · 16 (body, inputs, table) · 18 (section) · 28 (page title, KPI).
`tabular-nums` for money and weights. User text size: 100 / 112 / 125 % via root rem.

### Radius
6 px controls, 8 px cards and dialogs; full radius only for avatars and status dots.

### Spacing
Base 4 px; related 8, section 24; page padding 16 × 24.

### Motion
Colour/opacity transitions ≤ 150 ms; none on scroll; reduced motion removes all transforms.

## Allow
