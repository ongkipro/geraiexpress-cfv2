import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Built into dist/assets/app and served by the Worker only on the verified app host (spec 07 §3.1).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },
  build: {
    outDir: resolve(import.meta.dirname, "../../dist/assets/app"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  server: { port: 55181, strictPort: true },
})
