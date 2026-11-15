import path from "node:path"
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

const root = path.resolve(import.meta.dirname, "../..")

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: path.join(root, "wrangler.jsonc"), environment: "" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(root, "packages/db/migrations/control")),
          AUTH_SESSION_PEPPER: "test-pepper-0123456789abcdef0123456789abcdef",
          KEK_SECRET: "test-kek-not-a-secret",
          PROBE_SECRET: "test-probe-secret",
          TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
          MENGANTAR_PARTNER_SECRET: "test-partner-secret",
          PARTNER_RELAY_URL: "http://relay.test",
          PARTNER_RELAY_SECRET: "test-relay-secret",
          CF_SAAS_API_TOKEN: "test-cf-token",
          OPS_TOKEN: "test-ops-token",
          ALERT_WEBHOOK_URL: "",
        },
      },
    })),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
})
