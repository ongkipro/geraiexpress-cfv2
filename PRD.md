# PRD.md — Product Requirements Document (`geraiexpress-cfv2`)

- **Product:** GeraiExpress v2 — Multi-Courier Counter POS, Mengantar-Synced Ledger & White-Label Mini-Site Platform
- **Product Owner:** Paduka Ongki
- **Shipping Upstream:** Official **Mengantar** Partnership (`ongkirich`)
- **Evidence Basis:** Teardowns of 11 Indonesian shipping/agent platforms, 396 Google Play reviews (177 negative categorized), practitioner accounts, and verified Mengantar Partner/Public API contracts (`2026-09-15` to `2026-11-12`).
- **Product Language:** All customer, cashier, owner, and admin user interfaces ship in natural, Indonesian-market-friendly **Bahasa Indonesia (EYD V)**.

---

## 1. Problem Statement & Market Wedge

Indonesian neighborhood shops — *konter pulsa/HP, fotokopi & ATK, toko kelontong, ruko jasa* (core owners aged **35–55+**) — want to accept multi-courier parcels without single-courier branch deposit/equipment mandates, 500m–1km spacing locks, or monthly sales quotas.

Existing software fails them in two ways:
1. **Online-Seller Aggregators (OMS):** built for e-commerce warehouses shipping their own inventory. They lack customer cash/QRIS receipts (`struk`), shift drawer reconciliation, 58mm label+receipt combo printing, and outlet return-intake workflows; several leak recipient PII on public tracking pages, fueling COD WhatsApp scams.
2. **Hype Agent / PPOB Apps:** push Rp899k–Rp25.9M starter kits with inconsistent 25–40% headline claims, suffer Bluetooth printing and quote-vs-charge mismatches, and **freeze entire COD balances whenever a single parcel enters return (`RTS`)**.

### Value Proposition
> **Turn any existing shop into a trusted multi-courier shipping counter using the phone/laptop already on the desk — complete with its own `<slug>.gerai.cc` promo & QR pre-booking site, honest quote-locked receipts, 3-way dropship masking (with courier pickup at the outlet), and Rupiah-exact financial sync with Mengantar.**

---

## 2. Personas & Core Jobs-to-be-Done

| ID | Persona | Profile | Core Job-to-be-Done | Success Metric |
|---|---|---|---|---|
| **P1** | **Gerai Admin (Outlet Owner)** | Shop owner aged 35–55+ | See exact daily net profit, verify shift cash drawers, keep net cost hidden from staff, sync Mengantar top-ups/debits/returns to the Rupiah, and promote the shop locally | Shift & Mengantar balance reconciliation in < 2 min; 0 unexplained variance |
| **P2** | **Kasir (Counter Operator)** | Counter employee | Weigh, quote, collect cash/QRIS, and print label+receipt in < 45s (or < 15s via QR pre-booking) without volumetric or district (`Cordest`) mistakes | Median counter checkout <= 45s |
| **P3** | **Walk-in Sender** | Neighbor / micro-UMKM sending 1–3 parcels | Pick cheapest/fastest courier, pay the exact quoted price, get a physical/WA receipt and safe tracking link | 0 quote-vs-receipt disputes |
| **P4** | **Local Reseller / Dropshipper** | Online seller near the outlet without courier accounts | Pre-book from home on `<slug>.gerai.cc`, drop parcels at the outlet, print **their own shop name** as sender while couriers pick up from the outlet | Weekly repeat batch drop-offs |
| **P5** | **Parcel Recipient** | End buyer (COD / Non-COD) | Track parcel ETA without phone/address leakage to WhatsApp scammers | 0 PII fields exposed on anonymous tracking responses |
| **P6** | **Super Admin (Platform)** | GeraiExpress operations | Approve outlets → provision Mengantar seller accounts, manage per-outlet × courier discounts, monitor sync & COD phone risk without impersonating outlets | Outlet onboarding < 3 min post-approval |

---

## 3. Functional Requirements (`P0` Launch · `P1` Scale · `P2` Future)

