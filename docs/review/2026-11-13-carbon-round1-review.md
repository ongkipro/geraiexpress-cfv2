## Decision: REQUEST_CHANGES

### Executive Summary

The newly added VPS Partner Relay architecture (`docs/spec/10`, `DEC-219`, `ADR-0003`), App Shell & Page Inventory (`docs/visual/07`, `design/admin-contract.json`), Competitor Traceability (`docs/research/01`, `PR-22..PR-24`), and Legal Profile placeholders (`DEC-218`) are architecturally cohesive and preserve `DEC-209` Super Admin non-impersonation as well as `README.md` `DEC-201..DEC-219` / `PR-01..PR-24` ranges.

However, **4 P1 defects** and **7 P2 defects** must be resolved before M1 implementation starts:
1. `docs/spec/10` justifies omitting replay protection and retrying timeouts by claiming all four Mengantar Partner routes are reads or idempotent on `externalUserId` — directly contradicted by `geraiexpress-mengantar-partner-api.md` for `POST /sellers/api-key/regenerate`, where replay/retry rotates both `apiKey` and an **unrecoverable** `callbackSecret`.
2. `PR-15` (`P0`) adds mandatory sender WhatsApp verification, new-outlet masking quotas, and `true_sender` reveal auditing with no corresponding D1 columns, WABA/OTP mechanism, or spec rules.
3. `DEC-218`'s `platform_legal_profile` rendering rule in `docs/spec/01` and `docs/visual/07` omits the public-page exclusion for `npwp` (and applies corporate PT footers to `<slug>.gerai.cc` white-label mini-sites).
4. `docs/visual/07`'s `56 px` mobile header and always-primary header `+ Kiriman Baru` button will fail its own mandatory `admin-geometry.mjs` (`header-height: [64]` on `all` viewports) and `dotuiux check` (`primary-actions`) gates.

---

### Focused Verification Answers (Checklist)

- **Focus 1 (`docs/spec/10` + `DEC-219` + `ADR-0003`):**
  - *Single HMAC secret & no Cloudflare Access:* **Sound** over `Full (Strict)` TLS + Origin CA (`10:39,142`), 64 KB body cap (`10:106`), ±60 s window (`10:96`), and Cloudflare WAF rate limiting (`10:113`).
  - *Replay / provider-idempotency claim:* **Not supported** across all 4 routes (`P1-1`): `POST /sellers` **is** idempotent on `externalUserId` (`partner-api.md:142,297`) and `POST /sellers/list` **is** a read (`:155`), but `POST /sellers/api-key` takes `sellerId` and creates a key if absent (`:173`), while `POST /sellers/api-key/regenerate` takes `sellerId` and **rotates `apiKey` + `callbackSecret` on every call** (`:100,187,192` — harmful on replay/retry).
  - *Header forwarding & API-key logging:* **Sound.** Forwarding exact UTF-8 body bytes and exclusively `content-type`, `partner-id`, `timestamp`, `signature` (`10:104-105`) matches `partner-api.md:80-95` and strips `X-Forwarded-For`/`CF-Connecting-IP` before Mengantar's IP check. Banning all body/header logs (`10:108-109`) protects `apiKey` (returned by `/sellers`, `/api-key`, and `/regenerate`), `callbackSecret`, and owner PII (ensure Traefik access logs keep headers/bodies off).
  - *Rejected pull mode & Reserved-IP procedure:* Pull-mode rejection (`10:118-121`) is well-grounded in Mengantar's ±5 min signature rule (`partner-api.md:83,100`). Reserved-IP primary-interface rule (`10:169-171`) is sound; see `P2-1` (`RELAY_SECRET_PREVIOUS`) and `P3-4` (pre-DNS-switch test).
