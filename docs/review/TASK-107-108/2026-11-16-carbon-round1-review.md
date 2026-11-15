Verdict: REQUEST_CHANGES

1. **P1 — `computeFlow` allows negative `senderCodPayableIdr` in `sender_bears_fee`**
   - **Location:** `packages/domain/src/money/index.ts:209-212`, `packages/domain/test/money.test.ts:190-198`
   - **Failure scenario:** `sender_bears_fee` computes `C = G + P + I0` and `senderCodPayableIdr = G - F` with no guard ensuring `G >= F`. For a valid low-value COD item (`G = 10_000`, meeting `COD_GOODS_MIN_IDR = 10_000`) on a long-haul or multi-kg route (`P = 300_000`, `C = 310_000`, ~3.5% provider `codFee` `F = 10_850`), `computeFlow("sender_bears_fee", ...)` returns `senderCodPayableIdr = -850`. This violates `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:118` (*"Never store a negative payable"*) and cannot be settled in `counter_receipts`, where `amount_idr` must be strictly positive (`docs/spec/01-DATA-MODEL-AND-LEDGER.md:83`).
   - **Smallest fix:** Reject `mode === "sender_bears_fee" && G < F` in `computeFlow` with a `MoneyRuleError` (e.g. `COD_FEE_EXCEEDS_GOODS`, `"Harga barang COD tidak cukup menutup biaya COD."`), constrain or expect rejection when `G < F` in the random property test, assert `f.senderCodPayableIdr >= 0` for all modes, and add a unit test for `sender_bears_fee` with `G < F`.

2. **P2 — `GeraiVaultDO` exposes an unguarded `allocateSlugsForTest` RPC on the production Durable Object**
   - **Location:** `apps/worker/src/do/gerai-vault/index.ts:75-82` (with `wrangler.jsonc:74`)
   - **Failure scenario:** `allocateSlugsForTest(n)` is a public RPC method on `GeraiVaultDO` that omits `tenantId`, bypasses `this.refusal(tenantId)` (violating `index.ts:48`: *"Guard every feature RPC: right tenant, current schema, not in recovery"*), and accepts unbounded `n` inside a synchronous `transactionSync`. Because top-level `wrangler.jsonc:74` sets `"GX_ENV": "local"`, any deploy without an environment override leaves this unguarded RPC enabled. `apps/worker/test/slug/allocator.test.ts:2` already uses `runInDurableObject` from `"cloudflare:test"`, so no test helper RPC is needed on `GeraiVaultDO`.
   - **Smallest fix:** Remove `allocateSlugsForTest` from `apps/worker/src/do/gerai-vault/index.ts` and run the 10,000-slug `transactionSync` loop inside `runInDurableObject` in `apps/worker/test/slug/allocator.test.ts:12`.

3. **P2 — Exported `_idr` / `_bps` functions accept or return non-integers, wrong-sign values, and English identifier text in `userMessage`**
   - **Location:** `packages/domain/src/money/index.ts:25-35, 57-74, 102-125, 225-265, 292-300, 313-317`
   - **Failure scenario:**
     1. `mulDivFloor(-1, 1, 2)` returns `0` (`BigInt` division truncates toward zero rather than `floor` = `-1`), `mulDivFloor(100, 2000.5, 10000)` / `mulDivFloor(1, 1, 0)` throw raw English `RangeError` instead of `MoneyRuleError`, and quotients exceeding `Number.MAX_SAFE_INTEGER` return lossy floats via `Number(big)`.
     2. `commercialCostIdr(12_000, 9_600, 2000.5)` throws raw English `RangeError`; negative or `> 10_000` `assignedBps` produces costs `> P` or `< 0`; `effectiveBps(2000.5, 2500)` and `tariffGapIdr(9000.5, 9600)` return non-integers.
     3. `codAmountBase` and `resolveCodFee` do not call `assertIdr` on `P`, `I`, `G`: `resolveCodFee("buyer_bears_fee", { P: 12_000.5, I: null, G: 150_000 }, async () => 5_560)` emits non-integer `C: 167_560.5`.
     4. `labaKasIdr` validates none of its `_idr` fields, returning a float if any input is non-integer.
     5. `formatBps(-50)` computes `whole = Math.trunc(-50 / 100) = -0` and `String(-0) = "0"`, returning `"0,5 %"` (dropping the minus sign) instead of `"−0,5 %"`, and accepts non-integer `bps`.
     6. `assertIdr` sets `userMessage` to `` `Nilai ${name} tidak valid.` ``, leaking internal English parameter names (`"Nilai codFee tidak valid."`, `"Nilai amount tidak valid."`, `"Nilai publish tidak valid."`) into user-facing text (`AGENTS.md` §2).
   - **Smallest fix:** Guard `mulDivFloor` (`a >= 0`, `b >= 0`, `c >= 1`, safe-integer result); add `assertBps` (`0..10_000` safe integer) on `effectiveBps`, `commercialCostIdr`, and `nextVerificationState`; call `assertIdr` in `tariffGapIdr`, `codAmountBase`, and `labaKasIdr` (using signed safe-integer checks where reconciled provider credits/gaps can be negative); fix `formatBps` sign handling with `bps < 0 ? "−" : ""` on `Math.abs(bps)` after safe-integer check; and use a natural Indonesian `userMessage` in `assertIdr` (e.g. `"Nominal rupiah tidak valid."`, keeping `name` in `Error.message`).

