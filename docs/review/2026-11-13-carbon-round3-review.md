## Decision: APPROVE

### Executive Summary

Commit `c98c3bdf85ec` (*"Address Carbon round-2 review (4 P2, 2 P3)"*) **resolves all 7 open items** from Round 2: the remaining part of `P1-2`, all four `P2` findings (`R2-P2-1..R2-P2-4`), and both `P3` polish items (`R2-P3-1..R2-P3-2`).

Cross-contract verification of `HEAD` introduces **zero `P0`, `P1`, or `P2` contradictions**. Two minor, non-blocking `P3` implementation notes are recorded below for M2/M3 coding hygiene, and Milestone **M0** is clear to proceed to M1 implementation.

---

### Round 2 Resolution Matrix

| Finding | Verdict | Evidence (`file:line`) |
|---|---|---|
| **P1-2** *(remaining from R1)* Super Admin `masking_daily_quota` control & approval default | **Resolved** | `docs/spec/01-DATA-MODEL-AND-LEDGER.md:43` seeds `masking_daily_quota = 20` on outlet approval (`NULL` = no cap, TOTP + audit reason to raise/clear); `docs/spec/05-IAM-SECURITY-AND-PRIVACY.md:20` adds `masking_daily_quota` to the Super Admin TOTP + audit role row; `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:143` exposes `Kuota masking harian` (with TOTP + reason) alongside masking toggle and freeze on `/gerai/:slug`. |
| **R2-P2-1** `partner-relay` duplicate-guard collision on same-second calls/retries & inverted `secret_mismatch` direction | **Resolved** | `docs/spec/10-PARTNER-RELAY-VPS-STATIC-EGRESS.md:82-84` adds `X-Relay-Id: <uuid>` and signs `ts + "\n" + id + "\n" + target + "\n" + hex(sha256(body))`; `:98-103` keys the 120 s in-memory duplicate map on `X-Relay-Id` (reused on transport retries, new UUID on deliberate Worker retries) and grounds restart behaviour in end-to-end TLS + no auto-retry on `regenerate`; `:120` logs `X-Relay-Id`; `:122` lists `relay_duplicate`; `:143-145` directs the owner to copy the rotated Webhook Secret **from Mengantar Seller Settings into `Pengaturan > Outlet & Mengantar`**. |
| **R2-P2-2** `masking_daily_quota` silent `Standar Gerai` fallback & `RECIPIENT_PRIVACY` blocking | **Resolved** | `docs/adr/ADR-0005-three-way-masking-and-return-intake.md:26` scopes `masking_daily_quota` strictly to sender-masked sends, keeps `STANDARD_GERAI` and `RECIPIENT_PRIVACY` on a standard base uncapped, disables sender-masked presets in the POS when exhausted (`Kuota masking hari ini habis`), and rejects over-quota sender-masked drafts at `issue` with `422 MASKING_QUOTA_EXCEEDED` (including QR pre-bookings and API calls) instead of silently downgrading. |
| **R2-P2-3** `wa_verified_at` scope (`Masked and COD`), `true_phone` reset, API write guard & collapsed reveal | **Resolved** | `docs/adr/ADR-0005:24` and `docs/spec/03-COUNTER-POS-PRINTING-AND-SHIFT.md:22` require `wa_verified_at` on **masked or COD** sends (`PRD.md:69`); `docs/spec/01:54` and `docs/spec/08-OPENAPI-AND-MCP-CONTRACT.md:52` make `wa_verified_*` counter-only (`cashier`/`gerai_admin`), read-only over API/MCP, and reset to `NULL` on `true_phone` change; `docs/adr/ADR-0005:25` and `docs/visual/07:122` collapse `true_sender_json` behind `Lihat Pengirim Asli` (reason + `true_sender_reveal` audit); `docs/visual/06-REMAINING-MENUS-WIREFRAMES.md:47,56` moves `WA: ... ✓` to `/kontak/pengirim` and removes it from `/kontak/penerima`. |
| **R2-P2-4** `<slug>.gerai.cc` `/privasi` 404 under `hostClassifierMiddleware` & footer attribution drift | **Resolved** | `docs/spec/01:50` and `docs/visual/07:155-156` point mini-site privacy links to the absolute URL `https://geraiexpress.com/privasi` (avoiding cross-host 404s on `<slug>.gerai.cc`) and unify attribution copy with `docs/visual/03-WHITELABEL-GERAI-MINISITE.md:32` (`Didukung jaringan resmi GeraiExpress`, plus `legal_name` when filled). |
| **R2-P3-1** Phone (`390px`) bottom-bar center `＋` primary-CTA parity & duplicate body CTA | **Resolved** | `docs/visual/07:74-77` applies the primary-only-on-`Dashboard`/`/kasir`/`/kiriman` rule to the phone center `＋`, replaces the bottom bar with sticky commit bars on `/kasir/multi`, `/kasir/shift`, `/kiriman/pickup/:batch`, and `/kiriman/retur/:awb`, and forbids duplicate body `+ Kiriman Baru` buttons (`docs/visual/06:13` now renders `[+ Multi-Paket]  [⬇ Ekspor CSV]`). |
| **R2-P3-2** Duplicate `>= Rp500.000` text, `encrypted_npwp` in `spec/05`, and touch-target wording | **Resolved** | `docs/spec/03:24` removes the duplicate parenthetical; `docs/spec/05:37` includes `encrypted_npwp` (`DEC-218`) under `KEK_SECRET` `AES-256-GCM`; `AGENTS.md:38` and `docs/visual/01-DESIGN-SYSTEM-AND-ERGONOMICS.md:12` align on `44px` (`h-11`) on phones and all form inputs with `md:h-10` permitted for desktop sidebar/tabs/menus per `design/admin-contract.json`. |

