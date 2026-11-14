## Review

**Decision: REQUEST_CHANGES**  
**Merge verdict: BLOCK for M0 specification lock / M1 contract implementation.**

Read-only review completed across all named root documents, ADRs, specs 01–10, visual specs 01–08, research docs 01–03, and `design/admin-contract.json`. No files were edited. Prototype code and previous review conclusions were not treated as implementation evidence. The two AutoKirim bug claims were additionally checked against their referenced archived scripts.

No P0 issue was established. The principal problems are inconsistent financial semantics and incomplete propagation of DEC-220/224/225 into implementable contracts.

### Correct

- **Menu rename and routes are compatible.** The authoritative navigation uses **Buat Pengiriman**, while `/kasir`, `/kasir/multi`, `/kasir/cek-cepat`, and `/kasir/shift` remain technical routes. Remaining `Kasir` references generally denote the staff role or historical rename—not an active menu label. See `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:34–41`.
- **README ranges are current:** DEC-201..225 and PR-01..24, at `README.md:51–52`.
- **Palette separation is explicit:** `DESIGN.md:35–39` implements DEC-222, and `docs/visual/01-DESIGN-SYSTEM-AND-ERGONOMICS.md:21` explicitly retains the old palette for public pages rather than the signed-in workspace.
- **The three 100 mm formats are correctly distinguished** in `docs/spec/03-COUNTER-POS-PRINTING-AND-SHIFT.md:54–59` and `docs/visual/04-THERMAL-LABEL-AND-RECEIPT-LAYOUT.md:130–143`, including the default 100×100 label plus 100×50 sender stub.
- **Several requested fields really are defined:** payment projection fields, `print_count`, masking quota, and counter-only WhatsApp verification appear in `docs/spec/01-DATA-MODEL-AND-LEDGER.md:43,54,64,68`. API/MCP keys cannot self-assert WhatsApp verification (`docs/spec/08-OPENAPI-AND-MCP-CONTRACT.md:52`).
- **Insurance and provider float hygiene are sound at the storage boundary:** unknown insurance remains `NULL`; decimal provider `COD_FEE` is preserved as text rather than rounded into money columns. See `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:40` and `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:28`.
- **The AutoKirim duplicate `end_date` and wrong empty-state table-selector bugs are supported by the archived scripts.** They are not findings against GeraiExpress.
- No concrete API key, password, bearer credential, or private email exposure was identified in the reviewed documentation. Full phone-like examples remain in wireframes; see finding 19.

## Findings — P1

### 1. Sender COD entitlement and Mengantar seller settlement are conflated

**Evidence:**  
`docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:49–52` defines `estimated_cod_net_payout_idr` as the amount payable to the walk-in sender: `G`, `G−F`, or `G−P−I−F`.  
`docs/spec/01-DATA-MODEL-AND-LEDGER.md:67` and `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:36` define the reconciled counterpart as Mengantar’s entire seller credit, `COD_AMOUNT−estimatedSpecialPrice`.

These are different quantities when the outlet earns shipping spread. For example, with `G=150000`, `P=12000`, provider net shipping `9600`, and fee `F`, buyer-bears collection is `162000+F`; Mengantar credits the seller `152400`, while the sender entitlement is `150000`.

**Impact:** reconciliation appears to increase the sender payout by the outlet’s Rp2.400 spread, or risks paying that spread to the sender.

**Smallest fix:** separate **Mengantar seller COD credit** from **sender payable/payout** in names, columns, formulas, and receipt DTOs. Add one exact reconciliation example for each fee mode.

### 2. The universal profit formula produces false losses and premature “realized” profit

**Evidence:**  
`docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:17` calculates estimated profit as:

```text
counter_total_paid_idr − gerai_shipping_cost_idr
```

For COD with no counter collection, this reports a loss equal to shipping cost, despite a positive shipping spread. The same problem occurs for a Non-COD INV deliberately recorded unpaid.

