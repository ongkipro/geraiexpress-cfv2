## Review

**Verdict: REQUEST_CHANGES**  
**Reviewed HEAD:** `f071db579223` — working tree unchanged. Read-only review; excluded `docs/review/` and prototype code.

**Correct**
- The declared dependency graph is acyclic by inspection.
- Money calculations, dispatch journaling, role projection, webhook ordering, physical print verification and production approvals have concrete contracts.
- Kasir invitation backend work is assigned to TASK-104; Layar Pelanggan is correctly deferred as PR-22/P1 to TASK-701.
- TASK-501/502 explicitly own mini-site and brand legal footers.

### Findings

1. **P1 — Scaffold cannot deliver the prescribed workspace within its paths.**  
   **Location:** `TASKS.md:31–43`, `TASKS.md:129–141`.  
   TASK-101 excludes `pnpm-lock.yaml`, root `wrangler.jsonc`, and both frontend applications. No later task owns frontend package/Vite/router bootstrapping; TASK-301 owns only shell/components. TASK-108 depends on 101 but introduces staging configuration after 101 must already run Wrangler.  
   **Fix:** Assign root Wrangler configuration, lockfile, both frontend scaffolds and shared test/tool configuration to TASK-101; reserve later tasks for feature implementation.

2. **P1 — Feature tables have no executable migration ownership.**  
   **Location:** `TASKS.md:60–74`; `docs/spec/01-DATA-MODEL-AND-LEDGER.md:5–9`.  
   TASK-103 explicitly covers core tables only. Required tables such as quotes, receipts, shifts, invoice subitems, cashback, webhook routes/inbox, risk index and daily statistics are absent from that scope; downstream feature tasks lack database/migration paths.  
   **Fix:** Either include the complete specified schema in 103, or assign each remaining table and migration to a named feature task with explicit paths and fresh/upgrade tests.

3. **P1 — ADR-0006 projection outbox and deployed migration runner are unowned.**  
   **Location:** `TASKS.md:60–74`, `TASKS.md:129–141`; `docs/adr/ADR-0006-storage-split-d1-control-plane-do-tenant-data.md:48–57`.  
   Creating `shipment_index` is not implementing durable projection delivery. No task commits to versioned absolute upserts, alarm retries, risk/statistics pushes, or the batched `do:migrate` runner with progress and isolated recovery.  
   **Fix:** Add explicit implementation ownership and tests for restart/lost acknowledgement/reordering, stale-version rejection, migration batching and stop-on-failure recovery.

4. **P1 — Mandatory fail-closed CI security checks are not delivered.**  
   **Location:** `TASKS.md:40–43`, `TASKS.md:129–141`; `docs/spec/05-IAM-SECURITY-AND-PRIVACY.md:55–58`.  
   “No source maps” and “CI green” do not assign implementation of bundle secret scanning or route auth/projection coverage enforcement. TASK-108’s red-test experiment proves only unit-test wiring.  
   **Fix:** Assign all three security checks to an implementation task before CI depends on them. Require deliberately emitted `.map`, injected secret fixture and unprotected route fixtures to fail the build.

5. **P1 — Authentication screens and recovery lifecycle are missing.**  
   **Location:** `TASKS.md:76–100`, `TASKS.md:201–213`; `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:104–112`.  
   TASK-104 owns backend signup/invitations; 203 owns `/daftar`. Nobody owns `/masuk`, invitation acceptance UI, password-reset request/reset UI, or the owner-console TOTP interface. Password reset is nevertheless required by TASK-110’s M1 gate.  
   **Fix:** Assign these routes, corresponding backend lifecycle operations and Visual Contracts before 110; require signup, login, reset and invitation acceptance E2Es.

6. **P1 — Email durability and non-signup templates lack delivery contracts.**  
   **Location:** `TASKS.md:83–88`, `TASKS.md:156–166`; `docs/spec/12-TRANSACTIONAL-EMAIL-CLOUDFLARE.md:9–20`, §3.  
   TASK-104 proves OTP outbox insertion and simulated sending, not retry execution, expiry erasure or terminal suppression. No task explicitly owns all six templates and their triggers, including application status and new-device security alerts.  
   **Fix:** Assign the shared mailer/outbox runner and each trigger; test crash recovery, prescribed backoff, maximum attempts, expired-payload deletion and terminal bounce handling.

7. **P1 — Most Super Admin governance is missing.**  
   **Location:** `TASKS.md:201–249`, `TASKS.md:253–263`; `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:59–69`.  
   Approval and discount editing do not deliver the owner shell, Ringkasan, Pengawasan or Sistem & Audit. Directory/suspension controls, masking kill-switch/quota editor, cross-tenant risk search, platform legal editor and admin recovery are also unassigned. Isolated audit writes do not deliver audited PII/risk reads or the audit viewer.  
   **Fix:** Add bounded contracts for these surfaces and backend services, including TOTP recency on sensitive **reads and mutations**, audit assertions and non-impersonation tests.

8. **P1 — Remaining Gerai workflows lack implementation ownership.**  
   **Location:** `TASKS.md:337–370`; `docs/spec/06-DOMAINS-MENUS-AND-ROUTES.md:42–47`; `docs/visual/07-APP-SHELL-NAVIGATION-AND-PAGE-INVENTORY.md:140–142`.  
   PR-09’s zero-draft `/kasir/cek-cepat` and the notifications page/read state are absent. TASK-310 owns only frontend paths despite promising persisted settings and encrypted NPWP; TASK-308 similarly lacks auth backend paths for account/email/password/session changes.  
   **Fix:** Assign these routes and persistence/RPC operations explicitly, with tests for quick-check non-allocation, notification read state, owner-only settings and account-session revocation.

