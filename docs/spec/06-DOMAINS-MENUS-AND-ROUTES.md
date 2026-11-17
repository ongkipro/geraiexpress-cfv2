# 06 — Domains, Subdomains, Short `INV` Slugs & Compact Menu Architecture

This specification is the single source of truth for **host routing**, **unified short `INV` slug numbering**, and **compact Indonesian navigation** across every user role.

---

## 1. Domain & Subdomain Map

| Host / Pattern | Audience | Purpose | Auth Boundary |
|---|---|---|---|
| `geraiexpress.com` | Prospective outlet owners | Indonesian brand landing site, live tariff simulator, 1-click POS sandbox, sign-up entry | Public (no session cookie) |
| `app.geraiexpress.com` | **Gerai Admin** & **Kasir** | Daily counter POS, shipments, contacts, Mengantar finance sync, and outlet settings | `__Host-ge_app` |
| `owner.geraiexpress.com` | **Super Admin** | Outlet approvals, Mengantar provisioning, discount rules, cross-outlet risk & sync oversight | `__Host-ge_owner` + **TOTP** |
| `hooks.geraiexpress.com` | Mengantar webhook sender | `POST /webhooks/mengantar/:token` HMAC-verified status ingest → Queue | HMAC signature only |
| **`<gerai-slug>.geraimitra.com`** | Walk-in neighbors & local resellers | **Outlet White-Label Mini-Site**: store profile/map/WA, rate check, QR pre-booking, safe tracking & digital receipt | Public (separate `eTLD+1` — zero cookie overlap) |
| `relay.geraiexpress.com` | `apps/worker` only | Production Partner API egress relay, co-hosted on `99ribu-prod` (`149.28.129.53`, DEC-235, `docs/spec/10`); **not** served by the Worker | HMAC `X-Relay-Signature` |
| `cname.geraimitra.com` *(CNAME target, DEC-228)* | Pro outlets with their own domain (e.g., `kirim.tokobudi.id`) | *Cloudflare for SaaS* custom hostname → same Worker; lifecycle, root-domain branches and routing rules in `docs/spec/11` | Public (same as mini-site) |

**`gerai-slug` Validation:** `3–30` chars matching `^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$`; blocks reserved platform/protocol words (`www`, `app`, `api`, `owner`, `admin`, `hq`, `hooks`, `relay`, `custom`, `mcp`, `docs`, `mail`, `mengantar`) and official courier brand names (`jne`, `jnt`, `sicepat`, `spx`, `pos`, `lion`, `sap`, `paxel`, `anteraja`, `idexpress`, `ninja`, `tiki`). Slugs may not end in `-stg` (reserved for staging mini-sites, spec 07 §7). `cname` and `fallback` are reserved (Cloudflare for SaaS target and fallback origin, spec 11 §1); `probe` is reserved for the platform's synthetic routing tenant (`OBSERVABILITY.md`).

---

## 2. Unified Short Shipment Slug = `INV ID` (`DEC-211`)

One shipment has **one short human-friendly identifier from creation to completion**:

1. **Format & Per-Tenant Scope:** `7` characters generated via CSPRNG (`crypto.getRandomValues`) from unambiguous **Crockford Base32** (`23456789abcdefghjkmnpqrstvwxyz` — excludes `0/O/1/I/L/U`; $30^7 = 21.8\text{B}$ namespace per tenant, `PRIMARY KEY (tenant_id, slug)`), e.g., `8k4m2p7` (displayed uppercase as **`INV 8K4M2P7`** or **`#8K4M2P7`**).
2. **Universal Reuse Across Surfaces:**
   - **Counter POS URL:** clicking `+ Kiriman Baru` immediately opens `https://app.geraiexpress.com/kiriman/8k4m2p7`.
   - **Mini-Site QR Pre-Booking:** submitting `Kirim dari Rumah` on `berkahjaya.geraimitra.com` allocates `8k4m2p7` (48h draft TTL); scanning that QR at the counter opens the exact same `/kiriman/8k4m2p7` draft — **no code conversion**.
   - **Customer Receipt (`Struk Jujur`) & Invoice ID:** printed as `INV: 8K4M2P7` (revisions/voids append `v1, v2` history under `8k4m2p7`; no separate `PAY-` numbers).
   - **Digital Receipt & Public Tracking URLs:** `berkahjaya.geraimitra.com/inv/8k4m2p7` and `berkahjaya.geraimitra.com/lacak/8k4m2p7` (works both before AWB issuance and alongside courier AWB search afterward).
   - **Mengantar Reconciliation Key:** sent as `destinationMark: "8K4M2P7"` on `POST /order` and matched **case-insensitively** (`LOWER(destinationMark) == slug`) on read-back and reconciliation.

