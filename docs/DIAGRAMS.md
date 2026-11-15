# GeraiExpress v2 — Architecture & Flow Diagrams (Mermaid)

Rendered views of the accepted contracts. **The specs own the facts**; when a diagram and a spec disagree, the spec
wins and this file is corrected. Diagrams are validated with `mmdc` (mermaid 12) before commit; GitHub renders them.

| # | Diagram | Type | Source of truth |
|---|---|---|---|
| 1 | System context | flowchart (C4-style) | ARCHITECTURE §1, ADR-0002/0003 |
| 2 | Containers and stores | flowchart | ARCHITECTURE §2, ADR-0006, spec 07 §3 |
| 3 | Request routing by host | flowchart | ARCHITECTURE §3, spec 11 §3 |
| 4 | Control-plane data (D1) | ERD | spec 01 §0, §2.6–2.7, spec 11 §4 |
| 5 | Tenant data (`GeraiVaultDO`) | ERD | spec 01 §0–§2.5 |
| 6 | Counter checkout and dispatch | sequence | spec 03 §1, ADR-0004, spec 09 §3 |
| 7 | Webhook ingest and apply | sequence | spec 01 §2.7, §3 |
| 8 | Finance sync (`/invoices`) | sequence | spec 09 |
| 9 | Custom domain onboarding | sequence | spec 11 §5 |
| 10 | Shipment status (effective) | state | spec 01 §3 |
| 11 | Counter payment | state | spec 03 §1.1 |
| 12 | Sign-up and OTP email | sequence | spec 05 §2, spec 12 |
| 13 | Partner API via relay | sequence | spec 10, DEC-219 |
| 14 | Milestones | flowchart | ROADMAP, TASKS |

---

## 1. System context

```mermaid
flowchart LR
    owner["Pemilik Gerai<br/>(owner)"]
    kasir["Kasir"]
    sender["Pengirim walk-in /<br/>reseller"]
    recipient["Penerima paket"]
    superadmin["Super Admin<br/>(GeraiExpress)"]
    integr["Integrasi / AI agent<br/>(API key, MCP)"]

    subgraph GX["GeraiExpress v2 (Cloudflare)"]
        app["app.geraiexpress.com<br/>POS + owner workspace"]
        adm["owner.geraiexpress.com<br/>Super Admin console"]
        mini["slug.gerai.cc / custom domain<br/>gerai mini-site"]
        hooks["hooks.geraiexpress.com<br/>webhook ingest"]
        brand["geraiexpress.com<br/>brand site"]
    end

    relay["Partner relay<br/>(VPS, static IPv4)"]
    mpub["Mengantar Public API<br/>(per-seller key)"]
    mpart["Mengantar Partner API<br/>(IP allowlist)"]
    cfmail["Cloudflare Email Sending"]

    owner --> app
    kasir --> app
    superadmin --> adm
    sender --> mini
    recipient --> mini
    integr --> app
    app --> mpub
    adm --> relay --> mpart
    mpub -. "status webhooks" .-> hooks
    app --> cfmail
    brand --> app
```

## 2. Containers and stores

```mermaid
flowchart TB
    subgraph Edge["Cloudflare edge"]
        waf["DNS · WAF · rate limit ·<br/>Turnstile · SSL for SaaS"]
    end
    subgraph Worker["Primary Worker (Hono, one deployment)"]
        hc["Host classifier<br/>(spec 11 §3)"]
        api["/api/app · /api/owner ·<br/>/api/v1 · /mcp"]
        ssr["Hono JSX SSR<br/>(brand + mini-sites)"]
        assets["Static Assets<br/>(Vite React PWAs)"]
        qc["Queue consumers ·<br/>Cron handlers"]
    end
    subgraph Stores["State"]
        d1[("D1 DB<br/>control plane")]
        vault[("GeraiVaultDO ×N<br/>SQLite per gerai")]
        quota[("PartnerQuotaDO")]
        r2[("R2 BUCKET<br/>t/tenant_id/…")]
        kv[("KV CACHE_KV<br/>area search only")]
        q[["Queues: webhooks,<br/>finance sync, bulk"]]
    end
    email["send_email EMAIL"]
    relay["partner-relay (VPS)"]
    mengantar["Mengantar APIs"]

    waf --> hc
    hc --> api & ssr & assets
    api -- "RPC (tenant id from host + session)" --> vault
    api --> d1
    api --> kv
    api --> r2
    api --> email
    vault -- "outbox: versioned upserts" --> d1
    vault -- "write-ahead journal, then call" --> mengantar
    api --> quota --> relay --> mengantar
    q --> qc --> vault
```