- **Focus 2 (`docs/visual/07`):** Preserves `DEC-209` (`07:87,138-144` — zero Super Admin shipment creation/impersonation) and hides/403s `/keuangan` for Kasir (`07:27,128`); see `P1-4`, `P2-3`, `P2-5`, `P3-6` for geometry/primary-CTA/Kasir-settings conflicts.
- **Focus 3 (`docs/research/01` + `PR-22..PR-24`, `PR-07`, `PR-15`):** Review counts (`396` / `177` / `11` apps, ranks 1–12) and external file references match `~/Documents/work/research/gerai-ekspedisi-multi-kurir-2026-11/*.md`; see `P1-2`, `P2-3`, `P2-4`, `P2-6`, `P3-3` for overclaims and unbacked PR mappings.
- **Focus 4 (`DEC-218`):** Covered in `P1-3` and `P3-2`.
- **Focus 5 (Repo-wide):** `README.md:51-52` (`DEC-201..DEC-219`, `PR-01..PR-24`) is current; see `P2-2`, `P2-7`, `P3-1` for stale ranges in `ARCHITECTURE.md`/`ROADMAP.md` and unfilled `DESIGN.md`.

---

### Findings (`P0`–`P3`)

*(No `P0` findings.)*

#### P1 — Blocking Correctness, Security & Contract Defects

**P1-1 — False Partner-route idempotency claim & destructive `api-key/regenerate` timeout/replay rule.**
- **Evidence:** `docs/spec/10-PARTNER-RELAY-VPS-STATIC-EGRESS.md:96-98` claims *"the four routes are either reads or provider-idempotent on `externalUserId`"*, and `docs/spec/10:127-128` + `docs/adr/ADR-0003-mengantar-partner-and-egress-relay.md:25` tell the Worker to reconcile any `maybe_sent` timeout via `POST /sellers/list { externalUserId }` before retrying. In `/home/ongki/Projects/geraiexpress/docs/research/geraiexpress-mengantar-partner-api.md:100,173,187-196`:
  1. `POST /sellers/api-key` and `POST /sellers/api-key/regenerate` take `{ sellerId }`, not `externalUserId`; `/api-key` creates a key if absent (`:173`).
  2. `POST /sellers/api-key/regenerate` is **non-idempotent**: every call immediately invalidates the prior `apiKey` and rotates `callbackSecret` (`:187`). Replaying or retrying `regenerate` revokes the key stored from the first response, and **`POST /sellers/api-key` cannot recover the rotated `callbackSecret`** (`:192`), breaking webhook verification until manual seller intervention.
- **Smallest fix:**
  1. In `docs/spec/10:96-98`, base the no-external-nonce-store rationale on **end-to-end TLS (`Full (Strict)` + Origin CA) preventing passive sniffing** + ±60 s HMAC window (plus an optional ~8-line in-memory 120 s seen-`X-Relay-Signature` `Map` in `partner-relay` to block accidental duplicate client/proxy retries without any DB), and state the true semantics of all 4 routes.
  2. In `docs/spec/10:127-128` and `ADR-0003:25`, make `maybe_sent` route-specific: `POST /sellers` reconciles via `POST /sellers/list { externalUserId }`; **`POST /sellers/api-key/regenerate` is never retried** — reconcile `apiKey` via `POST /sellers/api-key { sellerId }` and, if `webhook_state == 'active'`, mark `webhook_state = 'secret_mismatch'` (`PR-02b`).

**P1-2 — `PR-15` (`P0`) anti-abuse extensions lack D1 columns, verification transport, and audit rules.**
- **Evidence:** `PRD.md:69` (and `docs/research/01-COMPETITOR-RESEARCH-AND-FEATURE-TRACEABILITY.md:84`) adds three P0 launch requirements to `PR-15`: *"Masked and COD sends require a verified sender WhatsApp number, new outlets have a configurable masking quota, and every reveal of `true_sender` is audit-logged."* None are backed in the technical specs:
  1. `sender_contacts` (`docs/spec/01-DATA-MODEL-AND-LEDGER.md:51-52`) has no `phone_verified_at` column, and v2 has no outbound WhatsApp/WABA OTP transport (`docs/spec/07:51` defines Email OTP only).
  2. `tenants` (`docs/spec/01:41`) has boolean `masking_enabled (1/0)` but no `masking_daily_quota` column, nor any quota control on Super Admin `/gerai/:slug` (`docs/visual/07:141`).
  3. `docs/visual/06-REMAINING-MENUS-WIREFRAMES.md:43` shows `Pengirim Asli (WA Retur)` unmasked in `/kontak/pengirim` for all counter roles, and neither `ADR-0005`, `docs/spec/04:26`, nor `docs/spec/05` defines when `true_sender_json` is masked or writes to `audit_logs`.
