# AGENTS.md — Engineering Rules & System Invariants (`geraiexpress-cfv2`)

Every engineer and AI agent working in `geraiexpress-cfv2` must follow these rules.

## 1. Authority Order
1. Executed code, SQL migrations, and passing automated tests on disk (once M1 begins).
2. `DECISIONS.md` and `docs/adr/ADR-*.md` (explicit owner decisions).
3. `ARCHITECTURE.md` and domain specifications in `docs/spec/*.md`.
4. `PRD.md` and UI/print specifications in `docs/visual/*.md`.

Fix drift in the owning file; never silently work around a specification contradiction in code.

## 2. Language Split (Docs vs Product Output)
- **Engineering artifacts** (specs, ADRs, code comments, commit messages, identifiers, OpenAPI/MCP descriptions): write in concise, exact **English**.
- **User-facing product output** (all UI copy, navigation labels, validation/error messages, email OTP templates, WhatsApp share templates, thermal labels, customer receipts, and public pages): write in natural, polite, Indonesian-market-friendly **Bahasa Indonesia (EYD V)**. Never expose raw English exception strings or provider jargon to end users.

## 3. Non-Negotiable Technical Invariants

1. **Lightweight 100% Cloudflare Serverless Stack:**
   - Do not introduce Next.js, `@opennextjs/cloudflare`, or heavy Node-only frameworks into Workers.
   - Target Web/WinterCG standards (`fetch`, `Web Crypto`, `Streams`), Hono, Drizzle ORM on Cloudflare D1, Durable Objects (`GeraiVaultDO`), R2, Queues, Cron Triggers, and Turnstile.
2. **Strict Multi-Tenant & Cross-Domain Isolation:**
   - Session cookies on `app.geraiexpress.com` (`__Host-ge_app`) and `owner.geraiexpress.com` (`__Host-ge_owner`) must never use a broad `Domain` attribute and must never be sent to `*.gerai.cc` or tenant custom domains.
   - Every D1 query touching tenant data must bind `tenant_id` from the authenticated session or verified host resolution — never from an untrusted request parameter.
3. **Exact Integer Money, Gram Weights, & Dual-Book Financial Precision:**
   - Store all money as **integer Rupiah (`_idr`)**, all weights as **integer grams (`_gram`, default `1000`)**, and all percentage rates as **integer basis points (`_bps`, `10000 bps = 100%`)**. Floating-point money or stored float weights are forbidden.
   - Preserve `NULL` (unknown/unverified) as distinct from `0`. Never hard-code historical courier tariffs or COD fee percentages as universal truths.
   - Separate **Local Counter Cash Book** (what walk-in senders paid at the desk) from **Mengantar Seller Mirror Book** (synced from Mengantar `GET /invoices`, `GET /order`, and `GET /batch`). Never claim an estimated figure is provider-settled until matched against a Mengantar record.
   - Route all balance-affecting dispatches (`POST /order`, `POST /order/pay-unpaid`, `DELETE /order`), `INV` slug allocation, shift close, and API key rotation through the tenant's **`GeraiVaultDO`** with an `idempotency_key`.
4. **Role Projection & Super Admin Non-Impersonation:**
   - Strip seller net shipping cost, discount bps, spread/margin, and Mengantar account balance from **server API responses** for `cashier` roles — CSS hiding is insufficient.
   - `super_admin` has full read/monitoring visibility across tenants (with audit logging on PII/risk reads) and owns platform configuration, but **never creates, pays, edits, or cancels shipments on behalf of a gerai**.
5. **Release & Bundle Hygiene:**
   - **Never emit or serve `*.map` source maps** in production client assets.
   - Never bundle `MENGANTAR_PARTNER_SECRET`, seller API keys (note: Mengantar Public API places the seller key in the URL path — **never log, return, or trace raw upstream request URLs**), or `PARTNER_RELAY_SECRET` into client code.
6. **Indonesian Counter Ergonomics (35–55+ Operators):**
   - Body and input text minimum `16px`, touch targets minimum `44px` on phones and for all form inputs (`h-11`; desktop sidebar/tabs/menus may use `md:h-10` per `design/admin-contract.json`), high-contrast input borders (`>= 3:1`), `tabular-nums` on all prices/weights, and compact navigation (6 menus on Gerai workspace, 5 menus on Super Admin).
