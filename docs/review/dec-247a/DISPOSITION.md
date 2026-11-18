# DEC-247A — disposition of GPT-6.1 Sol R1 (`R1-sol.md`, APPROVE on `d0fda4b`)

No P0 or P1. One non-blocking P2 (labelling of synthetic visuals) — applied before release:

| # | Sev | Note | Change | Check |
|---|---|---|---|---|
| R1-N1 | P2 (non-blocking) | Synthetic visuals should say they are illustrations | A small `<p class="note">` under the bento: "Ilustrasi fitur dengan data contoh, bukan transaksi gerai sungguhan."; a caption in the proof chart: "Ilustrasi alur, bukan angka pengukuran." (`apps/worker/src/brand/pages.ts`, `.rb-note` in `styles.ts`) | `brand.test.ts` home parity test asserts both lines in place; the bento slice now ends at the note |

This copy-only change was made after the approval at the reviewer's own suggestion; the release run
`RUN-20261118T163352Z-76a6989f` re-executes every gate on it.
