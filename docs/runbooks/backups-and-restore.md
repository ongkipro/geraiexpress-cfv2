# Runbook — Backups and restore (TASK-603, ADR-0006 §7)

Three layers, newest first:

| Layer | What | Window | Restore |
|---|---|---|---|
| D1 Time Travel | control plane (`DB`) | 30 days (Workers Paid) | `wrangler d1 time-travel restore <db> --timestamp=<ISO> --env <env>` (owner approval) |
| DO point-in-time recovery | each `GeraiVaultDO` SQLite | 30 days | in-object `await getBookmarkForTime(t)` → `await onNextSessionRestoreBookmark(b)` (returns an undo bookmark — record it) → `ctx.abort()`. Not supported in local development; no RPC exposes it yet (adding one is an R4 change with owner approval, used only after the R2 path is ruled out) |
| Daily R2 export | each provisioned tenant object | 35 days (`t/<tenant>/backup/<WIB day>.json.gz`) | `POST /internal/ops/backup-restore` into an empty scratch object, checksum compared |

## Daily export

- Cron `0 19 * * *` (02:00 WIB) → `exportAll`: every `active`/`suspended` tenant whose schema is `ok` exports itself
  (`exportBackup` RPC): gzip JSON of every table + DDL, R2 metadata `checksum` (SHA-256 of sorted content).
- Idempotent per WIB day; files older than 35 days are deleted by the next export.
- Any failure → one owner alert `tenant_backup_failed` (30-min dedupe) and a `tenant.object` event `backup_partial`.

## Restore drill (before the first production release, then quarterly)

1. Pick a tenant and a day: `t/<tenant>/backup/<YYYY-MM-DD>.json.gz` (R2 `geraiexpress-media-<env>`).
2. `curl -X POST -H "authorization: Bearer $OPS_TOKEN" https://owner.<apex>/internal/ops/backup-restore \
   -d '{"key":"t/<tenant>/backup/<day>.json.gz","target":"drill-<tenant>-<yyyymmdd>"}'`
   → `{ rows, sourceChecksum, restoredChecksum }`; they must be equal. The target must be a fresh name (an object that
   has tables is refused); the scratch object keeps the source tenant identity, is never routed by any host, and is
   only reachable through the ops token.
3. D1: `wrangler d1 time-travel info geraiexpress-control-<env> --timestamp=<ISO> --env <env>` and, into a scratch
   database, `wrangler d1 export geraiexpress-control-<env> --remote --env <env> --output d1.sql` +
   `wrangler d1 execute <scratch-db> --remote --file d1.sql` to prove a restorable copy (both default to `--local`
   without `--remote`).
4. Record RPO/RTO in `BUILD-LOG.md`.

## Local drill tools

- `node scripts/backup/d1-local-dump.mjs <local D1 .sqlite> <out.sql>` then `wrangler d1 execute DB --local --persist-to <scratch dir> --file <out.sql>`.
- Evidence of the first drill: `docs/evidence/TASK-603/drill.md`.

## Targets

- RPO: D1 ≤ 1 minute (Time Travel); tenant objects ≤ 1 minute inside 30 days (PITR), ≤ 24 h beyond (daily export).
- RTO: one tenant ≤ 15 minutes (restore into a scratch object + verification); control plane ≤ 30 minutes.
