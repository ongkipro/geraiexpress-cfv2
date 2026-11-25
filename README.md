# GeraiExpress v2 (`geraiexpress-cfv2`)

**Cloudflare-native multi-courier counter POS, Mengantar financial reconciliation engine, and white-label outlet mini-site platform (`*.geraimitra.com`) for Indonesian retail shipping counters.**

> **Repository status:** the application code for milestones M1–M6 is in this repository. Current state, deployments and open owner actions live only in [`STATUS.md`](STATUS.md); what exists in code is mapped in [`docs/SYSTEM-MAP.md`](docs/SYSTEM-MAP.md).

## Start Here

1. Rules and invariants: [`AGENTS.md`](AGENTS.md). Working agreement: [`docs/WORKFLOW.md`](docs/WORKFLOW.md).
2. Where things are (hosts, bindings, storage, routes, background jobs, commands): [`docs/SYSTEM-MAP.md`](docs/SYSTEM-MAP.md).
3. Toolchain, local setup and test layers: [`docs/spec/07-DEVELOPMENT-GUIDE-AND-WORKFLOW.md`](docs/spec/07-DEVELOPMENT-GUIDE-AND-WORKFLOW.md).

---

## Language Convention

- **Engineering & specification artifacts (`*.md`, code identifiers, schemas, tests):** written in clear, declarative **English** so AI coding agents and engineers execute without ambiguity.
- **All product surfaces (UI labels, navigation, validation messages, WhatsApp templates, thermal receipts/labels, and public pages):** written in natural, market-friendly **Indonesian (EYD V)** tailored for Indonesian shop owners and counter staff aged 35–55+. Indonesian UI strings in these specs are normative.

---

## Why GeraiExpress v2 Exists

Research across 11 Indonesian multi-courier platforms, 396 recent app reviews (177 negative), public help/terms pages, and REA static/source-map teardowns (synthesis and traceability: `docs/research/01-COMPETITOR-RESEARCH-AND-FEATURE-TRACEABILITY.md`) exposed two structural gaps in the market:

1. **Product gap:** Most platforms are online-seller warehouse tools (OMS) with an "Agent" landing page bolted on. None combine (a) quote-locked counter receipts (`Struk Jujur`), (b) per-shift cash drawer reconciliation, (c) 58mm Web-Bluetooth label+receipt printing, (d) three-way sender/recipient/outlet masking with **centralized pickup at the outlet** and structured **return intake**, (e) precision financial sync with Mengantar's ledger, and (f) an instant white-label promo & QR pre-booking site per outlet (`<slug>.geraimitra.com`).
2. **Runtime gap:** Running a heavy Next.js/OpenNext server adapter on Workers created bundle bloat and friction for multi-domain routing. v2 uses **Hono + two Vite React 19 SPAs + server-rendered HTML for the public sites + D1 + Durable Objects + R2 + Queues** for near-zero cold starts and atomic per-outlet serialization.

---

## Host & Domain Topology

| Host / Pattern | Audience | Responsibility | Rendering |
|---|---|---|---|
| `geraiexpress.com` | Prospective counter owners | Brand marketing site (ten pages), static counter simulation on `/simulasi-kasir` (synthetic data, no API call), sign-up entry | Server-rendered HTML from the Worker |
| `app.geraiexpress.com` | **Gerai Admin** (Owner) & **Kasir** (Operator) | Counter POS, 58mm/10×15 printing, shift drawer, pickup manifests, return intake, contacts, Mengantar-synced finance, API/MCP keys | React 19 + Vite SPA + Hono API |
| `owner.geraiexpress.com` | **Super Admin** (Platform) | Outlet approval → Mengantar seller provisioning, per-outlet × courier discount/cashback rules, cross-outlet risk & sync oversight | React 19 + Vite SPA + TOTP (`aal2`) |
| `hooks.geraiexpress.com` | Mengantar servers | Cookie-less HMAC-verified shipment status webhook receiver → Cloudflare Queue | Hono Worker → Queue |
| `<slug>.geraimitra.com` *(+ Pro Custom Domains)* | Walk-in neighbors & local resellers/dropshippers | **Outlet White-Label Mini-Site**: store profile, hours, map, WA button, rate check, **QR Pre-Booking**, and privacy-safe tracking | Server-rendered HTML from the Worker + Cloudflare for SaaS |

---

## Navigation Simplicity Principle

To keep daily operations effortless for 35–55+ shop owners and counter staff, v2 enforces compact top-level navigation:
- **Gerai Workspace (`app.geraiexpress.com`) — seven sidebar entries over six server menu keys (DEC-241):** `Dashboard` · **`Buat Pengiriman`** · `Cek Ongkir & Resi` *(shares the `Buat Pengiriman` key)* · `Kiriman` · `Kontak` (`Data Pengirim` / `Data Penerima`) · `Keuangan` *(Owner only)* · `Pengaturan` *(Owner only, except the `Printer` page)*.
- **Super Admin Console (`owner.geraiexpress.com`) — 5 top-level menus:** `Ringkasan` · `Gerai` · `Tarif & Kurir` · `Pengawasan` · `Sistem & Audit`.

