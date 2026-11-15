import { DurableObject } from "cloudflare:workers"

// Global Partner API quota (TASK-202).
export class PartnerQuotaDO extends DurableObject<Env> {}
