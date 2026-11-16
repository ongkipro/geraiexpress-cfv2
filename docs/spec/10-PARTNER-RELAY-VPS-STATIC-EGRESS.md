# 10 — Partner Relay on a VPS: Static IPv4 Egress for Mengantar (`geraiexpress-cfv2`)

- **Related:** `DEC-204`, `DEC-219`, `DEC-232`, `DEC-235`, `ADR-0003`, `ROADMAP.md` M6
- **Decision (DEC-235, 2026-11-17):** the dedicated GeraiExpress VPS (`139.180.142.31`) is retired and deleted. The
  relay co-hosts as one isolated, stateless Coolify container on the existing **`99ribu-prod`** Vultr instance; its
  Vultr **Reserved IPv4 `149.28.129.53`** is the egress address registered with Mengantar. The **simple push relay**
  (one HMAC secret) is unchanged. Options A/C below are kept as the record of how DEC-219/DEC-232 were decided.
- **Status:** Design. Nothing in this document is deployed. Any action on a live server, DNS record, or
  Mengantar production allowlist needs explicit owner approval at the time it is run.
- **Scope boundary:** this spec changes nothing in the 99ribu applications that share the host. The relay shares no
  network, volume or secret with them; it only uses the host's egress address, after owner approval.

---

## 1. Why a VPS is needed (verified facts only)

| Fact | Status | Source |
|---|---|---|
| Partner API production refuses any source IP not on the partner allowlist: `403 IP_NOT_ALLOWED`, "whatever it is signed with". | **Observed** | Mengantar Partner docs `#content-get-started`, `#content-authentication` (operations contract §1, accessed 2026-10-28) |
| Sandbox may not enforce the allowlist. | **Observed** | same |
| "Tell Mengantar before you change hosting or add a server." | **Observed** | same |
| Public API production reads succeeded from a non-allowlisted machine. | **Observed** (2026-10-14) | `geraiexpress-mengantar-public-api.md` |
| Public API label generation lists "Request IP is not allowed" as a 403 cause; whether it applies to Partner-created seller keys or to writes is **unknown**. | **Unknown — Q23** | Public docs `#content-label-generation-access` |
| Mengantar webhooks come from no fixed IP; our receiver cannot allowlist them by IP. | **Observed** | Public docs `#content-webhook` |
| Cloudflare Workers egress from shared, changing addresses. A dedicated Cloudflare egress IP needs the Zero Trust Enterprise add-on. | **Documented** | Cloudflare dedicated egress docs (research note §2) |

Conclusion: only the four Partner API routes strictly need one fixed, registered IPv4. Everything else stays on
Cloudflare. A small VPS is the cheapest fixed egress identity we control.

---

## 2. Topology

```text
 Super Admin clicks "Setujui & Buka Akun Seller Mengantar"
          │
          ▼
 ┌───────────────────────────┐   HTTPS (Cloudflare-proxied)    ┌──────────────────────────────────┐
 │ Cloudflare Worker         │ ──────────────────────────────► │ relay.geraiexpress.com           │
 │ PARTNER_TRANSPORT=relay   │  + X-Relay-* HMAC headers       │ (Cloudflare proxy, WAF rate rule)│
 │ signs Partner request     │                                 └───────────────┬──────────────────┘
 │ (Partner Secret stays     │                                                 │ origin TLS (Origin CA)
 │  in the Worker only)      │                                                 ▼
 └───────────────────────────┘                                 ┌──────────────────────────────────┐
                                                               │ 99ribu-prod (Vultr) · Coolify    │
                                                               │ container `partner-relay`        │
                                                               │ verifies HMAC + path allowlist   │
                                                               │ forwards exact bytes, no redirect│
                                                               └───────────────┬──────────────────┘
                                                                               │ egress from Reserved IPv4
                                                                               │ 149.28.129.53 (IPv6 off)
                                                                               ▼
                                                               ┌──────────────────────────────────┐
                                                               │ Mengantar Partner API (prod)     │
                                                               │ allowlist = [our IPv4]           │
                                                               └──────────────────────────────────┘
```

- **Inbound to the relay** goes through Cloudflare (orange-cloud DNS). The host firewall must accept 80/443 only
  from Cloudflare ranges (verify on `99ribu-prod` before go-live, §6 step 2), so the relay is never reachable directly.