Line 18 promotes profit to realized based solely on provider invoice reconciliation, even though DEC-220 permits the local customer payment to remain unpaid.

**Smallest fix:** define profit separately by collection mode, distinguish cash collected from customer receivables, and specify whether “realized” means cash-realized or accrued. Provider reconciliation alone must not imply that an unpaid counter customer has paid.

### 3. The data model cannot represent all three COD fee modes

**Evidence:**  
`docs/spec/01-DATA-MODEL-AND-LEDGER.md:60` offers only:

```text
cod_fee_bearer = sender | recipient_grossup
```

But `docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:49–51` specifies three states:

```text
buyer_bears_fee | sender_bears_fee | cod_all_in
```

`sender_bears_fee` and `cod_all_in` differ in whether the recipient pays shipping; a two-value bearer field cannot distinguish them. The COD selector still presents only two choices at `docs/visual/05-SHIPMENT-CREATION-AND-COURIER-SELECTION-FLOW.md:78`.

**Smallest fix:** introduce one canonical three-value `cod_fee_mode`, persist it in the immutable quote and shipment projection, and use the same enum in pricing, UI, OpenAPI, and MCP. Preserve `sender_bears_fee` as distinct from all-in.

### 4. COD dispatch arithmetic is incomplete for DFOD and negative all-in payouts

**Evidence:**  
`docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:43` enables the new service fee on `COD_SHIPPING`, but lines 53–54 provide no collection, counter-due, sender-payable, or margin formulas for that mode.

The same section gives Non-COD/DFOD item-value bounds of Rp10.000–Rp20.000.000 at line 48, then defines `G=item_value_idr=0` for DFOD at line 53. Declared insured value and COD goods collection are not separated.

For all-in, line 51 allows `G=10000` without requiring `G≥P+I+F`. Inputs `G=10000`, `P=12000`, `I=0`, `F=1000` therefore produce a supposed payout of **−Rp3.000**.

**Smallest fix:** add a complete per-mode collection/debit/payable table, including who pays packing and service fees. Separate declared goods value from COD goods amount. Reject negative all-in payouts or explicitly model the additional sender payment. Document the estimate/order request mapping for each mode rather than relying on the phrase “two-pass quote.”

### 5. DEC-220 lacks a complete counter-payment transition contract

**Evidence:**  
`docs/spec/01-DATA-MODEL-AND-LEDGER.md:64` defines the current projection and says marking paid or reverting appends a receipt, but does not define those receipt records or payment transitions.

`docs/spec/03-COUNTER-POS-PRINTING-AND-SHIFT.md:29` says local unpaid status produces a pickup **warning**; `docs/spec/04-PICKUP-MANIFEST-AND-RETURNS.md:16` says an `unpaid` INV is **blocked**. It does not distinguish local unpaid status from `provider_unpaid_hold`.

Shift totals are based on payments in the shift (`spec/03:65–66`), while the shipment has only one `cashier_shift_id` (`spec/01:62`). A shipment created unpaid in shift A and paid in shift B has no specified attribution rule.

**Smallest fix:** add a short orthogonal payment state machine covering mark-paid, duplicate submission, void/revert, re-payment, cancellation, and zero-counter-due COD. Define receipt event fields including actor, payment shift, amount, method, reason, and idempotency key. Explicitly distinguish local-unpaid handover policy from provider-unpaid blocking.

### 6. Assigned outlet discounts have no specified settlement mechanism under Scheme 1

**Evidence:**  
`DECISIONS.md:11` says Super Admin’s assigned discount governs the outlet’s shipping cost.  
`docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:29` derives that cost from assigned bps.  
However, `docs/adr/ADR-0003-mengantar-partner-and-egress-relay.md:15–16` gives each outlet its own seller account and balance, and `docs/spec/09-MENGANTAR-FINANCIAL-SYNC-AND-RECONCILIATION.md:35` reconciles actual provider debits.