---

## 3. Compact Gerai Workspace Navigation (`app.geraiexpress.com` — **7 Top-Level Menus**, DEC-241)

Designed for zero cognitive overload for 35–55+ shop owners. A top-level menu is a job; its **sidebar sub-tree** lists
the screens of that job (DEC-237, DEC-241), including the specialist tabs of a page (`/kiriman?tab=retur`), never a
15-item flat sidebar. `Pengaturan` stays one entry (its 10 pages have their own rail, DEC-240). `Shift Loket` is
deferred to post-launch (TASK-704): no menu, command or status row; `/kasir/shift` stays reachable by URL.

| # | Indonesian Menu | Route & In-Page Tabs / Sub-Menus | `Gerai Admin (Owner)` | `Kasir (Operator)` | Purpose |
|---:|---|---|:---:|:---:|---|
| **1** | **`Dashboard`** | `/` | **Summary & Analytics** (KPIs, daily profit/volume chart, courier RTS %, top senders, `geraimitra.com` share, alerts) | **Tugas Loket Hari Ini** (pickup queue, active shift, uncollected returns, `+ Kiriman Baru` CTA — **no profit/balance**) | Role-tailored home screen (`DEC-213`). |
| **2** | **`Buat Pengiriman`** | Sidebar tree (DEC-237, DEC-241, also in the phone Sheet): `Kiriman Satuan (/kasir — single-screen 60/40 POS, issues without leaving the page; /kiriman/:slug for existing drafts)` · `Paket Massal (/kasir/multi, manual + Excel/CSV)` | ✓ | ✓ (customer price only) | Single-parcel POS and multi-parcel batch entry (`DEC-225`: named `Buat Pengiriman` so the menu action is never confused with the `Kasir` staff role). |
| **3** | **`Cek Ongkir & Resi`** | Sidebar tree (DEC-241; visible with `buat-pengiriman`): `Cek Ongkir (/kasir/cek-cepat)` · `Cek Resi (/kasir/cek-resi)` | ✓ (+ optional `👁 Tampilkan Komisi`) | ✓ | Zero-draft front-desk rate/COD-risk checker and tracking lookup. |
| **4** | **`Kiriman`** | Sidebar tree (DEC-241): `Daftar Kiriman (/kiriman — tabs Semua · Belum Dibayar · Draf QR · Menunggu Saldo)` · `Pickup & Surat Jalan (/kiriman?tab=pickup)` · `Cetak Resi Massal (/kiriman/cetak-massal)` · `Riwayat Massal (/kiriman/massal)` · `Meja Retur (/kiriman?tab=retur)` · `Kendala & Klaim (/kiriman?tab=kendala)` | ✓ (+ cost/margin columns & CSV export) | ✓ (operational columns, print, manifest scan, return intake) | Unified parcel lifecycle hub with live badge counts per tab. |
| **5** | **`Kontak`** | **2 Dedicated Sub-Menus (`DEC-212`):**<br>• **`Data Pengirim`** (`/kontak/pengirim`)<br>• **`Data Penerima`** (`/kontak/penerima`) | ✓ (+ reseller deposit ledger) | ✓ (add/edit/select) | Separates walk-in senders & reseller masking brands (`Kirim Sebagai`) from recipient destination addresses & COD track records. |
| **6** | **`Keuangan`** | Sidebar tree = in-page tabs (`?tab=`, DEC-241): `Ringkasan & Saldo` · `Mutasi Mengantar` · `Laba per Kiriman` · `Cadangan Retur` · `Selisih Sync` (`Kas Loket & Shift` deferred with Shift Loket, TASK-704) | **✓ (Exclusive)** | **✗ (Hidden & API-blocked)** | Dual-book accounting: local counter cash/QRIS + precision sync with Mengantar `GET /invoices` (`09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md`). |
| **7** | **`Pengaturan`** | `/pengaturan` · Settings sub-menu (DEC-223): **Gerai** `Profil Gerai` · `Mini-Site` · `Data Usaha` — **Operasional** `Ekspedisi Aktif` · `Printer & Struk` · `Packing & Biaya Tambahan` — **Akun & Akses** `Anggota` · `Mengantar` · `API & MCP` (`/pengaturan/<item>`) | **✓ (Full)** | Printer Bluetooth pair/test modal only | Configure `<slug>.geraimitra.com` + QR poster, toggle active couriers, set cardboard prices, manage staff invites, and issue OpenAPI/MCP keys. |

