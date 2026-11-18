# DEC-247B — red mutations (courier logos + Indonesian validation)

Each mutation was applied with an exact single-occurrence text replacement, the named test was run through
`heavy-run --lock geraiexpress-cfv2-env`, and the original text was restored the same way (verified byte-identical
with `cmp` against a copy taken before the mutation). No `git checkout`/`restore` was used.

| id | file | mutation | command | red result | restored |
|---|---|---|---|---|---|
| M1 | `apps/web-app/src/components/admin/courier-logo.tsx` | `courierKey` keeps `&` when normalising (`/[^a-z0-9]/g` → `/[^a-z0-9&]/g`), so `J&T Express` no longer maps to the J&T logo | `pnpm vitest run --project unit apps/web-app/src/components/admin/courier-logo.test.ts` | 1 failed / 2 passed — `J&T Express: expected null to be 'jt'` | yes (`cmp` OK) |
| M3 | `apps/web-app/src/lib/form-validation-id.ts` | installer no longer calls `el.setCustomValidity(message)` (browser default message stays) | `pnpm vitest run --project unit apps/web-app/src/lib/form-validation-id.test.ts` | 1 failed / 11 passed — `expected 'Please fill out this field.' to be 'Email wajib diisi.'` | yes (`cmp` OK) |
| M5 | `apps/web-app/src/lib/form-validation-id.ts` | `valueMissing` branch disabled (`if (v.valueMissing) {` → `if (false) {`) | same as M3 | 2 failed — `valueMissing: names the field…` and `sets the Indonesian message on invalid…` | yes (`cmp` OK) |
| M2 | `apps/web-app/src/routes/kasir/cek-resi/page.tsx` | `COURIER_TRACK` truncated back to 3 couriers (SAP, Lion, Anteraja, iDexpress, Pos, SPX rows removed) | `GX_E2E_PORT=55185 pnpm exec playwright test e2e/courier-logos.spec.ts --project desktop-1280 -g "cek resi"` | 1 failed — `toHaveCount: Expected 9, Received 3` | yes (`cmp` OK) |
| M4 | `apps/web-app/src/components/admin/courier-logo.tsx` | J&T rows get the JNE file (`LOGO[key]` → `LOGO[key === "jt" ? "jne" : key]`) | `GX_E2E_PORT=55185 pnpm exec playwright test e2e/courier-logos.spec.ts --project desktop-1280 -g "kasir:"` | 1 failed — `J&T Express: Expected pattern /\/assets\/jt-[\w-]+\.svg$/, Received "/assets/jne-D_PIPm8D.svg"` | yes (`cmp` OK) |
