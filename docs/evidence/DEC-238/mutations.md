# DEC-238 mutation proofs (2026-11-17)

Each mutation was applied to the source, `apps/worker/test/mengantar-v2/contract.test.ts` was run, and the file was
restored. Every mutation turned at least one test red (13 tests, all green on the real code).

| # | Mutation | Red test |
| --- | --- | --- |
| M1 | `pickup.volume` hard-coded `volumeMotor` | scheduledPickup … volume from billable weight |
| M2 | estimate key `SAP` not normalised to `Sap` | SAP (uppercase key) prices the Sap service; COD caps |
| M3 | `discountExtra` left out of the observed discount | SAP … discountExtra counts in the observed discount |
| M4 | per-courier COD cap dropped after the COD passes | COD caps: Pos / Anteraja / SAP above Rp2.000.000 |
| M5 | `eco: true` dropped for `JTEco` | non-COD sends goodsValue … J&T ECO books courier JT + eco |
| M6 | Pos scheduled-pickup pinpoint guard dropped | scheduled Pos pickup needs outlet coordinates |
| M7 | J&T ECO COD passes ask `courier: "JT"` (no ECO row) | J&T ECO is quoted for COD from the courier=all row |
| M8 | cargo `cargoDiscountExtra` left out of observed bps | cargo extra discount counts in the observed cargo discount |
| M9 | a reserved slot 90–119 min ahead is not reused | a reserved slot is reused while ≥ 90 min ahead; scheduledPickup reuses the slot |
| M10 | POS sender card without the WhatsApp verification action | e2e `Checkout COD: pengirim baru diverifikasi di layar kasir` (desktop-1280) |
| M11 | POS publishes an answer to a superseded quote | e2e `pos-guards` "an answer to a superseded quote never restores the selection" |
| M12 | re-selecting a card no longer restores the frozen card | e2e `pos-guards` "the frozen card is the only amount paid…" (the submit-time `amountsOf` guard is a second layer behind it) |
| M13 | sender COD payout left out of the frozen-amount comparison | e2e `pos-guards` "a changed sender COD payout also stops for confirmation" |
| M14 | an `invalid pickup time` refusal keeps the dead cached slot | Worker `invalid pickup time drops the cached slot…` |
