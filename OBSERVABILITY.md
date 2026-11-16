# Observability Contract — GeraiExpress v2 (`geraiexpress-cfv2`)

Updated: 2026-11-15
Status: REQUIRED (planned; no host is deployed yet — every probe below becomes mandatory when its host first goes live)

Probe format:

```text
Probe: <name>|<url>|<expected-status>|<contains-or-TBD>|<max-latency-ms>
```

## Probes (liveness, no database or provider call — spec 07 §2)

```text
Probe: brand-health|https://geraiexpress.com/healthz|200|"ok":true|1000
Probe: app-health|https://app.geraiexpress.com/healthz|200|"ok":true|1000
Probe: owner-health|https://owner.geraiexpress.com/healthz|200|"ok":true|1000
Probe: hooks-health|https://hooks.geraiexpress.com/healthz|200|"ok":true|1000
Probe: minisite-probe|https://probe.gerai.cc/healthz|200|"ok":true|1000
Probe: relay-health|https://relay.geraiexpress.com/healthz|200|"ok":true|1500
```

Run: `pnpm probes --env <local|staging|production> [--port 8787]` (exit 1 on any failure). A failure posts one alert
to `ALERT_WEBHOOK_URL` (the owner's chat incoming webhook) or prints it with `--alert-dry-run`; `--force-fail <name>`
is the synthetic-breach drill.

**Alert channel (TASK-110):** the Worker's `*/5` cron runs the operator checks in `apps/worker/src/telemetry/checks.ts`
and sends each alert once per 30 min per key (`alert_state` in D1) to the `ALERT_WEBHOOK_URL` secret; without it the
alert is only an `alert.fired` event in Workers Logs. Telemetry events are structured JSON with bounded labels and
pass `@gx/telemetry` redaction (keys in URL paths, bearer/`gx_live_` keys, phones, emails, OTPs, cookie/token/body
fields). Staging/production channel: owner provides the webhook URL and sets it with `wrangler secret put
ALERT_WEBHOOK_URL --env <env>` (owner-approved action).

`probe` is a platform-owned synthetic tenant (reserved slug, no real data) that exists only to prove tenant routing. Staging uses the same probes on the staging
hosts of spec 07 §7.

## Operator decisions and signals

| Decision | Signal (bounded labels; no tenant id, phone or token in metric labels) | Alert |
|---|---|---|
| Are counters able to issue shipments? | `shipment.issue` outcome rate (`issued`, `unpaid_hold`, `reconciliation_needed`, `failed`) and p95 latency, per courier | `reconciliation_needed` > 2 % of issues over 30 min, or any `failed` streak ≥ 5 → owner on-call |
| Are provider statuses fresh? | webhook inbox age (oldest `received` row), applied events per minute, polling floor lag per tenant bucket | oldest `received` > 15 min → alert |
| Is money in sync? | finance sync last success age, `Selisih Sync` and `quote_drift` counts, `provider_status_conflict` count | last sync > 60 min for any active tenant |
| Is a seller key being misused? | `401/403` per tenant on Public API, issue volume vs 7-day baseline, any `403 IP_NOT_ALLOWED` on Public API (DEC-232) | any Public API `IP_NOT_ALLOWED`; issue volume > 3× baseline in 1 h |
| Is the Partner relay usable? | relay `/healthz`, Partner call outcome by route, `409 relay_duplicate`, `403 IP_NOT_ALLOWED` | any `IP_NOT_ALLOWED`, or relay down 5 min |
| Are discounts applied at Mengantar? | rules by `verification_state` (`belum_diterapkan`, `sesuai`, `selisih`) and age (DEC-230) | `belum_diterapkan` older than 2 × `apply_sla_minutes` (default 2 h) becomes `selisih`; any `selisih` → Super Admin |
| Can people sign up and log in? | `email_outbox` sent/failed/expired counts, delivery latency, OTP verify success rate | failed or expired > 5 % per hour; bounce > 5 % per day (spec 12 §7) |
| Are custom domains healthy? | hostnames by state, quota `used/allocated`, probe failures (`hostname.lifecycle` events; D1 `custom_hostname_quota`, `tenant_hostnames.probe_failures`) | quota ≥ 80 % (`hostname_quota`, daily 02:00 WIB); an active host fails its probe 3 polls in a row (`hostname_probe.<host>`, 10-min poll) |
| Is a tenant object unhealthy? | DO RPC error rate and `overloaded` errors, tenants in `recovery` | any tenant in `recovery` |

Telemetry is diagnostic and may be sampled; it is never the audit trail (`audit_logs` in D1 and the tenant object are).
Never log credentials, cookies, OTPs, reset links, raw webhook bodies or full phone numbers.

## SLO targets (pilot, revisit after 30 days of data)

| SLI | Target |
|---|---|
| Counter issue success (issued or unpaid_hold) / attempts, excluding provider-declared outages | 99 % per 7 days |
| Webhook-to-status freshness: events applied within 5 min of receipt | 99 % |
| OTP email delivered within 60 s | 95 % |

## Runbook

```text
### app-health / brand-health / owner-health / hooks-health
- Symptom and impact: host down → counters cannot work (app) or statuses stop (hooks).
- Check: probe URL; Cloudflare Workers dashboard errors; `wrangler deployments list`.
- Mitigation: if the last deploy is the cause, roll back.
- Rollback: RELEASE.md Rollback-Command (expand-only migrations → no schema rollback).
- Escalation: owner; Cloudflare status page.

### minisite-probe
- Symptom: tenant routing broken for mini-sites.
- Check: D1 `tenant_hostnames` row for `probe.gerai.cc`; Worker route `*/*` on `gerai.cc`; spec 11 §3.
- Mitigation: restore route; bump `routing_version`.

### relay-health / IP_NOT_ALLOWED
- Symptom: Partner onboarding fails; Public API unaffected.
- Check: relay container logs (Coolify); egress IPv4 equals the allowlisted address (spec 10 §6).
- Mitigation: restart container; never auto-retry `api-key/regenerate`.
- Escalation: Mengantar partner contact for allowlist changes.

### webhook inbox stale
- Check: oldest `received` row per tenant; Queue backlog; consumer errors.
- Mitigation: the inbox alarm re-enqueues after 10 min; polling floor keeps statuses moving meanwhile.
```

After user-visible downtime, data loss, or a manual rollback, add a short blameless note to `BUILD-LOG.md`: impact,
cause, fix, and the check that now catches it.
