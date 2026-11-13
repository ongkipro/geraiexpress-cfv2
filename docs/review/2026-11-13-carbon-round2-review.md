## Decision: REQUEST_CHANGES

### Executive Summary

Commit `587f9028a8b5` resolves **16 of 17** Round-1 findings (`P1-1`, `P1-3`, `P1-4`, all `P2-1..P2-7`, and all `P3-1..P3-6`) and **partially resolves `P1-2`**. Zero `P0` or `P1` blockers remain, ASCII wireframes in `docs/visual/02`, `04`, and `06` remain column-exact, and `DESIGN.md` tokens align with `docs/visual/01`, `docs/visual/07`, and `design/admin-contract.json`.

However, **4 narrow `P2` contradictions/gaps** introduced or left open by the Round-2 edits affect M1 host routing, D1 schema/repository rules, and the `partner-relay` wire contract, and should be closed before M1 implementation starts:
1. **`R2-P2-1` (`docs/spec/10`):** The new 120 s `X-Relay-Signature` duplicate guard signs integer Unix seconds with no per-attempt request ID, causing `409 relay_duplicate` false positives on same-second `POST /sellers/list` / `api-key` calls and `< 1 s` retries promised by §4.3 — and §4.3's `secret_mismatch` instruction reverses the Mengantar → GeraiExpress webhook-secret flow.
2. **`R2-P2-2` (`ADR-0005`, `docs/spec/01`, `docs/visual/07`):** `masking_daily_quota`'s silent fallback to `Standar Gerai` leaks outlet/sender identity if applied to pre-booked (`minisite_qr`) or API (`shipments:issue`) `Dropship Toko` orders, strips recipient anti-scam phone masking (`Privasi Penerima COD`) even when the sender is unmasked, and still lacks a new-outlet default / Super Admin UI control on `/gerai/:slug`.
3. **`R2-P2-3` (`PRD.md`, `ADR-0005`, `docs/spec/01,03,08`):** `wa_verified_at` is required for **"Masked and COD"** in `PRD.md` (`PR-15`) but **"masked"** only in `ADR-0005` (and omitted in `spec/03`), and `sender_contacts` lacks the rule clearing `wa_verified_*` on `true_phone` edits (permitted for `Kasir`) and blocking `wa_verified_*` writes via `contacts:write` API/MCP keys.
4. **`R2-P2-4` (`docs/spec/01,06`, `docs/visual/03,07`):** Requiring a `/privasi` link in `<slug>.gerai.cc` footers produces an HTTP 404 under `hostClassifierMiddleware` because `/privasi` exists only on `geraiexpress.com` (`spec/06 §5`), alongside normative footer copy drift against `docs/visual/03`.

---

### Round 1 Resolution Matrix