- **Smallest fix:** (a) Define "verified sender WhatsApp" as operator/inbound-WA confirmation (`wa_verified_at`, `wa_verified_by` on `sender_contacts` in `01:51`) or move automated WA OTP to P2; (b) add nullable `masking_daily_quota` to `tenants` (`01:41`) and `/gerai/:slug` (`visual/07:141`); and (c) specify in `ADR-0005` + `docs/spec/04:26` / `05` that unmasking `true_sender_json` on an issued masked `INV` or `Meja Retur` logs an `audit_logs` row.

**P1-3 — `platform_legal_profile` public rendering rule exposes `npwp`, uses a non-null placeholder example, and pollutes `<slug>.gerai.cc` white-label footers.**
- **Evidence:** `DECISIONS.md:24` (`DEC-218`) mandates *"NPWP encrypted and owner/Super-Admin-only"*. Unlike `tenant_business_profiles` (`docs/spec/01:42`: *"never in Kasir DTOs or public pages"*), `platform_legal_profile` (`docs/spec/01:47-48`) says *"public footer, `/ketentuan`, `/privasi`, subscription invoices, and email footers read this row. A `NULL` field renders nothing"*, and `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:150-151` states *"Footer of both [`geraiexpress.com` and `<slug>.gerai.cc`] renders only the filled fields of `platform_legal_profile`"*.
  1. Filling `platform_legal_profile.npwp` would render the company NPWP on public pages, violating `DEC-218`.
  2. `docs/spec/01:47` writes `legal_name (e.g., PT [diisi nanti])`, inviting a non-`NULL` seed string that would render publicly.
  3. Rendering GeraiExpress's corporate `registered_address` and `support_whatsapp` in `<slug>.gerai.cc` footers (`visual/07:150`) conflicts with the outlet's own storefront address/WA and neutral white-label design (`docs/visual/03:13-14,31`).
- **Smallest fix:** In `docs/spec/01:47-48` and `docs/visual/07:150-151`: rename `npwp` to `encrypted_npwp` wrapped by `KEK_SECRET` (`docs/spec/05:31`, `07:46`) and explicitly exclude it from all public pages (Super Admin & tax invoices only); change `:47`'s example to `NULL until filled`; restrict `geraiexpress.com` public rendering to `{legal_name, pse_registration_number, registered_address, support_email, support_whatsapp, privacy_contact_email}`; and keep `<slug>.gerai.cc` footer to `Didukung jaringan resmi GeraiExpress` (+ optional `legal_name` and `/privasi` link).

**P1-4 — `docs/visual/07` mobile header height (`56 px`) and dual primary buttons fail its own mandatory CI geometry/UX checks.**
- **Evidence:**
  1. `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:61` sets mobile `< 768 px` `<header>` height to `56 px`, while `:170` requires `admin-geometry.mjs <url> --contract design/admin-contract.json --viewports 390,1366,1536` to exit `0`. `design/admin-contract.json:13` enforces `"header-height": { "selector": "header", "allowed": [64], "viewports": "all" }`, which fails at `390px`.
  2. `docs/visual/07:46` places primary **`+ Kiriman Baru`** in Header right *"on every page except POS itself"* while forbidding *"More than one primary button"* (`visual/01:7`, `design/brief.md:21`, `dotuiux check --surface admin` rule `primary-actions`). Yet `docs/visual/07:118-131` defines page-specific `Primary` CTAs on 12 non-POS routes (`/kasir/multi`, `/kasir/cek-cepat`, `/kasir/shift`, `/kiriman/pickup/:batch`, `/kiriman/retur/:awb`, `/kontak/pengirim*`, `/kontak/penerima*`, `/keuangan`, `/pengaturan`, `/notifikasi`), creating two primary buttons on every one of those pages.