### 3.1 Outlet Onboarding, Mengantar Seller Provisioning & White-Label Host
| ID | Requirement | Pri | Acceptance Criteria |
|---|---|---|---|
| **PR-01** | Resumable Indonesian sign-up with Email OTP + Turnstile capturing business profile, outlet pickup coordinates, verified Mengantar `area_id` (subdistrict/postcode), and business WhatsApp. | P0 | Blocks submission until pickup `area_id` resolves against Mengantar address search. |
| **PR-02** | Super Admin approval provisions **1 dedicated Mengantar seller account** via Partner API (`direct` in Sandbox, static-IPv4 `partner-relay` in Production) with crash-safe state transitions (`registration_pending` → `connected`). If `409 EMAIL_ALREADY_REGISTERED` is returned, transitions to `existing_account_required` and offers **BYOK** (verified owner supplies their existing Mengantar seller API key → `byok_connected`) or owner email correction — never blind retry. | P0 | Never creates duplicate sellers for one tenant; ambiguous network failures enter recoverable reconciliation. |
| **PR-02b** | **Manual Per-Seller Webhook Setup & Polling Floor:** because Mengantar has no Partner webhook-provisioning API, `Pengaturan › Mengantar` (`/pengaturan/mengantar`) guides the Outlet Owner to paste their unique `https://hooks.geraiexpress.com/webhooks/mengantar/<token>` URL into Mengantar Seller Settings and save the resulting Webhook Secret (`webhook_state`: `unconfigured → awaiting_seller_setup → active \| secret_mismatch \| paused`). Until `active`, hourly `GET /order` polling serves as the authoritative status floor. | P0 | Status tracking works via hourly polling from day one even before seller webhook setup is completed. |
| **PR-03** | Instant activation of **`https://<slug>.gerai.cc`** upon outlet approval (enforcing reserved-word checks), plus optional Pro custom-domain CNAME onboarding via *Cloudflare for SaaS*. | P0 | `<slug>.gerai.cc` serves SSR pages immediately with zero Worker redeploy. |

