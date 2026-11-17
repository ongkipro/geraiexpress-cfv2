# DEC-245 — brand landing evidence

Head under test: `9c740b1` + the DEC-245 fix wave (Sol R1/R2 findings), local `wrangler dev` on
`geraiexpress.localhost:55190`, built with `pnpm build`.

## SEO — `seo-check.txt`

`seo-website-builder/scripts/check-page.mjs <html> <canonical>` on the ten rendered pages (`/`, `/fitur`, `/ekspedisi`,
`/cara-kerja`, `/biaya-dan-paket`, `/simulasi-kasir`, `/tanya-jawab`, `/hubungi-kami`, `/ketentuan`, `/privasi`):
**0 fail, 0 warn** on all ten. The `info` lines are empty `alt` on the decorative logo beside the printed brand name
and on courier logos whose name is printed in the same table cell.

## UI — screenshots + `ui-gates.json`

System Chrome (`/usr/bin/google-chrome`, `--use-gl=angle --use-angle=swiftshader` for WebGL in headless) at
**1440×900** and **390×844**:

| File | What |
|---|---|
| `home-hero-{1440,390}.png` | full-bleed 3D studio hero (step 01, frosted header, pause + step controls) |
| `home-ringkasan-select-{1440,390}.png` | `#ringkasan` with the destination Select open (listbox below its field) |
| `home-partners-{1440,390}.png` | partner strip, nine Mengantar couriers |
| `ekspedisi-{1440,390}.png` | `/ekspedisi` full page (logo grid + service table) |
| `simulasi-kasir-{1440,390}.png` | `/simulasi-kasir` after choosing J&T Express (receipt + label preview) |

`ui-gates.json` per viewport and step: `horizontalOverflowPx 0`; no console error, page error, failed request or HTTP
≥ 400; every `/couriers/*.svg` image complete with `naturalWidth > 0` (13 on `/`, 18 on `/ekspedisi`, 4 on the
simulator); keyboard Select (`ArrowDown`, `Enter`) picks `Tebet` and returns focus to the trigger.

## Tests and mutations

- Worker `apps/worker/test/brand/brand.test.ts`: ten pages, no `Set-Cookie`, `BRAND_ASSETS` allow-list (GET/HEAD, type,
  cache, `nosniff`; `/app/…`, `/index.html`, `/assets/`, maps, `//`, `%2F`, `..`, Ninja, POST → 404), three.js only on
  `/`, no API calls in the demos, copy guards (no fixed discount %, KYC, unsupported services, support hours).
- e2e `e2e/brand.spec.ts` (390/768/1280): pause freezes the scene clock and resumes; reduced motion starts frozen; resize
  while paused / reduced motion repaints without advancing the clock, draws nothing while off-screen and repaints
  on return; 44 px pause target; logos load; no `/api` or
  `/mcp` request.
- Mutations (each turned the named test red, then reverted): M-a allow-list widened to `/assets/*` + `/index.html`
  (worker asset test); M-b volumetric copy back to "6.000 reguler / 4.000 kargo" (worker copy test); M-c scene clock
  advancing while paused (2 e2e failures); M-d resize repaint removed (resize e2e: 0 scene pixels); M-e resize repaint without the off-screen
  gate (resize e2e: frames 59 → 62 while off-screen).