9. **P1 — Remaining critical provider lifecycles are not delivered.**  
   **Location:** `TASKS.md:189–199`, `TASKS.md:289–300`; `docs/adr/ADR-0004-durable-object-per-gerai-vault.md:15–20`.  
   SDK support for `api-key/regenerate` does not implement the DO rotation fence, atomic key/callback-secret storage or unknown-outcome recovery. No contract explicitly implements issued-shipment `DELETE /order` cancellation and provider read-back.  
   **Fix:** Assign seller rotation as R4 and extend dispatch ownership to cancellation; require idempotency, crash/timeout recovery, credential-version fencing, webhook-secret recovery and counter-void coordination tests.

10. **P1 — Required recurring jobs are not acceptance-gated.**  
    **Location:** `TASKS.md:374–395`, `TASKS.md:477–487`, `TASKS.md:511–519`.  
    Fixture reconciliation, mocked domain lifecycle and a one-time restore do not prove scheduled operation. Missing explicit deliverables include spec 09’s 15-minute/+60-second/manual triggers and pending rescan, spec 11’s daily quota check/issuance queue, and ADR-0006’s daily tenant exports. Backup task paths exclude Worker implementation.  
    **Fix:** Assign scheduler/queue wiring and paths; use fake-clock/alarm tests for cadence, pagination bounds, rate limits, reaping/quota alerts and daily exports.

11. **P1 — Observability has no implementation task before deployment.**  
    **Location:** `TASKS.md:129–141`, `TASKS.md:501–509`; `OBSERVABILITY.md:4`, §“Operator decisions and signals”.  
    TASK-602 requires probes green but owns only configuration/documentation. Nobody implements metric emission, monitoring configuration or alert delivery. Observability is mandatory when each host first goes live, including staging in TASK-108—not only M6.  
    **Fix:** Assign instrumentation and monitoring before first deployment; require synthetic threshold breaches to produce the specified owner alerts, plus credential/PII redaction checks.

12. **P1 — Some Done conditions require later implementation.**  
    **Location:** `TASKS.md:143–154`, `TASKS.md:295–300`, `TASKS.md:387–395`.  
    TASK-109’s M1 matrix requires API-key, webhook, tracking and media behavior delivered later. TASK-304 requires the pay-unpaid path, while recovery is assigned to 402, which depends through 401 on 304. Adding a dependency would create a cycle.  
    **Fix:** Phase isolation tests by implemented surface and require the complete matrix at M5. Put the shared settlement primitive in 304 and reserve 402 for finance-triggered recovery, or move that acceptance test to 402.

13. **P1 — Production readiness is not enforced by the dependency graph.**  
    **Location:** `TASKS.md:172–173`, `TASKS.md:521–530`; `ROADMAP.md:10–13`.  
    Contracts may start when their dependencies finish, but 604’s dependency closure excludes finance/returns/claims and API/MCP completion. Registration can therefore become graph-ready without all P0 deliverables or prior milestone exit gates.  
    **Fix:** Add explicit milestone-close dependencies covering every required task and integrated gate; require those closes before the pilot/open-registration contract.

14. **P2 — Risk declarations need reconciliation.**  
    **Location:** `TASKS.md:76–84`, `TASKS.md:387–390`; `RELEASE.md:32`; `docs/WORKFLOW.md:30–32,57`.  
    Session/cookie implementation is R3 despite the R4 cookie boundary; M1 is labelled R3 although it includes R4 tasks. Pay-unpaid is R3 despite the requested R4 money-dispatch boundary and TASK-304’s R4 classification.  
    **Fix:** Split or promote cookie work to R4, classify M1 by its highest boundary, and reconcile the money-dispatch rule in WORKFLOW and affected tasks.

15. **P2 — Broad path reservations undermine parallel ownership.**  
    **Location:** `TASKS.md:220`, `TASKS.md:233`, `TASKS.md:366`, `TASKS.md:461`, `TASKS.md:482`.  
    TASK-310 claims all settings routes, including specialist routes owned by 204/205/503/505. Dependency-only scheduling does not exclude concurrent writers. “Matching UI” also leaves ownership indeterminate.  
    **Fix:** Exclude reserved specialist subtrees from 310, name concrete UI/test paths, and identify the integrating owner for shared router/configuration files.

16. **P2 — Two diagram outcomes contradict the specs.**  
    **Location:** `docs/DIAGRAMS.md:379–381,426`.  
    Checkout unconditionally returns a label after timeout or unpaid hold, although spec 09 §3 forbids printing without confirmed settlement/AWB. Finance eligibility says counter “paid” and omits `not_required`.  
    **Fix:** Branch printable versus pending/reconciliation responses; show `paid OR not_required` with the provider reconciliation predicate.

17. **P2 — Several acceptance contracts remain underspecified.**  
    **Location:** `TASKS.md:302–311`, `TASKS.md:445–454`; `ROADMAP.md:10`; `docs/spec/07-DEVELOPMENT-GUIDE-AND-WORKFLOW.md:102–104`.  
    TASK-305 changes UI without a Visual Contract; “SEO checks pass” in 502 is not a defined command/threshold. TASKS’ usual 390/1366 checks do not explicitly deliver ROADMAP’s 768/1280 M3 gate.  
    **Fix:** Specify commands, assertions and evidence locations; add 305’s visual states, legal-footer NULL/filled-field cases, and one agreed milestone viewport matrix.

**Merge verdict: BLOCK.** Resolve P1 findings, then regenerate task-level coverage and correct `STATUS.md:31–33`’s premature completeness claim.

**Verification limitation:** Exact byte sizes were not available through the read-only file tools. Before approval, record `wc -c TASKS.md STATUS.md` against the required `<50 KB` and `<12 KB` limits.