## 3. Request routing by host

```mermaid
flowchart TD
    req([Request]) --> dcv{"/.well-known/acme-challenge<br/>or pki-validation?"}
    dcv -- yes --> pass[Pass through untouched]
    dcv -- no --> norm["Normalise Host<br/>(lowercase, no port/dot,<br/>ignore X-Forwarded-Host)"]
    norm --> plat{"Exact platform host?"}
    plat -- "geraiexpress.com" --> brandctx[MARKETING_APEX]
    plat -- "app." --> appctx["GERAI_WORKSPACE<br/>__Host-ge_app"]
    plat -- "owner." --> ownctx["PLATFORM_OWNER<br/>__Host-ge_owner + TOTP"]
    plat -- "hooks." --> hookctx["WEBHOOK_INGEST<br/>token hash → tenant"]
    plat -- no --> probe{"/.well-known/<br/>geraiexpress-probe/nonce?"}
    probe -- yes --> hmac["HMAC(host + nonce)<br/>no tenant data"]
    probe -- no --> lookup[("D1 tenant_hostnames<br/>(≤30 s isolate cache)")]
    lookup --> st{state}
    st -- "unknown / pending / purged" --> n404[Neutral 404]
    st -- suspended --> n403["403 Gerai tidak aktif"]
    st -- recovery --> n503["503 + Retry-After"]
    st -- active --> tenant["TENANT_MINISITE<br/>(tenant context)"]
```

## 4. Control-plane data (D1)

```mermaid
erDiagram
    USERS {
        text id PK
        text email UK
        text password_hash
        int created_at
    }
    SESSIONS {
        text id PK
        text user_id FK
        text host_context
        int expires_at
    }
    EMAIL_OTPS {
        text id PK
        text email_hash
        text otp_hash
        int expires_at
        int failed_attempts
    }
    SUPER_ADMINS {
        text user_id PK
        text totp_secret_encrypted
    }
    TENANTS {
        text id PK
        text slug UK
        text status
        int routing_version
    }
    TENANT_MEMBERS {
        text tenant_id FK
        text user_id FK
        text role
    }
    TENANT_HOSTNAMES {
        text hostname PK
        text tenant_id FK
        text kind
        text state
        text cf_custom_hostname_id
    }
    TENANT_API_KEYS {
        text id PK
        text tenant_id FK
        text key_hash
        text scopes
    }
    TENANT_DISCOUNT_RULES {
        text id PK
        text tenant_id FK
        text courier_code
        int assigned_bps
    }
    WEBHOOK_ROUTES {
        text token_hash PK
        text tenant_id FK
        int key_version
        text state
    }
    SHIPMENT_INDEX {
        text tenant_id PK
        text slug PK
        text awb_number
        text status
        int version
    }
    RECIPIENT_RISK_INDEX {
        text phone_hmac PK
        text tenant_id PK
        int delivered_count
        int rts_count
        int version
    }
    TENANT_DAILY_STATS {
        text tenant_id PK
        text day PK
        int shipments
        int version
    }
    EMAIL_OUTBOX {
        text id PK
        text template_id
        text to_email_hash
        text payload_encrypted
        int expires_at
        text state
    }
    USERS ||--o{ SESSIONS : has
    USERS ||--o| SUPER_ADMINS : "may be"
    USERS ||--o{ TENANT_MEMBERS : joins
    TENANTS ||--o{ TENANT_MEMBERS : has
    TENANTS ||--o{ TENANT_HOSTNAMES : "served on"
    TENANTS ||--o{ TENANT_API_KEYS : issues
    TENANTS ||--o{ TENANT_DISCOUNT_RULES : "priced by"
    TENANTS ||--o{ WEBHOOK_ROUTES : "receives via"
    TENANTS ||--o{ SHIPMENT_INDEX : "indexed in"
    TENANTS ||--o{ RECIPIENT_RISK_INDEX : contributes
    TENANTS ||--o{ TENANT_DAILY_STATS : reports
```

