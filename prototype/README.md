## GeraiExpress v2 prototype (TASK-001)

Throwaway visual prototype with sample data. Not production code.

- Run: `pnpm install && pnpm build && pnpm exec vite preview --host 0.0.0.0 --port 55180`
- Routes (hash): `#/`, `#/kasir/baru`, `#/kiriman`, `#/kontak/pengirim`, `#/keuangan`, `#/pengaturan`, `#/admin`
- Query: `role=kasir` (cashier view), `dir=b` / `dir=c` (visual directions B and C; default A)
- Primitives in `src/components/ui/` were edited once to the comfort contract (`design/admin-contract.json`).
