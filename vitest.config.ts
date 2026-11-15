import { defineConfig } from "vitest/config"

// Pure unit tests (Node). Workers runtime tests live in apps/worker (pnpm test:worker).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts", "scripts/**/*.test.mjs", "infra/**/test/*.test.mjs"],
        },
      },
    ],
  },
})