- **Smallest fix:** Keep `<header>` at `64 px` on mobile in `07:61` (or allow `[56, 64]` in `design/admin-contract.json:13`), and update `07:46` so header `+ Kiriman Baru` is primary only on `Dashboard`, `/kasir`, and `/kiriman` list, demoting to outline/secondary (or hiding on commit flows) whenever the route has its own `Primary` CTA in §3.2.

---

#### P2 — Contradictions, Missing Env/Host Wiring & Unbacked Traceability Claims

**P2-1 — `RELAY_SECRET_PREVIOUS` contradiction in `docs/spec/10` + missing Mengantar origin vars in `docs/spec/07`.**
- **Evidence:** `docs/spec/10:4,96,139` specifies a single `RELAY_SECRET` in *"the whole program"* and Coolify env list, contradicting `docs/spec/10:167-168` (`§7 Secret rotation`), which sets `RELAY_SECRET_PREVIOUS` on the relay. Separately, `docs/spec/07-DEVELOPMENT-GUIDE-AND-WORKFLOW.md:45-51` omits `MENGANTAR_PARTNER_ORIGIN` (needed by the Worker when `PARTNER_TRANSPORT="direct"` in local/sandbox per `ADR-0003:16`) and `MENGANTAR_PUBLIC_ORIGIN`.
- **Smallest fix:** Add optional `RELAY_SECRET_PREVIOUS` verification to `docs/spec/10:96,139`, and add `MENGANTAR_PUBLIC_ORIGIN` + `MENGANTAR_PARTNER_ORIGIN` to `docs/spec/07:47-49`.

**P2-2 — `relay.geraiexpress.com` missing from Host Routing, `RESERVED_SLUGS`, and Worker route exclusions.**
- **Evidence:** `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:3` is the *"single source of truth for host routing"*, but `relay.geraiexpress.com` (`docs/spec/10:36,82,141`) is absent from `docs/spec/06:7-18`, `ARCHITECTURE.md:13-22,68-76`, and `README.md:30-38`. If `apps/worker` ever attaches a wildcard `*.geraiexpress.com/*` route, Worker `fetch("https://relay.geraiexpress.com/forward")` will hit `hostClassifierMiddleware` (`ADR-0002:21` → 404) instead of the VPS origin.
- **Smallest fix:** Add `relay.geraiexpress.com` to `docs/spec/06 §1` (and `relay` to `RESERVED_SLUGS` in `06:18`), state in `ARCHITECTURE.md:68` & `docs/spec/10:141-142` that `apps/worker` binds explicit hostnames only (never `*.geraiexpress.com/*`), and specify Cloudflare SSL/TLS `Full (Strict)` for `relay.geraiexpress.com`.

**P2-3 — `PR-24` (`Multi-Outlet Owner`) contradicts `1:1` `mengantar_connections` schema.**
- **Evidence:** `PRD.md:82` (and `docs/research/01:86`) scopes `PR-24` to *"owners with more than one `tenant_outlets` row"* while requiring *"Each outlet keeps its own Mengantar seller account (Scheme 1)"*. In `docs/spec/01:14,44`, `mengantar_connections` has `tenant_id` as its **PK** (`1:1` with `tenants`), so multiple `tenant_outlets` rows under one `tenant` cannot own separate Mengantar seller accounts or separate `<slug>.gerai.cc` mini-sites (`docs/visual/07:18-19,42`).
- **Smallest fix:** Replace `tenant_outlets` with `tenants` (via multiple `tenant_members` `gerai_admin` memberships) in `PRD.md:82` and `docs/research/01:86`.

