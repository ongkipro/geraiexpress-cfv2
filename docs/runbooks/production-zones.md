# Runbook — Production zones, Cloudflare for SaaS, monitoring (TASK-602, DEC-228, spec 11 §2, OBSERVABILITY.md)

Every step is a **production action: the owner approves each one.** §1–§3 ran on 2026-11-18 under the owner's
explicit authorization (record in §5). Order: TASK-109 staging first, then production.

## 1. Resources (owner, Cloudflare dashboard or `wrangler`)

| Resource | Name | Fill into `wrangler.jsonc` `env.production` |
|---|---|---|
| D1 | `geraiexpress-control-production` | `d1_databases[0].database_id` |
| R2 | `geraiexpress-media-production` | — (name) |
| KV | cache namespace | `kv_namespaces[0].id` |
| Queues | `gx-mengantar-webhooks-production`, `gx-mengantar-finance-sync-production`, `gx-bulk-production`, `gx-hostnames-production` | — (names) |
| Rate limiter | namespace `3001` | — |
| Email Sending | `mail.geraiexpress.com` onboarded (TASK-112) | `send_email` |

Secrets (`wrangler secret put <NAME> --env production`, values from the owner's vault, never in Git):
`AUTH_SESSION_PEPPER`, `KEK_SECRET`, `PROBE_SECRET`, `TURNSTILE_SECRET_KEY`, `MENGANTAR_PARTNER_SECRET`,
`PARTNER_RELAY_URL`, `PARTNER_RELAY_SECRET`, `CF_SAAS_API_TOKEN`, `OPS_TOKEN`, `ALERT_WEBHOOK_URL`.
Vars to set: `TURNSTILE_SITE_KEY` (widget for `*.geraimitra.com` + `geraiexpress.com`), `CF_SAAS_ZONE_ID` (`geraimitra.com` zone id).

## 2. Zone setup — spec 11 §2 steps 1–6

| # | Step | Check |
|---|---|---|
| 1 | `geraiexpress.com` and `geraimitra.com` are separate registrable domains on the account | both zones Active |
| 2 | Enable Cloudflare for SaaS on `geraimitra.com` (payment method required) | SSL/TLS → Custom Hostnames page available |
| 3 | Proxied `AAAA fallback 100::` on `geraimitra.com`; set `fallback.geraimitra.com` as fallback origin | status **Active** |
| 4 | Proxied `CNAME cname → fallback.geraimitra.com` | `dig +short cname.geraimitra.com` returns Cloudflare IPs |
| 5 | Worker routes come from `wrangler.jsonc` on deploy: Custom Domains `geraiexpress.com`, `www.`, `app.`, `owner.`, `hooks.`; `*/*` and `cname.geraimitra.com/*` on `geraimitra.com`. Staging: `*-stg.geraimitra.com/*` + `*-staging` platform hosts. Also proxied `AAAA * 100::` and `AAAA @ 100::` on `geraimitra.com` for first-level mini-site hosts | `wrangler deploy --dry-run --env production` lists the routes; after deploy, Workers → Routes shows them |
| 6 | API token: Zone `geraimitra.com` only — **SSL and Certificates: Edit** (custom hostnames) + **Zone: Read**; no account scope. Store as `CF_SAAS_API_TOKEN` | `curl -H "Authorization: Bearer …" https://api.cloudflare.com/client/v4/zones/<id>/custom_hostnames/quota` → 200 |

Also: a synthetic `probe` tenant + D1 row `probe.geraimitra.com` (`probe-stg.geraimitra.com` on staging; platform_subdomain, active)
for the `minisite-probe` probe (OBSERVABILITY.md). `probe` is a reserved slug, so it is seeded directly, never through the
approval flow (which would also call the live Partner API):
`wrangler d1 execute DB --remote --env <env> --command "INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES ('probe', 'probe', 'Probe', 'active', 0, 0); INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at, activated_at) VALUES ('probe.geraimitra.com', 'probe', 'platform_subdomain', 'active', 0, 0)"`
(owner approval; `/healthz` answers without touching the tenant object).

## 3. Deploy and verify

1. `deploy-production.yml` (manual, protected environment) on the verified SHA; D1 migrations; `pnpm do:migrate --env production`.
2. `pnpm probes --env production` → all 6 probes PASS (brand, app, owner, hooks, minisite-probe, relay).
3. Alert drill: `curl -X POST -H "authorization: Bearer $OPS_TOKEN" https://owner.geraiexpress.com/internal/ops/alert-drill`
   → the owner confirms 15 `[DRILL]` messages arrive (one per alert key of OBSERVABILITY.md); record in `BUILD-LOG.md`.
4. Synthetic breach per check (staging first): `pnpm probes --env production --force-fail app-health` (probe alert);
   the operator checks are proven by `apps/worker/test/telemetry/operator-checks.test.ts` (each threshold ± 1).
5. `RELEASE.md` snapshot → `production-gate` (docs/WORKFLOW.md §8).

## 4. Rollback

`pnpm exec wrangler rollback <version-id> --env production` (owner approval). D1/DO migrations are expand-only within a
release; restore paths in `docs/runbooks/backups-and-restore.md`.

## 5. Live record — 2026-11-18 (owner-authorized, account `ca58f2ac62b7c66e46e6ce654f585034`)

Wrangler ran with OAuth (`env -u CLOUDFLARE_API_TOKEN -u CF_API_TOKEN pnpm exec wrangler …`) so an inherited
zone-scoped token never took over. Config commit `c6ed6b0`.

| Resource | Staging | Production |
|---|---|---|
| D1 (`--location apac`, `running_in_region` APAC) | `geraiexpress-control-staging` `c25337ba-21be-4ae7-ab55-7c7a8df89bbb` | `geraiexpress-control-production` `e845e4b8-0c24-422d-8b92-0f31d1408ae9` |
| R2 (location hint APAC) | `geraiexpress-media-staging` | `geraiexpress-media-production` |
| KV | `geraiexpress-cache-staging` `ca9f844f1d7845cfb71de035884502cb` | `geraiexpress-cache-production` `b560e2279c45431e87620ad52dccb01f` |
| Queues | `gx-{mengantar-webhooks,mengantar-finance-sync,bulk,hostnames}-staging` | `gx-{mengantar-webhooks,mengantar-finance-sync,bulk,hostnames}-production` |
| Placement | `aws:ap-southeast-1` (`cf-placement: local-SIN`) | `aws:ap-southeast-1` (`cf-placement: local-SIN`) |
| Control migrations | `0000`–`0018` applied | `0000`–`0018` applied |
| Probe tenant (D1 + `pnpm do:migrate`) | `probe-stg.geraimitra.com`, DO v0 → v23 | `probe.geraimitra.com`, DO v0 → v23 |
| Secrets (`wrangler secret bulk`, values never printed) | 10/10; `MENGANTAR_PARTNER_SECRET` = sandbox Partner secret | 10/10; `MENGANTAR_PARTNER_SECRET` = placeholder until Mengantar issues the production Partner secret |
| Worker version | `c51a2428-6b43-4a80-afa9-1419cdd72ddb` | `d3794756-571a-40ce-8d69-d736ffb24586` |

`ALERT_WEBHOOK_URL` is set **empty** on both: `telemetry/alerts.ts` skips delivery only for an empty value (a
non-URL such as `disabled` would turn every alert into a failed fetch), so alerts are `alert.fired` log events until the
owner sets the channel webhook (`wrangler secret put ALERT_WEBHOOK_URL --env <env>`), then runs the §3 alert drill.
Zone step 6: `CF_SAAS_API_TOKEN` reads `custom_hostnames/quota` (200) and the fallback origin `fallback.geraimitra.com`
(`active`). Vars: `TURNSTILE_SITE_KEY` `0x4AAAAAAF6YLggBbRId8AR2`, `CF_SAAS_ZONE_ID` `d07b150f9b2180da692c5787ce1d954a`.

Live HTTPS checks after deploy:

| URL | Result |
|---|---|
| `https://geraiexpress.com/`, `/healthz` | 200, 200 (brand landing title "Aplikasi Kasir Agen Kirim Paket Multi-Ekspedisi - GeraiExpress") |
| `https://www.geraiexpress.com/` | 301 → `https://geraiexpress.com/` |
| `https://app.geraiexpress.com/masuk`, `/healthz` | 200, 200 (CSP + `x-frame-options: DENY`; `*.map` 404) |
| `https://owner.geraiexpress.com/masuk`, `/healthz` | 200, 200 |
| `https://hooks.geraiexpress.com/healthz` | 200 |
| `https://probe.geraimitra.com/healthz` | 200 |
| `https://geraimitra.com/` | 404 neutral page (`noindex`, "Halaman tidak ditemukan") |
| `pnpm probes --env staging` | PASS 5/5 |
| `pnpm probes --env production` | 5/6 — `relay-health` 526 (Cloudflare cannot validate the relay origin certificate: TASK-601 Origin CA on the `99ribu-prod` Traefik is still an owner step) |

Not done here: GitHub `staging`/`production` protected environments and deploy-workflow secrets (TASK-109), first Super
Admin bootstrap per environment (TASK-106), alert drill (§3.3), relay rollout (TASK-601), Email Sending inbox tests
(TASK-112). Rollback: `wrangler rollback <previous version> --env <env>` (§4); the first deploy has no previous version,
so a rollback means `wrangler delete` of the env Worker after owner approval.

### 5.1 Rollout log

| Date | Change | Control migrations | Staging Worker | Production Worker |
|---|---|---|---|---|
| 2026-11-18 | First go-live (`c6ed6b0`) | `0000`–`0018` | `c51a2428-6b43-4a80-afa9-1419cdd72ddb` | `d3794756-571a-40ce-8d69-d736ffb24586` |
| 2026-11-18 | DEC-246 Super Admin `/akun` + recovery codes (`5901a9d`, Sol R2 APPROVE) | `0019_super_admin_recovery_codes` | `6bfb94c4-3300-4575-8d19-8eeee5677604` | `c8285eb3-be44-4939-8c1b-285686540e04` |
| 2026-11-18 | TASK-701 Layar Pelanggan (`2d8caae`, Sol R7 APPROVE) | — (tenant `0024` via `pnpm do:migrate`, objects v24) | `82278278-ffd9-4846-9819-17400a07714a` | `62b42387-cdb0-4d0c-9135-ee59c078c989` |
