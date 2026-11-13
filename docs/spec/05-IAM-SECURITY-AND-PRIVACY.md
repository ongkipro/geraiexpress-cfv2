# 05 — IAM, Multi-Domain Security & Privacy Protection (`geraiexpress-cfv2`)

This contract enforces role permissions, Cloudflare Worker cryptography, Indonesian Personal Data Protection compliance (UU PDP No. 27/2022; implementing rules pending counsel review), and anti-COD-scam tracking privacy.

---

## 1. Role & Permission Matrix

| Capability | `Public (*.gerai.cc)` | `Cashier (Operator)` | `Gerai Admin (Owner)` | `Super Admin (Platform)` |
|---|:---:|:---:|:---:|:---:|
| Publish rate check & create QR Pre-Booking (`INV` draft) | ✓ (Turnstile + IP limit) | ✓ | ✓ | – |
| Anonymous parcel tracking (initials + city only) | ✓ | ✓ (full for own outlet) | ✓ (full for own outlet) | ✓ (cross-outlet monitor) |
| Unlock full delivery recipient details (& POD photo if supplied by provider) | Requires last 4 digits of recipient phone | ✓ | ✓ | ✓ |
| Issue paid shipments, collect cash/QRIS, print label & receipt | – | ✓ | ✓ | **✗ (Never acts as outlet)** |
| Open/close own cash shift | – | ✓ | ✓ (all shifts in outlet) | Read summary |
| Scan pickup manifests & process `Meja Retur` | – | ✓ | ✓ | Read summary |
| View net discounted cost, margin/spread, & Mengantar balance | **✗** | **✗ (Stripped in API)** | **✓** | **✓** |
| Manage active couriers, mini-site, packing prices, staff, API/MCP keys | **✗** | **✗** | **✓** | – |
| Approve outlet → provision Mengantar seller account | **✗** | **✗** | **✗** | **✓ (Requires TOTP `aal2`)** |
| Configure per-outlet × courier discount/cashback & masking kill-switch | **✗** | **✗** | **✗** | **✓ (TOTP + Audit reason)** |
| Inspect cross-outlet COD phone risk history | **✗** | Sees 3-color badge only | Sees 3-color badge only | **✓ (`risk_review` + Audit)** |

---

## 2. Authentication, Host-Locked Sessions & Secret Wrapping

1. **Owned Authentication:**
   - Email-first 6-digit OTP verification in Bahasa Indonesia before password setup; staff join exclusively via single-use 7-day email invitations bound to a fixed role.
   - Passwords hashed via Web Crypto `PBKDF2-SHA256` at **`100,000` iterations** (to be regression-tested in `workerd` at M1 against the current Cloudflare Workers WebCrypto iteration ceiling) with unique 16-byte random salts plus server pepper (`AUTH_SESSION_PEPPER`).
   - Super Admin accounts require **TOTP (`aal2`)** with recency checks on sensitive reads and mutations.
2. **Domain-Isolated Cookies, CSRF & Bearer Separation:**
   - `app.geraiexpress.com` → `__Host-ge_app` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 7-day rolling max).
   - `owner.geraiexpress.com` → `__Host-ge_owner` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 12-hour max).
   - State-changing requests on `/api/app/*` and `/api/owner/*` enforce Hono `Origin` / CSRF verification.
   - Programmatic `/api/v1/*` and `/mcp` routes accept **`Authorization: Bearer` tokens exclusively** and ignore browser cookies completely.
3. **Envelope Encryption for Mengantar Credentials (`AES-256-GCM`):**
   - Seller `apiKey` and `webhookSecret` values are encrypted with `AES-256-GCM` (random 96-bit IV per ciphertext) using Worker secret `KEK_SECRET` before D1 persistence.
   - Plaintext keys are never returned to any UI or API response and are redacted from all upstream URL logs.

---

## 3. Public Tracking Privacy Benchmark (Anti-COD WhatsApp Scam)

Competitor reviews document widespread fraud where COD buyers receive scam WhatsApp transfer requests because public tracking endpoints expose recipient names, phones, or street addresses.

In `geraiexpress-cfv2`, `GET /api/public/track/:code` **truncates PII on the server before serialization**:
- **Returned to anonymous visitors:** `INV` slug, AWB, courier & service name, current status badge, hub scan timeline (timestamp + hub city), origin city → destination district/city, ETA, and outlet help contact (omitted when `RESELLER_DROPSHIP` preset is active, showing reseller store name instead).
- **Masked on server:** sender and recipient names reduced to initials (`Rina Kartika` → `R*** K******`).
- **Physically omitted from anonymous JSON:** sender/recipient/driver phone numbers, street/RT/RW lines, COD Rupiah amount, item descriptions, and POD photo URLs.
- **Verified Unlock Gate:** Entering the **exact last 4 digits of the recipient's phone number** + Turnstile token under strict per-IP rate limiting unlocks full delivery recipient confirmation (`history` consignee note, full recipient name, and POD photo asset *when supplied by the upstream courier/provider response*).

---

## 4. Automated CI Release Security Gates
Builds fail closed if:
1. Any `*.map` file is emitted into `dist/` client assets.
2. Static bundle scanning detects `SECRET`, `PARTNER`, `PRIVATE`, or key-shaped literals.
3. Any `/api/app/*` or `/api/owner/*` route lacks explicit auth + role-projection middleware.
