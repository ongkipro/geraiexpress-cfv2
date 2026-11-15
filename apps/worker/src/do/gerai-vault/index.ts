import { DurableObject } from "cloudflare:workers"

// One object per tenant (ADR-0004, ADR-0006). Storage, migration and feature RPCs are added by their owning tasks.
export class GeraiVaultDO extends DurableObject<Env> {}
