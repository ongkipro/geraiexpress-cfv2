import { test as base } from "@playwright/test"

// Each test is a different simulated client (local only): per-IP auth limits (spec 05 §2: 10 OTP mails per IP per
// hour) apply per test instead of throttling the whole suite, which shares one loopback address.
export const test = base.extend({
  context: async ({ context }, use, info) => {
    // Hash the whole test id (+ repeat/retry): the old formula used only its first char and length, so two specs could
    // share an IP and exhaust the 10-OTP/hour limit together once a spec signs up several accounts (DEC-244 shell tests).
    let hsh = 2166136261
    for (const ch of `${info.testId}:${info.repeatEachIndex}:${info.retry}`) hsh = Math.imul(hsh ^ ch.charCodeAt(0), 16777619) >>> 0
    const ip = `198.18.${(hsh >>> 8) % 250}.${hsh % 250}`
    await context.setExtraHTTPHeaders({ "cf-connecting-ip": ip })
    await use(context)
  },
  request: async ({ playwright }, use, info) => {
    const ctx = await playwright.request.newContext({ extraHTTPHeaders: { "cf-connecting-ip": `198.19.${info.workerIndex % 250}.${(info.testId.length * 13 + info.title.length) % 250}` } })
    await use(ctx)
    await ctx.dispose()
  },
})
export { expect } from "@playwright/test"