---

### Post-Fix Contradiction & Regression Checks (`HEAD` `c98c3bdf85ec`)

1. **`X-Relay-Id` semantics vs §4.3 retry rules & logging (`docs/spec/10`, `ADR-0003`):** **Clean.**
   - Deliberate Worker retries on `POST /sellers/list` and `POST /sellers/api-key` (`docs/spec/10:141`) generate a new `X-Relay-Id` UUID (`:99`), producing a fresh `X-Relay-Signature` even within the same Unix second while transport-level retries reuse `X-Relay-Id` and stop at `409 relay_duplicate`.
   - Logging (`:120`) records only `method, target path, upstream status, latency, X-Relay-Id` and never raw header maps or bodies. *(See `R3-P3-1` for a minor defensive note on Worker handling of `409 relay_duplicate` and `ADR-0003:21` prose.)*
2. **`422 MASKING_QUOTA_EXCEEDED` vs `docs/spec/08` error codes & MCP `issue_paid_shipment` (`ADR-0005`, `spec/07,08`, `visual/04`):** **Clean.**
   - `docs/spec/08:19` and `docs/spec/07:64-71` standardize errors as `{ ok: false, error: { code, message, field_errors } }` with `UPPER_SNAKE_CASE` English `error.code` (`INSUFFICIENT_MENGANTAR_BALANCE`) and Indonesian `error.message`; `422 MASKING_QUOTA_EXCEEDED` (`Kuota masking hari ini habis`) fits the envelope directly without conflicting with any closed enum in `spec/08`.
   - Both `POST /api/v1/shipments/:slug/issue` (`spec/08:50`) and MCP `issue_paid_shipment` (`spec/08:66`) serialize through `GeraiVaultDO`, so per-WIB-day quota enforcement is atomic across POS, QR pre-bookings, REST, and MCP. *(See `R3-P3-2` on `RECIPIENT_PRIVACY` with a reseller base.)*