| Finding | Verdict | Evidence (`file:line`) |
|---|---|---|
| **P1-1** Partner-route idempotency & `regenerate` timeout/replay | **Resolved** *(see `R2-P2-1`)* | `docs/spec/10-PARTNER-RELAY-VPS-STATIC-EGRESS.md:96-109` grounds replay safety in end-to-end TLS (`Full (strict)` + Origin CA) + ±60 s window + 120 s seen-signature guard and documents exact semantics of all 4 routes; `docs/spec/10:138-144` and `docs/adr/ADR-0003-mengantar-partner-and-egress-relay.md:25` make `maybe_sent` route-specific and forbid automatic `api-key/regenerate` retries. |
| **P1-2** `PR-15` D1 columns, WA verification & reveal audit | **Partially resolved** *(see `R2-P2-2`, `R2-P2-3`)* | `docs/spec/01-DATA-MODEL-AND-LEDGER.md:43,54` adds `tenants.masking_daily_quota` and `sender_contacts.wa_verified_at / wa_verified_by / wa_verify_method` (`operator_confirmed`); `PRD.md:69`, `docs/research/01:84`, `ADR-0005:24-26`, and `docs/spec/04:29` add `true_sender_reveal` audit rules. Still missing: Super Admin quota control on `/gerai/:slug` (`docs/visual/07:142-143` remains `— (read-only)` without quota) + default seeding on approval. |
| **P1-3** `platform_legal_profile` NPWP exposure, placeholder & mini-site footer | **Resolved** *(see `R2-P2-4`)* | `docs/spec/01:44,49-50` renames `npwp` → `encrypted_npwp` (`AES-256-GCM` under `KEK_SECRET`, Super Admin & tax invoices only, never public), sets `legal_name` to `NULL until filled; never a placeholder string`, restricts `geraiexpress.com` public fields, and preserves outlet identity on `<slug>.gerai.cc` (`docs/visual/07:152-154`). |
| **P1-4** `visual/07` 56 px mobile header & dual primary buttons | **Resolved** | `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:8,63` and `DESIGN.md:24` set mobile `<header>` to `64 px` (matching `design/admin-contract.json:13`); `docs/visual/07:47` makes header `+ Kiriman Baru` primary only on `Dashboard`, `/kasir`, and `/kiriman`, outline when §3 defines a page `Primary`, and hidden on `/kiriman/:slug`. |
| **P2-1** `RELAY_SECRET_PREVIOUS` & Mengantar origin env vars | **Resolved** | `docs/spec/10:96-97,155` accepts optional `RELAY_SECRET_PREVIOUS` during rotation; `docs/spec/07-DEVELOPMENT-GUIDE-AND-WORKFLOW.md:50` adds `MENGANTAR_PUBLIC_ORIGIN` & `MENGANTAR_PARTNER_ORIGIN`. |
| **P2-2** `relay.geraiexpress.com` routing, `RESERVED_SLUGS` & Worker binding | **Resolved** | `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:16,19` adds `relay.geraiexpress.com` (not served by Worker) and `relay` in `RESERVED_SLUGS`; `docs/spec/10:157-160` mandates `Full (strict)` TLS and explicit Worker host bindings (never `*.geraiexpress.com/*`). |
| **P2-3** `PR-24` multi-outlet vs `1:1` `mengantar_connections` | **Resolved** | `PRD.md:82`, `docs/research/01:86`, and `docs/visual/07:43` scope `PR-24` to one owner with `gerai_admin` membership across multiple `tenants` rows, preserving 1:1 `mengantar_connections` and `<slug>.gerai.cc`. |
| **P2-4** Traceability overclaims in `docs/research/01` | **Resolved** | `docs/research/01-COMPETITOR-RESEARCH-AND-FEATURE-TRACEABILITY.md:31,54,59,63,66,83` marks `banding_claim` N/A (Live Chat), maps return warning to `ADR-0005`/`PR-17`, marks `counter_service_fee_idr` schema-reserved (`0` at launch per `DEC-205`), scopes `Mobil` hint to `Pickup & Manifest` (`PR-16`), and cites `spec 02 §4` + per-resi bosAgen vs aggregate Komship `ideal_balance`. |
| **P2-5** `visual/07` tablet rail, mobile touch targets, text scale & Kasir `/pengaturan` | **Resolved** | `docs/visual/07:8-9,36,50-51,56,120,131,162-165` uses icon-only 56 px rail with hover+focus tooltips, `h-11 md:h-10` (`>= 44 px` on phones), 3-step `100% / 112% / 125%` text scale, local-only Kasir printer pair/density (no `Simpan`), and `Kasir sees customer price only` on `/kasir/multi`. |
| **P2-6** `PR-20` `h` (`hari` vs `hours`) ambiguity & bucket sync | **Resolved** | `PRD.md:78`, `docs/spec/04:38`, and `docs/visual/06:32` all use `48 jam–4 hari · 5–14 hari · 15–30 hari · >30 hari`. |
| **P2-7** Empty `DESIGN.md` & `README.md` index | **Resolved** | `DESIGN.md:1-50` is populated (50 lines; direction marked `Picked-by: pending` until prototype pick, `C1..C5`, tokens) and indexed with `design/` in `README.md:57-58`. |
| **P3-1** Stale spec/visual counts in `ARCHITECTURE.md` & `ROADMAP.md` | **Resolved** | `ARCHITECTURE.md:105` and `ROADMAP.md:7` list `research (01)`, `spec (01..10)`, `visual (01..07)`, and `DESIGN.md` / `design/admin-contract.json`. |
| **P3-2** `DEC-218` tables in `spec/01` §1 ERD & PIC subfields in `visual/06` | **Resolved** | `docs/spec/01:12,15` adds `platform_legal_profile` and `tenant_business_profiles` to the ERD; `docs/visual/06:99` lists `Nama Brand, Penanggung Jawab (nama, jabatan, email, HP)`. |
| **P3-3** Insurance `NULL` vs `Rp 0` & prompt naming | **Resolved** *(minor typo in `R2-P3-2`)* | `PRD.md:53`, `docs/spec/03:24`, `docs/visual/02:58`, and `docs/visual/04:76` use `Insurance Prompt` and `-` when `insurance_fee_idr IS NULL`. |
| **P3-4** Pre-DNS-cutover verification in `docs/spec/10` | **Resolved** | `docs/spec/10:184-185` runs §6 step 4 inside the new container or via a temporary proxied hostname (`relay-next.geraiexpress.com`). |
| **P3-5** Relay LOC & `ADR-0003` `DEC-219` metadata | **Resolved** | `DECISIONS.md:10`, `ARCHITECTURE.md:30,104`, and `ADR-0003:4,17` align on `≤ 80 LOC` Node/Go and cross-reference `DEC-219`. |
| **P3-6** Sub-route link, `Keuangan` tabs, `Profil Perusahaan` TOTP & `Deposit` | **Resolved** | `docs/spec/06:50` links `visual/07 §3`; `docs/visual/06:76` includes all 6 `Keuangan` tabs; `docs/visual/07:146` adds `(TOTP + reason)` on `Profil Perusahaan`; `docs/visual/02:65` & `05:29` include `Deposit` / `Deposit Reseller`. |

