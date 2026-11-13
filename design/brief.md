# UI brief — GeraiExpress v2 signed-in workspace (`app.` + `owner.`)

## Niche
Indonesian multi-courier shipping counters ("gerai/agen ekspedisi") running on one Mengantar seller
account per outlet: konter pulsa, fotokopi, kelontong, and dedicated agen shops in tier-2/3 cities.

## Audience
- Gerai Admin (owner, 35–55+, often reading glasses, laptop 1366 px or Android phone) — must trust that
  money numbers (cash drawer, Mengantar balance, COD payouts, profit) are exact and synced.
- Kasir (staff, 18–40, counter PC or phone, in a queue with a customer waiting) — must trust that the
  price shown is the price charged and that the label prints right the first time.
- Super Admin (platform team, desktop) — must trust approvals, discounts and sync health at a glance.

## Primary job
Serve a walk-in customer in under 45 s: weigh, pick a courier from real quotes, take payment, print the
label + receipt. Everything else (shipments hub, contacts, finance, settings) supports that loop.

## Primary action
`+ Kiriman Baru` (opens `/kiriman/:slug` POS). One per screen; on finance/settings pages the page's own
save/sync action is primary instead.

## References wanted
- shadcn dashboard block (`ui.shadcn.com/blocks` dashboard-01) — app shell, sidebar, header, data table.
- Shopify Polaris admin patterns (`polaris-react.shopify.com`) — order list tabs, operator density.
- Local market: KiriminAja / Mengantar public pages for Indonesian courier vocabulary (no copying).
- Existing GeraiExpress v1 accepted tokens (`~/Projects/geraiexpress/design/DIRECTION.md`): Apple blue
  `#0066CC`, parchment `#F5F5F7`, system font stack.

## Non-goals
- No tiny 12–13 px body text, no dense 32 px rows on counter screens (v1 complaint: "font kecil-kecil").
- No icon-tile KPI cards, gradients, glass, emoji decoration, card-in-card, rainbow chips.
- No second navigation; no 15-item sidebar; no English UI strings.
- No dark mode in v2 launch (counter lighting is bright; one theme to verify).
