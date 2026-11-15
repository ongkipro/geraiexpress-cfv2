# 11 — Cloudflare for SaaS: Gerai Hostnames, Custom Domains & Tenant Routing

Owner of: how a request on `<slug>.gerai.cc` or a gerai's own domain reaches the right tenant, and the custom-hostname
lifecycle. Related: ADR-0002 (dual domain), ADR-0006 (D1 control plane), DEC-202, DEC-228, PR-03, M5/M6.
Method source: dotfiles skill `cloudflare-for-saas` (facts checked against developers.cloudflare.com 2026-11-13/14).
Plans, prices and limits change: re-read the linked Cloudflare page at M6 provisioning and record page and date.

---

## 1. Zones and hosts

| Zone | Hosts | Served by |
|---|---|---|
| `geraiexpress.com` (platform) | apex, `www`, `app.`, `owner.`, `hooks.` | the Worker (custom domains on the Worker) |
| `gerai.cc` (tenant zone, **Cloudflare for SaaS enabled**) | `<slug>.gerai.cc`, `cname.gerai.cc` (CNAME target), `fallback.gerai.cc` (fallback origin) | Worker route `*/*` on this zone |
| Gerai's own domain (Pro) | e.g. `kirim.tokobudi.id`, or root `tokobudi.id` + `www` | custom hostname in the `gerai.cc` zone → same Worker |

- `<slug>.gerai.cc` needs **no custom hostname**: proxied `AAAA * 100::` and `AAAA @ 100::` plus Universal SSL cover
  first-level subdomains. Activation on outlet approval is a D1 row, not a Cloudflare API call.
- `cname.gerai.cc` replaces the earlier `custom.gerai.cc` name (DEC-228); `custom` stays in `RESERVED_SLUGS`.
- `relay.` is never a Worker host (spec 10).

## 2. One-time zone setup (M6, owner-approved production action)

1. Separate registrable domains (already true: `geraiexpress.com` vs `gerai.cc`).
2. Enable Cloudflare for SaaS on `gerai.cc` (non-Enterprise needs a payment method on the account).
3. Originless fallback: proxied `AAAA fallback 100::`; set as fallback origin; wait for **Active**.
4. Proxied `CNAME cname → fallback.gerai.cc` (the customer-facing target).
5. Worker route `*/*` on `gerai.cc` → the production Worker; add `cname.gerai.cc/*` → Worker explicitly (O2O safety).
   Staging: the route `*-stg.gerai.cc/*` → the **staging** Worker (more specific routes win), so `<slug>-stg` hosts never
   reach production bindings. Staging does not create custom hostnames; custom-domain flows are tested in staging with
   a separate test zone owned by the team.
6. API token for the Worker: zone-scoped to `gerai.cc`, custom-hostname edit + quota read only; stored as secret
   `CF_SAAS_API_TOKEN`. Never an account-wide token.

## 3. Request routing (the security boundary — R4)

Order inside `hostClassifierMiddleware`, before any tenant query or cache read:

1. Pass through `/.well-known/acme-challenge/*` and `/.well-known/pki-validation/*` untouched (HTTP DCV).
   `GET /.well-known/geraiexpress-probe/<nonce>` is answered **for pending hosts too** (not for suspended tenants or
   moved/purged hosts; `GET` only) with `HMAC(probe_secret, host ":" nonce)` only (no tenant name or data); the `:`
   separator prevents cross-TLD collisions (`toko.co` + `m…` vs `toko.com` + `…`). It is the activation probe of §5 step 5.
   DCV pass-through applies only to candidate tenant hosts (`GET`/`HEAD`); platform hosts and `relay.` never pass it.
2. Normalise `Host` (lowercase, strip port and trailing dot); ignore `X-Forwarded-Host`; reject IP literals (any form:
   the last label must start with a letter) and hosts over 253 chars. `/healthz` answers only on hosts that pass this
   step and are not `relay.`/other platform subdomains.