---

### Contradiction & Regression Check Summary

- **Duplicate guard vs regenerate/retry rules (`docs/spec/10`):** Regression found — see **`R2-P2-1`**.
- **`masking_daily_quota` fallback vs `PR-15` / presets (`ADR-0005`, `spec/01`, `visual/07`):** Contradiction & incomplete wiring found — see **`R2-P2-2`**.
- **`wa_verified` flow vs `Kasir` / API permissions (`PRD.md`, `ADR-0005`, `spec/01,03,08`, `visual/06,07`):** Contradiction & boundary gap found — see **`R2-P2-3`**.
- **Legal profile rendering vs `visual/03` mini-site footer (`spec/01,06`, `visual/03,07`):** Broken `/privasi` host route + copy drift found — see **`R2-P2-4`**.
- **ASCII wireframe alignment (`docs/visual/02`, `04`, `06`):** **Verified clean.** `docs/visual/02:45-70` right column holds exact 41-char width (`Asuransi` `:58` and `[Deposit]` `:65` aligned); `docs/visual/04:34-88,114-141` holds exact 32-col (`Asuransi                       -` `:76` = 32 chars) and 60-col widths; `docs/visual/06:67-88` holds exact 100-char width (`:76` 6-tab bar = 100 chars).
- **`DESIGN.md` vs `docs/visual/01` & `07` tokens (`design/admin-contract.json`):** **Verified aligned** on colors (`#0066CC`, `#1D1D1F`/`#333333`/`#595959`, `#FFFFFF`/`#F5F5F7`, `#D2D2D7`/`#7A7A7A`), system UI stack, `14/16/18/28` scale, `100/112/125%` root-rem text scaling, `64 px` header, and `256/56 px` sidebar. Two non-blocking polish items are noted in **`R2-P3-1`** and **`R2-P3-2`**.

---

### Ranked Findings (`P2`–`P3`)

*(No `P0` or `P1` findings.)*

#### P2 — Contract Contradictions & Missing Security/Routing Guards

**R2-P2-1 — `partner-relay` duplicate guard collides on same-second requests/retries (`409 relay_duplicate`), plus inverted `secret_mismatch` recovery direction.**
- **Evidence:**
  1. `docs/spec/10-PARTNER-RELAY-VPS-STATIC-EGRESS.md:83-85` uses integer Unix-second `X-Relay-Timestamp` (`1767000000`) and signs `ts + "\n" + target + "\n" + hex(sha256(body))` with **no per-attempt request ID** (even though `:119` requires logging `request id`). `:99-100` caches seen `X-Relay-Signature` values for 120 s and rejects repeats with `409 relay_duplicate`.
  2. Directly breaks `:140` (*"`POST /sellers/list`, `POST /sellers/api-key`: safe to retry with a fresh signature"*): whenever an upstream call fails in `< 1 s` (or two legitimate `POST /sellers/list` calls with the same filter execute within the same Unix second), `ts`, `target`, and `body` are identical — so the Worker's "fresh signature" is byte-identical and rejected with `409 relay_duplicate`.
  3. `docs/spec/10:142-143` says *"ask the owner to re-enter the new callback secret in Mengantar (PR-02b)"* — inverted direction: Mengantar rotates and issues the secret (`partner-api.md:187`), so per `PR-02b` (`PRD.md:44`) the Outlet Owner copies the new Webhook Secret **from Mengantar Seller Settings into GeraiExpress** (`Pengaturan > Outlet & Mengantar`).
  4. `docs/spec/10:101-102` justifies in-memory loss on restart *"because the timestamp window is shorter than a restart"*, whereas a stateless container restarts in ~1 s vs the ±60 s (120 s) window.