- **Outbound from the relay** leaves through the host's primary IPv4, the Reserved IPv4 `149.28.129.53`. That address
  is what Mengantar allowlists. The relay container must not get IPv6 egress (every attached Docker network has
  `EnableIPv6=false` and a forced IPv6 connection fails — runbook §5 step 1b), so the source is always that IPv4.
- **Co-hosting isolation (DEC-235):** own Coolify application and Docker network, no shared volume, no shared
  environment variable, `read_only` root filesystem, non-root user, all capabilities dropped, memory limit 128 MB,
  no published host port (Coolify's proxy routes `relay.geraiexpress.com` only). The 99ribu workloads are untouched.
- **Public API, webhooks, D1, finance sync, POS:** unchanged, direct from Cloudflare (no relay hop).

---

## 3. Host options (decided: co-host on `99ribu-prod`, DEC-235)

| Option | What | Egress IP | Extra cost | Isolation | Recommendation |
|---|---|---|---|---|---|
| A. Shared host + reserved IPv4 *(historical — host deleted, DEC-235)* | Run `partner-relay` as one Coolify app on the existing `geraiexpress` VPS (Vultr `sgp`, IPv6 off, Cloudflare-only firewall). Attach a Vultr **Reserved IP** so the address survives a rebuild or migration. | Reserved IPv4 | Reserved IP fee only (check current Vultr price) | Shares the host with the v1 app; relay is stateless, ~64 MB RAM | **Recommended.** Same pattern the `99ribu-prod` host already uses for the AutoLaris IP allowlist. |
| B. Shared host, current IPv4 *(historical — not chosen, DEC-232)* | As A, but allowlist the instance's current address. | Instance IPv4 | None | As A | Rejected: a rebuild changes the IP and stops onboarding. |
| C. Dedicated micro VPS *(historical — not chosen, DEC-235)* | Smallest Vultr instance only for the relay, own firewall group, plus a reserved IPv4. | Reserved IPv4 | Smallest-plan fee + reserved IP | Full: no shared blast radius | Choose when the v1 host is retired or must not carry v2 traffic. |
| D. Cloudflare dedicated egress | Workers VPC → Gateway egress policy → dedicated IPs. | Cloudflare-assigned (2 cities) | Zero Trust Enterprise add-on | Full | Rejected for now: plan cost; revisit only if the Enterprise plan is bought for other reasons. |

**Decided (DEC-235):** neither A on the old host (deleted) nor C. The relay co-hosts on `99ribu-prod`, which already
carries a Vultr Reserved IPv4 (`149.28.129.53`) for the AutoLaris allowlist — Option A's pattern on a different host.
Moving to another host later is the same procedure as §7 ("IP change").

---

## 4. Relay contract (`infra/partner-relay`)

### 4.1 Request from the Worker

```http
POST https://relay.geraiexpress.com/forward
X-Relay-Timestamp: 1767000000
X-Relay-Id: 0b7e2c4a-5f1d-4e8b-9c3a-2d6f8e1a4b70
X-Relay-Target: /api/partner/v1/sellers/list
X-Relay-Signature: hex(HMAC-SHA256(RELAY_SECRET, ts + "\n" + id + "\n" + target + "\n" + hex(sha256(body))))
Content-Type: application/json
partner-id: <assigned Partner ID>
timestamp: <unix seconds, produced by the Worker>
signature: <Mengantar Partner SHA-256 signature, produced by the Worker>

<exact request body bytes>
```

### 4.2 Relay rules (the whole program)

1. **One secret:** `RELAY_SECRET` (HMAC-SHA256; `RELAY_SECRET_PREVIOUS` is also accepted only during a rotation
   window, §7), timestamp window ±60 s. Requests travel inside TLS end to end (Cloudflare edge, then Full (strict)
   with the Origin CA certificate), so a third party cannot capture one to replay it.
   **Duplicate guard:** the Worker generates `X-Relay-Id` (UUID) once per intentional attempt; a transport retry of
   the same attempt reuses it, a deliberate Worker retry gets a new one. The relay keeps an in-memory map of
   `X-Relay-Id` values seen in the last 120 s and answers a repeat with `409 relay_duplicate` without calling
   Mengantar. This blocks accidental double sends from client or proxy retries without blocking legitimate
   calls in the same second. The map is lost on restart; that is acceptable because TLS prevents capture and
   `api-key/regenerate` is never retried automatically (§4.3).
   Route semantics (Partner research §4–7), which decide what a retry may do:
   | Route | Body key | Repeat effect |
   |---|---|---|
   | `POST /sellers` (register) | `externalUserId` | Idempotent for a known `externalUserId` |
   | `POST /sellers/list` | filter | Read |
   | `POST /sellers/api-key` | `sellerId` | Returns the current key; creates one only if none exists |
   | `POST /sellers/api-key/regenerate` | `sellerId` | **Not idempotent**: every call invalidates the previous `apiKey` and rotates `callbackSecret`, which `api-key` cannot return later |
2. **Closed allowlist:** `X-Relay-Target` must be exactly one of the four Partner paths
   (`/sellers`, `/sellers/list`, `/sellers/api-key`, `/sellers/api-key/regenerate` under `/api/partner/v1`).
   The upstream origin is fixed config (`MENGANTAR_PARTNER_ORIGIN`), never taken from the request. Redirects are
   not followed.
3. **No Mengantar secrets on the relay host:** the Worker computes the Partner signature
   (`SHA256(METHOD:PATH:TYPE:BODY:TIMESTAMP:PARTNER_SECRET)`); the relay forwards the body bytes and exactly the
   headers `content-type`, `partner-id`, `timestamp`, `signature`.
4. **Bounds:** request body ≤ 64 KB, response ≤ 1 MB, upstream timeout 15 s, max 4 concurrent upstream calls.
   The partner-wide 60/min and 1,000 registrations/day limits are enforced in the Worker by `PartnerQuotaDO`.
5. **Logging:** method, target path, upstream status, latency, `X-Relay-Id`. **Never** bodies or headers:
   `api-key` responses contain seller API keys and callback secrets.
6. **Errors:** relay refusals use `relay_*` codes (`relay_auth_failed`, `relay_target_denied`, `relay_duplicate`,
   `relay_upstream_timeout`) so they are never confused with Mengantar's `403 IP_NOT_ALLOWED`.
7. **Health:** `GET /healthz` → `200 {"ok":true}` without calling Mengantar.
8. **Edge protection:** a Cloudflare WAF rate-limiting rule on `relay.geraiexpress.com` (e.g. 30 requests/min
   per IP) blocks brute-force noise before it reaches the relay host. No Cloudflare Access app is needed.

### 4.2b Rejected alternative: pull mode

The VPS polling the Worker for jobs (no public endpoint) was considered and rejected:
- Mengantar's `timestamp` must be within 5 minutes of provider time and every retry needs a fresh signature, so
  queued jobs either expire or force the Partner Secret onto the VPS.
- It adds a job queue, leases and result callbacks to the Worker for a flow that runs a few times a month.

### 4.3 Worker behaviour

- `PARTNER_TRANSPORT=relay` is required in production; there is **no direct-fetch fallback** (it would fail with
  `IP_NOT_ALLOWED` and adds a second code path).
- A timeout after the request may have reached Mengantar is `maybe_sent`. Recovery is per route:
  - An unexpected `409 relay_duplicate` means an earlier copy already entered the relay: treat it as `maybe_sent`.
  - `POST /sellers`: reconcile with `POST /sellers/list { externalUserId }` before any retry.
  - `POST /sellers/list`, `POST /sellers/api-key`: safe to retry with a fresh signature.
  - `POST /sellers/api-key/regenerate`: **never retried automatically.** Read the current key with
    `POST /sellers/api-key { sellerId }`; if `webhook_state = 'active'`, set it to `secret_mismatch` and ask the
    owner to copy the rotated Webhook Secret from Mengantar Seller Settings into `Pengaturan › Mengantar` (`/pengaturan/mengantar`)
    (PR-02b). Super Admin sees
    `Kunci diganti — perbarui secret webhook`.
- Relay unreachable → the outlet stays `registration_pending`; Super Admin sees **`Relay tidak terjangkau`** in
  `Sistem & Audit > Kesehatan Integrasi & Relay`. Counter work of already-connected outlets is unaffected.

---

### 4.4 Public API hardening without an IP allowlist (DEC-232)

- Seller keys live only encrypted in the tenant's `GeraiVaultDO` (spec 05 §2 item 3); they never reach a browser, log or
  response; the URL path key is redacted in every error (ARCHITECTURE §4.1).
- Per-tenant rate limits on quote, issue and cancel; issuing tools in MCP capped per day (spec 08).
- Key rotation fence (TASK-205) and immediate rotation on suspected exposure (`Sistem & Audit` action, TOTP).
- Anomaly alerts (`OBSERVABILITY.md`): any `403 IP_NOT_ALLOWED`, spikes of `401/403` per tenant, unusual issue volume
  per tenant versus its 7-day baseline.
- Egress for the Partner API only: the `99ribu-prod` Vultr Reserved IPv4 `149.28.129.53` (DEC-235).

## 5. Deployment shape (co-hosted on `99ribu-prod`, DEC-235)

- Coolify application `partner-relay`, image pinned by digest, no published host ports (Traefik routes
  `relay.geraiexpress.com` to the container), `restart: unless-stopped`, memory limit 128 MB, read-only root
  filesystem, non-root user.
- Relay env (Coolify): `RELAY_SECRET`, optional `RELAY_SECRET_PREVIOUS` (rotation only), `MENGANTAR_PARTNER_ORIGIN`. Worker secrets: `PARTNER_RELAY_URL`,
  `PARTNER_RELAY_SECRET` (same value as `RELAY_SECRET`), `MENGANTAR_PARTNER_ID`, `MENGANTAR_PARTNER_SECRET`.
- DNS: `relay.geraiexpress.com` A record, proxied, to `149.28.129.53`; covered by the existing
  `*.geraiexpress.com` Origin CA certificate; zone SSL mode Full (strict).
- `apps/worker` binds explicit hostnames only (`app.`, `owner.`, `hooks.`, apex, `*.geraimitra.com`), **never**
  `*.geraiexpress.com/*`, so a Worker `fetch` to `relay.` reaches the relay host instead of the Worker itself.
- Traefik access logs for this router stay at the default (no headers, no bodies).
- Size target: ≤ 80 lines of Node or Go, zero runtime dependencies beyond the standard library.

---

## 6. M6 verification checklist (all must pass before production onboarding)

1. Inside the relay container on `99ribu-prod`: `curl -4 -s https://api.ipify.org` (or any IP echo) returns
   `149.28.129.53`, the address registered with Mengantar.
2. `relay.geraiexpress.com/forward` with a bad HMAC or a timestamp older than 60 s → `401 relay_auth_failed`;
   with a valid HMAC but a non-allowlisted target → `403 relay_target_denied`; direct request to `149.28.129.53`
   on 443 with `Host: relay.geraiexpress.com` → refused (firewall admits Cloudflare ranges only).
3. Sandbox `POST /sellers/list` through the relay → `200`.
4. Production `POST /sellers/list` through the relay → `200`. The same call sent directly from a Worker →
   `403 IP_NOT_ALLOWED` (proves the allowlist is enforced and the relay is the reason it works).
5. Q23 is not a blocker (DEC-232): Public API calls stay direct from the Worker with the hardening of §4.4. If a
   `403 IP_NOT_ALLOWED` is ever seen on a Public API route, an alert fires and that exact route is added to the relay
   allowlist by a DEC entry — never a wildcard.
6. Relay logs for steps 3–4 contain no request or response bodies.

---

## 7. Operating procedures

- **IP change (rebuild, migration, Option B → A/C):** add the new address to the Mengantar allowlist first,
  confirm step 4 of §6 from the new host (run it inside the new container, or through a temporary proxied
  hostname such as `relay-next.geraiexpress.com`, because the firewall only admits Cloudflare), switch DNS, then
  ask Mengantar to remove the old address. Never the reverse order.
- **Secret rotation:** set `RELAY_SECRET_PREVIOUS` = old value and `RELAY_SECRET` = new value on the relay, update
  the Worker, then remove `RELAY_SECRET_PREVIOUS` after 10 minutes.
- **Reserved IP conversion:** convert the instance's current IPv4 to a Reserved IP in Vultr so the address does not
  change (verify the exact Vultr procedure and price at M6). The reserved address must be the instance's
  **primary** IPv4; a secondary address does not change the egress source. §6 step 1 proves it.
- **Monitoring:** Super Admin health tab shows relay reachability (last `/healthz`), last Partner call status, and
  the count of outlets in `registration_pending` / `registration_unknown`.
- **Disaster:** if `99ribu-prod` is lost, the Reserved IPv4 `149.28.129.53` survives: attach it to the replacement
  instance as its primary IPv4, deploy the same image, run §6 steps 1–4. No Mengantar allowlist change is needed.
- **Old host (DEC-235):** `139.180.142.31` was deleted by the owner. If it was ever registered with Mengantar, ask
  Mengantar to remove it after §6 step 4 passes from `149.28.129.53`.
