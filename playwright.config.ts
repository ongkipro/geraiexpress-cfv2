import { defineConfig, devices } from "@playwright/test"

// Milestone matrix (ROADMAP): 390 / 768 / 1280. Hosts are *.localhost served by `wrangler dev`.
const port = Number(process.env.GX_E2E_PORT ?? 8787)
// Fresh local state per run (rate limits and data from an earlier run must not leak into this one).
const state = `.wrangler/state-e2e-${process.env.GX_E2E_RUN ?? Date.now().toString(36)}`
process.env.GX_E2E_RUN ??= state.slice(-8)

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://app.geraiexpress.localhost:${port}`,
    trace: "retain-on-failure",
    // Locally the installed Google Chrome is used (no browser download); CI installs Playwright's Chromium.
    ...(process.env.CI ? {} : { channel: "chrome" }),
    launchOptions: { args: ["--password-store=basic"] },
  },
  projects: [
    { name: "phone-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec wrangler d1 migrations apply DB --local --env= --persist-to ${state} && pnpm exec wrangler dev --local --port ${port} --ip 127.0.0.1 --persist-to ${state}`,
    url: `http://geraiexpress.localhost:${port}/healthz`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
