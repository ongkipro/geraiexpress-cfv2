Verdict: REQUEST_CHANGES

## Review

1. **P2 — IPv6-only-egress verification can falsely pass.**  
   **Location:** `docs/runbooks/partner-relay-production.md:61` (required by lines 14–15).  
   **Failure scenario:** `api64.ipify.org` accepts both IPv4 and IPv6. An unrestricted `wget` can return `149.28.129.53` on a dual-stack container, so this check does **not** prove IPv6 egress is unavailable. The isolation check at line 64 also omits network IPv6 configuration. An incorrectly configured container could therefore pass these checks while later Partner requests leave over non-allowlisted IPv6.  
   **Smallest fix:** inspect every attached Docker network and require `EnableIPv6=false`; replace or supplement step 1b with an explicitly IPv6-forced connection that must fail. Keep step 1 as the positive Reserved-IPv4 check.

**Correct:** Wrangler routes and environment variables match DEC-234 (`wrangler.jsonc:95–105,167–180`); probe regex escaping and staging suffix mapping are correct (`scripts/probes/probes-lib.mjs:34–39`). The retired zone remains blocked for custom domains (`apps/worker/src/hostnames/service.ts:62–63`). Thermal wrapping has new host-preservation/32-column tests and a stub-QR geometry regression test (`packages/thermal-print/test/print.test.ts:29–47,125–147`). Relay documentation explicitly leaves rollout pending owner approval.

**Verification:** Static review only; no tests executed. Before merge, run the required integrated gate through `heavy-run --lock geraiexpress-cfv2-env -- pnpm gate DEC-234`.

**Merge verdict:** BLOCK pending finding 1.