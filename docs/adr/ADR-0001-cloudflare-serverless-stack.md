# ADR-0001: Lightweight Cloudflare Serverless Stack (Hono + Vite SPA + D1 + DO + R2)

- **Status:** Accepted (2026-11-12); storage split amended by ADR-0006 (2026-11-15)
- **Related:** DEC-201, DEC-214, DEC-217

## Context
In `geraiexpress` v1, running a full Next.js application through `@opennextjs/cloudflare` introduced large Worker bundles, slow builds, and adapter edge cases. `geraiexpress-cfv2` must serve both interactive counter/admin workspaces and thousands of fast Indonesian white-label outlet mini-sites (`*.gerai.cc` + custom domains) with minimal cold start and low baseline cost.

## Options Considered
1. **Next.js + `@opennextjs/cloudflare` on Workers:** heavy bundle footprint, slower cold starts, complex multi-tenant hostname routing.
2. **Self-hosted Node + PostgreSQL VPS:** strong relational locking, but loses serverless zero-ops scaling and native edge multi-hostname routing.
3. **Cloudflare Workers (`@hono/zod-openapi`) + Vite React 19 PWA (Static Assets) + Hono JSX SSR (Public Sites) + D1 + Durable Objects + R2 + Queues *(Chosen)*.**

## Decision
Adopt **Option 3**:
- **HTTP, OpenAPI & MCP Layer:** one TypeScript Cloudflare Worker using Hono and `@hono/zod-openapi` serves JSON APIs, OpenAPI 3.1 + Scalar docs, stateless Streamable HTTP MCP endpoints, and edge-cached Indonesian SSR pages (`geraiexpress.com` and `*.gerai.cc`).
- **Authenticated Workspaces:** `app.geraiexpress.com` and `owner.geraiexpress.com` are built with **Vite + React 19 + TanStack Router/Query + Tailwind + shadcn/ui** and served via **Workers Static Assets** with zero Worker CPU spent on static asset delivery.
- **State & Storage:** **Cloudflare D1** (Drizzle ORM) for the control plane and **SQLite-backed Durable Objects (`GeraiVaultDO`)** for each gerai's data and atomic serialization (as amended by ADR-0006), **Cloudflare R2** for zero-egress media storage, and **Cloudflare Queues + Cron** for webhook ingestion and Mengantar financial sync.

## Consequences
- **Positive:** sub-megabyte Worker script, near-zero cold start across Indonesian/Singapore PoPs, native SEO/WhatsApp OpenGraph for outlet mini-sites, and instant desktop-like counter responsiveness with Web-Bluetooth support.
- **Trade-off / Mitigation:** D1 (SQLite) lacks PostgreSQL row-level locking across external HTTP calls; mitigated by routing all per-outlet state mutations and provider dispatches through `GeraiVaultDO` (`ADR-0004`).
