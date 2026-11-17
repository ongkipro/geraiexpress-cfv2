# DESIGN.md — GeraiExpress v2 signed-in workspace

Surface: admin
Brief: `design/brief.md`. Size contract: `design/admin-contract.json` (**desk**, DEC-239 — volum-default / AdsBookCMS / TokoPhi scale). Full tokens and wireframes:
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

- C1: desktop shell (DEC-239) = white 256 px sidebar: brand mark + name/domain, quick-action row (`+ Kiriman Baru` +
  Scan QR) on Gerai, menus grouped `UTAMA · OPERASIONAL · ADMINISTRASI` (Super Admin `PLATFORM · TATA KELOLA · SISTEM`)
  with a left accent bar on the active item, `Buat Pengiriman` and `Kontak` as Collapsible trees with dot sub-items
  (DEC-237), and a status block at the foot (Shift + label format; Super Admin: environment + TOTP). White 64 px topbar:
  trigger + breadcrumb (navigation only), `⌘K` command pill (jump to any menu or task), page actions, and the account
  chip at the right (profile, Ukuran Teks, bantuan, Keluar). The page owns its single `h1` (`PageHeader`); content on the
  `#F6F7F9` canvas, max 1480 px. Super Admin uses the same `AdminShell` (DEC-236).
- C0: one kit for both consoles (DEC-236): `apps/web-app/src/components/admin/` — `PageHeader`, `SectionCard`,
  `Panel`, `ItemList`, `MetricCard`, `StatusBadge` (dot + label), `CalloutAlert`, state blocks, `DataTableShell`,
  `AdminBarChart`, `CheckboxField`, `ChoiceGroup`, `DetailList`; Sonner for toasts. No hand-rolled cards or controls.
- C2: phone shell = 64 px header + 64 px bottom bar with a center `＋`; POS (`/kasir`, `/kiriman/:slug`) replaces the
  bottom bar with a sticky checkout bar; the menu opens as a Sheet with the same tree (visual 07 §1.3).
- C3: list pages = title → in-page tabs with counts → filter bar → table; tables become cards under 768 px.
- C4: POS = 60/40 split at ≥ 1024 px (inputs left, sticky `Ringkasan & Pembayaran` right); single column on phones;
  one primary issues without leaving `/kasir` (DEC-237).
- C5: dashboard (owner) = period filter: presets + calendar range (default 7 hari terakhir, visual 08 §1) → one strip of
  6 KPI tiles (Kiriman, Tercatat dibayar, Belum dibayar, Saldo aman, Estimasi Laba, Laba Kas — the two profits never
  summed) → chart beside `Perlu tindakan` (one row per open queue) → recent shipments beside courier performance →
  top senders + sources; Kasir home has no money totals.
- C7: KPI tile (TokoPhi `kpi-tile`) = 12 px muted icon + label, delta pill right (glyph + word, never colour alone),
  24 px bold tabular figure, one 12 px caption.
- C8: POS rows (DEC-239) = compact selectable courier rows (radio, whole row is the hit area, ~56 px: dot, courier mark,
  service + medal, ETA · billable kg · rule hint, price right); payment = 2×2 grid, never a 3 + 1 wrap.
- C6: settings (DEC-240, TokoPhi) = one framed white `Card` rail 260 px (group labels, icon tile + title + one-line
  subtitle rows; no summary card, DEC-243) beside a flush-left `max-w-4xl` column of `SectionCard`s with 2-col form
  grids; switches as `ToggleRow` (title + helper left, Switch right); `/pengaturan` opens the first section on desktop
  and is a grouped directory on phones; never a row of horizontal tabs.
- C10: topbar (DEC-243) = 3-column grid on desktop (breadcrumb · fixed-track search · utilities + account chip); the
  search never moves between pages; popovers stay compact (date range ~640 px, 31 px day cells).
- C9: sidebar taxonomy (DEC-241) = a menu per job, a sub-tree per screen of that job (tab-backed children active only
  on their tab); settings pages never appear in the main sidebar.

## Tokens

### Colour
Mengantar blue, light only (DEC-222) on the DEC-239 surface model: page canvas cool slate `#F6F7F9`; sidebar, topbar
(`white/95` + blur) and cards white with `#E2E8F0` hairlines (`slate-200/85`) and a 1px `0 1px 2px rgba(15,23,42,.03)`
shadow; accent
`#2E47BA`, tint `#EEF1FB`; ink `#203551`, muted `#55657D`; inputs `#7B879C`; chart Non-COD `#2E47BA`, COD `#E07A2F`
(always with legend). `color-scheme: light`; no dark palette at launch.
Status pairs as in `docs/visual/01` §2 (safe, warn, danger, pickup-warn).

### Type
System UI stack (`-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif`); mono only for INV,
AWB and thermal preview. Desk scale (DEC-239): 12 (labels, captions, table heads uppercase, badges — the floor) · 14
(body, inputs, buttons, sidebar, table cells) · 16 (card titles) · 24 (page title `h1`, KPI figures, bold tabular). On
phones inputs stay 16 and every control 44 px; controls 36 px on desktop (32/40 allowed), table head 40, rows 48.
`tabular-nums` for money and weights. User text size: 100 / 112 / 125 % via root rem.

### Radius
6–8 px controls, 10 px (`rounded-xl`) cards and panels, 8 px courier rows and menus; full radius for avatars, status
dots, delta pills and count badges.

### Spacing
Base 4 px; KPI tile 16/20 padding with 12 between groups and 4 inside a group; grid gap 10–12 (tiles) and 16–20
(cards); page padding 16 (phone) × 24–32 (desk), content max 1480 px. Charts: bars `maxBarSize 28`, radius 4, dashed
`#E2E8F0` gridlines, 12 px `#64748B` ticks, legend dots above the plot.

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
