## Review

DEC-248 Round 2 · `dec-248` · `e09f998..a022727`

### Findings

- **P1 — The combobox can commit a result from the previous query.** Search for `coblong` and wait for Dago, then replace the query with `tebet` and press Down → Enter before the new response arrives. The input handler clears `areas` only below three characters, so the new keyboard path can select Dago during the 300 ms debounce or while the request is pending. The selected ID then goes into the application payload. The existing test covers `coblong` → `co`, not replacement with another valid query. Clear or hide results when the trimmed query changes, and only allow selection from results for the current query. Add a regression with the replacement response held pending. (`apps/web-app/src/routes/daftar/page.tsx:57`, `apps/web-app/src/routes/daftar/page.tsx:88`, `apps/web-app/src/routes/daftar/page.tsx:144`, `apps/web-app/src/routes/daftar/page.tsx:161`, `e2e/auth-stage.spec.ts:141`)
- **P2 — ArrowUp can reopen the list with the active option out of view.** With enough results to overflow the list, press Escape, then ArrowUp. The handler chooses the last result and calls `scrollIntoView` before React mounts the reopened list, so the lookup finds no element. The popup opens at the top even though Enter selects the offscreen last option. Scroll the active option after the open state and highlight have rendered, as the command palette already does. Test Escape → ArrowUp with an overflowing list. (`apps/web-app/src/routes/daftar/page.tsx:154`, `apps/web-app/src/routes/daftar/page.tsx:174`, `apps/web-app/src/components/admin/shell.tsx:321`)

### Verified

- **Consent:** Tahap 3 displays the same `sellerEmail` state sent in the application. Editing it in Tahap 2 clears consent, and the regression checks that the new address is shown and submission is disabled. (`apps/web-app/src/routes/daftar/page.tsx:86`, `apps/web-app/src/routes/daftar/page.tsx:126`, `apps/web-app/src/routes/daftar/page.tsx:210`, `e2e/auth-stage.spec.ts:120`)
- **Combobox:** The roles, Escape and blur dismissal, clearing below three characters, and highlight reset on a new result set are in place. The two keyboard defects above remain. (`apps/web-app/src/routes/daftar/page.tsx:60`, `apps/web-app/src/routes/daftar/page.tsx:135`, `e2e/auth-stage.spec.ts:95`)
- **HP PIC:** Untouched HP PIC follows WhatsApp on re-entry to Tahap 3; an explicit edit survives a later WhatsApp change. The regression covers both paths. (`apps/web-app/src/routes/daftar/page.tsx:108`, `apps/web-app/src/routes/daftar/page.tsx:197`, `e2e/auth-stage.spec.ts:128`)
- **Turnstile and short viewport:** Both forms reserve 65 px once a real site key is known and render with `size: "flexible"`. The delayed-widget test checks that insertion does not move submit, and the retry test checks that sign-in waits for a fresh token. The 1280×560 case checks that expanded coordinates and submit are reachable through inner scrolling without page scroll. (`apps/web-app/src/lib/turnstile.tsx:59`, `apps/web-app/src/routes/masuk/page.tsx:56`, `apps/web-app/src/routes/daftar-akun/page.tsx:103`, `e2e/auth-stage.spec.ts:148`, `e2e/auth-stage.spec.ts:169`, `e2e/auth-stage.spec.ts:197`)

Read-only review of the supplied delta and test evidence; no tests or browser checks were rerun. After the combobox fixes, rerun `pnpm e2e e2e/auth-stage.spec.ts e2e/onboarding.spec.ts --project desktop-1280`.

**Merge verdict: BLOCK**

Verdict: REQUEST_CHANGES