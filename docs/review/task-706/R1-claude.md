# TASK-706 Independent R4 Review — Round 1 (`claude`)

- **Task:** TASK-706 — Hosted CI green on `main` (DEC-209 non-impersonation gate, finding F1)
- **Risk Level:** R4
- **Base Commit:** `e43804d`
- **Reviewer:** `claude` (independent read-only CLI via `ai-ask claude --cwd ... --attach /tmp/task-706.patch`; fallback from `codex`, whose Linux bubblewrap sandbox failed to execute shell reads)
- **Date:** 2026-11-25

## 1. Verdict

**APPROVE.** One non-blocking nit on the comment wording (F1 below).

## 2. Confirmation

**`syncSellerKeyFromPartner` only maintains the seller's API key; it is not impersonation** (`apps/worker/src/do/gerai-vault/index.ts:2991-3039`):
- **Guards:** stops if the tenant is refused (`:2995`), if the gerai is not a Partner-registered seller with `connected` state (`:2997-2998`), or if a key rotation is running (`:2999`, re-checked inside the transaction at `:3012`).
- **What it writes:** only:
  - `mengantar_connections`: `encrypted_api_key`, `key_version`, and `webhook_state='secret_mismatch'` when the webhook was active (`:3015-3022`)
  - a `status_poll` timer (`:3026`)
  - DO audit entries (`:3001`, `:3027`)
- **What it does not touch:** no shipment rows, no `POST /order`, `pay-unpaid` or `DELETE /order` dispatch, no ledger or cash book, no INV allocation.
- **Key provenance:** Mengantar's own read-back `POST /sellers/api-key` (`credentials/rotation.ts:126`). Super Admin cannot supply an arbitrary key; request body carries only `reason`; `regenerate` is never called on this path.
- **Owner route:** `POST /gerai/:slug/sinkron-kunci` (`admin/gerai/routes.ts:285-295`, registered at `api/owner.ts:396`) requires `owner_recent` + `reason` (`:287`), writes D1 audit (`:293`), and returns `KeySyncOutcome` without the key (`rotation.ts:22-25`).
- **Gerai-side route:** `POST /settings/mengantar/sync-key` (`api/app.ts:1300-1306`) is `app_owner`-only and rate-limited 3/min via `syncOwnSellerKey` (`webhooks/settings.ts:97-111`).
- **Route path scan:** `sinkron-kunci` does not match `OWNER_FORBIDDEN_PATH` (`route-scan-lib.mjs:58`).

**Mutation checks remain intact:**
- `non-impersonation.test.mjs:23-26` (direct `createShipment`, aliased `cancelShipment`) is unchanged and passes (`2/2`).
- Removing the entry fails the scan with `do/gerai-vault/credentials/rotation.ts: Super Admin code calls vault.syncSellerKeyFromPartner()`; adding it makes the scan pass.
- Note: DEC-253 hosted `ci.yml` push run remains to be verified after push on `main`.

## 3. Findings

- **F1 (nit):** Allowlist comment at `scripts/ci/route-scan-lib.mjs:74` understated writes by omitting `webhook_state='secret_mismatch'` and the `status_poll` timer. Suggested exact wording: `updates mengantar_connections key/version (+ webhook_state->secret_mismatch, status_poll timer) and audit; no shipment or money mutation`.
- **F2 (low, pre-existing pattern, non-blocking):** DO `audit()` records `actor_type = "user"` with `initiatedBy: "super_admin"` in metadata (D1 audit at `routes.ts:293` records the real Super Admin actor).