If provider discount is 30% and assigned discount is 20%, a Rp12.000 tariff yields a specified outlet cost of Rp9.600 but an actual Mengantar debit of Rp8.400. No documented provider configuration or separately authorized settlement accounts for the Rp1.200 difference.

**Smallest fix:** state whether assigned bps is merely an internal commercial estimate or an enforceable provider term. If enforceable, document the supported provider/settlement mechanism and its ledger treatment. Do not present an internal calculation as control over an independently owned seller balance.

## Findings — P2

### 7. New settings and manifest requirements are not fully defined in the owning schema

**Evidence:**  
`DECISIONS.md:31` accepts the commission toggle, custom unboxing remark, service-fee configuration, and driver fields.

`docs/spec/01-DATA-MODEL-AND-LEDGER.md:29` mentions driver fields only in the ER diagram. There is no concrete `pickup_batches` definition, including field requirements, tenant key, handover timestamp, or signature reference. `docs/spec/04-PICKUP-MANIFEST-AND-RETURNS.md:18` still requests only name and signature.

No persistence fields are defined for the outlet default print format, commission visibility, unboxing remark, or service-fee settings. `docs/visual/08-PERIOD-FILTER-AND-SETTINGS-NAVIGATION.md:160–161` does not enumerate the newly accepted commission/remark controls either.

**Smallest fix:** add a tenant-settings definition and a concrete manifest table definition. Specify defaults, limits, owner-only writes, device-local versus tenant-global values, and canonical `driver_vehicle_no`/`vehicle_no` mapping. Add the missing controls to visual/08.

### 8. OpenAPI/MCP do not yet describe the new financial and printing contracts

**Evidence:**  
`docs/spec/08-OPENAPI-AND-MCP-CONTRACT.md:46` lists quote inputs but omits the new COD fee mode. Lines 44–56 define no print endpoint/schema or supported print-format enum; there is also no stated programmatic contract or explicit exclusion for counter-payment mutation.

Separately, `ARCHITECTURE.md:76` calls public MCP “read-only,” while `docs/spec/08-OPENAPI-AND-MCP-CONTRACT.md:75` includes `create_public_prebooking_inv`.

**Smallest fix:** extend spec/08 with canonical request/response fields, format values, print selection limit, authorization, and exclusions. Specify whether `print_count` records PDF generation, transport completion, or operator-confirmed printing, and whether receipt-only reprints affect it. Replace public MCP “read-only” with “restricted public tools including draft creation.”

### 9. The service fee is simultaneously launch-enabled and launch-disabled

**Evidence:**  
`docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:43` enables optional Rp1.000–Rp200.000 fees under DEC-225.  
`docs/visual/08-PERIOD-FILTER-AND-SETTINGS-NAVIGATION.md:161` still says `0 at launch, DEC-205`.  
`docs/research/01-COMPETITOR-RESEARCH-AND-FEATURE-TRACEABILITY.md:66` still calls it schema-reserved and zero at launch, contradicting that document’s own updated row at line 128.

**Smallest fix:** mark the old zero-at-launch restriction superseded by DEC-225. State that `P` remains the publish shipping tariff and the fee is a separately disclosed, outlet-kept line item—not an undisclosed tariff markup. With that distinction, a separate fee need not contradict DEC-205.

### 10. The requested 5 kg auto-cargo behavior has not reached the canonical product contract

**Evidence:**  
`PRD.md:52` specifies auto-highlighting Cargo at **10.000 g**, and `docs/visual/05-SHIPMENT-CREATION-AND-COURIER-SELECTION-FLOW.md:48` still labels it `Cargo ≥10 kg`.

`docs/research/01-COMPETITOR-RESEARCH-AND-FEATURE-TRACEABILITY.md:125` promises v2 auto-highlighting at `>=5000 g (or >=10000 g)`, which is not deterministic. Research/02’s observed AutoKirim rule is unambiguously actual or volumetric weight ≥5 kg (`docs/research/02-AUTOKIRIM-AUTHENTICATED-REA-TEARDOWN.md:67`).