## 5. Tenant data (`GeraiVaultDO`, one SQLite store per gerai)

The link from every tenant table to D1 `TENANTS` is application-enforced (separate databases, ADR-0006).

```mermaid
erDiagram
    TENANT_SETTINGS {
        text tenant_id PK
        text default_label_format
        int counter_service_fee_enabled
        int cashier_may_pay_sender_cod
    }
    MENGANTAR_CONNECTIONS {
        text tenant_id PK
        text encrypted_api_key
        text encrypted_webhook_secret
        int key_version
        int synced_balance_idr
    }
    TENANT_OUTLETS {
        text id PK
        text mengantar_area_id
    }
    SENDER_CONTACTS {
        text id PK
        text true_phone
        int wa_verified_at
    }
    RECIPIENT_CONTACTS {
        text id PK
        text phone
        int cod_delivered_count
        int cod_rts_count
    }
    QUOTE_SNAPSHOTS {
        text id PK
        text cod_fee_mode
        int publish_shipping_idr
        int provider_net_shipping_idr
        int cod_fee_idr
        int cod_collection_total_idr
    }
    SHIPMENTS {
        text slug PK
        text status
        text provider_status
        text custody_stage
        int counter_due_idr
        text counter_payment_status
        int sender_cod_payable_idr
        int print_count
    }
    SHIPMENT_EVENTS {
        text id PK
        text shipment_slug FK
        int event_at
        text source
    }
    WEBHOOK_INBOX {
        text event_key PK
        int provider_event_at
        text state
    }
    COUNTER_RECEIPTS {
        text id PK
        text shipment_slug FK
        text event
        text direction
        int amount_idr
        text shift_id FK
        text bulk_batch_id FK
    }
    CASHIER_SHIFTS {
        text id PK
        int opening_float_idr
        int counted_cash_idr
    }
    PICKUP_BATCHES {
        text id PK
        text courier_code
        text driver_name
        text driver_vehicle_no
    }
    RETURN_INTAKES {
        text shipment_slug PK
        text otp_hash
    }
    BULK_IMPORT_BATCHES {
        text id PK
        text state
        int row_count
    }
    BULK_IMPORT_ROWS {
        text batch_id PK
        int row_no PK
        text shipment_slug
    }
    COUNTER_LEDGER_ENTRIES {
        text id PK
        text type
        int amount_idr
    }
    MENGANTAR_INVOICE_MIRROR {
        text invoice_id PK
        text type
        int amount_idr
    }
    SENDER_CONTACTS ||--o{ SHIPMENTS : sends
    RECIPIENT_CONTACTS ||--o{ SHIPMENTS : receives
    TENANT_OUTLETS ||--o{ SHIPMENTS : "picked up at"
    QUOTE_SNAPSHOTS ||--|| SHIPMENTS : locks
    SHIPMENTS ||--o{ SHIPMENT_EVENTS : history
    SHIPMENTS ||--o{ COUNTER_RECEIPTS : "paid via"
    CASHIER_SHIFTS ||--o{ COUNTER_RECEIPTS : "attributed to"
    PICKUP_BATCHES ||--o{ SHIPMENTS : "handed over in"
    SHIPMENTS ||--o| RETURN_INTAKES : "returned via"
    BULK_IMPORT_BATCHES ||--o{ BULK_IMPORT_ROWS : contains
    BULK_IMPORT_ROWS |o--o| SHIPMENTS : creates
    BULK_IMPORT_BATCHES ||--o{ COUNTER_RECEIPTS : "batch payment"
    SHIPMENTS ||--o{ COUNTER_LEDGER_ENTRIES : "book 1"
    MENGANTAR_INVOICE_MIRROR ||--o{ SHIPMENTS : "book 2 matches"
```

