## Review

**Verdict: REQUEST_CHANGES**

Read-only review of the current execution-plan files. No files changed; no application tests run. `docs/review/` was used only to identify the numbered round-1 findings, not as implementation evidence; prototype code was excluded.

### Round-1 disposition

| # | Status | Current evidence |
|---:|---|---|
| 1 | **RESOLVED** | TASK-101 now owns the lockfile, root Wrangler configuration, both SPA scaffolds and test configuration: `TASKS.md:49–60`. |
| 2 | **PARTIAL** | Vertical migration ownership is established (`TASKS.md:31–32`), and most feature tasks have migration paths. However, the required D1 shipment projection still lacks an explicit delivering contract; see R1 below. |
| 3 | **PARTIAL** | Generic versioned outbox, alarms, migration batching and failure isolation are assigned to 103 (`TASKS.md:75–89`). Actual shipment-index publication and its acceptance tests remain unspecified; see R1. |
| 4 | **RESOLVED** | TASK-109 implements all three fail-closed security checks and deliberately failing fixtures: `TASKS.md:157–170`. |
| 5 | **RESOLVED** | Account screens and lifecycle tests are assigned to 105; owner TOTP screens/recovery to 106: `TASKS.md:105–134`. |
| 6 | **PARTIAL** | TASK-104 covers six templates, retry bounds, erasure and crash tests (`TASKS.md:91–103`). Approval/rejection email triggering is still absent from 203’s acceptance contract (`TASKS.md:245–259`); see R2. |
| 7 | **RESOLVED** | Directory, suspension, masking controls and owner shell are assigned to 203; remaining governance views, audited risk reads and legal editing to 208; admin recovery to 106: `TASKS.md:123–134,245–259,309–322`. |
| 8 | **RESOLVED** | Quick check, notifications and settings/account persistence now have backend/UI ownership: `TASKS.md:335–346,362–372,451–465`. The newly identified `/kiriman` ownership omission is N1 below. |
| 9 | **RESOLVED** | Rotation fencing/recovery belongs to 205; cancellation/read-back and shared settlement to 304: `TASKS.md:277–287,374–387`. |
| 10 | **RESOLVED** | Finance cadence/rescan, hostname scheduling/quota/reaper and daily backups are explicitly assigned: `TASKS.md:479–490,599–612,646–655`. |
| 11 | **PARTIAL** | Observability implementation exists in 110 (`TASKS.md:172–183`), but 109 can deploy before it: both depend only on 101 (`TASKS.md:163,178`). See R3. |
| 12 | **RESOLVED** | Isolation is phased to M1 surfaces, with later extensions named (`TASKS.md:185–197`). `payUnpaid` is implemented in 304 before finance recovery consumes it (`TASKS.md:382–386,492–502`). |
| 13 | **RESOLVED** | Milestone-close convention gates subsequent milestones; 604 depends on every close and production-readiness task: `TASKS.md:39–40,657–667`. |
| 14 | **PARTIAL** | Cookies, storage and pay-unpaid are now R4; M1 is R4 (`TASKS.md:42,77,107,494`; `RELEASE.md:32`). Several tenant-data tasks nevertheless remain R2, contrary to the revised risk rule; see R4. |
| 15 | **RESOLVED** | Shared-file integration rule and concrete specialist settings exclusions are present: `TASKS.md:33–35,457–460`. |
| 16 | **RESOLVED** | Checkout branches printable versus pending outcomes; finance includes `paid` or `not_required`: `docs/DIAGRAMS.md:380–385,431`. |
| 17 | **RESOLVED** | Shared verification commands/matrix, masking visual states, Lighthouse thresholds and legal NULL/filled cases are specified: `TASKS.md:36–38,399–402,559–560,573`. |

### Remaining round-1 findings

#### R1 — P1: Shipment-index delivery is still not explicitly owned

**Location:** `TASKS.md:81–89,379–387`; `docs/adr/ADR-0006-storage-split-d1-control-plane-do-tenant-data.md:38–50`.

The storage task names baseline tables and a **generic** outbox. Dispatch owns tenant migrations and journal/call/record behavior, but does not commit to publishing shipment creation/status changes to D1 `shipment_index`. No task explicitly names that projection’s delivery or tests. Creating a generic outbox is not the producer integration required by ADR-0006.

**Smallest fix:** Name the task owning the D1 index schema and assign shipment-index publication to the shipment/status write paths. Require lost-ack, restart and stale/reordered-version tests against the actual projection—not just the generic outbox.

#### R2 — P1: Application-status email triggering remains acceptance-unowned

**Location:** `TASKS.md:98–103,253–259`; `docs/spec/12-TRANSACTIONAL-EMAIL-CLOUDFLARE.md:13–20`.

Template snapshots and simulated sending prove rendering/mailer behavior. TASK-203’s approval flow and tests do not require enqueueing `application_status` on approval **or rejection**, although spec 12 explicitly requires both triggers.

**Smallest fix:** Add approval/rejection outbox insertion and delivery assertions to 203, using the shared mailer. Verify retries do not duplicate the business transition.

#### R3 — P1: First staging deployment is not gated on observability readiness

