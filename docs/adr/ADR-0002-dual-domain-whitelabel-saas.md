# ADR-0002: Dual-Domain Isolation (`geraiexpress.com` Core Brand vs `*.gerai.cc` Outlet White-Label)

- **Status:** Accepted (2026-11-12)
- **Related:** DEC-202, DEC-207

## Context
GeraiExpress v2 requires two distinct brand and security postures:
1. Our platform brand (`geraiexpress.com`) must anchor partner recruitment, the counter/owner workspace, and the Super Admin console.
2. Each approved outlet needs its own promotional web page, publish-rate calculator, QR pre-booking form, and parcel tracker on a **short, neutral URL** suitable for shop banners and dropshippers — without ever risking session-cookie leakage against authenticated staff workspaces.

## Decision
Split hosts across two separate registrable domains (`eTLD+1`) served by the same Cloudflare Worker deployment:
1. **Platform Core (`geraiexpress.com`):**
   - `geraiexpress.com` — Indonesian marketing site & 1-click counter sandbox.
   - `app.geraiexpress.com` — Outlet Owner & Cashier PWA (`__Host-ge_app` cookie).
   - `owner.geraiexpress.com` — Super Admin console (`__Host-ge_owner` cookie + `aal2` TOTP).
   - `hooks.geraiexpress.com` — cookie-less HMAC webhook endpoint for Mengantar.
2. **Outlet White-Label Network (`gerai.cc` + *Cloudflare for SaaS*):**
   - `<slug>.gerai.cc` — wildcard DNS routed automatically upon outlet approval.
   - `<custom.merchantdomain.id>` — optional Pro tier CNAMEd to `custom.gerai.cc` via **Cloudflare for SaaS** (automated TLS issuance; verify current Cloudflare custom-hostname free quota at M6 provisioning).

The Worker's entry middleware classifies `Host` strictly and returns an Indonesian HTTP 404 for cross-context paths.

## Consequences
- **Security:** Because `gerai.cc` and custom domains are distinct `eTLD+1` origins from `geraiexpress.com`, browsers physically never attach `__Host-ge_app` or `__Host-ge_owner` cookies to outlet mini-site requests.
- **Commercial:** Short URLs (`berkahjaya.gerai.cc`) fit cleanly on 58mm thermal receipts, WhatsApp bios, and storefront banners while remaining neutral for local resellers.
- **Obligation:** Enforce a strict `RESERVED_SLUGS` denylist (`www`, `app`, `api`, `owner`, `admin`, `hooks`, `custom`, `mcp`, courier trademarks, etc.) at outlet registration.
