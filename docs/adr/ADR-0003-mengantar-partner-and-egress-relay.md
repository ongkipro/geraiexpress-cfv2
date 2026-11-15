# ADR-0003: Official Mengantar Partnership (Scheme 1) & Static-IPv4 Partner Relay

- **Status:** Accepted (2026-11-12)
- **Related:** DEC-203, DEC-204, DEC-216, DEC-219

## Context
GeraiExpress operates as an official Mengantar partner (`Partner ID: ongkirich`). Mengantar exposes two distinct API surfaces:
1. **Public API (`api-public.mengantar.com/api/public/{API_KEY}/...`):** handles 99.9% of daily operations — area search, shipping estimates, order creation, `pay-unpaid`, pickup time slots, order/batch reads, cancellations, and `/invoices` financial ledger reads. Production read calls succeeded without an IP allowlist; whether Partner-created seller keys ever enforce per-key IP restrictions on writes or label generation remains an explicit M6 verification item with Mengantar (Operations Contract Q23).
2. **Partner API (`/api/partner/v1/sellers/*` — 4 POST routes):** provisions new seller accounts, lists sellers, retrieves keys, and rotates keys. Sandbox relaxes IP checks, but **Production strictly enforces an allowlisted static public IPv4 (`403 IP_NOT_ALLOWED` otherwise)**. Non-Enterprise Cloudflare Workers egress from rotating shared IPs.

## Decision
1. **Scheme 1 Account Ownership:**
   - Every approved outlet business maps 1:1 to **its own Mengantar seller account** (`externalUserId = tenant.id` when Partner-provisioned; if `409 EMAIL_ALREADY_REGISTERED` triggers the `PR-02` BYOK fallback, `external_user_id` stays `NULL` and is excluded from Partner `sellers/list` reconciliation), with its pickup master set to the outlet's physical address.
   - Each outlet owns its Mengantar prepaid balance, top-ups, Non-COD debits, return-shipping debits, and COD disbursements; GeraiExpress syncs and reconciles every movement via `GET /invoices`, `GET /order`, and `GET /batch` (`docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md`).
2. **Dual-Mode Partner Transport (`MengantarPartnerTransport`):**
   - `PARTNER_TRANSPORT="direct"` (local dev & Sandbox): Worker calls Mengantar Sandbox Partner API directly.
   - `PARTNER_TRANSPORT="relay"` (Production): Worker sends HMAC-signed requests (`X-Relay-Timestamp`, `X-Relay-Id`, `X-Relay-Target`, `X-Relay-Signature`) exclusively for the 4 Partner routes to **`infra/partner-relay`**, a ≤ 80-line stateless Node/Go container deployed on a minimal VPS whose **static public IPv4** is registered with Mengantar.
   - All **Public API** traffic continues directly from Cloudflare Workers to Mengantar with zero relay hop.

Host choice, relay contract, deployment shape, M6 checks and IP-change procedure: `docs/spec/10-PARTNER-RELAY-VPS-STATIC-EGRESS.md` (`DEC-219`).

## Security & Failure Rules
- **Path-Key Redaction:** `mengantar-sdk` scrubs `{API_KEY}` from all Public API URLs before logging or throwing errors.
- **Closed Relay Allowlist:** `infra/partner-relay` forwards only to the configured Mengantar Partner origin and the 4 exact Partner paths (no open proxy / SSRF risk).
- **Crash-Safe Onboarding:** Relay timeouts after forwarding are recorded as `maybe_sent`. Registration reconciles via `POST /sellers/list { externalUserId }` before any retry; `api-key/regenerate` is never retried automatically (it rotates the key and callback secret on every call) — see `docs/spec/10` §4.3.

## Consequences
- **Positive:** all user traffic, POS checkouts, mini-sites, D1/Durable Object data, and financial sync stay on Cloudflare Serverless, while Production Partner IP allowlisting is satisfied for a reserved-IP fee (plus a micro-VPS fee only under Option C) with zero database and zero Mengantar secrets on the relay host.
