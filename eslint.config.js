import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores(["**/dist", "**/.wrangler", "**/node_modules", "prototype/**", "apps/worker/worker-configuration.d.ts", "test-results", "playwright-report"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Security-sensitive tokens must use crypto.getRandomValues / randomUUID (workers-best-practices).
      "no-restricted-properties": ["error", { object: "Math", property: "random", message: "Use crypto.getRandomValues()." }],
    },
  },
  {
    files: ["apps/web-*/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
])