4. **P2 — `isQuoteDrift` misparses empty, non-numeric, and formatted `COD_FEE` strings**
   - **Location:** `packages/domain/src/money/index.ts:268-273`
   - **Failure scenario:** `orderCodFeeText.replace(/[^0-9.-]/g, "")` turns `""`, `"   "`, `"—"`, or `"N/A"` into `""`, and `Number("")` is `0` (`Number.isFinite(0) === true`), so `isQuoteDrift(0, "")` and `isQuoteDrift(0, "N/A")` return `false` instead of flagging drift. Stripping non-digits also silently rewrites `"1e4"` to `14`, `"5560,50"` to `556050`, and `"Rp5.560"` to `5.56`, while `frozenF` is not checked with `assertIdr`.
   - **Smallest fix:** Call `assertIdr("frozenF", frozenF)`. After `if (orderCodFeeText === null) return false`, match `orderCodFeeText.trim()` strictly against `/^(-?)(\d+)(?:\.(\d+))?$/` (returning `true` if unmatched), and compare exact `BigInt` scaled units (`scale = 10n ** BigInt(frac.length)`, `abs(val - BigInt(frozenF) * scale) >= scale`).

5. **P2 — `normalizeSlug` rejects the receipt/return-tag format `"INV: 8K4M2P7"`**
   - **Location:** `packages/domain/src/slug/index.ts:24-27`
   - **Failure scenario:** `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:31` and `docs/visual/04-THERMAL-LABEL-AND-RECEIPT-LAYOUT.md:16,54,289` specify `INV: 8K4M2P7` (with a colon) on `Struk Jujur` and parcel return tags. `normalizeSlug("INV: 8K4M2P7")` strips only `/^inv\s*#?\s*/`, leaving `": 8k4m2p7"` and returning `null`, so `slugExists` returns `false` when an operator or customer pastes the receipt label string.
   - **Smallest fix:** Update the prefix strip in `normalizeSlug` to `.replace(/^inv\s*[:#-]?\s*/, "").replace(/^#/, "")` (safe because `i` is excluded from `SLUG_ALPHABET`), validate/normalize `slug` in `displayInv` and `destinationMark`, and add `"INV: 8K4M2P7"` and `"INV #8K4M2P7"` test cases.

6. **P2 — Worker slug tests depend on prior-test state and omit the `TENANT_NOT_READY` refusal**
   - **Location:** `apps/worker/test/slug/allocator.test.ts:39-51`, `packages/domain/test/money.test.ts:185-202`
   - **Failure scenario:**
     1. In `allocator.test.ts`, `"lookups are case-insensitive"` (`:39`) and `"refuses a foreign tenant id"` (`:48`) rely on `"slug-b1"` having been migrated and populated in the preceding test (`:18`); running either test alone (`vitest run -t "lookups"`) fails with `TENANT_NOT_PROVISIONED`.
     2. `GeraiVaultDO` replaced `TenantNotReadyError` with `VaultRefusal` (`"TENANT_MISMATCH" | "TENANT_NOT_PROVISIONED" | "TENANT_NOT_READY"`), but no test exercises `"TENANT_NOT_READY"` (e.g. an object migrated only to v1 before `0002_inv_slugs`, or in `"recovery"`).
     3. In `money.test.ts:194`, the 2,000-case property test hardcodes `S: 0, V: 0`, never exercising service fees (`S`) or counter promos (`V`) across random combinations.
   - **Smallest fix:** Make each `allocator.test.ts` test provision its own tenant stub, add a `TENANT_NOT_READY` assertion on a v1-only (`stub.migrate("slug-v1", 1)`) object, and sample valid `S` and `V` values (plus `counterDueIdr >= 0`) in `money.test.ts`.

