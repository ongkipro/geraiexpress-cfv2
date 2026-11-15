// Builds Mengantar clients from environment configuration (spec 07 §3.2). Local development uses an in-process mock
// (MENGANTAR_*_ORIGIN = "mock"); staging calls the sandbox; production calls the Partner API through the relay only.
import { MengantarPublicClient, PartnerClient } from "@gx/mengantar-sdk"
import { mockFetch } from "./mock"

export function partnerClient(env: Env): PartnerClient {
  const mock = env.MENGANTAR_PARTNER_ORIGIN === "mock"
  if (env.GX_ENV === "production" && env.PARTNER_TRANSPORT !== "relay") throw new Error("production requires PARTNER_TRANSPORT=relay (spec 10 §4.3)")
  return new PartnerClient({
    transport: mock ? "direct" : env.PARTNER_TRANSPORT === "relay" ? "relay" : "direct",
    partnerId: env.MENGANTAR_PARTNER_ID,
    partnerSecret: env.MENGANTAR_PARTNER_SECRET,
    partnerOrigin: mock ? "https://mock.mengantar.local" : env.MENGANTAR_PARTNER_ORIGIN,
    relayUrl: env.PARTNER_RELAY_URL,
    relaySecret: env.PARTNER_RELAY_SECRET,
    fetchImpl: mock ? mockFetch : undefined,
  })
}

export function publicClient(env: Env, apiKey: string): MengantarPublicClient {
  const mock = env.MENGANTAR_PUBLIC_ORIGIN === "mock"
  return new MengantarPublicClient({ origin: mock ? "https://mock.mengantar.local" : env.MENGANTAR_PUBLIC_ORIGIN, apiKey, fetchImpl: mock ? mockFetch : undefined })
}