3. Exact match on platform hosts → platform context (ARCHITECTURE §3), no tenant.
4. `*.gerai.cc` (one label) or any other host → **authoritative D1 lookup** in `tenant_hostnames` (in-isolate cache
   of at most 30 s, keyed by host and the tenant's `routing_version`):
   - unknown, `pending`, `purged` → neutral Indonesian 404 (no tenant data, no hint that a tenant exists);
   - tenant `suspended` → 403 `Gerai sedang tidak aktif`;
   - tenant `recovery` → 503 with `Retry-After`;
   - `active` → tenant context.
5. KV is **never** used for host → tenant (eventual consistency of 60 s or more would keep a suspended gerai online).
6. Edge-cache keys carry `tenant_id`, `routing_version` and host; never read cache before step 4.

## 4. `tenant_hostnames` (D1)

`hostname` (PK, normalised), `tenant_id`, `kind` (`platform_subdomain | custom`), `role` (`primary | redirect`),
`state` (`pending | active | failed | moved | suspended | purged`), `cf_custom_hostname_id`, `cf_status`,
`cf_ssl_status`, `verification_errors_json`, `dns_branch` (`subdomain | root_primary | www_primary`),
`created_at`, `activated_at`, `last_checked_at`, `probe_ok_at`, `deleted_at`. A hostname belongs to at most one
tenant; `tenants.routing_version` increments on any change.

## 5. Custom-domain lifecycle (Pro)

| # | Who | Step |
|---|---|---|
| 1 | Owner (`Pengaturan › Mini-Site › Domain Sendiri`) | Enters `kirim.tokobudi.id`. App normalises, refuses `gerai.cc`/platform names, a host another tenant owns, and anything over the cap (1 custom domain per Pro gerai; root + `www` count as one). Row `pending`. |
| 2 | Worker | `POST /zones/{gerai.cc}/custom_hostnames` with `ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } }`; GET again after a short delay for `ownership_verification` and `ssl.validation_records`. Create **before** the owner saves a proxied CNAME (O2O Error 1014). |
| 3 | Owner | Adds the DNS record shown in the app (§6). |
| 4 | Worker (Cron every 10 min + `Periksa Lagi` button) | `GET` status; the button sends `PATCH` with the same `ssl` method to restart validation. |
| 5 | Worker | When `status = active` **and** `ssl.status = active`, the Worker requests `https://<host>/.well-known/geraiexpress-probe/<random nonce>` and compares the response with its own `HMAC(probe_secret, host ":" nonce)`; only a match proves the host reaches this deployment, then it sets `state = active` and bumps `routing_version`. Every other path on a pending host stays a neutral 404 (lifecycle test). |
| 6 | Worker | Canonical URLs, QR posters and receipts switch to the custom host only after step 5. A failed probe keeps `<slug>.gerai.cc` primary. |
| 7 | Worker (daily reaper) | Delete hostnames `pending`/`failed` for 7 days, `moved`, or of churned/purged tenants: `DELETE` the custom hostname (stops billing), set `purged`. Never rely on Cloudflare's own deletion. |

Remedies shown to the owner (Indonesian copy in the page): CNAME not pointed yet → show the exact record; HTTP DCV
blocked (customer WAF/redirect/O2O rules) → switch to `txt` and show the TXT record; CAA error → allow Google Trust
Services / Let's Encrypt in CAA; `Blocked` → owner releases the zone hold, then `Periksa Lagi`.

## 6. Root domains and Indonesian registrars

- Default for a subdomain (`kirim.tokobudi.id`): `CNAME kirim → cname.gerai.cc`.
- Root (`tokobudi.id`) works only where the DNS can CNAME the root: Cloudflare DNS (CNAME flattening, default at the
  apex) or a provider with ALIAS/ANAME. **Never** instruct an `A` record to Cloudflare IPs (apex proxying is an
  Enterprise add-on).
- Branches: `root_primary` (create root + `www`; `www` redirects to root after both are active) or `www_primary`
  (create `www` only; root forwarding stays at the registrar — warn when it has no HTTPS).
- Many local registrar panels accept no CNAME at `@`: the guide recommends moving nameservers to free Cloudflare DNS;
  **keep MX and mail records unchanged**.
- O2O (owner's zone is on another Cloudflare account): create the hostname first; their SSL/TLS mode must be Full or
  Full (strict) to avoid redirect loops; real-time validation only.

## 7. Quota, cost and operations

- Cloudflare for SaaS Free/Pro/Business: 100 custom hostnames included, then USD 0.10 each; API hard cap 50,000
  (Cloudflare Plans page, Aug 14, 2026). Every hostname counts until deleted, pending included.
- Daily job reads `GET /zones/{zone}/custom_hostnames/quota` and alerts at 80 % of `allocated`.
- Certificate issuance limit 15 per minute: bulk onboarding goes through a Queue.
- Super Admin `Gerai › Domain Mitra` tab lists every hostname with state, Cloudflare status, last probe and a
  `Hapus` action (TOTP + reason).
- Purge cache by hostname when a gerai's domain or mini-site content changes.

## 8. Tests (merge-blocking from M5)

Tenant A's session, IDs, API key, webhook secret and cookies against tenant B's host and the platform hosts — refused
on admin API, public API, `/lacak`, media, KV-backed endpoints, webhooks and cached pages. Host normalisation table
tests (case, port, trailing dot, IP literal, `X-Forwarded-Host`). DCV paths pass through. A suspended tenant returns
403 within the in-isolate cache window (≤ 30 s). An O2O test uses a domain in a second Cloudflare account (M6).
