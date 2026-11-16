-- Final review (Sol delta A-5): a per-call nonce identifies the decision that won the `submitted` → decided
-- transition, so every side effect in the approval/rejection batch (audit, routing version, host, email, rules,
-- onboarding row) is gated on THIS call even when two decisions by the same admin share a millisecond.
ALTER TABLE tenant_applications ADD COLUMN decision_nonce TEXT;