## 6. Counter checkout and dispatch

```mermaid
sequenceDiagram
    autonumber
    actor K as Kasir
    participant POS as POS PWA
    participant W as Worker
    participant V as GeraiVaultDO
    participant M as Mengantar Public API
    K->>POS: Tujuan, berat, mode COD
    POS->>W: POST /api/app/quotes
    W->>M: GET /order/estimate (Non-COD, then COD passes)
    M-->>W: price, estimatedSpecialPrice, codFee
    W-->>POS: courier cards (Kasir: customer price only)
    K->>POS: Pilih kurir · Catat pembayaran
    POS->>W: POST issue (Idempotency-Key)
    W->>V: issueShipment(slug, frozen quote)
    V->>V: write-ahead journal (in_flight)
    V->>M: POST /order (timeout 15 s)
    alt paid and AWB issued
        M-->>V: cnote_no, isPaid true
        V->>V: status ready_for_pickup · receipt row
    else balance too low
        M-->>V: isPaid false, batch_id
        V->>V: provider_unpaid_hold (await top-up + pay-unpaid)
    else timeout or unknown
        V->>V: reconciliation_needed (read back, never replay)
    end
    V-->>W: result
    alt AWB issued
        W-->>POS: label PDF + receipt
        POS->>K: Cetak 10×15 Paket + Bukti
    else unpaid hold or reconciliation
        W-->>POS: Menunggu Saldo / Sedang dicek (no label)
    end
```

## 7. Webhook ingest and apply

```mermaid
sequenceDiagram
    autonumber
    participant M as Mengantar
    participant H as hooks. Worker
    participant D as D1 webhook_routes
    participant V as GeraiVaultDO
    participant Q as Queue
    M->>H: POST /webhooks/mengantar/token
    H->>D: lookup SHA-256(token)
    alt unknown or revoked
        H-->>M: 404 (no body)
    else known tenant
        H->>V: verifyWebhook(raw body, headers)
        V->>V: HMAC + ±5 min · insert webhook_inbox (same tx)
        V-->>H: ok
        H->>Q: { tenant_id from D1, event_key }
        H-->>M: 200
        Q->>V: applyWebhook(event_key)
        V->>V: provider projection max(key) · combine with custody · mark applied
    end
    Note over V: Alarm re-enqueues rows still "received" after 10 min
```

## 8. Finance sync (`/invoices`)

```mermaid
sequenceDiagram
    autonumber
    participant C as Cron (15 min)
    participant Q as finance-sync Queue
    participant V as GeraiVaultDO
    participant M as Mengantar /invoices
    C->>Q: enqueue active tenants
    Q->>V: syncInvoices()
    V->>M: GET /invoices since cursor
    M-->>V: invoices + subItems + balanceAmount
    V->>V: upsert mirror (book 2) idempotently
    V->>V: match by cnote_no · ORDER_ID · batch
    V->>V: set provider_reconciled_cost_idr / reconciled COD credit
    V->>V: Laba Kas eligible when counter paid or not_required, and provider side reconciled
    V->>V: flag Selisih Sync / quote_drift
```

## 9. Custom domain onboarding

```mermaid
sequenceDiagram
    autonumber
    actor O as Owner
    participant W as Worker
    participant CF as Cloudflare for SaaS API
    participant DNS as Owner DNS
    O->>W: Domain sendiri: kirim.tokobudi.id
    W->>W: normalise · cap · not taken → row pending
    W->>CF: POST custom_hostnames (ssl http dv)
    W->>CF: GET (validation records)
    W-->>O: Tambahkan CNAME kirim → cname.gerai.cc
    O->>DNS: add CNAME
    loop every 10 min or Periksa Lagi
        W->>CF: GET status
    end
    W->>W: status and ssl active?
    W->>W: GET https://host/.well-known/geraiexpress-probe/nonce = HMAC?
    W->>W: state active · routing_version++
    Note over W,CF: pending/failed 7 days → DELETE (reaper)
```

