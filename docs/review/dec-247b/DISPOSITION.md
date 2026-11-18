# DEC-247B — disposition of GPT-6.2 Sol R1 (`R1-sol.md`, REQUEST_CHANGES on `d72a5d7`)

All eight findings fixed in the review-fix run `RUN-20261118T182730Z-48cf174c`. Every fix has a regression test, and
every test was proven by a red mutation. Each mutation was applied, the named suite run, and the file restored and
checked by SHA-256.

| # | Sev | Finding | Fix | Regression | Mutation (red) |
|---|---|---|---|---|---|
| 1 | P1 | Dropship tracking showed the outlet logo, map pin and WhatsApp (ADR-0005) | `PublicTrack.maskedOutlet` (dropship / unbranded label; a QR draft with a sender store). `trackWa` gives the shell `masked` for the result **and** the unlock response. The shell then drops the logo/initials, name, kecamatan line, Lokasi card, map, every WhatsApp link, the outlet favicon initial, the `<title>` suffix and the custom-domain footer name. The body's origin district (spec 05 §3) stays. | `minisite.test.ts` "ADR-0005 (Sol R1 P1)…": ordinary vs masked result vs masked unlock | R1-M1: shell ignores `maskedOutlet` → that test red |
| 2 | P1 | `w[0]` split a supplementary-plane letter; `encodeURIComponent` threw on the favicon | `initials` takes `Array.from(w)[0]` (first code point) | `identity.test.ts` "Sol R1 P1: a name starting with a supplementary-plane letter…": saves `𠮷野家 Berkah`; `/`, `/kirim`, `/lacak` 200; monogram `𠮷B`; favicon decodes | R1-M2: `w[0]` → red |
| 3 | P1 | `/cara-kerja` told the Non-COD payment path as universal | Step 4 and pipeline stops 2, 3 and 5 now separate the two paths, following `computeFlow` (spec 02 §3.3). Non-COD: paid at the counter, seller balance debited by the net partner tariff at issue. COD: billed to the recipient by the courier; the counter takes only packing or service fees; nothing is debited at issue; tariff + COD fee are netted from the COD credit when it settles. The lead says the five stops are shared and only who pays and when the debit happens differ. | `brand.test.ts` `/cara-kerja` test: COD/Non-COD sentences present, the old universal sentences absent | R1-M3: old stop-2 copy → red |
| 4 | P2 | `publicShell` logo join did not bind the tenant | `AND m.tenant_id = ?` with the verified tenant id (`publicShell(sql, tenantId)`) | `identity.test.ts` `/logo` test: the tenant's own logo row re-owned by another tenant → monogram, no `/logo?v=`, `/logo` 404 | R1-M4: binding replaced by `? IS NOT NULL` → red |
| 5 | P2 | Validation ownership inferred from message text | Ownership now follows the setter. The first time a net writes a field, it wraps that field's `setCustomValidity`, so any other caller (even with identical words) takes the message over. Applied to all three nets with the same flaw: `form-validation-id.ts` (web-app + web-owner), the brand inline net (`seo.ts`), the mini-site inline net (`html.ts`). | unit "a page message with the very same words is the page's…"; e2e brand validation (same-message step); e2e mini-site `/lacak` same-message step | R1-M5 (app, unit red), R1-M9 (brand, e2e red), R1-M10 (mini-site, e2e red) |
| 6 | P2 | Quote POST rewrote `-20`/`1.5` and dropped three zeroes | The submitted strings are validated before parsing: either all three empty, or all three match `^[1-9][0-9]{0,2}$` and are ≤ 300; otherwise 422 with the dims message | `identity.test.ts` Cek Ongkir: `-20`, `1.5`, `0 0 0`, a zero, `301`, partial, `5O` → 422, no result | R1-M6: check disabled → red |
| 7 | P2 | Simulator option text 15px on phones | `@media(max-width:640px){.sim .opt-main{font-size:1rem}}` | e2e dropdown test (phone): trigger and list `.opt-main` computed `16px`; worker CSS assertion | R1-M7: rule removed → phone e2e red |
| 8 | P2 | Mini-site menu trigger ignored Space | `keydown` Space (`' '`, legacy `Spacebar`) toggles the menu, with `preventDefault` so the page does not scroll; Enter keeps the native link activation; the no-JS `#mnav:target` fallback is unchanged | e2e mini-site (phone): Space opens, Space closes, scroll position unchanged | R1-M8: handler removed → phone e2e red |

Mutation notes: the first variant of R1-M4 (`? = ?`) went red for the wrong reason, a binding-count error. It was
replaced by `? IS NOT NULL`, which keeps one binding, and then failed on the ownership assertion itself.

Ledger: `apps/worker/src/do/gerai-vault/index.ts` (the single `publicShell` caller, one line) was not in the run's
declared surface; it is recorded as an accepted scope expansion (`expand-scope`, verification `worker`).

# Round 2 — disposition of GPT-6.2 Sol R2 (`R2-sol.md`, REQUEST_CHANGES on `f80c966`)

Sol verified that six of the eight R1 findings are resolved. The two remaining items were fixed in run
`RUN-20261118T185551Z-7ca80cd6`.

| # | Sev | Finding | Fix | Regression | Mutation (red) |
|---|---|---|---|---|---|
| R2-1 | P1 | `/cara-kerja` still blurred COD Barang and COD Ongkir, and said COD debits later | Step 4 and pipeline stops 2, 3 and 5 now follow spec 02 §3.3 and `computeFlow`. Non-COD pays shipping, plus packing and the counter service fee if any, at the counter; the net tariff is debited at issue. In COD Barang and COD Ongkir (DFOD) the recipient pays the courier's bill on delivery. The counter service fee applies only to Non-COD and DFOD; COD Barang takes packing only, if chosen. For COD, Mengantar deducts shipping and COD fees from the proceeds and credits the rest, so the seller balance is never debited. | `brand.test.ts` `/cara-kerja`: exact COD Barang / DFOD / service-fee / net-credit sentences; the R1 wording absent | R2-M1: R1 stop-2 wording → red |
| R2-2 | P2 | Dimension guard rejected `020` and validated the 200-char display copy | The guard reads the original `formData` strings (trimmed, not truncated). Any dimension supplied means all three must be `^\d{1,3}$` and 1..300; the values are passed on as numbers. | `identity.test.ts`: `"20" + 198 spaces + "cm"` → 422; `020 × " 40 " × 30` → 200 and `(20×40×30 cm)` | R2-M2: read from the display copy → red; R2-M3: leading zero refused again → red |