7. **P3 — Missing `effectiveCostIdr` helper and runtime divisor/safe-integer guards in `weight`**
   - **Location:** `packages/domain/src/money/index.ts:57-70`, `packages/domain/src/weight/index.ts:21-28, 70-74`
   - **Failure scenario:**
     1. `commercialCostIdr` computes the requested commercial reference `M` (`M = 9_000` when `P = 12_000, N = 9_599, assigned = 2500`), whereas `quote_snapshots.effective_gerai_cost_idr` (`docs/spec/02:29,34`) must equal `N = 9_599` whenever `assigned >= observed` without re-deriving from `effectiveBps = 2000` (which would yield `9_600`). Without an explicit `effectiveCostIdr(publishIdr, netIdr, assignedBps)`, downstream TASK-303 callers risk either booking `M` (subsidy) or re-deriving from `effectiveBps` (breaking `9599` when `assigned > observed`).
     2. `volumetricWeightGram` does not runtime-check `divisor === 6000 || divisor === 4000` or safe-integer bounds on `numerator + divisor - 1`, and `kgToGram` does not check `Number.isSafeInteger` on its rounded output.
   - **Smallest fix:** Export `effectiveCostIdr` (`assignedBps >= observed ? netIdr : publishIdr - mulDivFloor(publishIdr, assignedBps, BPS)`) alongside `commercialCostIdr` (and align `docs/spec/02:29,34` in an unprotected integration commit), and assert runtime `divisor` and safe-integer outputs in `volumetricWeightGram` and `kgToGram`.

### Verified Invariants Checklist
- [x] Spec 02 §3.4 five `cod_fee_mode` worked rows, Non-COD `N + I0` debit, per-mode fee fixture, and `expectedProviderCodCreditIdr - senderCodPayableIdr = P - N` identity match exact integer values.
- [x] `NULL` insurance (`I: null`) is preserved without mutating input to `0`; insured Non-COD `Laba Kas` (`I = 1_000` → `16_000 - 10_600 = 5_400`) and reconciliation gating match Spec 02 §3.5.
- [x] `9599` regression (`P = 12_000, N = 9_599, assigned = 2000` → `9_599`) and not-yet-applied fixture (`assigned = 2500, observed = 2000` → `M = 9_000`, `effective = 2000`, `N = 9_600`, `Selisih tarif = -600`, `Estimasi Laba = 5_400`) match Spec 02 §2 / §3.4.
- [x] DEC-230 / DEC-233 policy band (`2000..3000` bps, default `2000`, per-courier override with platform fallback, `apply_sla_minutes = 60`, `+15/+60/+120 min` check schedule, 1-bp tolerance, `Belum diterapkan → Sesuai / Selisih` at `2 × SLA`) matches Spec 02 §2.1.
- [x] `resolveCodFee` fixed-point iteration (1 pass for fixed modes, ≤ 3 passes for fee-inclusive modes, `COD_FEE_UNSTABLE` on non-convergence) matches Spec 02 §3.3.
- [x] Weight & volumetric math (`DEFAULT_WEIGHT_GRAM = 1000`, `ceil(L×W×H×1000/divisor)`, `billedKg` with 300 g / 310 g tolerance, sub-kg decimal dispatch when `routeMinWeightGram < 1000`, `< 10 g` / `>= 100 kg` unit-mistake guard, Visual 05 `1200 g` + `30×20×15` → `2 kg`) matches Spec 02 §1 and DEC-215.
- [x] Slug generator (`23456789abcdefghjkmnpqrstvwxyz`, 30 chars excluding `0/O/1/I/L/U`, length 7, CSPRNG rejection sampling rejecting bytes `>= 240`), tenant SQLite migration `0002_inv_slugs.sql` + Drizzle `invSlugs` parity, and `ON CONFLICT DO NOTHING` retry up to 8 attempts (`SLUG_EXHAUSTED`) match DEC-211 and ADR-0004 §2.
- [ ] Negative `senderCodPayableIdr` guard on `sender_bears_fee` (Finding 1).
- [ ] Production `GeraiVaultDO` RPC surface free of unguarded test methods (Finding 2).
- [ ] Total integer/safe-integer enforcement across all exported money helpers, Indonesian `assertIdr` `userMessage`, strict `isQuoteDrift` parsing, and `"INV: 8K4M2P7"` slug normalization (Findings 3–5).