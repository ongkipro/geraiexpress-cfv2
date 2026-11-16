# Runbook — Production zones, Cloudflare for SaaS, monitoring (TASK-602, DEC-228, spec 11 §2, OBSERVABILITY.md)

Every step is a **production action: the owner approves each one.** Nothing here has been run against production.
Order: TASK-109 staging first (same steps on the team test zone), then production.

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
Vars to set: `TURNSTILE_SITE_KEY` (widget for `*.gerai.cc` + `geraiexpress.com`), `CF_SAAS_ZONE_ID` (`gerai.cc` zone id).

## 2. Zone setup — spec 11 §2 steps 1–6

| # | Step | Check |
|---|---|---|
| 1 | `geraiexpress.com` and `gerai.cc` are separate registrable domains on the account | both zones Active |
| 2 | Enable Cloudflare for SaaS on `gerai.cc` (payment method required) | SSL/TLS → Custom Hostnames page available |
| 3 | Proxied `AAAA fallback 100::` on `gerai.cc`; set `fallback.gerai.cc` as fallback origin | status **Active** |
| 4 | Proxied `CNAME cname → fallback.gerai.cc` | `dig +short cname.gerai.cc` returns Cloudflare IPs |
| 5 | Worker routes come from `wrangler.jsonc` on deploy: Custom Domains `geraiexpress.com`, `www.`, `app.`, `owner.`, `hooks.`; `*/*` and `cname.gerai.cc/*` on `gerai.cc`. Staging: `*-stg.gerai.cc/*` + `*-staging` platform hosts. Also proxied `AAAA * 100::` and `AAAA @ 100::` on `gerai.cc` for first-level mini-site hosts | `wrangler deploy --dry-run --env production` lists the routes; after deploy, Workers → Routes shows them |
| 6 | API token: Zone `gerai.cc` only — **SSL and Certificates: Edit** (custom hostnames) + **Zone: Read**; no account scope. Store as `CF_SAAS_API_TOKEN` | `curl -H "Authorization: Bearer …" https://api.cloudflare.com/client/v4/zones/<id>/custom_hostnames/quota` → 200 |

Also: a synthetic `probe` tenant + D1 row `probe.gerai.cc` (`probe-stg.gerai.cc` on staging; platform_subdomain, active)
for the `minisite-probe` probe (OBSERVABILITY.md). `probe` is a reserved slug, so it is seeded directly, never through the
approval flow (which would also call the live Partner API):
`wrangler d1 execute DB --remote --env <env> --command "INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES ('probe', 'probe', 'Probe', 'active', 0, 0); INSERT INTO tenant_hostnames (hostname, tenant_id, kind, state, created_at, activated_at) VALUES ('probe.gerai.cc', 'probe', 'platform_subdomain', 'active', 0, 0)"`
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
