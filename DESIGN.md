# DESIGN.md — GeraiExpress v2 signed-in workspace

Surface: admin
Brief: `design/brief.md`. Size contract: `design/admin-contract.json` (**comfort**). Full tokens and wireframes:
`docs/visual/01` (tokens), `docs/visual/07` (shell and page inventory), `docs/visual/02`, `05`, `06` (bodies).

## Direction

Picked-by: owner (Ongki), 2026-11-14 — **Direction A**: system UI font stack, Mengantar blue `#2E47BA` on clean white,
8 px radius (prototype `?dir=a`). Rejected: B (Inter webfont, same blue — near-identical look for an extra font
download) and C (Geist + teal — loses the Mengantar-network identity). Gate evidence: `design/evidence/prototype-gates.md`.

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
- C5: dashboard (owner) = period filter: presets + calendar range (default 7 hari terakhir, visual 08 §1) → 4 KPI → shipment chart → shipment history →
  courier table + `Perlu tindakan`; Kasir home has no money totals.
- C6: settings = left settings menu + one form per route on desktop; grouped list of rows → item page on phones
  (visual 08 §2); never a row of horizontal tabs.

## Tokens

### Colour
Clean white + Mengantar blue, light only (DEC-222): canvas/cards `#FFFFFF` with `#E3E8F0` hairlines; accent
`#2E47BA`, tint `#EEF1FB`; ink `#203551`, muted `#55657D`; inputs `#7B879C`; chart Non-COD `#2E47BA`, COD `#E07A2F`
(always with legend). `color-scheme: light`; no dark palette at launch.
Status pairs as in `docs/visual/01` §2 (safe, warn, danger, pickup-warn).

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

allow: primary-actions — admin shell: the count includes the header, in-page tabs and segmented controls; never more than one filled primary per screen (visual 07 §1.1)
allow: nav-label — tab labels are the spec's business terms (`Pickup & Manifest`, `Mutasi Sync Mengantar`); shortening them breaks the menu contract in spec 06
allow: marker-count — status badges are per table row in operational lists; each is dot + text, neutral chip
allow: icon-overload — settings list on phones: a trailing chevron on every row is the platform cue that the row opens its own page (visual 08 §2.2); no icon tiles

## Direction — mini-site `<slug>.geraimitra.com` (TASK-501)

Picked-by: inherited from the accepted workspace direction A (owner 2026-11-14) + visual 03 §1 (owner-approved
wireframe). No separate owner pick was made for the public page; the independent visual verdict is pending
(final reviewer pass) → visual acceptance UNVERIFIED until then.
Surface/job: neighbourhood customers on a phone from a WhatsApp link or shop QR — "what does it cost, can I fill
this in at home, where is my parcel?"
Sections (in order): outlet name + address + hours + WhatsApp → three tabs (`Cek Ongkir`, `Kirim dari Rumah`,
`Lacak Paket`) → the active tab's form/result → `Kenapa kirim di …` (home only, background shift) → footer
`Didukung jaringan resmi GeraiExpress` + privacy link.
Type / color / shape: system stack; Mengantar blue `#2E47BA` for the one primary per page; white canvas, `#F7F9FC`
band; 6–8 px radius; no cards, no imagery (no owner photos exist yet — the outlet logo slot is reserved).
### Composition contract
C1: SSR HTML + inline CSS < 35 KB; JavaScript only for the area search and the Turnstile widget.
C2: one column ≤ 640 px for forms on every width; header and tabs span the 960 px frame.
C3: anonymous tracking shows initials + district/city only; the 4-digit gate is the only way to the recipient name.

## Direction — brand site `geraiexpress.com` (TASK-502)

Picked-by: inherited direction A + visual 03 §2 (owner-approved wireframe); no separate owner pick → visual
acceptance UNVERIFIED until the independent final pass.
Surface/job: shop owners (konter pulsa, fotokopi, kelontong, agen) deciding "is this worth signing up for and does
it fit my counter?"
Sections: plain wordmark + 5-link nav → hero (one offer headline, one sentence, `Daftar Gerai` + `Coba Simulasi
Kasir`) → three counter benefits (band) → money trust + free gerai page → existing-equipment note (band) → legal
footer (filled fields only). `/simulasi-kasir` = static synthetic demo, no login, no API.
### Composition contract
C1: SSR, no client framework, no cookies on the apex; JS only on `/simulasi-kasir`.
C2: no imagery until the owner supplies real counter photos (no invented customers, metrics or logos).
C3: titles `Halaman - GeraiExpress`, meta descriptions 120–155 chars, single h1 per page.
