import { test as base } from "@playwright/test"

// Each test is a different simulated client (local only): per-IP auth limits (spec 05 §2: 10 OTP mails per IP per
// hour) apply per test instead of throttling the whole suite, which shares one loopback address.
export const test = base.extend({
  context: async ({ context }, use, info) => {
    const ip = `198.18.${(info.workerIndex * 37 + info.repeatEachIndex) % 250}.${(info.testId.charCodeAt(0) + info.retry + info.testId.length * 7) % 250}`
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
