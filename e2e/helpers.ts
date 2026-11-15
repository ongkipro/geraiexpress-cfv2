import { readFileSync } from "node:fs"
import type { APIRequestContext } from "@playwright/test"

export const PORT = Number(process.env.GX_E2E_PORT ?? 8787)
export const APP = `http://app.geraiexpress.localhost:${PORT}`
export const OWNER = `http://owner.geraiexpress.localhost:${PORT}`

function opsToken(): string {
  const m = readFileSync(".dev.vars", "utf8").match(/^OPS_TOKEN=(.*)$/m)
  return (m?.[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2")
}

/** Reads the last simulated email variables for an address (local only). */
export async function lastMail(request: APIRequestContext, to: string, template: string): Promise<Record<string, string>> {
  for (let i = 0; i < 20; i++) {
    const res = await request.get(`${OWNER}/internal/dev/last-mail?to=${encodeURIComponent(to)}&template=${template}`, { headers: { authorization: `Bearer ${opsToken()}` } })
    if (res.ok()) return ((await res.json()) as { data: Record<string, string> }).data
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`no ${template} mail for ${to}`)
}

export const uniqueEmail = (tag: string) => `${tag}-${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}@contoh.test`
