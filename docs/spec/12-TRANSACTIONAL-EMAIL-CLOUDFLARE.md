# 12 — Transactional Email (Cloudflare Email Sending only)

Owner of: every email GeraiExpress sends. Decision: DEC-227 (one provider, Cloudflare Email Sending; no second
provider wired in parallel). Method source: dotfiles skill `cloudflare-email-service`. Cloudflare pages read
2026-11-15: Pricing (updated 2026-06-09), Limits (2026-10-30), Local sending and Send bindings (2026-10-15).

---

## 1. Scope

Transactional only (Cloudflare permits no marketing or bulk mail on this service):

| Template id | Trigger | Recipient |
|---|---|---|
| `signup_otp` | `/daftar` step 1 | applicant email |
| `password_reset` | `/lupa-sandi` | account email |
| `kasir_invite` | owner invites a Kasir | invitee email |
| `email_change_otp` | `Akun Saya › Ganti Email` | new email |
| `application_status` | Super Admin approves/rejects an outlet application | owner email |
| `security_alert` | new-device login of an owner or Super Admin | account email |
| `application_submitted` | an outlet application is submitted or resubmitted (control `0020`) | applicant email |
| `admin_new_application` | the same event | each active Super Admin (at most 10) |

No receipts, shipment updates or promotions by email (receipts go to WhatsApp links; promotions are out of scope).

## 2. Account, domain and binding

- **Plan:** Workers Paid (required for sending to arbitrary recipients). 3,000 emails per month included, then
  USD 0.35 per 1,000 (Pricing page). New accounts start with a conservative daily quota that grows with good sending.
- **Sending domain:** `geraiexpress.com` onboarded to Email Sending (Cloudflare DNS; Cloudflare configures SPF and
  DKIM records). Add DMARC on `geraiexpress.com`: start `p=none` with `rua` reports for 2 weeks, then `p=quarantine`.
- **From:** `GeraiExpress <noreply@geraiexpress.com>`; `Reply-To: bantuan@geraiexpress.com` (Email Routing to the
  support inbox).
- **Binding:** `"send_email": [{ "name": "EMAIL", "allowed_sender_addresses": ["noreply@geraiexpress.com"] }]`.
  No API key exists for email.
- **Never** send from `geraimitra.com` or a tenant custom domain (tenant domains are customer-controlled; DEC-202).

## 3. Sending path

1. The auth flow writes an `email_outbox` row in D1 (`id`, `template_id`, `to_email_hash`, `to_email_encrypted`,
   `payload_encrypted` — AES-256-GCM with `KEK_SECRET`, holding the rendered variables including the plain OTP or
   invite link so a retry after a crash can rebuild the message —, `expires_at` (= the OTP/link expiry), `state`,
   `attempts`, `next_attempt_at`, `lease_until`, `created_at`, `sent_at`, `provider_message_id`, `last_error_code`) in
   the same D1 batch as the OTP hash/invite. `state` is `queued | sending | sent | failed | expired | suppressed`.
   `payload_encrypted` and `to_email_encrypted` are nulled on every terminal state (`sent`, `failed`, `expired`,
   `suppressed`).
2. `dispatchDue(env)` (`apps/worker/src/email/mailer.ts`) claims due rows with a 60 s lease — a row left `sending`
   by a crash is claimed again once its lease expires — and `sendOne` (the only caller of `env.EMAIL.send`) builds
   subject, `text` **and** `html` from the Indonesian template, sends, and records the result. It runs from the `*/5`
   Cron and through `waitUntil` right after an enqueue.
3. Retry: transient errors back off (30 s, 2 min, 5 min; max 4 attempts) and **never after `expires_at`** (an expired
   OTP is not sent; the user requests a new one). `E_RECIPIENT_SUPPRESSED` and hard bounces are terminal and shown as
   `Email tidak dapat menerima pesan. Periksa alamat email.`
4. OTP rate limits (spec 05 §2) apply before the outbox: max 3 OTP emails per address per 15 min and 10 per IP per hour.
5. The OTP is verified against its hash + pepper; its plain value exists only inside `payload_encrypted` until sent or
   expired and is never written to production logs (logs carry `to_email_hash`). Locally, `wrangler dev` writes the
   simulated message to local files — acceptable for development only (§5).

## 4. Content rules (deliverability)

- Indonesian subject, honest and short, e.g. `Kode verifikasi GeraiExpress: 482915` (code also in the body).
- Plain-text part always present; HTML is simple (no images required, no URL shorteners, links only to
  `geraiexpress.com` hosts).
- Footer: platform legal name and support address from `platform_legal_profile` (DEC-218); why the user received it.
- No tracking pixels; no attachments.

## 5. Local development

`wrangler dev` simulates the binding by default: messages are logged and saved to local files, nothing is sent. Tests
assert on the outbox row and the logged message. A `remote: true` binding (real sending) is used only for the
deliverability gate below, with addresses the team owns.

## 6. Deliverability gate (before the first real signup — M1 exit, owner approval for the DNS change)

Pass all of these on the production sending domain, record evidence in `BUILD-LOG.md`:

1. SPF and DKIM `pass`, DMARC `pass` (aligned) in the received headers of each test message.
2. Inbox (not spam/promotions) for `signup_otp` and `password_reset` at Gmail, Outlook.com and Yahoo, two sends each.
3. Delivery time under 60 s for every OTP test.
4. A mail-tester style score of at least 9/10.

If any check fails, fix the cause (DNS, content, sender name) and re-run; DEC-227 is re-opened only with recorded
evidence that Cloudflare Email Sending cannot pass after fixes. Adding a second provider in parallel is not allowed.

## 7. Operations

- Watch the Email Service analytics (delivered, bounced, suppressed) weekly in pilot; alert when the bounce rate of a
  day exceeds 5 % or when sends hit the daily quota (request an increase through Cloudflare's limit form before the
  public launch).
- Suppression list: an address suppressed after a hard bounce stays suppressed until the user changes their email.
