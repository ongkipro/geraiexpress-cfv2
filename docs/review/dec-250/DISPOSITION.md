# DEC-250 review disposition

## GPT-6.2 Sol R1 (`R1-sol.md`, on `33d4fa7`): REQUEST_CHANGES, 1 P1 + 4 P2 + 1 verification gap. All fixed.

| # | Finding | Disposition | Proof |
|---|---|---|---|
| P1 | The switcher sends an applicant with a session back to `/daftar-akun` (`/daftar` → `Masuk ke Loket` → `Daftar Gerai Baru`). | **Fixed.** `/daftar-akun` has a route `beforeLoad` guard: `GET /auth/me`, and a session without a gerai (`membership: null`) redirects to `/daftar`. One guard covers every entry: the switcher, the brand `Daftar Gerai` CTA and a typed URL. `/masuk` does not need a second `/auth/me` call per view (the supervisor's in-card variant). On `/daftar` itself the active tab still links to `/daftar`. | e2e `auth-stage` click-through `/daftar` → `/masuk` → `/daftar` plus typed `/daftar-akun` → `/daftar`; mutation M1 (guard removed) red. |
| P2 | Challenged signup: Tab order differs from the screen (CSS `order`). | **Fixed.** One `<form>` for the email and OTP sub-states, with DOM order equal to screen order: field, Turnstile slot + action, OTP links, status. The single slot is never re-rendered between the sub-states (`__tsRenders` = 1). No CSS `order`. | e2e focusable challenge stub: Email → Tab → challenge; OTP code → challenge → `Verifikasi` → `Ganti email`; mutation M2 (slot after the action) red. |
| P2 | A silent Turnstile adds an extra 16px gap. | **Fixed.** `TurnstileAction` wraps slot + submit in a gap-free column. `useTurnstile` exposes `visible` from a `ResizeObserver` on the slot, and the slot gets `mb-4` only while it is taller than 0. The status line is a fixed 16px so the `○`/`●` glyph swap never re-centres the card. | e2e: action Y identical before/after the silent 0px render on `/masuk` and `/daftar-akun` at three viewports, silent gap 0, challenged gap exactly 16px (`/masuk`, `/daftar-akun`, OTP); mutation M3 (`mb-4` always) red. |
| P2 | Mobile stacked tables drop their column headers from the accessibility tree. | **Fixed.** The `thead` is only visually hidden below 760px (`position:absolute; 1px; clip-path:inset(50%)`), and both `.tbl.stack` tables carry explicit `table` / `rowgroup` / `row` / `columnheader` / `cell` roles through the grid/block restyle. | Vitest markup + CSS; e2e at 390: `getByRole("table")` 1, `columnheader` 4 / 3, `cell` ≥ 36 / 12; mutation M4 (`display:none`) red. |
| P2 | The mini-site unit toggle has no selected indicator in forced-colors mode. | **Fixed.** `@media(forced-colors:active)` adds a `ButtonBorder` outline to each pill and a 3px `SelectedItem` outline + `SelectedItem` fill (`forced-color-adjust:none`) on the checked one. | Vitest CSS; e2e `emulateMedia({ forcedColors: "active" })`: checked 3px solid, other 1px; mutation M5 red. |
| Gap | Owner `/totp` had no three-viewport evidence. | **Covered.** New e2e: bootstrap an admin, password step, `/totp` enrol checked with `fits` + `studio` at 1440×900, 1366×768 and 390×844, then the recovery-code step keeps the studio. | e2e `auth-stage` owner `/totp` test. |

Focused checks per the fast protocol: `check:fast`, Vitest `test/brand` + `test/minisite`, `check-page.mjs` 10/10,
e2e `auth-stage` + `auth` + `onboarding` + `brand` + `minisite` (all projects). Mutations M1–M5 red, restored with
SHA-256 verification. A `/auth/me` 401 for an anonymous visitor of `/daftar-akun` is expected (the guard) and is the only
console error the auth-stage test ignores.

## GPT-6.2 Sol R2 (`R2-sol.md`, on `c60f3c5`): REQUEST_CHANGES, 0 P0/P1, 3 P2. All fixed.

| # | Finding | Disposition | Proof |
|---|---|---|---|
| P2 | The forced-colors selection rule hides the keyboard focus ring on the checked unit pill. | **Fixed.** Inside `@media(forced-colors:active)`, after the checked rule: `.seg.unit label:has(input:focus-visible){outline:2px solid CanvasText;outline-offset:3px}`. Selection stays the `SelectedItem` fill; focus is a distinct outer system-colour ring. | e2e `minisite` in forced colors: Tab from `Berat paket` focuses the checked `gram` radio → 2px ring at 3px offset, same fill; Tab out → the idle selection indicator is back; Vitest CSS; mutation R2-M1 (rule removed) red. |
| P2 | The owner `/totp` check could measure before the QR renders. | **Fixed.** The test waits for the `Kode QR pendaftaran TOTP` image and the fallback key before the three-viewport loop. The fully rendered enrolment screen fits with no page or inner scroll at 1440×900, 1366×768 and 390×844, so no layout change was needed. | e2e `auth-stage` owner `/totp`; mutation R2-M2 (QR forced to 560px) red, which proves the loop now measures the QR. |
| P2 | The console filter dropped every `/auth/me` error, a `500` included. | **Fixed.** Only a message from `/api/app/auth/me` that contains `401` is ignored; any other status on that URL fails the console check. | Test-only narrowing (no app mutation applies); `auth-stage` passes with it. |

Focused checks per Sol R2: `check:fast`, Vitest `test/brand` + `test/minisite`, e2e `auth-stage` + `minisite` on
desktop-1280. Mutations R2-M1 and R2-M2 red, restored with SHA-256 verification.

## GPT-6.2 Sol R3 (`R3-sol.md`, on `cbcd1d5`): REQUEST_CHANGES, 0 P0/P1, 1 P2. Fixed.

| # | Finding | Disposition | Proof |
|---|---|---|---|
| P2 | The console exception matched any standalone `401` in a `/auth/me` message, not strictly the HTTP status. | **Fixed.** The filter matches only Chromium's resource line `status of 401` on `/api/app/auth/me`; every other console error, including another status on that URL, fails the test. | `eslint e2e/auth-stage.spec.ts`; e2e `auth-stage` on desktop-1280. |

Production code is unchanged in this round (test-only).

## GPT-6.2 Sol R4 (`R4-sol.md`, on `59ac470`): REQUEST_CHANGES, 1 test-only P2. Fixed.

| # | Finding | Disposition | Proof |
|---|---|---|---|
| P2 | The `status of 401` filter was not anchored to Chromium's resource message. | **Fixed.** The exception uses the anchored pattern `/^Failed to load resource: the server responded with a status of 401(?: \(|$)/` and still requires the `/api/app/auth/me` URL. | `eslint e2e/auth-stage.spec.ts`; e2e `auth-stage` on desktop-1280. |

Production code is unchanged in this round (test-only).