DEC-225 itself does not record the 5 kg rule.

**Smallest fix:** record the requested 5 kg recommendation threshold in DEC-225 and propagate it to PRD/spec/visuals. Distinguish the UI recommendation threshold from each courier’s minimum chargeable cargo weight; preserve the launch Non-COD-only restriction.

### 11. Normative wireframes still contain superseded labels, actions, and formats

**Evidence:**

- `docs/visual/02-WIREFRAMES-COUNTER-AND-ADMIN.md:16` uses **Buat Kiriman**, not Buat Pengiriman.
- Lines 48 and 70–71 retain `Paket Baru / Multi-Paket / Cek Cepat`, the old `58mm / 10×15 PDF` choice, and **BAYAR & CETAK**.
- `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:120` uses `Kiriman Baru · Multi-Paket · Cek Cepat · Shift Kas`, unlike DEC-225/spec/06.
- `docs/visual/06-REMAINING-MENUS-WIREFRAMES.md:14–15` omits the accepted **Belum Dibayar** tab.
- `PRD.md:76` says charts use daily buckets otherwise, whereas DEC-221/visual/08 require weekly buckets beyond 92 days.

These documents declare their UI strings normative; explanatory supersession notes do not cover all of these specimens.

**Smallest fix:** update the specimens and page inventory to the canonical labels, button wording, format choices, unpaid tab, and chart granularity. Keep `/kasir/*` routes unchanged.

### 12. Dropship printing examples contradict the stated outlet-hiding rule

**Evidence:**  
`docs/visual/04-THERMAL-LABEL-AND-RECEIPT-LAYOUT.md:184–185` explicitly says Dropship Toko prints the reseller brand, never the outlet, **on both parts**.

But the same default-format specimen prints the outlet name and outlet WhatsApp at lines 167–173. The 58 mm Dropship example likewise prints the outlet identity at lines 63–64.

**Impact:** implementing the specimens would reveal identity the adjacent rule says must be hidden.

**Smallest fix:** decide the sender-stub policy explicitly and make the rule and both specimens agree. If the existing rule stands, render reseller identity/contact on those stubs; do not copy outlet identity into masked output.

### 13. Print specimens misstate payment and insurance facts

**Evidence:**  
`docs/visual/04-THERMAL-LABEL-AND-RECEIPT-LAYOUT.md:43` prints `NON-COD (ONGKIR SUDAH LUNAS)`, although line 108 says the parcel label never shows counter-payment status and DEC-220 permits unpaid Non-COD labels.

The 10×15 specimen combines a COD collection banner of Rp167.560 with a Non-COD-style Rp27.000 paid stub for the same INV (`:156–173`).

The full-size specimen prints `Asuransi: tidak` at line 246, although the canonical model presently knows only an unverified/unknown insurance fee.

**Smallest fix:** use a neutral Non-COD banner, make each complete specimen internally consistent, and render unknown insurance as `—` or an explicit unverified state—not “not insured.” Preserve `NULL` in storage and DTOs.

### 14. Adopted item-value limits are not reconciled with the repo’s Mengantar evidence

**Evidence:**  
`docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:48` adopts Rp20.000.000 for Non-COD/DFOD, matching AutoKirim’s observed bounds in research/02.  
`docs/research/03-SIMILAR-SYSTEMS-DEEP-REA-BENCHMARK.md:67` reports Mengantar’s `MAX_NON_COD = 5000000`.

A frontend constant alone does not prove an API limit, but the two sources do not establish that the imported Rp20 million bound is valid for this Mengantar integration.

**Smallest fix:** distinguish observed competitor validation from verified Mengantar constraints. Define item-value limits per applicable courier/service/provider contract, and mark unresolved limits as sandbox-verification dependencies rather than unconditional launch rules.

### 15. Double flooring contradicts the asserted exact provider-cost equality

**Evidence:**  
`docs/spec/02-PRICING-DISCOUNT-AND-CASHBACK.md:29,34` floors provider discount into bps, then floors the reconstructed discount, while asserting exact equality when assigned bps equals observed bps.