- **Smallest fix:**
  1. Add `X-Relay-Id: <uuid>` (generated once per Worker attempt; preserved on transport-level retries of that attempt, regenerated on intentional Worker retries, and logged as `:119`'s `request id`) to `docs/spec/10:83-85` and include `id` in `X-Relay-Signature` (`ts + "\n" + id + "\n" + target + "\n" + hex(sha256(body))`), and list `relay_duplicate` in `:121`.
  2. Fix `:142-143` to *"ask the owner to copy the rotated Webhook Secret from Mengantar Seller Settings into `Pengaturan > Outlet & Mengantar` (PR-02b)"*, and fix `:101-102` to state restart loss is acceptable because TLS blocks capture and `regenerate` is never auto-retried.

**R2-P2-2 — `masking_daily_quota` silent `Standar Gerai` fallback leaks dropshipper/outlet identity and strips recipient COD phone masking; new-outlet quota still lacks a default and Super Admin UI.**
- **Evidence:**
  1. `docs/adr/ADR-0005-three-way-masking-and-return-intake.md:26` states: *"over the cap the presets fall back to `Standar Gerai` with the message `Kuota masking hari ini habis`."*
     - On `<slug>.gerai.cc` QR pre-bookings (`minisite_qr`, `PR-19`) or programmatic `POST /api/v1/shipments/:slug/issue` (`docs/spec/08:50`) where the sender selected `Dropship Toko` (`RESELLER_DROPSHIP`), silently falling back to `Standar Gerai` prints the **outlet's logo/name and true walk-in sender** onto a dropshipper's parcel without consent (violating `ADR-0005:20`).
     - Treating all non-`Standar Gerai` presets identically also blocks `Privasi Penerima COD` (`RECIPIENT_PRIVACY`, `ADR-0005:21`, `docs/visual/04:150-154`) even when the sender is unmasked (`Standar Gerai` base), forcing full recipient phone numbers onto paper labels and defeating `PR-15`'s anti-COD-scam protection (`docs/research/01:37`).
  2. `PRD.md:69` (`PR-15`) mandates *"new outlets get a `masking_daily_quota`"*, but `docs/spec/01:43` defaults `NULL = no cap` (*"default suggestion 20/day for the first 30 days"*) while Super Admin `/gerai/pengajuan/:id` and `/gerai/:slug` (`docs/visual/07:142-143`, `Primary: — (read-only)`) still expose no `masking_daily_quota` field/action (and `docs/spec/05:20` / `06:61` omit it).
- **Smallest fix:**
  1. In `ADR-0005:26`, scope `masking_daily_quota` strictly to **sender-masked** sends (`RESELLER_DROPSHIP`, `FULL_GERAI_MASK`, or `RECIPIENT_PRIVACY` with reseller base — keeping `Standar Gerai` + `RECIPIENT_PRIVACY` always available), disable sender-masked presets in the POS picker for new selections with `Kuota masking hari ini habis`, and make backend `issue` **reject** over-quota sender-masked drafts (`422 MASKING_QUOTA_EXCEEDED`) unless the operator explicitly switches the draft to `Standar Gerai`.
  2. Seed `masking_daily_quota = 20` on outlet approval in `docs/spec/01:43` and add `masking_daily_quota` editing (with TOTP + audit reason) alongside `masking toggle` on `/gerai/:slug` in `docs/visual/07:143` (and `docs/spec/05:20`, `06:61`).

**R2-P2-3 — `wa_verified_at` scope mismatch (`Masked and COD` vs `masked`-only) and unguarded `true_phone` edit / `contacts:write` API boundary.**
- **Evidence:**
  1. `PRD.md:69` (`PR-15`) requires `wa_verified_at` for **"Masked and COD sends"**, whereas `ADR-0005:24` requires a verified `true_sender` WhatsApp only for **"Every masked shipment"** (omitting unmasked `Standar Gerai` COD sends), and `docs/spec/03:18-25` (`Path B — Direct Walk-In POS`) omits the `wa_verified_at` gate completely.
  2. `Kasir` can add/edit `sender_contacts` (`docs/spec/06:46`) and external tokens can call `POST /api/v1/contacts/senders` (`contacts:write`, `docs/spec/08:52`), yet `docs/spec/01:54` does not require resetting `wa_verified_at / wa_verified_by / wa_verify_method` to `NULL` when `true_phone` changes, nor does `docs/spec/08:52` forbid setting `wa_verified_*` via `contacts:write` API/MCP tokens.
  3. On `/kiriman/:slug (issued)` (`docs/visual/07:119`), `true_sender_json` on masked shipments is not specified as collapsed behind an explicit `"Lihat Pengirim Asli"` action + reason prompt (needed so routine status views do not spam `audit_logs` or lack `ADR-0005:25`'s mandatory `reason`); and `docs/visual/06:56` shows `(WA ✓)` on `/kontak/penerima` (no `wa_verified_at` column) instead of `/kontak/pengirim` (`06:46`).
- **Smallest fix:** Align `ADR-0005:24` and `docs/spec/03:22` with `PRD.md:69` (`masked or COD` requires `sender_contacts.wa_verified_at IS NOT NULL` at issue time); add to `docs/spec/01:54` (and `08:52`) that `wa_verified_*` is set only by an interactive `cashier`/`gerai_admin` counter action and resets to `NULL` whenever `true_phone` changes; note collapsed `true_sender` reveal + reason on `docs/visual/07:119`; and move `(WA ✓)` from `docs/visual/06:56` to `06:46`.

**R2-P2-4 — `<slug>.gerai.cc` footer requires a `/privasi` link that 404s under `hostClassifierMiddleware`, plus normative copy drift vs `docs/visual/03`.**
- **Evidence:**
  1. `docs/spec/01-DATA-MODEL-AND-LEDGER.md:50` and `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:154` state that `<slug>.gerai.cc` footers render *"a `/privasi` link"*, while `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:70-75` and `docs/visual/07:152` define `<slug>.gerai.cc` routes exclusively as `/ · /kirim/:slug · /lacak · /lacak/:kode · /inv/:slug` (`/privasi` is defined only on `geraiexpress.com` at `spec/06:77`, `visual/07:151`). Because `hostClassifierMiddleware` (`ADR-0002:21`, delivered in M1) returns HTTP 404 for cross-context paths, a relative `/privasi` link on `<slug>.gerai.cc` will 404.
  2. Normative Indonesian footer copy (`README.md:10`) differs across `docs/visual/03:32` (`Didukung jaringan resmi GeraiExpress`), `docs/spec/01:50` (`Didukung GeraiExpress (+ legal_name when filled)`), and `docs/visual/07:154` (`Didukung GeraiExpress`).
- **Smallest fix:** Either point the mini-site privacy link explicitly to `https://geraiexpress.com/privasi` in `docs/spec/01:50`, `docs/visual/03:32`, and `docs/visual/07:154` (simplest, zero duplicate legal page on custom domains) or add `/privasi` to `<slug>.gerai.cc` routes in `docs/spec/06:70-75` and `docs/visual/07:152`; and unify the attribution string across `spec/01:50`, `visual/03:32`, and `visual/07:154`.

---

#### P3 — Non-Blocking Polish

- **R2-P3-1 — Phone (`390px`) bottom-bar center `＋` primary-CTA parity (`docs/visual/07:70,74,77` & `docs/visual/06:13`):** `visual/07:47` demotes desktop header `+ Kiriman Baru` to outline on routes with their own `Primary` CTA so `dotuiux check --surface admin` (`primary-actions`) passes, and `:77` replaces the phone bottom bar on `/kiriman/:slug`, but `:74` does not state the same primary-vs-outline / sticky-bar replacement rule for the phone center `＋` (`56 px`) on the 12 other routes with page `Primary` CTAs (and `visual/06:13` draws a second `[+ Kiriman Baru]` inside the `KIRIMAN` body header). **Smallest fix:** Note in `visual/07:74,77` that phone center `＋` follows `:47`'s primary-only-on-`Dashboard`/`/kasir`/`/kiriman` rule (replaced by sticky commit bars on `/kasir/multi`, `/kasir/shift`, `/kiriman/pickup/:batch`, `/kiriman/retur/:awb`) and page bodies omit duplicate `+ Kiriman Baru` buttons.
- **R2-P3-2 — Minor text/encryption/ergonomics sync (`docs/spec/03:24`, `docs/spec/05:36-38`, `AGENTS.md:38` / `docs/visual/01:12`):**
  1. `docs/spec/03:24` has duplicate parenthetical `Insurance Prompt (>= Rp500.000) (\`>= Rp500.000\`)`.
  2. `docs/spec/05:36-38` (`Envelope Encryption`) mentions only Mengantar `apiKey` and `webhookSecret` under `KEK_SECRET`, omitting `encrypted_npwp` (`docs/spec/01:44,49`).
  3. `AGENTS.md:38` and `docs/visual/01:12` state `min-h-11` (`44px`) unqualified across viewports, whereas `docs/visual/07:8-9,162-165` and `design/admin-contract.json:5,21` use `h-11 md:h-10` (`44px` on phones and all form inputs; `40px` on desktop sidebar/tabs/menus).