# DEC-247B mini-site — red mutations

Each mutation replaced one exact text span, ran the command, then restored the exact original text (file bytes
re-hashed and compared: all 14 restored, never `git checkout`/`restore`). Baseline before the run:
`vitest run test/minisite` 12/12 and `e2e/minisite.spec.ts` 6/6 (phone-390, tablet-768, desktop-1280), both green.

Worker command: `pnpm --filter @gx/worker exec vitest run test/minisite/identity.test.ts -t '<test>'`.
E2E command: `GX_E2E_PORT=55184 pnpm exec playwright test e2e/minisite.spec.ts --project=phone-390 -g 'DEC-247'`.
All runs under `heavy-run --lock geraiexpress-cfv2-env`.

| ID | File | Mutation | Test | Red result |
|---|---|---|---|---|
| MS-M1 | `apps/worker/src/do/gerai-vault/minisite/index.ts` | `publicShell` JOIN drops `AND m.purpose = 'logo'` | worker `/logo serves only` | home renders `/logo?v=` for a QRIS media id; expected the initials monogram |
| MS-M2 | `apps/worker/src/minisite/index.ts` + `do/gerai-vault/minisite/index.ts` | `/logo` drops the `t/<tenant>/logo/` R2-prefix check **and** `publicLogo` drops the purpose filter (combined) | worker `/logo serves only` | `expected 200 to be 404`: a QRIS image served at `/logo` |
| MS-M3 | `apps/worker/src/minisite/index.ts` | courier strip filter `c.enabled &&` removed | worker `courier strip` | strip contains `/couriers/jt.svg` for a disabled courier |
| MS-M4 | `apps/worker/src/minisite/index.ts` | `attribution: onTenantZone(c.host, env.TENANT_ZONE)` → `attribution: true` | worker `footer attribution` | custom domain page contains "Didukung jaringan resmi GeraiExpress" |
| MS-M5 | `apps/worker/src/minisite/html.ts` | WhatsApp chat button inserted into the header bar | worker `WhatsApp: never in the header` | header matches `/wa\.me|WhatsApp/` |
| MS-M6 | `apps/worker/src/minisite/html.ts` | phone menu WhatsApp row removed (`chatHref ?` → `null ?`) | worker `WhatsApp: never in the header` | menu does not end with the `mwa` WhatsApp row |
| MS-M7 | `apps/worker/src/minisite/index.ts` | QR card page keeps the gerai chat (`page({ ...s, wa: false })` → `page(s)`) | worker `WhatsApp: never in the header` | QR card has 3 `wa.me` links, expected 1 |
| MS-M8 | `apps/worker/src/minisite/index.ts` | `/kirim` form back to `novalidate` | worker `Indonesian validation` | form markup no longer constraint-validated |
| MS-M9 | `apps/worker/src/minisite/html.ts` | validation net's `invalid` listener removed | worker `Indonesian validation` | script lacks `setCustomValidity(m)` |
| MS-M10 | `apps/worker/src/minisite/html.ts` | COD toggle inverted (`!=='1'` → `!=='0'`) | worker `COD price field` | script string mismatch (behaviour proven by MS-E1) |
| MS-E1 | `apps/worker/src/minisite/html.ts` | COD toggle inverted | e2e DEC-247 (phone-390) | `Harga barang COD (Rp)` visible while Non-COD is selected |
| MS-E2 | `apps/worker/src/minisite/html.ts` | net no longer sets the Indonesian message (`f.setCustomValidity(m)` removed) | e2e DEC-247 (phone-390) | `Received: "Please fill out this field."`, expected `Kolom Kecamatan tujuan wajib diisi.` |
| MS-E3 | `apps/worker/src/minisite/html.ts` | WhatsApp chat button in the header bar | e2e DEC-247 (phone-390) | red: `expect(locator).toBeVisible()` → `Received: hidden` (first failing assertion of the run; the worker test MS-M5 pins the exact header check) |
| MS-E4 | `apps/worker/src/minisite/html.ts` | phone menu WhatsApp row removed | e2e DEC-247 (phone-390) | last menu link has class `""`, expected `mwa` |

Surviving mutant (recorded honestly): dropping only `AND m.purpose = 'logo'` from `publicLogo` stays green because
the Worker's `t/<tenant>/logo/` R2-prefix check still refuses a QRIS key; the two guards are redundant by design, and
MS-M2 proves that removing both is caught. Dropping the `/couriers/` allow-list alone is equivalent too (the asset
directory only holds the nine allow-listed SVGs), so it is not listed.