Owner-only `/status` (`Status Operasional`, DEC-244) sits outside the menus: topbar icon beside the bell, `⌘K`, and the
sidebar status link; API `GET /api/app/status`, `POST /api/app/status/recheck` (`app_owner`, recheck 6/min).

Auth, onboarding, detail and sub-routes for every menu, with page content and role differences: `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md` §3.

---

## 4. Compact Super Admin Navigation (`owner.geraiexpress.com` — **5 Top-Level Menus**)

All routes require `aal2` TOTP verification and enforce strict non-impersonation (`DEC-209`):

| # | Indonesian Menu | Route & In-Page Tabs | Core Platform Governance Responsibilities |
|---:|---|---|---|
| **1** | **`Ringkasan`** | `/` | Network-wide shipment volume, active outlets, pending applications, Mengantar webhook/sync health, and variance alerts. |
| | *Recheck actions (DEC-244, `owner_aal2`, rate-limited, audited)* | `POST /sistem/kesehatan/periksa` · `POST /tarif/verifikasi-ulang` · `POST /gerai/:slug/sinkron` · `POST /domains/periksa` · `POST /pengawasan/sinkron-keuangan` | Operational reads and scheduled-job triggers only; none creates, pays, edits or cancels a gerai shipment (DEC-209). |
| **2** | **`Gerai`** | `/gerai` · Tabs = sidebar sub-tree (DEC-241): `Pengajuan Baru` · `Direktori Gerai` · `Domain Mitra (*.geraimitra.com)` | Review applications → **`Setujui & Buka Akun Seller Mengantar`**, monitor per-outlet health/RTS %, toggle `Masking Aktif`, freeze outlets, inspect Cloudflare for SaaS SSL status. |
| **3** | **`Tarif & Kurir`** | `/tarif` · Tabs = sidebar sub-tree (DEC-241): `Diskon & Cashback` · `Permintaan Mengantar` · `Kebijakan Diskon` | Set per-outlet × courier/service integer `bps` discounts & cashback (ceiling `max_discount_bps`, default 30 %; each rule verified against the observed Mengantar discount, DEC-230); maintain courier volumetric divisors, COD caps, and claim deadlines. |
| **4** | **`Pengawasan`** | `/pengawasan` · Tabs = sidebar sub-tree (DEC-241): `Pantauan Kiriman` · `Radar Risiko COD` | Search any `INV` or AWB across tenants, monitor `reconciliation_needed` / `provider_unpaid_hold` / sync-mismatch queues, and audit cross-outlet COD phone RTS scores. |
| **5** | **`Sistem & Audit`** | `/sistem` · Tabs = sidebar sub-tree (DEC-241): `Kesehatan Integrasi` · `Log Audit` · `Akses Admin` · `Profil Perusahaan` | Monitor Partner API quota & `partner-relay` reachability, inspect immutable audit logs, manage Super Admin recovery TOTP accounts, and edit the platform operator legal profile (`platform_legal_profile`, TOTP + audit reason). |

---

## 5. Public Surface Routes

1. **Outlet Mini-Site (`https://<gerai-slug>.geraimitra.com`):**
   - `/` — Storefront header (logo, hours, map pin, WA CTA) + 3 instant tabs: `Cek Ongkir` · `Kirim dari Rumah (QR)` · `Lacak Paket`.
   - `/kirim/:slug` — Shareable QR Pre-Booking card (`INV 8K4M2P7`) ready for counter scan.
   - `/lacak` & `/lacak/:kode` — Privacy-safe tracking (accepts `INV` slug or courier AWB; 4-digit recipient phone gate unlocks full delivery recipient confirmation and POD photo when provided by upstream).
   - `/inv/:slug` — Privacy-safe digital customer receipt.
   - `/mcp` — Rate-limited public MCP endpoint (`08-OPENAPI-AND-MCP-CONTRACT.md`).
2. **Platform Brand Site (`https://geraiexpress.com`):**
   - `/` · `/fitur` · `/cara-kerja` · `/simulasi-kasir` (1-click interactive counter sandbox, no login wall) · `/hubungi-kami` · `/ketentuan` · `/privasi`.