**Location:** `TASKS.md:157–183`; `OBSERVABILITY.md:4`; `docs/WORKFLOW.md:93–101`.

TASK-109 can complete its first staging deployment before TASK-110 implements probes, redaction and alert delivery. TASK-110’s post-deploy probe assertion does not enforce observability readiness **when the host first goes live**.

**Smallest fix:** Split observability into pre-deploy implementation/configuration and post-deploy verification. Gate 109’s first deployment on the former, then require the latter immediately after deployment. Avoid introducing a dependency cycle.

#### R4 — P1: Tenant-data implementations remain underclassified and can bypass independent review

**Location:** `TASKS.md:289–300,348–359,403–413,441–449,504–516,528–539`; `docs/WORKFLOW.md:30–34,78–79`.

TASK-206 writes tenant courier preferences; 302 handles tenant contacts/private media; 306 exposes tenant labels; 309 reads tenant financial analytics; 403 changes parcel custody; 405 handles tenant claims. All are R2, while WORKFLOW explicitly places **tenant data** in R3. R2 does not require the independent review mandated for R3/R4.

**Smallest fix:** Promote the tenant-data portions to R3, or split genuinely UI-only/pure encoding work from the R3 services. Preserve mandatory independent review.

### New findings

#### N1 — P1: The main `Kiriman` lifecycle list has no implementation/path owner

**Location:** `TASKS.md:340–346,379–380,408,434–435,509–510,522–523,534–535`.

TASK-301 owns the shell and notifications, not the `/kiriman` route. Subsequent tasks reserve shipment detail and specialist subtrees only. Nobody owns the main list, its shared listing/filter RPC, `Belum Dibayar`/`Draf QR`/`Menunggu Saldo` tabs, badge counts, or owner CSV export.

These are required by `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:44` and `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:125`. An empty scaffold or navigation link does not deliver them.

**Smallest fix:** Extend a bounded M3 task with explicit `/kiriman` list and backend-read paths. Gate it on two-tenant filtering, cashier projection, payment-state tabs/row actions and owner-only export tests; require it before 399.

#### N2 — P1: DEC-226’s prerequisite is enforced only after pricing implementation

**Location:** `TASKS.md:302–307,329,692`; `STATUS.md:35`; `DECISIONS.md:32`.

TASK-207 can implement pricing after 107/203, without the Mengantar answer. The answer—or newly accepted fallback—is a dependency of **M2 close**, although the plan’s own notes and STATUS require it **before M2**, and DEC-226 requires resolution before M2 pricing.

**Smallest fix:** Move the recorded commercial-mode decision to the M2 entry/pricing prerequisite. If the owner authorizes proceeding without an answer, record that exception before 207 starts and reconcile STATUS/the milestone note.

#### N3 — P2: Relay deployment invariant prohibits the relay’s required secret

**Location:** `TASKS.md:632`; `docs/spec/10-PARTNER-RELAY-VPS-STATIC-EGRESS.md:168–169`.

“Secrets not in Coolify variables” prohibits `RELAY_SECRET`, but spec 10 explicitly provisions `RELAY_SECRET` and, temporarily, `RELAY_SECRET_PREVIOUS` in the relay’s Coolify environment. Only **Mengantar credentials** must stay off the VPS.

**Smallest fix:** Qualify the invariant: no Mengantar secrets on the VPS/Coolify; relay HMAC secrets are provisioned as specified in spec 10.

#### N4 — P2: Standard telemetry acceptance points to the wrong helper task

**Location:** `TASKS.md:38,172–189`.

The standard Done condition names “TASK-111 helpers”, but 111 owns only isolation tests; telemetry infrastructure belongs to 110.

**Smallest fix:** Change the reference to TASK-110.

### Cross-check summary

- **Dependency graph:** No declared cycle found by inspection, including the implicit milestone-close edges. All P0 milestones are in 604’s dependency closure. R3 and N2 remain readiness-ordering defects.
- **Coverage:** All P0 PR identifiers, DEC-201..229 and ADR-0001..0006 appear in the plan’s delivering-task coverage. That inventory does not prove implementation completeness: R1, R2 and N1 remain concrete gaps.
- **Path ownership:** The three applications and principal packages match `ARCHITECTURE.md:113–131`. Feature migration files and specialist settings exclusions substantially improve disjoint ownership.
- **Testability:** The inherited `pnpm check`, geometry and Playwright requirements make the short feature acceptance lists substantially more executable. Tests still do not close the specific omissions above.
- **Approvals:** Per-action deploy, DNS, SaaS/custom-hostname, production migration, VPS and production Mengantar approvals remain explicit in `docs/WORKFLOW.md:93–101` and `STATUS.md:50`; the plan is not blanket authorization.
- **Hot-file limits:** Supplied sizes—TASKS **41,413 bytes**, STATUS approximately **3,700 bytes**—are below their limits. Byte counts were not independently measurable with the available read tools.
- **Review limitation:** `watchdog_diff` reported that reviewer-launch HEAD changed or was unavailable. This is an as-read plan review, not certification of a stable commit hash or committed diff range.

**Merge verdict: BLOCK — resolve R1–R4 and N1–N2, then re-review the delta.**