For `P=12000` and provider net shipping `9599`:

```text
observed_bps = floor(2401 × 10000 / 12000) = 2000
reconstructed cost = 12000 − floor(12000 × 2000 / 10000) = 9600
```

The asserted exact cost is Rp9.599.

**Smallest fix:** explicitly preserve the exact integer provider net amount when provider-cost precedence applies. Treat derived bps as a lossy control/display value, or document the permitted rounding difference. Add this regression example to TASK-107’s test requirements.

### 16. Some research conclusions are stronger than their cited observations

**Evidence:**  
`docs/research/02-AUTOKIRIM-AUTHENTICATED-REA-TEARDOWN.md:130` concludes there is no dedicated return-intake workflow. Inspection of the listed modules supports absence in those inspected surfaces, not necessarily absence across the deployed system.

`docs/research/03-SIMILAR-SYSTEMS-DEEP-REA-BENCHMARK.md:26` identifies CS role `12`, but attributes disabled export to a condition checking role `3`. That expression does not establish the claimed CS restriction.

Research/02’s menu table also contains **25 listed route rows**, not the claimed 23 at line 19.

**Smallest fix:** label the return-workflow conclusion `[I]` and scope it to inspected surfaces; describe the export guard literally without attributing it to role 12; correct the route count. Use “specified/planned mitigation” rather than implying GeraiExpress runtime fixes already exist.

### 17. The machine-readable comfort contract permits inputs forbidden by AGENTS

**Evidence:**  
`AGENTS.md:37` requires all form inputs to be at least 44 px high.  
`design/admin-contract.json:10` permits desktop input/select heights of **40 or 44 px**. Mobile touch targets at line 22 are expressed only through `warnBelow: 44`, while task gates commonly require zero failures rather than zero warnings.

**Smallest fix:** make all form-input height checks require 44 px, distinguish permitted compact desktop navigation from form controls, and make sub-44 px phone controls fail the acceptance gate rather than merely warn.

## Findings — P3

### 18. Workflow metadata understates the reviewed contract set

**Evidence:**  
`STATUS.md:3,14–16` remains dated November 13 and lists DEC-201..219, visual 01–07, and research 01.  
`ROADMAP.md:7` and `ARCHITECTURE.md:112` similarly omit the new visual/research documents. Roadmap M3 still describes only the older 10×15 PDF printing scope at line 10.

**Smallest fix:** update document ranges and milestone scope; identify the November 14 additions as requiring review/sign-off. Do not extend the previous `Independent-Review: PASS` to later changes implicitly. README’s ranges need no correction.

### 19. Complete phone-like examples remain without an explicit synthetic-data declaration

**Evidence:**  
Examples include full numbers beside names and addresses in `docs/visual/04-THERMAL-LABEL-AND-RECEIPT-LAYOUT.md:47,53,64`, `docs/visual/05-SHIPMENT-CREATION-AND-COURIER-SELECTION-FLOW.md:114`, and `docs/visual/06-REMAINING-MENUS-WIREFRAMES.md:46,56,58`.

I could not establish that these are real personal data, so this is **not a confirmed PII leak**. Nevertheless, the repository cannot currently satisfy a literal “no phone numbers written into docs” check.

**Smallest fix:** replace them with redacted placeholders, or explicitly establish and label a synthetic example-data policy. Keep authenticated research captures free of account-specific data.

---

### Verification needed before approval

1. Resolve the P1 financial semantics and add exact examples covering all three COD fee modes, DFOD, unpaid counter sales, and subsequent provider reconciliation.
2. Complete the payment event/state contract and new persistence/API fields before implementing the associated M1 schema and domain-math tasks.
3. Reconcile the normative wireframes and stale launch restrictions with DEC-220..225.
4. Re-review the corrected contract set before recording M0 sign-off.

No runtime tests were executed: this was a documentation review, and prototype behavior was outside the implementation review scope.