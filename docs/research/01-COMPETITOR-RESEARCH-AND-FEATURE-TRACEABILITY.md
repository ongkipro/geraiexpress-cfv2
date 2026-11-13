# 01 — Competitor Research Synthesis & Feature Traceability (`geraiexpress-cfv2`)

- **Purpose:** carry the 2026-11 competitor research into the v2 repository as one English synthesis, and map
  every finding to the requirement or decision that answers it (or to an explicit deferral).
- **Evidence labels:** **[O]** observed in a public page, bundle, source map, store listing or review;
  **[I]** inferred from observations; **[U]** unknown. Clean-room: patterns only, no vendor code copied.
- **Full sources (not copied here):**
  - `~/Documents/work/research/gerai-ekspedisi-multi-kurir-2026-11/gerai-multi-courier-product-research.md`
  - `~/Documents/work/research/gerai-ekspedisi-multi-kurir-2026-11/rea-deep-dive-2026-11-12.md`
  - `~/Documents/work/research/gerai-ekspedisi-multi-kurir-2026-11/clean-room-system-blueprint.md`
  - Mengantar contracts: `~/Projects/geraiexpress/docs/research/geraiexpress-mengantar-{public-api,partner-api,operations-contract}.md`
  - Cold REA evidence (1.3 GB, sha256-verified): `/data/backups/research/gerai-ekspedisi-multi-kurir-2026-11/`

---

## 1. Market shape [O/I]

Two archetypes get confused:
1. **Online-seller aggregators** (KiriminAja, Biteship, Mengantar seller app, Lincah, Komship): built for sellers
   shipping their own stock. Strong rate comparison, COD, risk scores; weak at walk-in counters (no cash
   receipt, no shift drawer, no return desk).
2. **Agent / PPOB counter apps** (AutoKirim, SIMASRIM, bosAgen, Fastpay, Kurir Pedia): sell starter kits and
   partnership packages; have counters and printing, but freeze balances, mismatch quotes and leak data.

GeraiExpress v2 sits between them: an aggregator-grade engine (Mengantar) under a counter-grade workflow.

## 2. What users complain about (396 recent reviews, 177 negative, 11 apps) [O counts / I coding]

| Rank | Complaint | Count | v2 answer |
|---:|---|---:|---|
| 1 | Balance / COD withdrawal held | 37 | `Saldo Aman` per-resi reserve, never whole-balance freeze — PR-13, spec 09 |
| 2 | Slow / bot customer support | 31 | Proactive exception buckets so the outlet answers first — PR-20; WhatsApp share — PR-19 |
| 3 | App errors / login / OTP | 31 | Email OTP + resumable sign-up — PR-01; offline banner, no silent queue — visual 07 |
| 4 | KYC friction | 30 | Super Admin review instead of video calls — PR-02; optional business data — DEC-218 |
| 5 | COD failure / returns / lost parcels | 24 | `Meja Retur` + claim assistant — PR-17, PR-20 |
| 6 | Account suspended with balance inside | 14 | Balance lives in the outlet's own Mengantar account (Scheme 1) — DEC-203 |
| 7 | COD WhatsApp scams (data leak) | 12 | Privacy tracking, phone gate, recipient masking — PR-15, PR-19 |
| 8 | Courier pickup late / no-show | 8 | Pickup queue, cut-off timer, `Diantar Mandiri ke Cabang` — PR-16 |
| 9 | Unexpected fees | 7 | Line-by-line `Struk Jujur` — PR-07 |
| 10 | Weight / price changed after the fact | 5 (+ press reports) | Scale photo + agreed weight on receipt, `Selisih Berat` tab — PR-05, PR-20 |
| 11 | Receipt / Bluetooth printing | 5 | Web-Bluetooth ESC/POS + PDF fallback + test print — PR-08 |
| 12 | "Commission too small" | 0 | Discounts attract sign-ups; reliability keeps outlets — pricing is not the wedge |

**Product lesson [I]:** outlets join for discounts and leave over held money, weight disputes, slow printing
and leaked recipient data. v2 prioritises those four.

## 3. Competitor patterns worth adopting (clean-room) [O]

