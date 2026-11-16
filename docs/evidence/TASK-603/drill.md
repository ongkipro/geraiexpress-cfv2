# TASK-603 restore drill — local (2026-11-16)

Environment: `pnpm dev` state `.wrangler/state-dev` (local Worker on 127.0.0.1:55190, R2/DO/D1 simulated by Miniflare).

| Step | Command | Result |
|---|---|---|
| Export (both tenants) | `POST /internal/ops/backup-export` | `export.json`: 1 exported + 1 skipped (same WIB day), 0 failed; 340 ms |
| Restore object 1 (`sinarjaya`) | `POST /internal/ops/backup-restore` → `drill-sinarjaya-*` | `restore.json`: 85 rows, source = restored checksum `3ddcc41a…`; 92 ms |
| Restore object 2 (`drillkedua`) | same → `drill-drillkedua-*` | `restore-2.json`: 6 rows, checksum equal `bc737517…` |
| Refusals | restore into a real tenant id / a non-empty object | 422 `INVALID_TARGET` / 409 `restore target is not empty` |
| D1 control plane | `node scripts/backup/d1-local-dump.mjs <db.sqlite> out.sql` → `wrangler d1 execute --local --persist-to <scratch> --file` | 31 tables, 931 statements; counts equal in source and scratch: tenants 2, users 2, tenant_hostnames 3, audit_logs 9, d1_migrations 13, tenant_api_keys 1; ~4 s |

RPO/RTO recorded in `docs/runbooks/backups-and-restore.md`: RPO D1 ≤ 1 min (Time Travel), objects ≤ 1 min within 30 days
(PITR) and ≤ 24 h beyond (daily export); RTO one tenant ≤ 15 min, control plane ≤ 30 min. The drill above measured
< 1 s per object restore and ~4 s for D1 on local data volumes.

Remote drill (staging scratch environment: D1 Time Travel restore into a scratch database + two objects from R2) is
AWAITING_OWNER (TASK-109 staging resources).