**P2-4 — Four inaccurate or overclaimed traceability mappings in `docs/research/01`.**
- **Evidence:**
  1. `docs/research/01:59` maps bosAgen `claim appeal (banding_claim)` to `PR-20`, which has no appeal workflow (`PRD.md:78`, `docs/spec/04 §3`; Mengantar claims are Live Chat only per `operations-contract.md:491`).
  2. `docs/research/01:63` maps Mengantar's return-warning modal to `Masking warning copy — PR-15`, but `PRD.md:69` (`PR-15`) contains no return-warning copy (`docs/visual/04:158` only covers courier SMS/WA sender names).
  3. `docs/research/01:66` claims UKURIR `outlet markup` is adopted via `counter_service_fee_idr`; although the column exists in `docs/spec/01:64`, `DEC-205` mandates publish tariffs and `docs/spec/02:25-46` omits markup from commercial instruments and receipt math.
  4. `docs/research/01:83` claims the `Mobil` pickup vehicle hint is *"shown in courier selector"*; it exists only in `Pickup & Manifest` (`PRD.md:70` `PR-16`, `docs/spec/04:10`, `docs/visual/06:31`), not in `PR-06` or `docs/visual/05`. *(Also at `:31`, `Saldo Aman` is owned by `spec 02 §4`, not `spec 09`; at `:54`, per-resi hold is bosAgen `:59`, whereas Komship's `ideal_balance` is an aggregate buffer per `rea-deep-dive-2026-11-12.md:95,112`.)*
- **Smallest fix:** Mark `banding_claim` N/A (Live Chat upstream), map `:63` to `ADR-0005` / `PR-17` (or add 1-line return-to-outlet copy to `PR-15`), mark `counter_service_fee_idr` as schema-reserved (`0` at launch per `DEC-205`), and fix `:83` to `Pickup & Manifest (PR-16, visual 06)` (plus `:31` → `spec 02` and `:54` wording).

**P2-5 — `docs/visual/07` rail/touch/text-scale & Kasir `/pengaturan` inconsistencies.**
- **Evidence:**
  1. `docs/visual/07:54` specifies a *"56 px icon rail with labels under icons (14 px)"* on tablet, which cannot physically fit inside `SIDEBAR_WIDTH_ICON 3.5rem` (`56 px`) / `size-10!` (`40×40 px`, `07:159`) for 9–10-char labels (`Dashboard`, `Pengaturan`).
  2. `docs/visual/07:8,161-162` sets `Tabs` triggers and menu/toolbar items to `h-10` (`40 px`) across viewports, falling below `AGENTS.md:38` (`min-h-11` = `44 px`) and `design/admin-contract.json:21` (`touch-target` `warnBelow: 44` on mobile). `07:49-50` also defines a 2-step Account-menu text toggle (`Normal / Besar` `112.5%`), conflicting with `docs/visual/01:11` (3-step top-bar `100% / 112% / 125%`).
  3. `docs/visual/07:129` routes Kasir to `/pengaturan` with `Primary: Simpan`, conflicting with `docs/spec/06:47` (*"Printer Bluetooth pair/test modal only"*) and `docs/spec/05:18` (Kasir never edits outlet settings). `07:118` (`/kasir/multi`) also leaves `Owner vs Kasir` as `—` instead of `Kasir sees customer price only`.
- **Smallest fix:** Use icon-only + tooltip/focus label on the `56 px` tablet rail (matching `07:35`), use `h-11 md:h-10` so mobile targets stay `>= 44 px`, unify the text-scale options between `01:11` and `07:49-50`, restrict Kasir printer config to local Web-Bluetooth pair/test + density (no outlet DB `Simpan`), and note `Kasir sees customer price only` on `07:118`.

**P2-6 — Bilingual `h` (`hari` vs `hours`) unit ambiguity in `PR-20` stuck-parcel buckets.**
- **Evidence:** `PRD.md:78` writes `Tidak Bergerak (>48j / 5-14h / 15-30h)` alongside `2×24h damage / 3×24h lost` in the same row, using `h` for Indonesian *hari* (days) in column 2 and English *hours* in column 4. `docs/spec/04:36` (`48j–4h, 5–14h, 15–30h, >30h`) and `docs/visual/06:29` (`48j–4h | 5–14h | >14h`) also disagree on the bucket list.
- **Smallest fix:** Write `48 jam–4 hari · 5–14 hari · 15–30 hari · >30 hari` (`2–4d, 5–14d, 15–30d, >30d`) consistently in `PRD.md:78`, `docs/spec/04:36`, and `docs/visual/06:29`.

**P2-7 — Root `DESIGN.md` is an empty comment skeleton while `dotuiux check` is a release gate.**
- **Evidence:** `DESIGN.md:1-51` contains only template HTML comments (`<!-- Step 3: ... -->`) with zero direction or tokens and is omitted from `README.md:55-82`, while `docs/visual/07:169` requires `dotuiux check <url> --surface admin` to exit `0`.
- **Smallest fix:** Populate `DESIGN.md` (<150 lines) from `design/brief.md` + `docs/visual/01` tokens + `design/refs/` and add `DESIGN.md` + `design/` to `README.md`.

---

#### P3 — Non-Blocking Polish & Stale Index Counts

- **P3-1 — Stale spec/visual counts in `ARCHITECTURE.md:105` and `ROADMAP.md:7`:** Both still read `01..09` and `01..06` and omit `docs/research/01` (+ `design/admin-contract.json` in M0). **Smallest fix:** Update to `01..10` and `01..07` + `docs/research/01`.
- **P3-2 — `DEC-218` tables omitted from `docs/spec/01` §1 ERD (`01:10-31`):** `platform_legal_profile` and `tenant_business_profiles` appear in §2.1/§2.1b (`:42,47`) but not in the §1 ERD; `docs/visual/06:99` also compresses `pic_name/role/email/phone` + `brand_name` into a single `Penanggung Jawab` label. **Smallest fix:** Add both tables to `01:10-31` and list PIC subfields in `visual/06:99`.
- **P3-3 — Insurance `NULL` vs `Rp 0` and guard naming (`PRD.md:53`, `docs/spec/03:24`, `docs/visual/02:58`, `docs/visual/04:76`):** `PRD.md:53` and `docs/spec/02:40` keep `insurance_fee_idr = NULL` (`AGENTS.md:27`: `NULL != 0`), yet `03:24` calls it *"Mandatory Insurance Guard"* and `02:58` / `04:76` display `Asuransi Rp 0` (unlike `04:57` `Asuransi:-`). **Smallest fix:** Rename `03:24` to `Insurance Prompt (>= Rp500.000)` and render `-` when `insurance_fee_idr IS NULL`.
- **P3-4 — Pre-DNS-cutover test in `docs/spec/10:164-166`:** Confirming §6 step 4 from the new host *before* switching `relay.geraiexpress.com` DNS cannot be run from a Worker directly to the VPS IP because the Vultr firewall allows 443 from Cloudflare ranges only (`10:56-57,151`). **Smallest fix:** Note in `10:165` to run the pre-cutover check inside the new host container or via a temporary proxied hostname (`relay-next.geraiexpress.com`).
- **P3-5 — Relay LOC & ADR header metadata drift (`DECISIONS.md:10`, `ARCHITECTURE.md:44,104`, `ADR-0003:4,17` vs `docs/spec/10:143`):** Earlier files say `~40 LOC Stateless Node Container` (`+ Compose`) and `ADR-0003:4` omits `DEC-219`, while `docs/spec/10:143` says `≤ 80 lines of Node or Go` on Coolify. **Smallest fix:** Add `DEC-219` to `ADR-0003:4` and align wording to `≤ 80 LOC Node/Go`.
- **P3-6 — Minor route/tab/payment-method sync (`docs/spec/06`, `docs/visual/02,05,06,07`):** Cross-link `docs/visual/07 §3` from `docs/spec/06` for auth/detail sub-routes; add the 2 missing `Keuangan` tabs (`Ringkasan & Saldo Mengantar`, `Selisih Sync`) to the `docs/visual/06:67` wireframe header; add `(TOTP + reason)` to `docs/visual/07:144` `Simpan on Profil Perusahaan`; and include `Deposit Reseller` (`PR-07`) alongside `Tunai / QRIS / Transfer` in `visual/02:55`, `05:29`, and `07:120`.