| Source | Pattern | Where in v2 |
|---|---|---|
| Komship (public source maps) | Pickup batch as its own entity; AWB/label per batch | spec 04, PR-16 |
| Komship | "Custom Label": up to 15 sender identities (name + phone ≤ 30 chars) | `Kirim Sebagai` brands — PR-14, PR-15 |
| Komship | 15 money fields per order (cashback, service fee, discount, net profit…) | spec 01 money columns |
| Komship | Ideal-balance withdrawal with explained buffer and per-resi reasons | `Saldo Aman` — PR-13 |
| Komship | 25 typed ledger transaction codes | Dual-book ledger types — spec 09 |
| Komship | Claim types + stuck buckets 5–14 / 15–30 / 31–60 / >60 days + `Belum Bisa / Bisa Klaim / Kadaluarsa` | PR-20 |
| Komship | Customer reputation by phone: <10 % green, 10–50 % amber, >50 % red | Local COD risk badge — spec 03 |
| bosAgen | Two-part 58 mm print (label + "Potong Disini" + receipt), BLE 20-byte chunks | PR-08, visual 04 |
| bosAgen | `retained_fund` per resi; `return_accept` batch; claim appeal (`banding_claim`) | PR-13, PR-17, PR-20 |
| bosAgen | Membership tiers SILVER → TITANIUM with progress | `tier_code` — spec 01 |
| SIMASRIM | Parallel quotes with medals; dynamic courier-required fields; Cargo highlight ≥ 10 kg | PR-06, visual 05 |
| Biteship | 11 independent label visibility toggles + preview | Masking presets matrix — visual 04 |
| Mengantar | Reseller flows; hide-sender-address warning modal about returns | Masking warning copy — PR-15 |
| KiriminAja | RTS rate by phone / district; staff shifts + activity log | spec 03 risk badge; PR-10 |
| Lincah | Proactive monitoring tabs (no update, over SLA, weight change) | `Kendala & Klaim` tabs — PR-20 |
| UKURIR | White-label brand, branded resi and WhatsApp, outlet markup | `<slug>.gerai.cc`, `counter_service_fee_idr` |
| Kurir Pedia | Points converted to balance; AI assistant over account data | MCP server — PR-21; points deferred (§5) |

## 4. Five differentiators no competitor combines [I]

1. Reseller pre-books at home, outlet weighs, prints the reseller's own brand, courier picks up at the outlet.
2. One 58 mm print: courier label on top, honest customer receipt below.
3. Per-resi reserve instead of whole-balance freeze.
4. Managed return desk for masked shipments (returns always come back to the outlet).
5. Public tracking that never exposes phone, address, COD amount or POD without a phone check.

## 5. Gaps found during this review and how v2 handles them

| Research module | Gap in v2 docs before this pass | Resolution |
|---|---|---|
| Counter: **customer-facing screen** (customer sees price, not cost) | Not specified | **PR-22 (P1)**: `Layar Pelanggan` view — second browser window/tab or phone showing locked quote, total and QRIS only |
| Counter: **auto-insurance prompt** for high-value goods | Not specified | **PR-07 extended**: goods value ≥ Rp500.000 shows an insurance prompt; fee stays `NULL` until a verified Mengantar field exists (spec 02) |
| Counter: **pickup vehicle hint** from dimensions | Partially (spec 04 `Mobil`) | Kept in spec 04; badge shown in courier selector |
| Masking: **anti-abuse controls** | Kill-switch only | **PR-15 extended**: masked/COD sends require a verified sender WhatsApp; masking quota for new outlets; audit log on every reveal of `true_sender` |
| Loyalty: **points / stamps for senders** | Not specified | **Deferred to P2 (PR-23)**: stamp card per sender (e.g. 10 sends → 1 discount), stored as outlet-funded promo, no e-money |
| Revenue: **multi-outlet owner** | `tenant_outlets` exists; no UX | **PR-24 (P2)**: outlet switcher in the sidebar header (visual 07) and per-outlet KPIs |
| Revenue: **marketplace drop-off receipts** | Not specified | Explicit non-goal for the first release (no marketplace drop-point contract) |
| Ops: **QRIS soundbox** | Not specified | Non-goal for launch; QRIS is recorded as a payment method only |
| Security: **no public source maps** | AGENTS.md + DEC | Kept; Komship is the counter-example |

## 6. Regulatory and provider unknowns (carry to counsel / Mengantar) [U]

1. Permenkomdigi 8/2025 Art. 77 (QR identity on postal receipts) vs local masked labels — counsel + physical
   hub scan per courier before masking is advertised (ADR-0005).
2. UU PDP implementing rules for recipient data retention — counsel (spec 05).
3. Cashback/points vs Bank Indonesia e-money rules — keep cashback as shipping credit; counsel before cash-out.
4. Mengantar Q23: IP restriction on Public API writes / label generation for Partner-created sellers (spec 10).
5. Real discounts received by new accounts at competitors — not published; do not use in marketing.
