# Runbook — Email deliverability gate (TASK-112, spec 12 §6, DEC-227)

Owner-approved live steps. Production sign-up stays closed until every check below is recorded in `BUILD-LOG.md`.

## Current state (read-only check, 2026-11-16)

`pnpm email:deliverability --domain mail.geraiexpress.com`:

- `dns.spf` FAIL — `mail.geraiexpress.com` has no SPF yet (domain not onboarded to Email Sending).
- `dns.dkim` FAIL — no DKIM selector published yet.
- `dns.dmarc` PASS — `_dmarc.geraiexpress.com` already publishes `p=reject` (no `rua`). Aligned DKIM from Email
  Sending is required before the first send, otherwise every message is rejected. Spec 12 §2 plans `p=none` with
  `rua` for 2 weeks; changing the existing record is the owner's decision (it also covers other senders on the domain).

## Steps (owner, each one approved at the time)

1. Cloudflare dashboard or `wrangler email sending enable geraiexpress.com` (Cloudflare adds SPF + DKIM on the zone).
   Note the DKIM selector.
2. Decide the DMARC record for `geraiexpress.com` (keep `p=reject` or move to `p=none; rua=mailto:<owned inbox>` for
   two weeks, then `p=quarantine`).
3. `pnpm email:deliverability --domain geraiexpress.com --dkim-selector <selector>` → all `dns.*` PASS.
4. Deploy staging (TASK-109) and send, from staging, two `signup_otp` and two `password_reset` to an owned Gmail,
   Outlook.com and Yahoo address (12 sends). For each message save "Show original" headers to a file and run
   `pnpm email:deliverability --dkim-selector <selector> --headers <file> ...` → every file PASS (SPF, DKIM,
   aligned DMARC, delivery < 60 s).
5. Record inbox placement (Inbox / Spam / Promotions) for the 12 sends and a mail-tester score ≥ 9/10 in
   `BUILD-LOG.md`. Any failure: fix the cause (DNS, content, sender name) and repeat; a second provider is not added
   (DEC-227) unless Cloudflare Email Sending cannot pass after fixes, with recorded evidence.
