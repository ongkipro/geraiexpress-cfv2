## Review

**DEC-251 Round 4 — `dec-251`, `8225354..84c6099`.** Reviewed the supplied delta, Round 3 review, disposition, and affected source and tests.

No issues found.

- **Single save, no second GET — resolved.** Both forms set the `saving` ref before the POST, disable `Simpan` while pending, and pass the full response item to `onSaved`. The POST and GET handlers return the same role-projected contact shape. `PartyStep.saved()` closes the sheet and picks the returned contact synchronously, unless checkout is locked. The sender regression asserts one POST despite repeated submit attempts, including `requestSubmit()`, and zero contact-detail GETs. (`apps/web-app/src/routes/kontak/pengirim.tsx:159`, `apps/web-app/src/routes/kontak/penerima.tsx:127`, `apps/worker/src/do/gerai-vault/index.ts:434`, `apps/worker/src/api/app.ts:1027`, `apps/web-app/src/routes/kasir/index.tsx:167`, `e2e/pos-guards.spec.ts:260`)
- **Dismissed sheet completion — resolved.** Opening or dismissing `+ Baru` advances `sheetGen`. Both forms are keyed by `sheetId`, and `savedIf()` rejects stale completions before they can close the current sheet or change the selected contact. The regression holds a POST, dismisses with Escape, reopens the sheet, and checks that it stays open and empty after the old response arrives. (`apps/web-app/src/routes/kasir/index.tsx:173`, `apps/web-app/src/routes/kasir/index.tsx:193`, `e2e/pos-guards.spec.ts:276`)
- **WhatsApp verification during checkout — resolved.** `VerifySender` uses `onUpdate`, not `pickSender`. The functional update applies only when `cur?.id === v.id` and does not advance `checkoutGen`. The regression verifies the sender during a held Non-COD freeze, then confirms issuance and an AWB. (`apps/web-app/src/routes/kasir/index.tsx:124`, `apps/web-app/src/routes/kasir/index.tsx:187`, `apps/web-app/src/routes/kasir/index.tsx:302`, `apps/web-app/src/routes/kasir/index.tsx:453`, `e2e/pos-guards.spec.ts:305`)

**Verification:** Read-only source review; no files modified and no tests rerun. The disposition records `check:fast` and both focused `Sol R3` Playwright tests passing (`docs/review/dec-251/DISPOSITION.md:65`).

**Merge verdict: OK.**

Verdict: APPROVE