---

## Document Index

```text
geraiexpress-cfv2/
├── README.md                          # Project overview, language policy, host map, and doc index
├── AGENTS.md                          # Non-negotiable engineering, money, role, and security invariants
├── DECISIONS.md                       # Canonical owner & architecture decision register (DEC-201..DEC-253)
├── PRD.md                             # Evidence-backed Product Requirements Document (PR-01..PR-24)
├── ARCHITECTURE.md                    # Cloudflare Serverless topology, DO locking, and Mengantar relay
├── ROADMAP.md                         # Milestones M0..M6 and verification exit gates
├── RELEASE.md                         # Release manifest for the release being prepared
├── OBSERVABILITY.md                   # Post-deploy probes, SLO targets and runbook
├── BUILD-LOG.md                       # Durable implementation notes and evidence
├── TASKS.md                           # Sole execution queue
├── STATUS.md                          # Only workflow-state authority: Now / Next / Blockers
├── DESIGN.md                          # UI direction, composition contract and tokens (dotuiux)
├── design/                            # brief.md, refs/ teardowns, admin-contract.json (desk-scale size contract, DEC-239)
└── docs/
    ├── WORKFLOW.md                    # Working agreement: task lifecycle, verification ladder, review, release
    ├── DIAGRAMS.md                    # Mermaid: C4-style context/containers, ERDs, sequences, state machines
    ├── SYSTEM-MAP.md                  # What exists in code: hosts, bindings, storage, routes, jobs, commands
    ├── research/
    │   ├── 01-COMPETITOR-RESEARCH-AND-FEATURE-TRACEABILITY.md
    │   ├── 02-AUTOKIRIM-AUTHENTICATED-REA-TEARDOWN.md
    │   └── 03-SIMILAR-SYSTEMS-DEEP-REA-BENCHMARK.md
    ├── adr/
    │   ├── ADR-0001-cloudflare-serverless-stack.md
    │   ├── ADR-0002-dual-domain-whitelabel-saas.md
    │   ├── ADR-0003-mengantar-partner-and-egress-relay.md
    │   ├── ADR-0004-durable-object-per-gerai-vault.md
    │   ├── ADR-0005-three-way-masking-and-return-intake.md
    │   └── ADR-0006-storage-split-d1-control-plane-do-tenant-data.md
    ├── spec/
    │   ├── 01-DATA-MODEL-AND-LEDGER.md
    │   ├── 02-PRICING-DISCOUNT-AND-CASHBACK.md
    │   ├── 03-COUNTER-POS-PRINTING-AND-SHIFT.md
    │   ├── 04-PICKUP-MANIFEST-AND-RETURNS.md
    │   ├── 05-IAM-SECURITY-AND-PRIVACY.md
    │   ├── 06-DOMAINS-MENUS-AND-ROUTES.md
    │   ├── 07-DEVELOPMENT-GUIDE-AND-WORKFLOW.md
    │   ├── 08-OPENAPI-AND-MCP-CONTRACT.md
    │   ├── 09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md
    │   ├── 10-PARTNER-RELAY-VPS-STATIC-EGRESS.md
    │   ├── 11-CLOUDFLARE-SAAS-HOSTNAMES-AND-TENANT-ROUTING.md
    │   └── 12-TRANSACTIONAL-EMAIL-CLOUDFLARE.md
    ├── visual/
    │   ├── 01-DESIGN-SYSTEM-AND-ERGONOMICS.md
    │   ├── 02-WIREFRAMES-COUNTER-AND-ADMIN.md
    │   ├── 03-WHITELABEL-GERAI-MINISITE.md
    │   ├── 04-THERMAL-LABEL-AND-RECEIPT-LAYOUT.md
    │   ├── 05-SHIPMENT-CREATION-AND-COURIER-SELECTION-FLOW.md
    │   ├── 06-REMAINING-MENUS-WIREFRAMES.md
    │   ├── 07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md
    │   ├── 08-PERIOD-FILTER-AND-SETTINGS-NAVIGATION.md
    │   └── 09-BRAND-MARKETING-DESIGN-SYSTEM-AND-SEO.md
    ├── runbooks/                      # Owner-run production steps
    │   ├── backups-and-restore.md
    │   ├── email-deliverability.md
    │   ├── partner-relay-production.md
    │   └── production-zones.md
    ├── review/                        # Archived independent reviews and dispositions
    ├── evidence/                      # Per-task and per-decision verification evidence
    └── archive/                       # Superseded work queues
```

Code layout (`apps/`, `packages/`, `infra/`, `scripts/`, `e2e/`): [`docs/SYSTEM-MAP.md`](docs/SYSTEM-MAP.md) §2.
