# `/panduan` screenshots

The user guide at `geraiexpress.com/panduan` (`apps/worker/src/brand/panduan.ts`, visual 09 §7) shows the real
screens. These scripts drive the real flows on a **local** Worker with the offline Mengantar mock and synthetic data,
so the images can be regenerated whenever the UI changes. Nothing here touches staging or production.

| Script | Does |
|---|---|
| `seed.mjs [port]` | creates one owner with a connected gerai (`berkahjaya`), one Kasir, three senders and three recipients; prints the state as JSON |
| `capture.mjs <state.json> <out dir>` | runs every guide flow and saves one PNG per step, with the numbered markers drawn in; `GX_VIEW=phone` repeats the flows in a 390 px window (`<name>-hp.png`); `GX_ONLY="cod,retur"` runs only the named sections |
| `optimize.mjs <desktop dir> <phone dir> [--merge]` | converts both sets to WebP in `apps/web-app/public/panduan/` and writes `apps/worker/src/brand/panduan-shots.json` (pixel sizes the page reads; pass `--merge` when updating a `GX_ONLY` subset); it cuts nothing, and flags a phone picture taller than 1,400 CSS px so its framing can be fixed in `capture.mjs` |

## Regenerate

Start from an **empty local state** each time: the queues (`Pickup & Surat Jalan`, `Meja Retur`, the shipment list)
show every parcel the flows have ever issued, so a second run on the same state produces crowded, misleading screens.

```bash
pnpm build                                              # the Worker serves the built SPAs
rm -rf .wrangler/state-panduan
pnpm exec wrangler d1 migrations apply DB --local --env= --persist-to .wrangler/state-panduan
pnpm exec wrangler dev --local --port 8911 --persist-to .wrangler/state-panduan    # in another terminal

export GX_OPS_TOKEN=<the local OPS_TOKEN of that wrangler dev>
node scripts/panduan/seed.mjs 8911 > /tmp/panduan-state.json

# Pickup and return first, while their queues hold only the parcels those sections create; then everything else.
REST="mulai,cek ongkir,kiriman satuan,cetak label,detail kiriman,pengirim baru,cod,paket massal,daftar kiriman,siap-1-mengantar,siap-2-anggota,siap-3-printer,daftar,mini-site,hp"
GX_ONLY="pickup,retur" node scripts/panduan/capture.mjs /tmp/panduan-state.json /tmp/panduan-desktop
GX_ONLY="$REST"        node scripts/panduan/capture.mjs /tmp/panduan-state.json /tmp/panduan-desktop

# Phone set: repeat from `rm -rf .wrangler/state-panduan` (fresh state, reseed), then the same two commands with
# GX_VIEW=phone and /tmp/panduan-phone as the output folder.

node scripts/panduan/optimize.mjs /tmp/panduan-desktop /tmp/panduan-phone
pnpm build && pnpm --filter @gx/worker exec vitest run test/brand/brand.test.ts
```

Run the heavy steps through the device's shared-resource wrapper where one exists (`docs/WORKFLOW.md` §4). Do not
edit a source file while `wrangler dev` is serving a capture run: it reloads, and the offline Mengantar mock starts
empty again.

## Rules the scripts keep

- **Markers match steps.** The number passed as `n` in `capture.mjs` is the step number in `panduan.ts`; step
  numbers run through a whole guide. When a step is added or removed, renumber both.
- **Kasir view first.** Flows run as the Kasir; only `Pengaturan` screens are captured as the owner, and none of them
  shows cost, margin or balance (visual 09 §6.2).
- **Synthetic and redacted.** All names and addresses are made up; right before each shot every phone number is
  rewritten to `08xx-xxxx-NNNN` and the local tenant host to `<slug>.geraimitra.com` (AGENTS.md "Example data
  policy"). Form values are restored afterwards so the flow continues with the real input.
- **A failed section does not stop the run.** The last line prints the failed sections; rerun them with `GX_ONLY`.
- **Markers never cover what they point at.** A badge sits above the right end of a field by default (labels are
  left-aligned); `side` moves it (`tl` for whole cards and lists, `r` beside a control, `br` below). A mark may take
  several locators and rings their union. The crop grows to include every badge.
- **Phones get phone screens.** `GX_VIEW=phone` captures a 390 px window at 2×. Where the primary button lives in the
  sticky action bar, the shot is a real phone window with that bar in view (`phoneFrame`).
- **Every marker is inside its picture.** A long phone screen is framed on the band that holds its markers; a run
  fails when a marker is missing or falls outside the crop, instead of publishing a step without a pointer.
- A `wrangler dev` that just started has an empty Mengantar mock: `capture.mjs` issues and cancels one throwaway
  parcel first (`warmUp`) so the first real flow is not refused while a pickup slot is renewed.
- The pickup section refuses to run when more than six parcels are waiting: start from a fresh state instead.
