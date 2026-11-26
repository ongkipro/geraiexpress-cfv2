# TASK-603 restore drill — remote staging & production (2026-11-26)

- **Account:** Dedicated Cloudflare account `GeraiExpress` (`f235ecdb5517054b386c6d413569a103`), APAC (`aws:ap-southeast-1`).
- **Runbook:** `docs/runbooks/backups-and-restore.md` (ADR-0006 §7).
- **WIB backup day:** `2026-11-26` (daily cron `0 19 * * *` / 02:00 WIB had already written today's backups to R2 in both staging and production).
- **Secrets & PII:** Ops tokens injected via `secrets-env run` (never printed); zero tenant PII exported from production D1 or printed from any query; temporary local staging SQL dump removed immediately after remote import verification.

## 1. D1 Time Travel & Remote Scratch Database Restore

| Step | Target | Result |
|---|---|---|
| Time Travel info (staging) | `geraiexpress-control-staging` at `2026-11-26T11:09:48Z` | Bookmark `0000038d-00000004-0000512f-8ed2ad1f9b049856fbabe0e27a711ff6` |
| Time Travel info (production) | `geraiexpress-control-production` at `2026-11-26T11:09:48Z` | Bookmark `0000041a-00000008-0000512f-f1c2944f8e0283959b960f61e0292c81` |
| Remote export (staging) | `wrangler d1 export geraiexpress-control-staging --remote --env staging` | Bookmark `00000390-00000004-0000512f-94606ee4fc7cb81c09dc9d51833dddf4`; `55,896` bytes, `541` lines |
| Create scratch D1 (APAC) | `geraiexpress-drill-20261126` (`2e271970-a7d8-4398-b2d9-ecb248b62011`) | Created in region APAC (`wrangler.jsonc` untouched) |
| Remote import into scratch D1 | `wrangler d1 execute geraiexpress-drill-20261126 --remote --yes --file` | **197 queries** executed in `10.39 ms` (`4.92 s` upload + import), `549` rows read, `613` rows written, `0.42 MB`, bookmark `00000000-0000001e-0000512f-5194e953d685b6c5dbc418f0582fb842` |
| Parity verification | Source `geraiexpress-control-staging` vs scratch `geraiexpress-drill-20261126` | **33/33 tables identical**; exact row-count match across all checked control-plane tables: `d1_migrations=21`, `tenants=2`, `users=2`, `tenant_members=1`, `tenant_hostnames=2`, `courier_service_catalog=16`, `tenant_discount_rules=14`, `audit_logs=1`, `tenant_api_keys=0` |

## 2. R2 Daily Tenant Exports → Scratch Durable Object (`drill-*`) Restore

### Staging (`owner-staging.geraiexpress.com`, R2 `geraiexpress-media-staging`)

| Step | Request / Target | HTTP | Elapsed | Result |
|---|---|---:|---:|---|
| Verify daily export | `POST /internal/ops/backup-export` | 200 | 1,876 ms | `exported: 0, skipped: 2, failed: []` (02:00 WIB cron already backed up 2/2 active tenants) |
| Restore object 1 (`demo-tenant-001`) | `t/demo-tenant-001/backup/2026-11-26.json.gz` → `drill-demo-20261126-019724` | 200 | 595 ms | **894 rows**, `sourceChecksum === restoredChecksum` (`8473a192…17575d`) |
| Restore object 2 (`probe`) | `t/probe/backup/2026-11-26.json.gz` → `drill-probe-20261126-019724` | 200 | 884 ms | **3 rows**, `sourceChecksum === restoredChecksum` (`83c4d5bf…e4dd05`) |
| Refusal: real tenant target | `target: "demo-tenant-001"` | 422 | 41 ms | `INVALID_TARGET` |
| Refusal: non-empty scratch target | `target: "drill-demo-20261126-019724"` | 409 | 398 ms | `RESTORE_REFUSED` (`target sudah berisi data`) |

### Production (`owner.geraiexpress.com`, R2 `geraiexpress-media-production`)

| Step | Request / Target | HTTP | Elapsed | Result |
|---|---|---:|---:|---|
| Verify daily export | `POST /internal/ops/backup-export` | 200 | 1,380 ms | `exported: 0, skipped: 4, failed: []` (02:00 WIB cron already backed up 4/4 active tenants) |
| Restore object 1 (`demo-tenant-001`) | `t/demo-tenant-001/backup/2026-11-26.json.gz` → `drill-demo-20261126-023026` | 200 | 517 ms | **894 rows**, `sourceChecksum === restoredChecksum` (`9ee685f4…68b0a1a`) |
| Restore object 2 (`probe`) | `t/probe/backup/2026-11-26.json.gz` → `drill-probe-20261126-023026` | 200 | 711 ms | **3 rows**, `sourceChecksum === restoredChecksum` (`78b1e766…1d9634`) |
| Refusal: real tenant target | `target: "demo-tenant-001"` | 422 | 52 ms | `INVALID_TARGET` |
| Refusal: non-empty scratch target | `target: "drill-demo-20261126-023026"` | 409 | 362 ms | `RESTORE_REFUSED` (`target sudah berisi data`) |

## 3. Measured RPO / RTO vs Targets

| Metric | Target (`docs/runbooks/backups-and-restore.md`) | Measured (2026-11-26 remote) | Verdict |
|---|---|---|---|
| D1 control plane RPO | ≤ 1 min (Time Travel) | Time Travel bookmark resolved to exact UTC timestamp on both staging & production | **PASS** |
| Tenant DO RPO | ≤ 1 min PITR / ≤ 24 h daily R2 export | Daily 02:00 WIB R2 export present for 2/2 staging & 4/4 production tenants | **PASS** |
| Tenant DO RTO (single tenant) | ≤ 15 min | **0.52–0.88 s** (894-row demo object restored & SHA-256 verified) | **PASS** |
| Control plane D1 RTO | ≤ 30 min | **~15 s active** (export + download + remote scratch D1 upload & 197-query import in 4.92 s) | **PASS** |

*Cleanup (2026-11-26, owner-approved): Temporary scratch D1 `geraiexpress-drill-20261126` (`2e271970-a7d8-4398-b2d9-ecb248b62011`) deleted cleanly via `wrangler d1 delete geraiexpress-drill-20261126 --skip-confirmation`; `wrangler d1 list` confirmed only `geraiexpress-control-staging` and `geraiexpress-control-production` remain.*
