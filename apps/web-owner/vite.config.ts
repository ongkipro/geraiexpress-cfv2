import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Built into dist/assets/owner and served by the Worker only on the verified owner host (spec 07 §3.1).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
      "@shared": resolve(import.meta.dirname, "../web-app/src"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "../../dist/assets/owner"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  server: { port: 55182, strictPort: true },
})
