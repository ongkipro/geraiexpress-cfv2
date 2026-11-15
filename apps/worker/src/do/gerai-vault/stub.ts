// The only way to address a tenant object (ADR-0006 §6: placement hint apac). `tenantId` must come from a verified
// host or session, never from a request body (AGENTS.md §3.2).
export function vaultFor(env: Pick<Env, "GERAI_VAULT">, tenantId: string) {
  if (!tenantId) throw new Error("vaultFor: empty tenant id")
  return env.GERAI_VAULT.getByName(tenantId, { locationHint: "apac" })
}
