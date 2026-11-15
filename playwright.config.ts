import { defineConfig, devices } from "@playwright/test"

// Milestone matrix (ROADMAP): 390 / 768 / 1280. Hosts are *.localhost served by `wrangler dev`.
const port = Number(process.env.GX_E2E_PORT ?? 8787)

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://app.geraiexpress.localhost:${port}`,
    trace: "retain-on-failure",
    launchOptions: { args: ["--password-store=basic"] },
  },
  projects: [
    { name: "phone-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec wrangler dev --local --port ${port} --var GX_E2E:1`,
    url: `http://geraiexpress.localhost:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