### 3.2 Unified Short `INV` Slug, Counter POS, Gram Weight Input & Printing
| ID | Requirement | Pri | Acceptance Criteria |
|---|---|---|---|
| **PR-04** | **Unified Short Shipment Slug (`INV ID`):** clicking `Kiriman Baru` (or submitting a mini-site pre-booking) allocates one **7-char CSPRNG Crockford Base32 slug** (`crypto.getRandomValues`, no `0/O/1/I/L/U`, e.g., `8k4m2p7`, displayed `INV 8K4M2P7`) unique per tenant `(tenant_id, slug)` and used across workspace URLs, receipts, QR pre-booking, tracking URLs, and Mengantar `destinationMark` (matched case-insensitively). | P0 | No separate `PAY-`, `BK-`, or verbose `<PREFIX>-<date>-<seq>` numbers exist for the shipment. |
| **PR-05** | **Integer Gram Weight Input (`default: 1000` g) + Mistake Guards:** defaults to `1000` with a 1-click `[ gram ● \| kg ]` segmented toggle (`1250 g ⇄ 1,25 kg`), quick chips (`500 g`, `1.000 g`, `2 kg`, `5 kg`, `10 kg`), volumetric calculator (`/6000` vs `/4000` per courier + rounding tolerance), and unit-error warnings if `< 10` in `gram` mode or `>= 100` in `kg` mode. | P0 | Stored/API weight is strictly integer grams; volumetric math is shown line-by-line on screen and receipt. |
| **PR-06** | **Smart Multi-Courier Selector:** parallel quotes across active couriers (`Non-COD`, `COD Barang`, `COD Ongkir` for Regular; **Cargo services quoted & dispatched `Non-COD` only** until cargo COD is verified in sandbox); `Reguler` vs `Cargo` tabs (Cargo recommended at actual or volumetric weight >= 5,000 g per DEC-225; each courier's cargo minimum still applies); rank badges (`Termurah`, `Tercepat`, `Cair COD Terbesar`); local destination RTS history; purple `Drop-off saja` warning from `tenant_courier_prefs.pickup_mode` + SiCepat `unsupportedPickup`; and dynamic per-courier fields. | P0 | Cashiers see customer tariff only; Owners optionally toggle net cost & margin preview. |
| **PR-07** | **Quote-to-Receipt Lock (`Struk Jujur`) & Counter Payment Recording:** locks `quote_snapshot_id` through payment and **records** (never processes) the counter payment — `paid \| unpaid` plus method `QRIS gerai`, `Tunai` with change calc, `Transfer`, or `Deposit Reseller`; `Bayar nanti` prints with the INV marked unpaid (DEC-220) — supports 100%-outlet-kept packing add-ons (`Kardus`, `Bubble Wrap`), and issues append-only receipt records (reversals via explicit `Void`). Goods value ≥ Rp500.000 shows an insurance prompt (`Asuransikan paket ini?`); the insurance fee stays `NULL` until a verified Mengantar field exists. | P0 | Editing weight/dimensions/service forces re-quote; stale quotes cannot print. Staff names are omitted on customer-facing receipts. |
| **PR-08** | **Thermal Printing (PC-first, DEC-224):** (a) **primary — 100 mm thermal stickers from the outlet PC browser in three formats (DEC-224): `10×15 · Paket + Bukti` (default — 10×10 parcel label + 10×5 sender stub), `10×10 · Paket saja`, `10×15 · Paket saja`**, plus A4 (1/2/4-up) PDF fallback, with `Belum Tercetak / Tercetak` tracking and bulk print ≤ 50; (b) **secondary — 58mm/80mm Web-Bluetooth ESC/POS (`Potong Disini`)** printing label + receipt in 1 click (20-byte BLE chunks, batch keep-alive, 32-col preview). | P0 | Primary path (DEC-224 amendment): the outlet PC browser prints exact-size 100 mm PDFs to a USB/network thermal printer with no wrapper app; the 58 mm Web-Bluetooth roll works on Android/Chrome as the secondary path. |
| **PR-09** | **`Buat Pengiriman` Hub — Multi-Parcel Entry (`/kasir/multi`) & Quick Front-Desk Checker (`/kasir/cek-cepat`, `DEC-225`):** batch entry for resellers dropping multiple parcels at once (manual rows or Excel/CSV import up to 200 rows with per-row checks and a `Riwayat Massal` history, DEC-229), a zero-draft quick rate/volumetric/COD-risk checker for walk-in inquiries, and `Cek Resi` for INV/AWB/phone lookup. | P0 | Quick checks never pollute draft `INV` lists; 1-click converts a check into a real `INV`. |
| **PR-10** | **Per-Shift Cash Drawer Close:** records opening float, running cash vs non-cash totals, blind/guided physical cash count at close, and mandatory reason codes on variance. | P0 | Owner dashboard flags any non-zero shift variance immediately. |

### 3.3 Dual-Book Finance & Precision Mengantar Sync
| ID | Requirement | Pri | Acceptance Criteria |
|---|---|---|---|
| **PR-11** | **Super Admin Discount & Cashback Matrix:** per-outlet × courier/service integer `bps` rules with effective timestamps and audit reasons; the requested discount is capped by `max_discount_bps` (DEC-230) while cost always uses `min(assigned, observed)`. | P0 | Ceiling `max_discount_bps` (30 % default, configurable); each rule tracked `Belum diterapkan → Sesuai / Selisih` against observed Mengantar discount; customers always pay the publish tariff; no subsidy (DEC-226, DEC-230). |
| **PR-12** | **Precision Mengantar Financial Sync (`Keuangan`):** syncs `GET /invoices` (observed `typeAddBalance`, `typePayment`, `typeReconciliation`, `typeRefund`, `typeWithdraw`, plus bundle-observed `typeCorrection` and any future unknown types routed to `Selisih Sync`, alongside running `balanceAmount`), reconciles them 1:1 against local `INV` slugs, and handles `isPaid: false` unpaid orders via `POST /order/pay-unpaid` once top-up clears. | P0 | Local Mengantar Mirror balance matches `balanceAmount` from Mengantar; discrepancies or unknown invoice types surface in `Selisih Sync`. |
| **PR-13** | **Anti-Freeze Return Risk Reserve (`Saldo Aman`):** calculates estimated return-shipping exposure strictly for active `RTS` / disputed `INV`s without freezing unrelated funds, displaying the exact contributing `INV` list to the Owner. | P0 | Solves the #1 negative review pain across competing agent apps. |

### 3.4 Three-Way Masking, Contacts (`Pengirim` & `Penerima`), Pickup Manifest & Return Intake
| ID | Requirement | Pri | Acceptance Criteria |
|---|---|---|---|
| **PR-14** | **Dedicated Two-Submenu Contacts (`Kontak > Pengirim` & `Kontak > Penerima`):** separates walk-in senders & reseller store brands (`Kirim Sebagai`) from recipient address books (`area_id` + COD success/RTS counters). | P0 | 1-click auto-fill in POS from phone or name search. |
| **PR-15** | **Three-Way Masking with Outlet Pickup:** pickup is always the outlet's address; the owner enables masking and the allowed presets in `Pengaturan › Label & Privasi` (DEC-231); operators then choose 1 of the enabled presets (`Standar Gerai`, `Dropship Toko`, `Privasi Penerima COD`, `Full Nama Gerai`) with prohibited-goods acknowledgment and Super Admin per-outlet kill-switch. Masked and COD sends require a sender WhatsApp confirmed at the counter (`wa_verified_at`, operator click-to-chat confirmation; automated OTP is P2), new outlets get a `masking_daily_quota`, and every reveal of `true_sender` on an issued masked `INV` is audit-logged (ADR-0005). | P0 | True sender & recipient identities remain immutable in internal snapshots for returns/audits. |
| **PR-16** | **Courier Pickup Queues & Signed Handover Manifest:** groups `Siap Pickup` parcels per courier with cut-off timers and vehicle hints, enforces barcode scan-into-sack validation (loud red alert on wrong courier), captures courier signature, and supports `Diantar Mandiri ke Cabang` fallback. | P0 | Provides hard handover evidence if a parcel goes missing before hub scan. |
| **PR-17** | **Mandatory Outlet Return Intake (`Meja Retur`):** scans arriving RTS AWBs, reveals `true_sender`, logs parcel condition + R2 photo, sends 1-click WhatsApp notice with a **4-digit pickup OTP**, and records final handover back to the sender/reseller. | P0 | Zero orphaned dropship returns at the outlet counter. |

### 3.5 Owner Summary & Analytics Home, Mini-Site (`*.gerai.cc`), OpenAPI & MCP
| ID | Requirement | Pri | Acceptance Criteria |
|---|---|---|---|
| **PR-18** | **Gerai Admin Home (`Dashboard`):** displays KPIs (shipments, recorded paid vs unpaid INV, net profit, synced Mengantar balance & active COD) for a shadcn period filter (WIB presets plus calendar date range, default `7 hari terakhir`, DEC-221, `docs/visual/08` §1), a shipment chart (Non-COD vs COD, per hour for Hari ini/Kemarin, per day up to 92 days, per week beyond), a shipment history list with payment and delivery status, urgent action list, per-courier SLA & RTS %, top senders/resellers, and `<slug>.gerai.cc` pre-booking share. | P0 | Cashiers visiting `/` see only operational counter tasks without profit/balance metrics. |
| **PR-19** | **Outlet Mini-Site (`<slug>.gerai.cc`) + QR Pre-Booking + Privacy Tracking:** fast Indonesian SSR page with store info/map/WA, publish rate check, `Kirim dari Rumah` (`INV` QR generator with 48h draft TTL), and privacy-safe tracking (initials + city only; 4-digit recipient phone gate unlocks full delivery recipient note & POD photo when provided by upstream). | P0 | Anonymous tracking JSON never contains phone numbers, street lines, COD amounts, or POD URLs. |
| **PR-20** | **Proactive Exception & Claim Assistant:** buckets `Tidak Bergerak (48 jam–4 hari · 5–14 hari · 15–30 hari · >30 hari)`, `Gagal Antar`, `Selisih Berat / Cordest`, and per-courier claim countdown timers with scale/packing photos attached. | P0 | Prevents missed courier claim windows (e.g., 2×24h damage / 3×24h lost). |
| **PR-21** | **Scoped OpenAPI 3.1 & Remote MCP Server:** `@hono/zod-openapi` endpoints (`/api/v1/*`, `/api/v1/docs`) and Streamable HTTP MCP (`/mcp` & `<slug>.gerai.cc/mcp`) authenticated via hashed, scope-limited `gx_live_...` keys (delivered in Milestone M5). | P0 | Enables e-commerce plugins, WhatsApp reseller bots, and owner AI assistants safely. |
| **PR-22** | **Customer-Facing Screen (`Layar Pelanggan`):** a second window/tab or a phone paired by QR shows only the locked quote, line items, total and the outlet QRIS — never net cost, margin or Mengantar balance. | P1 | Pairing is per shift; closing the shift unpairs it. |
| **PR-23** | **Sender Stamp Card:** outlet-funded loyalty per sender contact (e.g. 10 paid sends → one discount), recorded as an outlet promo, never as e-money or withdrawable value. | P2 | Counsel review before any cash-out variant. |
| **PR-24** | **Multi-Outlet Owner:** outlet switcher in the sidebar header and per-outlet vs aggregate KPIs (labelled) for one owner who is `gerai_admin` of more than one `tenants` row. | P2 | Each tenant keeps its own Mengantar seller account and `<slug>.gerai.cc` (Scheme 1). |

---

## 4. Explicit Non-Goals (Initial Release)
- PPOB billers, pulsa/gaming top-ups, travel ticketing, or banking EDC hardware sales.
- Holding pooled public e-money outside Mengantar's official seller balance architecture.
- Super Admin operational impersonation of outlet cashiers.
- Marketplace drop-point receipts (no drop-point contract), QRIS soundbox hardware, and courier-branch deposit schemes.

Research traceability for every requirement: `docs/research/01-COMPETITOR-RESEARCH-AND-FEATURE-TRACEABILITY.md`.