3. **`wa_verified` rules vs `Kasir` role matrix (`spec/05`, `spec/06`) & contacts API (`spec/01`, `spec/08`):** **Clean.**
   - `Kasir` can add/edit/select `sender_contacts` (`spec/06:46`, `visual/07:129-130`) and issue shipments (`spec/05:14`), matching interactive counter confirmation in `spec/01:54` (`cashier`/`gerai_admin`), while deposit balances remain owner-only and net cost/margin stay stripped (`spec/05:17`).
   - Because MCP `upsert_sender_or_recipient_contact` (`spec/08:72`) shares the single `@hono/zod-openapi` schema (`spec/08:6-12`) with `/api/v1/contacts/senders` (`spec/08:52`), `wa_verified_*` is uniformly read-only and cleared on `true_phone` edits across REST and MCP.
4. **Footer copy across `docs/visual/03`, `docs/visual/07`, and `docs/spec/01`:** **Clean.**
   - `docs/spec/01:50`, `docs/visual/03:32`, and `docs/visual/07:155-156` all use `Didukung jaringan resmi GeraiExpress` (plus `legal_name` when populated in `platform_legal_profile`, omitted when `NULL`) and link to `https://geraiexpress.com/privasi` (`Kebijakan Privasi ↗`).
5. **`AGENTS.md` touch wording vs `design/admin-contract.json`, `docs/visual/01`, and `docs/visual/07`:** **Clean.**
   - `design/admin-contract.json` checks `touch-target` (`minSide`, `warnBelow: 44`) on `mobile`, `input-height: [40, 44]` on `desktop`, `button-height: [36, 40, 44]` on `desktop`, `table-head-height: [44]`, `header-height: [64]`, and `sidebar-width: [256, 56]`. `AGENTS.md:38`, `docs/visual/01:12`, and `docs/visual/07:8-10,161-169` (`h-11` on phones and form inputs; `md:h-10` on desktop sidebar/tabs/menus/toolbars) satisfy every check in `admin-contract.json`.
6. **ASCII wireframe column alignment (`docs/visual/02..07`, counting emoji as 2 display columns):** **Clean.**
   - Updated boxes in `docs/visual/03:10-33` (100 display cols) and `docs/visual/06:12-26,41-59` (102 and 100 display cols; 26-col first column on `:47` and `:56`) align cleanly.

---

### Ranked Findings (`P3` Optional Implementation Notes Only)

*(No `P0`, `P1`, or `P2` findings.)*

- **R3-P3-1 — Treat unexpected `409 relay_duplicate` as `maybe_sent` in the Worker adapter and list all 4 `X-Relay-*` headers in `ADR-0003:21` (`docs/spec/10:98-103,138` & `docs/adr/ADR-0003:21`):**
  - If a proxy/edge transport retry ever surfaces `409 relay_duplicate` back to the Worker, the first copy already entered `partner-relay` and may have reached Mengantar; also `ADR-0003:21` mentions `(X-Relay-Timestamp, X-Relay-Signature)` in summary prose before delegating to `spec/10`.
  - **Smallest fix (when implementing M2 `mengantar-sdk` / optional doc tidy):** Map `409 relay_duplicate` to `maybe_sent` recovery in `MengantarPartnerTransport` (and optionally expand `ADR-0003:21` to `X-Relay-*` headers).
- **R3-P3-2 — Ensure `isSenderMasked` predicate includes `RECIPIENT_PRIVACY` when combined with a reseller base (`docs/adr/ADR-0005:26` & `docs/visual/04:148-155`):**
  - `ADR-0005:26` states `tenants.masking_daily_quota` caps sender-masked sends (`RESELLER_DROPSHIP`, `FULL_GERAI_MASK`) while "`STANDARD_GERAI` and `RECIPIENT_PRIVACY` on a standard base are never capped". In `docs/visual/04:148-155`, `3. Privasi Penerima COD` can sit on base `1` (`Standar Gerai`) or base `2` (`Dropship Toko`).
  - **Smallest fix (when implementing M3 `packages/domain` / optional doc tidy):** Implement quota counting against `senderMaskBase !== 'STANDARD_GERAI'` (so `RECIPIENT_PRIVACY` on a `RESELLER_DROPSHIP` base also counts against `masking_daily_quota`), or add `, or RECIPIENT_PRIVACY on a reseller base` to the parenthetical in `ADR-0005:26`.