## 10. Shipment status (effective, after combine)

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> issuing_in_flight: confirm at POS
    issuing_in_flight --> ready_for_pickup: paid + AWB
    issuing_in_flight --> provider_unpaid_hold: balance too low
    issuing_in_flight --> reconciliation_needed: timeout
    reconciliation_needed --> ready_for_pickup: read back ok
    provider_unpaid_hold --> ready_for_pickup: top-up + pay-unpaid
    ready_for_pickup --> cancelled: local cancel, read back
    ready_for_pickup --> handed_to_courier: manifest handover (custody)
    handed_to_courier --> in_transit: provider
    in_transit --> delivered: provider
    in_transit --> lost: provider
    in_transit --> undelivery_hold: provider
    in_transit --> rts_in_transit: provider
    undelivery_hold --> rts_in_transit: provider
    rts_in_transit --> provider_returned: provider report
    provider_returned --> rts_at_gerai: Meja Retur scan (custody)
    rts_in_transit --> rts_at_gerai: scan first (custody)
    undelivery_hold --> rts_at_gerai: scan first (custody)
    rts_at_gerai --> rts_returned_to_sender: OTP handback (custody)
    delivered --> [*]
    lost --> [*]
    cancelled --> [*]
    rts_returned_to_sender --> [*]
    note right of in_transit
        stuck_attention is a flag (>48 h), not a state
    end note
```

## 11. Counter payment

```mermaid
stateDiagram-v2
    [*] --> unpaid: create, counter_due > 0
    [*] --> not_required: create, counter_due = 0
    unpaid --> paid: mark_paid (in)
    paid --> unpaid: void_payment (out, reason)
    unpaid --> voided: INV cancelled
    not_required --> voided: INV cancelled
    paid --> voided: void_payment then cancel (owner)
    voided --> [*]
```

## 12. Sign-up and OTP email

```mermaid
sequenceDiagram
    autonumber
    actor U as Calon pemilik
    participant W as Worker
    participant D as D1
    participant E as EMAIL binding
    U->>W: /daftar email + Turnstile
    W->>W: rate limits (3 / 15 min per email, 10 / h per IP)
    W->>D: email_otps (hash) + email_outbox (encrypted payload) in one batch
    W->>E: sendMail(signup_otp) text + html
    alt sent
        W->>D: outbox sent · payload nulled
    else transient error
        W->>D: retry 30 s / 2 min / 5 min, never after expires_at
    end
    U->>W: 6-digit code (10 min, 5 wrong → 15 min lock)
    W->>D: verify hash · create session
```

## 13. Partner API via relay

```mermaid
sequenceDiagram
    autonumber
    participant SA as Super Admin
    participant W as Worker
    participant P as PartnerQuotaDO
    participant R as partner-relay (VPS)
    participant MP as Mengantar Partner API
    SA->>W: Setujui & Buka Akun Seller (TOTP)
    W->>P: reserve quota (60/min, 1000/day)
    W->>W: sign SHA256(METHOD:PATH:TYPE:BODY:TS:SECRET)
    W->>R: HTTPS + X-Relay-Signature, X-Relay-Id
    R->>R: verify HMAC · allowlisted path · 120 s duplicate guard
    R->>MP: forward exact bytes from static IPv4
    MP-->>R: response
    R-->>W: response
    W->>W: store seller key encrypted in tenant DO
```

## 14. Milestones

```mermaid
flowchart LR
    M0["M0 spec + design<br/>LOCKED 2026-11-15"] --> M1["M1 monorepo, auth,<br/>D1 + DO, CI, email gate"]
    M1 --> M2["M2 Mengantar SDK,<br/>onboarding, discounts"]
    M2 --> M3["M3 POS, printing,<br/>Paket Massal, contacts"]
    M3 --> M4["M4 finance sync,<br/>manifest, returns"]
    M4 --> M5["M5 mini-site, API,<br/>MCP, custom domains"]
    M5 --> M6["M6 relay prod, SaaS zone,<br/>backups, pilot"]
```
